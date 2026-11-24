// Item icons (Poké Balls, potions, stones, berries ...) from Pokémon Black 2 / White 2: archive a/0/2/5.
// Icon number N is in file 2N, and its colours are in file 2N + 1.
import { decompress, parseNarc } from './nds'

export const ITEM_ICON_NARC = 'a/0/2/5'

function find(d: Uint8Array, tag: string): number {
  for (let i = 0; i + 4 <= d.length; i++) if (String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]) === tag) return i
  return -1
}

function paletteOf(file: Uint8Array): Array<[number, number, number]> | null {
  const d = decompress(file)
  const p = find(d, 'TTLP')
  if (p < 0) return null
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const size = dv.getUint32(p + 16, true)
  const cols: Array<[number, number, number]> = []
  for (let k = 0; k + 1 < Math.min(size, 512); k += 2) {
    const v = dv.getUint16(p + 24 + k, true)
    const c = (n: number) => (n << 3) | (n >> 2)
    cols.push([c(v & 31), c((v >> 5) & 31), c((v >> 10) & 31)])
  }
  return cols
}

function iconCanvas(chr: Uint8Array, pal: Array<[number, number, number]>): HTMLCanvasElement | null {
  const d = decompress(chr)
  const p = find(d, 'RAHC')
  if (p < 0) return null
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let th = dv.getUint16(p + 8, true)
  let tw = dv.getUint16(p + 10, true)
  const depth = dv.getUint32(p + 12, true)
  const dataSize = dv.getUint32(p + 24, true)
  const px = d.subarray(p + 32, p + 32 + dataSize)
  const bpp8 = depth === 4
  const tiles = px.length / (bpp8 ? 64 : 32)
  if (!tw || !th || tw * th !== tiles) { tw = Math.max(1, Math.round(Math.sqrt(tiles))); th = Math.ceil(tiles / tw) }
  const W = tw * 8, H = th * 8
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  for (let t = 0; t < tiles; t++) {
    const bx = (t % tw) * 8, by = Math.floor(t / tw) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = bpp8 ? px[t * 64 + y * 8 + x] : (x & 1 ? px[t * 32 + y * 4 + (x >> 1)] >> 4 : px[t * 32 + y * 4 + (x >> 1)] & 15)
        if (c === 0) continue
        const rgb = pal[c] ?? [255, 0, 255]
        const o = ((by + y) * W + bx + x) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Decodes every item icon. `put` stores one picture under the item number. */
export async function decodeItemIcons(narcData: Uint8Array, put: (id: number, blob: Blob) => Promise<void>): Promise<number> {
  const files = parseNarc(narcData)
  let n = 0
  for (let id = 1; id * 2 + 1 < files.length; id++) {
    try {
      const pal = paletteOf(files[id * 2 + 1])
      if (!pal || files[id * 2].length === 0) continue
      const c = iconCanvas(files[id * 2], pal)
      if (!c) continue
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
      if (blob) { await put(id, blob); n++ }
    } catch { /* not an icon */ }
  }
  return n
}
