// The battle HP boxes of Pokémon Black 2 / White 2 (archive a/0/1/1):
//   files 485 / 486 (+ tiles 483, colours 484) = the name bars (foe: pointed end on the right, you: pointed end on the left, 136 x 14 pixels),
//   files 436 / 439 (cells) with tiles 435 / 438 = the HP strip (foe) and the HP + EXP strips (you); colours 430 = White 2 (light), 431 = Black 2 (dark).
// The game draws the name bar on a background layer and the strips as sprite cells; we cut them out and let the page lay them out.
import { decompress } from './nds'
import { paletteOf } from './items'
import { crop, renderScreen } from './commandUi'

type Rgb = [number, number, number]
const SIZES: Array<Array<[number, number]>> = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]
interface Oam { x: number; y: number; w: number; h: number; hf: number; vf: number; tile: number; pal: number }

function find(d: Uint8Array, tag: string): number {
  for (let i = 0; i + 4 <= d.length; i++) if (String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]) === tag) return i
  return -1
}

/** the sprite pieces of every cell of a cell file (NCER) */
function readCells(file: Uint8Array): Oam[][] {
  const d = decompress(file)
  const k = find(d, 'KBEC')
  if (k < 0) return []
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const count = dv.getUint16(k + 8, true), ext = dv.getUint16(k + 10, true)
  const base = k + 8 + dv.getUint32(k + 12, true)
  const stride = ext ? 16 : 8
  const ob = base + count * stride
  const out: Oam[][] = []
  for (let i = 0; i < count; i++) {
    const n = dv.getUint16(base + i * stride, true), off = dv.getUint32(base + i * stride + 4, true)
    const oams: Oam[] = []
    for (let j = 0; j < n; j++) {
      const a0 = dv.getUint16(ob + off + j * 6, true), a1 = dv.getUint16(ob + off + j * 6 + 2, true), a2 = dv.getUint16(ob + off + j * 6 + 4, true)
      let y = a0 & 0xff; if (y > 127) y -= 256
      let x = a1 & 0x1ff; if (x > 255) x -= 512
      const [w, h] = SIZES[a0 >> 14][a1 >> 14]
      oams.push({ x, y, w, h, hf: (a1 >> 12) & 1, vf: (a1 >> 13) & 1, tile: a2 & 0x3ff, pal: a2 >> 12 })
    }
    out.push(oams)
  }
  return out
}

function tilesOf(file: Uint8Array): Uint8Array {
  const d = decompress(file)
  const i = find(d, 'RAHC')
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  return d.subarray(i + 32, i + 32 + dv.getUint32(i + 24, true))
}

/** one sprite piece (an OBJ of a cell) drawn on its own */
function drawObj(o: Oam, px: Uint8Array, pal: Rgb[]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = o.w; c.height = o.h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(o.w, o.h)
  const tw = o.w >> 3
  for (let ty = 0; ty < o.h >> 3; ty++) for (let tx = 0; tx < tw; tx++) {
    const t = o.tile + ty * tw + tx
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
      const v = x & 1 ? b >> 4 : b & 15
      if (!v) continue
      const rgb = pal[o.pal * 16 + v] ?? [255, 0, 255]
      let X = tx * 8 + x, Y = ty * 8 + y
      if (o.hf) X = o.w - 1 - X
      if (o.vf) Y = o.h - 1 - Y
      const p = (Y * o.w + X) * 4
      img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** makes a strip longer: the plain middle part (the last 8 columns before the end) is repeated, then the pointed left end is mirrored as the right end */
function lengthen(src: HTMLCanvasElement, width: number, cap: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = width; out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  for (let x = src.width; x < width - cap; x += 8) ctx.drawImage(src, src.width - 8, 0, 8, src.height, x, 0, Math.min(8, width - cap - x), src.height)
  ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, cap, src.height, 0, 0, cap, src.height); ctx.restore()
  return out
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))

