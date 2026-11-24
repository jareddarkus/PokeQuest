// The battle command buttons of Pokémon Black 2 / White 2 (archive a/0/1/1, the files after the 3D scenery):
//   file 358 = tile graphics, 359 = colours, 361 = screen map with BAG / RUN / POKÉMON / back buttons in a row,
//   372 = screen map with the FIGHT label and four move buttons.
// A screen map bigger than 256 pixels is stored as 32x32-tile blocks (top-left, top-right, bottom-left, bottom-right).
import { decompress, parseNarc } from './nds'
import { paletteOf } from './items'

export const COMMAND_NARC = 'a/0/1/1'

function find(d: Uint8Array, tag: string): number {
  for (let i = 0; i + 4 <= d.length; i++) if (String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]) === tag) return i
  return -1
}

export function renderScreen(screen: Uint8Array, gfx: Uint8Array, pal: Array<[number, number, number]>): HTMLCanvasElement | null {
  const s = decompress(screen)
  const g = decompress(gfx)
  const si = find(s, 'NRCS')
  const gi = find(g, 'RAHC')
  if (si < 0 || gi < 0) return null
  const sv = new DataView(s.buffer, s.byteOffset, s.byteLength)
  const gv = new DataView(g.buffer, g.byteOffset, g.byteLength)
  const w = sv.getUint16(si + 8, true), h = sv.getUint16(si + 10, true)
  const dsize = sv.getUint32(si + 16, true)
  const tiles = s.subarray(si + 20, si + 20 + dsize)
  const px = g.subarray(gi + 32, gi + 32 + gv.getUint32(gi + 24, true))
  const nt = Math.floor(px.length / 32)
  const tw = w / 8, th = h / 8
  const big = w > 256 || h > 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const k = big ? (((ty >> 5) * (tw >> 5) + (tx >> 5)) << 10) + (ty & 31) * 32 + (tx & 31) : ty * tw + tx
      if (k * 2 + 1 >= tiles.length) continue
      const e = tiles[k * 2] | (tiles[k * 2 + 1] << 8)
      const t = e & 0x3ff, hf = (e >> 10) & 1, vf = (e >> 11) & 1, pi = e >> 12
      if (t >= nt) continue
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y
          const b = px[t * 32 + sy * 4 + (sx >> 1)]
          const v = sx & 1 ? b >> 4 : b & 15
          if (v === 0) continue
          const rgb = pal[pi * 16 + v] ?? [255, 0, 255]
          const o = ((ty * 8 + y) * w + tx * 8 + x) * 4
          img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Cuts a rectangle out and trims the see-through border. */
export function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const part = document.createElement('canvas')
  part.width = w
  part.height = h
  part.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h)
  const d = part.getContext('2d')!.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 0) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j) }
  if (x1 < 0) return part
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(part, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/**
 * BAG and POKÉMON are cut off by the edge of the screen map in the game file (one pointed end is missing, the buttons are
 * symmetric). We rebuild the missing end as the mirror image of the other end (n columns).
 */
function mirrorEnd(src: HTMLCanvasElement, side: 'left' | 'right', n: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width + n
  out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, side === 'left' ? n : 0, 0)
  ctx.save()
  if (side === 'left') { ctx.translate(n, 0); ctx.scale(-1, 1); ctx.drawImage(src, src.width - n, 0, n, src.height, 0, 0, n, src.height) } // copy of the right end
  else { ctx.translate(src.width + n, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, n, src.height, 0, 0, n, src.height) } // copy of the left end
  ctx.restore()
  return out
}

const toBlob =(c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))

/** Stores cmd:bag, cmd:run, cmd:pokemon, cmd:back, cmd:fight and move:grey / red / blue / yellow. */
export async function decodeCommandUi(narcData: Uint8Array, put: (name: string, blob: Blob) => Promise<void>): Promise<number> {
  const files = parseNarc(narcData)
  const pal = paletteOf(files[359])
  if (!pal || !files[358]) return 0
  let n = 0
  const save = async (name: string, c: HTMLCanvasElement) => { const b = await toBlob(c); if (b) { await put(name, b); n++ } }
  const row = renderScreen(files[361], files[358], pal)
  if (row) {
    await save('cmd:bag', mirrorEnd(crop(row, 0, 140, 90, 56), 'left', 14))
    await save('cmd:run', crop(row, 90, 140, 80, 56))
    await save('cmd:pokemon', mirrorEnd(crop(row, 170, 140, 86, 56), 'right', 14))
    await save('cmd:back', crop(row, 420, 140, 92, 56))
  }
  const fight = renderScreen(files[372], files[358], pal)
  if (fight) {
    await save('cmd:fight', crop(fight, 84, 86, 89, 21))
    await save('move:grey', crop(fight, 250, 222, 134, 50))
    await save('move:red', crop(fight, 384, 222, 128, 50))
    await save('move:blue', crop(fight, 250, 272, 134, 50))
    await save('move:yellow', crop(fight, 384, 272, 128, 50))
  }
  return n
}
