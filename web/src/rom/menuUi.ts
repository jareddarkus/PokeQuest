// The Start ("X") menu art of Pokémon Black 2 / White 2 (archive a/0/7/0):
//   file 0 = light colours, 1 = dark colours, 2 = highlight colours (3 palettes of 16 x 16),
//   file 3 = tile graphics of the menu (screen map 18 = six button slabs, 16 = the grid background),
//   files 5-14 = 32x32 menu icons (2 pictures each, 4bpp, 4x4 tiles): 6 Pokédex, 7 Bag, 9 Pokémon (Poké Ball), 11 Exit door,
//   12 Trainer Card, 5 speech bubble, 10 / 13 / 14 other devices.
import { parseNarc } from './nds'
import { paletteOf } from './items'
import { crop, renderScreen } from './commandUi'

export const MENU_NARC = 'a/0/7/0'
export const MENU_ICONS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))

function iconCanvas(file: Uint8Array, pal: Array<[number, number, number]>): HTMLCanvasElement | null {
  let p = -1
  for (let i = 0; i + 4 <= file.length; i++) if (file[i] === 0x52 && file[i + 1] === 0x41 && file[i + 2] === 0x48 && file[i + 3] === 0x43) { p = i; break }
  if (p < 0) return null
  const px = file.subarray(p + 32, p + 32 + 512)
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(32, 32)
  for (let t = 0; t < 16; t++) {
    const bx = (t % 4) * 8, by = Math.floor(t / 4) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
        const v = x & 1 ? b >> 4 : b & 15
        if (v === 0) continue
        const rgb = pal[v] ?? [255, 0, 255]
        const o = ((by + y) * 32 + bx + x) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Stores menu:slab (a dark button plate) and menu:icon5 ... menu:icon14. */
export async function decodeMenuUi(narcData: Uint8Array, put: (name: string, blob: Blob) => Promise<void>): Promise<number> {
  const files = parseNarc(narcData)
  const light = paletteOf(files[0])
  const dark = paletteOf(files[1])
  if (!light || !dark) return 0
  let n = 0
  const save = async (name: string, c: HTMLCanvasElement | null) => { if (!c) return; const b = await toBlob(c); if (b) { await put(name, b); n++ } }
  const slabs = renderScreen(files[18], files[3], dark)
  if (slabs) await save('menu:slab', crop(slabs, 0, 20, 128, 46))
  for (const i of MENU_ICONS) {
    if (files[i]) await save(`menu:icon${i}`, iconCanvas(files[i], light))
  }
  return n
}
