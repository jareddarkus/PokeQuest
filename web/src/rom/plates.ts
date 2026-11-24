// The move-type labels (NORMAL, FIRE, WATER ...) and the physical / special / status icons from the battle interface (a/0/8/2).
// The game stores each label once and picks its colours itself; here the colour group that fits the type best is chosen
// from the game's own palette, so the label keeps the game's pixels and colours.
import { decompress, parseNarc } from './nds'
import { paletteOf } from './items'

export const UI_NARC = 'a/0/8/2'
const PALETTE_FILE = 33

/** The 17 types in the order of the plate pictures (files 34 .. 50). */
export const PLATE_TYPES = [
  'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass',
  'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
] as const

const WANT: Record<string, [number, number, number]> = {
  Normal: [168, 167, 122], Fighting: [194, 46, 40], Flying: [169, 143, 243], Poison: [163, 62, 161], Ground: [226, 191, 101],
  Rock: [182, 161, 54], Bug: [166, 185, 26], Ghost: [115, 87, 151], Steel: [183, 183, 206], Fire: [238, 129, 48],
  Water: [99, 144, 240], Grass: [122, 199, 76], Electric: [247, 208, 44], Psychic: [249, 85, 135], Ice: [150, 217, 214],
  Dragon: [111, 53, 252], Dark: [112, 87, 70],
  Physical: [232, 69, 44], Special: [77, 107, 216], Status: [154, 154, 154],
}

const dist = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

function tilesOf(file: Uint8Array): Uint8Array {
  const d = decompress(file)
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === 0x52 && d[i + 1] === 0x41 && d[i + 2] === 0x48 && d[i + 3] === 0x43) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
      return d.subarray(i + 32, i + 32 + dv.getUint32(i + 24, true))
    }
  }
  return new Uint8Array(0)
}

function plateCanvas(px: Uint8Array, pal: Array<[number, number, number]>, sub: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 16
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(32, 16)
  for (let t = 0; t < 8; t++) {
    const bx = (t % 4) * 8, by = Math.floor(t / 4) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
        const i = x & 1 ? b >> 4 : b & 15
        if (i === 0) continue
        const rgb = pal[sub * 16 + i] ?? [255, 0, 255]
        const o = ((by + y) * 32 + bx + x) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** The most used colour number of a plate is its coloured background. */
function fillIndex(px: Uint8Array): number {
  const h = new Array(16).fill(0)
  for (const b of px) { h[b & 15]++; h[b >> 4]++ }
  h[0] = 0
  return h.indexOf(Math.max(...h))
}

export async function decodePlates(narcData: Uint8Array, put: (name: string, blob: Blob) => Promise<void>): Promise<number> {
  const files = parseNarc(narcData)
  const pal = paletteOf(files[PALETTE_FILE])
  if (!pal) return 0
  let n = 0
  const save = async (name: string, px: Uint8Array) => {
    const fi = fillIndex(px)
    let best = 0, bestD = Infinity
    for (let sub = 0; sub < 3; sub++) {
      const col = pal[sub * 16 + fi] ?? [0, 0, 0]
      const d = dist(col, WANT[name])
      if (d < bestD) { bestD = d; best = sub }
    }
    const canvas = plateCanvas(px, pal, best)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (blob) { await put(name, blob); n++ }
  }
  for (let i = 0; i < PLATE_TYPES.length; i++) await save(PLATE_TYPES[i], tilesOf(files[34 + i]))
  await save('Status', tilesOf(files[56]))
  await save('Physical', tilesOf(files[57]))
  await save('Special', tilesOf(files[58]))
  return n
}