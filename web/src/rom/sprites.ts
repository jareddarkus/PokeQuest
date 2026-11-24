// Turns the Pokémon pictures stored in Pokémon Black 2 / White 2 into normal images (PNG), on the player's computer.
import { decompress, parseNarc } from './nds'

/** a/0/0/4 holds 20 files per Pokémon (national Pokédex number x 20). */
export const SPRITE_NARC = 'a/0/0/4'
const FRONT = 0
const BACK = 9
const PAL_NORMAL = 18
const PAL_SHINY = 19
export const MAX_ROM_DEX = 649

type Rgb = [number, number, number]

/** Colours are stored as 5-bit values; the first colour of every palette means "see-through". */
function readPalette(file: Uint8Array): Rgb[] {
  const d = decompress(file)
  let p = -1
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === 0x54 && d[i + 1] === 0x54 && d[i + 2] === 0x4c && d[i + 3] === 0x50) { p = i; break } // "TTLP"
  }
  if (p < 0) throw new Error('Palette not found')
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const dataSize = dv.getUint32(p + 16, true)
  const cols: Rgb[] = []
  for (let k = 0; k < Math.min(dataSize, 32); k += 2) {
    const v = dv.getUint16(p + 24 + k, true)
    const c = (n: number) => (n << 3) | (n >> 2)
    cols.push([c(v & 31), c((v >> 5) & 31), c((v >> 10) & 31)])
  }
  return cols
}

function readTiles(file: Uint8Array): Uint8Array {
  const d = decompress(file)
  let p = -1
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === 0x52 && d[i + 1] === 0x41 && d[i + 2] === 0x48 && d[i + 3] === 0x43) { p = i; break } // "RAHC"
  }
  if (p < 0) throw new Error('Tiles not found')
  return d.subarray(p + 32)
}

/**
 * A 96 x 96 picture is stored as four blocks of 8 x 8 pixel tiles (4 bits per pixel):
 * 64x64 top-left, 32x64 right, 64x32 bottom, 32x32 bottom-right.
 */
const BLOCKS: Array<[number, number, number, number]> = [
  [0, 0, 8, 8],
  [64, 0, 4, 8],
  [0, 64, 8, 4],
  [64, 64, 4, 4],
]

function toCanvas(tiles: Uint8Array, pal: Rgb[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(96, 96)
  let t = 0
  for (const [bx, by, tw, th] of BLOCKS) {
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const base = t * 32
        t++
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const byte = tiles[base + y * 4 + (x >> 1)] ?? 0
            const c = x & 1 ? byte >> 4 : byte & 15
            const px = bx + tx * 8 + x
            const py = by + ty * 8 + y
            const o = (py * 96 + px) * 4
            if (c === 0) { img.data[o + 3] = 0; continue }
            const rgb = pal[c] ?? [255, 0, 255]
            img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export type SpriteKey = string // e.g. "25:front:normal"
export const spriteKey = (dex: number, back: boolean, shiny: boolean): SpriteKey => `${dex}:${back ? 'back' : 'front'}:${shiny ? 'shiny' : 'normal'}`

const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image failed'))), 'image/png'))

/** Decodes every Pokémon (front, back, normal, shiny) from the game's archive. */
export async function decodeAllSprites(
  narcData: Uint8Array, onProgress: (done: number, total: number) => void, put: (key: SpriteKey, blob: Blob) => Promise<void>,
): Promise<number> {
  const files = parseNarc(narcData)
  let made = 0
  const last = Math.min(MAX_ROM_DEX, Math.floor(files.length / 20) - 1)
  for (let dex = 1; dex <= last; dex++) {
    const base = dex * 20
    try {
      const pals = [readPalette(files[base + PAL_NORMAL]), readPalette(files[base + PAL_SHINY])]
      for (const [fileIdx, back] of [[FRONT, false], [BACK, true]] as const) {
        if (files[base + fileIdx].length === 0) continue
        const tiles = readTiles(files[base + fileIdx])
        for (let s = 0; s < 2; s++) {
          await put(spriteKey(dex, back, s === 1), await canvasToBlob(toCanvas(tiles, pals[s])))
          made++
        }
      }
    } catch {
      /* a Pokémon without data: skip it */
    }
    if (dex % 10 === 0) { onProgress(dex, last); await new Promise((r) => setTimeout(r)) }
  }
  onProgress(last, last)
  return made
}
