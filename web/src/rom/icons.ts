// The little Pokémon menu icons of Pokémon Black 2 / White 2 (archive a/0/0/7): file 0 = three 16-colour palettes,
// files 8 + 2N = icon of Pokémon number N (two 32x32 pictures, 4 bits per pixel, 4x4 tiles each).
// The game stores which of the three palettes each Pokémon uses somewhere else, so we pick the palette whose colours
// are closest to the Pokémon's own big picture from the game file.
import { paletteOf } from './items'

export const ICON_NARC = 'a/0/0/7'
const MAX_DEX = 649

type Rgb = [number, number, number]

function iconPixels(file: Uint8Array): Uint8Array | null {
  // RGCN: tile data starts after the 'RAHC' block header (0x20 bytes into the block)
  const d = file
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] === 0x52 && d[i + 1] === 0x41 && d[i + 2] === 0x48 && d[i + 3] === 0x43) return d.subarray(i + 32, i + 32 + 512)
  }
  return null
}

function render(px: Uint8Array, pal: Rgb[], sub: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(32, 32)
  for (let t = 0; t < 16; t++) {
    const bx = (t % 4) * 8, by = Math.floor(t / 4) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const b = px[t * 32 + y * 4 + (x >> 1)]
        const v = x & 1 ? b >> 4 : b & 15
        if (v === 0) continue
        const rgb = pal[sub * 16 + v] ?? [255, 0, 255]
        const o = ((by + y) * 32 + bx + x) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Average colour of the lively (not black / white / grey outline) pixels of a picture. */
function lively(data: Uint8ClampedArray): Rgb | null {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2])
    if (mx < 50 || mx - mn < 40) continue
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return n >= 8 ? [r / n, g / n, b / n] : null
}

async function spriteColour(blob: Blob | null): Promise<Rgb | null> {
  if (!blob) return null
  try {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    return lively(ctx.getImageData(0, 0, c.width, c.height).data)
  } catch { return null }
}

/**
 * Stores one picture (frame 1) per Pokémon number under put(dex, blob).
 * `bigPicture(dex)` gives the Pokémon's big front picture (from the game file) used to pick the palette.
 */
export async function decodeIcons(
  files: Uint8Array[],
  bigPicture: (dex: number) => Promise<Blob | null>,
  put: (dex: number, blob: Blob) => Promise<void>,
): Promise<number> {
  const pal = paletteOf(files[0])
  if (!pal) return 0
  let n = 0
  for (let dex = 1; dex <= MAX_DEX; dex++) {
    const px = files[8 + 2 * dex] && iconPixels(files[8 + 2 * dex])
    if (!px) continue
    const cands = [0, 1, 2].map((s) => render(px, pal, s))
    let best = 0
    const want = await spriteColour(await bigPicture(dex))
    if (want) {
      let bd = Infinity
      cands.forEach((c, i) => {
        const have = lively(c.getContext('2d')!.getImageData(0, 0, 32, 32).data)
        if (!have) return
        const d = (have[0] - want[0]) ** 2 + (have[1] - want[1]) ** 2 + (have[2] - want[2]) ** 2
        if (d < bd) { bd = d; best = i }
      })
    }
    const blob = await new Promise<Blob | null>((res) => cands[best].toBlob(res, 'image/png'))
    if (blob) { await put(dex, blob); n++ }
  }
  return n
}
