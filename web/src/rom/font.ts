// The fonts of Pokémon Black 2 / White 2 (archive a/0/2/3): "NFTR" files (Nintendo bitmap fonts). Read from the player's own game file.
// A glyph is a small picture (1 or 2 bits per pixel); the file also says how far each letter sits from the left and how wide it is.

export interface NftrFont {
  height: number // the line height in pixels (from the file)
  cellW: number
  cellH: number
  baseline: number
  depth: number
  lineFeed: number
  glyphs: Uint8Array // cellW * cellH bytes per glyph: 0..(2^depth - 1)
  widths: Array<[number, number, number]> // [left, glyph width, advance] per glyph index
  map: Map<number, number> // character code -> glyph index
  errorGlyph: number
  defaultWidth: [number, number, number]
  /** for checking: where the glyph pictures sit in the file */
  src?: { data: Uint8Array; base: number; cellSize: number }
}

const tag = (d: Uint8Array, o: number) => String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3])

export function parseNftr(d: Uint8Array): NftrFont | null {
  if (d.length < 32 || tag(d, 0) !== 'RTFN') return null
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const blocks = dv.getUint16(0xe, true)
  let pos = dv.getUint16(0xc, true)
  let font: Partial<NftrFont> & { cellSize?: number } = { widths: [], map: new Map(), defaultWidth: [0, 0, 0], lineFeed: 0, errorGlyph: 0, height: 0 }
  for (let b = 0; b < blocks && pos + 8 <= d.length; b++) {
    const t = tag(d, pos)
    const size = dv.getUint32(pos + 4, true)
    const body = pos + 8
    if (t === 'FNIF') {
      font.lineFeed = d[body + 1]
      font.errorGlyph = dv.getUint16(body + 2, true)
      font.defaultWidth = [dv.getInt8(body + 4), d[body + 5], d[body + 6]]
      if (size >= 0x20) font.height = d[body + 0x10 + 0]
    } else if (t === 'PLGC') {
      const cellW = d[body], cellH = d[body + 1]
      const cellSize = dv.getUint16(body + 2, true)
      font.cellW = cellW; font.cellH = cellH
      font.baseline = d[body + 4]
      font.depth = d[body + 6]
      const count = Math.floor((size - 16) / cellSize)
      const out = new Uint8Array(count * cellW * cellH)
      const maxv = (1 << font.depth) - 1
      font.widths = []
      for (let g = 0; g < count; g++) {
        const base = body + 8 + g * cellSize
        // every glyph starts with three bytes: how far its picture sits from the left, how wide the picture is, how far the pen moves on; then the picture
        font.widths[g] = [dv.getInt8(base), d[base + 1], d[base + 2]]
        for (let y = 0; y < cellH; y++) {
          for (let x = 0; x < cellW; x++) {
            const p = (y * cellW + x) * font.depth
            out[g * cellW * cellH + y * cellW + x] = ((d[base + 3 + (p >> 3)] ?? 0) >> (8 - font.depth - (p & 7))) & maxv
          }
        }
      }
      void maxv
      font.glyphs = out
      font.src = { data: d, base: body + 8, cellSize }
    } else if (t === 'PAMC') {
      const first = dv.getUint16(body, true), last = dv.getUint16(body + 2, true)
      const type = dv.getUint16(body + 4, true)
      const next = dv.getUint32(body + 8, true)
      const data = body + 12
      if (type === 0) { const idx = dv.getUint16(data, true); for (let c = first; c <= last; c++) font.map!.set(c, idx + (c - first)) }
      else if (type === 1) { for (let c = first; c <= last; c++) { const g = dv.getUint16(data + (c - first) * 2, true); if (g !== 0xffff) font.map!.set(c, g) } }
      else if (type === 2) { const n = dv.getUint16(data, true); for (let i = 0; i < n; i++) font.map!.set(dv.getUint16(data + 2 + i * 4, true), dv.getUint16(data + 4 + i * 4, true)) }
      void next
    }
    pos += size
  }
  if (!font.glyphs || !font.cellW) return null
  if (!font.height) font.height = font.cellH
  const f = font as NftrFont
  return f
}

/**
 * Draws a line of text into a new canvas (1 pixel of the canvas = 1 pixel of the game's own font). Glyph values: 2 and 3 = the letter, 1 = its soft edge / shadow.
 * `color` is the letter, `shadow` the colour of the edge pixels (null = they are drawn in the letter colour).
 */
export function renderLine(f: NftrFont, text: string, color: string, shadow: string | null, outline = false): HTMLCanvasElement {
  const w = Math.max(1, measureNftr(f, text) + 2), h = f.cellH + 2
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const parse = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const main = parse(color), edge = shadow ? parse(shadow) : main
  let x = 0
  for (const ch of text) {
    const g = f.map.get(ch.codePointAt(0)!) ?? f.errorGlyph
    const wd = f.widths[g] ?? f.defaultWidth
    for (let gy = 0; gy < f.cellH; gy++) {
      for (let gx = 0; gx < f.cellW; gx++) {
        const v = f.glyphs[g * f.cellW * f.cellH + gy * f.cellW + gx]
        if (!v) continue
        const px = x + wd[0] + gx + (outline ? 1 : 0), py = gy + (outline ? 1 : 0)
        if (px < 0 || px >= w || py >= h) continue
        const o = (py * w + px) * 4
        const body = v === 1 // every font of the game draws the letter with value 1 and its shadow (right / below) with 2 (3 = rare extra)
        const rgb = body ? main : edge
        if (outline) { // a full 1-pixel outline around every pixel of the letter (the look of the HP boxes), the letter itself on top (the glyph's own shadow pixels are not used)
          if (!body) continue
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const qx = px + dx, qy = py + dy
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue
            const oo = (qy * w + qx) * 4
            if (img.data[oo + 3] === 0) { img.data[oo] = edge[0]; img.data[oo + 1] = edge[1]; img.data[oo + 2] = edge[2]; img.data[oo + 3] = 255 }
          }
        }
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      }
    }
    x += wd[2]
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Draws `text` into the context in one flat colour (the glyph's own grey steps become see-through-ness). Returns the width drawn. */
export function drawNftr(ctx: CanvasRenderingContext2D, f: NftrFont, text: string, x: number, y: number, rgb: [number, number, number] = [255, 255, 255]): number {
  const maxv = (1 << f.depth) - 1
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  let cx = x
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const g = f.map.get(code) ?? f.errorGlyph
    const w = f.widths[g] ?? f.defaultWidth
    const left = w[0]
    for (let gy = 0; gy < f.cellH; gy++) {
      for (let gx = 0; gx < f.cellW; gx++) {
        const v = f.glyphs[g * f.cellW * f.cellH + gy * f.cellW + gx]
        if (!v) continue
        const px = cx + left + gx, py = y + gy
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue
        const o = (py * img.width + px) * 4
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = Math.max(img.data[o + 3], Math.round((v / maxv) * 255))
      }
    }
    cx += w[2]
  }
  ctx.putImageData(img, 0, 0)
  return cx - x
}

export function measureNftr(f: NftrFont, text: string): number {
  let w = 0
  for (const ch of text) {
    const g = f.map.get(ch.codePointAt(0)!) ?? f.errorGlyph
    w += (f.widths[g] ?? f.defaultWidth)[2]
  }
  return w
}

/** The fonts of the archive a/0/2/3: every file that is a font, in file order. */
export function readFonts(files: Uint8Array[]): NftrFont[] {
  const out: NftrFont[] = []
  for (const f of files) { try { const p = parseNftr(f); if (p) out.push(p) } catch { /* not a font */ } }
  return out
}
