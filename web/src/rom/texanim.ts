// Texture animations of the maps (files in archive a/0/6/8, "SRT0" inside a BTA0): water, rivers and fountains move because the
// game slides their texture a little each frame. Each file lists materials by name; for each material five numbers are animated
// (scale S / T, rotation, move S / T), each either constant or one value per frame.
import { readDict } from './nitro'

export interface MatAnim { frames: number; moveS: Float32Array | number; moveT: Float32Array | number }

const u32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(o, true)
const i32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(o, true)
const i16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt16(o, true)

/** Reads one BTA0 file: material name -> how its texture moves. */
export function parseTextureAnim(d: Uint8Array): Map<string, MatAnim> {
  const out = new Map<string, MatAnim>()
  try {
    if (d[0] !== 0x42 || d[1] !== 0x54 || d[2] !== 0x41 || d[3] !== 0x30) return out // 'BTA0'
    const srt = u32(d, 0x10)
    const anims = readDict(d, srt + 8)
    if (!anims.length) return out
    const a = srt + u32(anims[0].data, 0)
    const frames = d[a + 4] | (d[a + 5] << 8)
    const comp = (rec: number, base: number): Float32Array | number => {
      const flag = u32(d, rec), val = u32(d, rec + 4)
      if (flag & 0x20000000) return i32(new Uint8Array(new Uint32Array([val]).buffer), 0) / 4096 // constant
      const n = flag & 0xffff
      const arr = new Float32Array(n)
      for (let f = 0; f < n; f++) arr[f] = (flag & 0x10000000 ? i16(d, base + val + f * 2) : i32(d, base + val + f * 4)) / 4096
      return arr
    }
    for (const m of readDict(d, a + 8)) {
      const rec = m.offset // five records of 8 bytes: scaleS, scaleT, rotation, moveS, moveT
      out.set(m.name, { frames, moveS: comp(rec + 24, a), moveT: comp(rec + 32, a) })
    }
  } catch { /* leave what we have */ }
  return out
}

export function valueAt(c: Float32Array | number, frame: number): number {
  return typeof c === 'number' ? c : c.length ? c[Math.min(c.length - 1, frame % c.length)] : 0
}