/** Stores hp:namefoe, hp:nameme (136 x 14) and hp:stripfoe, hp:stripme (the strips, lengthened). `white` = White 2 (light boxes) else Black 2 (dark). */
export async function decodeHpBoxes(files: Uint8Array[], white: boolean, put: (name: string, b: Blob) => Promise<void>): Promise<number> {
  let n = 0
  // name bars
  const darkPal = paletteOf(files[484])
  const lightPal = paletteOf(files[430])
  if (!darkPal || !lightPal) return 0
  const namePal: Rgb[] = darkPal.map((c) => [...c] as Rgb)
  if (white) {
    // the bar colours of White 2: the same roles as in the dark set, taken from the light strip colours (fill, shade, end highlight)
    for (const row of [1, 2]) {
      namePal[row * 16 + 14] = [198, 198, 198]; namePal[row * 16 + 15] = [173, 173, 173]
      namePal[row * 16 + 7] = [247, 247, 247]; namePal[row * 16 + 8] = [206, 198, 189]; namePal[row * 16 + 9] = [156, 148, 156]
      namePal[row * 16 + 2] = [16, 16, 16]
    }
  }
  for (const [file, name, box] of [[485, 'hp:namefoe', [0, 125, 136, 14]], [486, 'hp:nameme', [128, 61, 136, 14]]] as Array<[number, string, number[]]>) {
    const c = renderScreen(files[file], files[483], namePal)
    if (!c) continue
    const bar = crop(c, box[0], box[1], box[2], box[3])
    const b = await toBlob(bar)
    if (b) { await put(name, b); n++ }
  }
  // the game's own little pictures of the boxes: the HP / EXP gauge pieces, the Poké Ball and gender signs, the digits 0-9, "Lv" (all 8 x 8 tiles of file 434) and the "/" (file 456)
  const gp = paletteOf(files[white ? 430 : 431])
  if (gp) {
    const sheet = document.createElement('canvas')
    sheet.width = 128; sheet.height = 40 // 16 tiles per row, 65 tiles: 0-64 (64 = the slash)
    const ctx = sheet.getContext('2d')!
    const img = ctx.createImageData(128, 40)
    const put8 = (px: Uint8Array, t: number, slot: number) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
        const v = x & 1 ? b >> 4 : b & 15
        if (!v) continue
        const rgb = gp[v] ?? [255, 0, 255]
        const o = (((slot >> 4) * 8 + y) * 128 + (slot & 15) * 8 + x) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
    const t434 = tilesOf(files[434])
    for (let t = 0; t < 64; t++) put8(t434, t, t)
    put8(tilesOf(files[456]), 3, 64)
    ctx.putImageData(img, 0, 0)
    const gb = await toBlob(sheet)
    if (gb) { await put('hp:glyphs', gb); n++ }
  }
  // the small Poké Balls of the team rows (cells of file 422, tiles 420, colours 421): 0 = a Pokémon, 2 = the dark one (shown black for an empty place)
  try {
    const bc = readCells(files[422]), bpx = tilesOf(files[420]), bpal = paletteOf(files[421])
    if (bpal && bc[0] && bc[2]) {
      for (const [ci, name] of [[0, 'bt:ball'], [2, 'bt:ballfnt'], [2, 'bt:ballno']] as Array<[number, string]>) {
        const o = bc[ci][0]
        const c = drawObj(o, bpx, bpal)
        if (name === 'bt:ballno') { // an empty place of the row is a black disc with a white ring: the greys of the dark ball become black
          const ctx = c.getContext('2d')!, img = ctx.getImageData(0, 0, c.width, c.height)
          for (let i = 0; i < img.data.length; i += 4) { if (img.data[i + 3] && img.data[i] + img.data[i + 1] + img.data[i + 2] < 480) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 8 } }
          ctx.putImageData(img, 0, 0)
        }
        const bb = await toBlob(c)
        if (bb) { await put(name, bb); n++ }
      }
    }
  } catch { /* the rows use plain circles */ }
  // HP strips (cells 436 = foe, 439 = you with the EXP strip), colours 430 (White 2) or 431 (Black 2)
  const pal = paletteOf(files[white ? 430 : 431])
  if (!pal) return n
  for (const [cer, tiles, name, width] of [[436, 435, 'hp:stripfoe', 112], [439, 438, 'hp:stripme', 124]] as Array<[number, number, string, number]>) {
    const cells = readCells(files[cer])
    if (!cells[0]) continue
    const px = tilesOf(files[tiles])
    // the left piece of the cell holds the strip starting at the pointed end
    const piece = cells[0].slice().sort((a, b) => a.x - b.x)[0]
    const strip = crop(drawObj(piece, px, pal), 0, 0, piece.w, piece.h)
    const b = await toBlob(lengthen(strip, width, 6))
    if (b) { await put(name, b); n++ }
  }
  return n
}
