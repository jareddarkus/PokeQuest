// Move-effect pictures (glows, stars, rings, lightning bolts, slashes ...) from the player's own game file.
// They live in the particle archive a/0/0/6: each file is a "SPA" bundle of textures (format A5I3: 5 bits of
// see-through-ness and 3 bits of brightness). The game tints them with a colour while it plays an effect,
// so we keep only the shape (white + see-through-ness) and tint them the same way when the effect plays.
import { parseNarc } from './nds'

export const FX_NARC = 'a/0/0/6'

/** The shapes we use: name -> [file number in the archive, texture number inside that file]. */
export const FX_SHAPES: Record<string, [number, number]> = {
  glow: [16, 0], puff: [27, 0], star: [28, 0], spark: [1, 0], burst: [168, 0], ring: [213, 0], bolt: [211, 0],
  slash: [0, 0], tail: [291, 0], swirl: [177, 0], cloud: [263, 0], smoke: [258, 0], spike: [230, 0], zig: [252, 0],
  sun: [195, 0], heart: [150, 0], crescent: [186, 0], hand: [440, 0], foot: [203, 0], bone: [323, 0], note: [385, 0],
  glow2: [154, 0], disc: [161, 0], flash: [350, 0], drop: [291, 0],
}

function decodeShape(d: Uint8Array, texIndex: number): HTMLCanvasElement | null {
  if (d.length < 0x20 || String.fromCharCode(d[0], d[1], d[2], d[3]) !== ' APS') return null
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const count = dv.getUint16(10, true)
  let o = dv.getUint32(0x18, true)
  for (let t = 0; t < count; t++) {
    if (String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]) !== ' TPS') return null
    const param = dv.getUint32(o + 4, true)
    const size = dv.getUint32(o + 8, true)
    if (t === texIndex) {
      const fmt = param & 15
      const w = 8 << ((param >> 4) & 15), h = 8 << ((param >> 8) & 15)
      if (fmt !== 6 && fmt !== 1) return null
      const px = d.subarray(o + 36, o + 36 + size)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')!
      const img = ctx.createImageData(w, h)
      for (let i = 0; i < w * h; i++) {
        const b = px[i] ?? 0
        const a = fmt === 6 ? Math.round(((b >> 3) * 255) / 31) : Math.round(((b >> 5) * 255) / 7)
        img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = a
      }
      ctx.putImageData(img, 0, 0)
      return c
    }
    o += 36 + size
  }
  return null
}

export async function decodeFx(narc: Uint8Array, put: (name: string, b: Blob) => Promise<void>): Promise<number> {
  const files = parseNarc(narc)
  let n = 0
  for (const [name, [file, tex]] of Object.entries(FX_SHAPES)) {
    const c = files[file] ? decodeShape(files[file], tex) : null
    if (!c) continue
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
    if (blob) { await put(name, blob); n++ }
  }
  return n
}
