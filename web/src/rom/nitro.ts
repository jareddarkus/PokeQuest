// Readers for Nintendo DS 3D files found in Pokémon Black 2 / White 2: models (BMD0 / NSBMD) and textures (BTX0 / NSBTX).
// Everything runs on the player's computer.
import { decompress } from './nds'

const ascii = (d: Uint8Array, o: number, n: number) => String.fromCharCode(...d.subarray(o, o + n))
const nameAt = (d: Uint8Array, o: number) => ascii(d, o, 16).replace(/\0+$/, '')

export interface DictEntry { name: string; data: Uint8Array; offset: number }

/** The "dictionary" structure used everywhere in these files: names + fixed-size data entries. */
export function readDict(d: Uint8Array, o: number): DictEntry[] {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const num = d[o + 1]
  const treeEnd = o + 8 + (num + 1) * 4
  const unit = dv.getUint16(treeEnd, true)
  const dataStart = treeEnd + 4
  const namesStart = dataStart + num * unit
  const out: DictEntry[] = []
  for (let i = 0; i < num; i++) {
    out.push({ name: nameAt(d, namesStart + i * 16), data: d.subarray(dataStart + i * unit, dataStart + (i + 1) * unit), offset: dataStart + i * unit })
  }
  return out
}

const u32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(o, true)
const u16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true)
const i16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt16(o, true)
const i32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(o, true)

// ---------------------------------------------------------------- textures
export interface Texture { name: string; width: number; height: number; rgba: Uint8Array; hasAlpha: boolean }
export interface TexFile { textures: Map<string, Texture>; paletteNames: string[] }

interface RawTex { name: string; params: number; data1: Uint8Array; data2?: Uint8Array }
interface RawPal { name: string; data: Uint8Array }

function findBlock(d: Uint8Array, magic: string): number {
  const n = u16(d, 0xe)
  for (let i = 0; i < n; i++) {
    const off = u32(d, 0x10 + i * 4)
    if (ascii(d, off, 4) === magic) return off
  }
  return -1
}

function readTexBlock(d: Uint8Array, t: number): { texs: RawTex[]; pals: RawPal[] } {
  const texBlockOff = u32(d, t + 0x14)
  const texOff = u16(d, t + 0x0e)
  const compInfoOff = u16(d, t + 0x1e)
  void compInfoOff
  const comp1 = u32(d, t + 0x24)
  const comp2 = u32(d, t + 0x28)
  const palBlockLen = u16(d, t + 0x30) << 3
  const palOff = u32(d, t + 0x34)
  const palBlockOff = u32(d, t + 0x38)
  const texs: RawTex[] = []
  for (const e of readDict(d, t + texOff)) {
    const params = u32(e.data, 0)
    const w = 8 << ((params >> 20) & 7)
    const h = 8 << ((params >> 23) & 7)
    const fmt = (params >> 26) & 7
    const off = (params & 0xffff) << 3
    const bits = [0, 8, 2, 4, 8, 2, 8, 16][fmt]
    const len = (w * h * bits) / 8
    if (fmt === 5) {
      texs.push({ name: e.name, params, data1: d.subarray(t + comp1 + off, t + comp1 + off + len), data2: d.subarray(t + comp2 + off / 2, t + comp2 + off / 2 + len / 2) })
    } else {
      texs.push({ name: e.name, params, data1: d.subarray(t + texBlockOff + off, t + texBlockOff + off + len) })
    }
  }
  const pals: RawPal[] = []
  const palEntries = readDict(d, t + palOff)
  const starts = palEntries.map((e) => u16(e.data, 0) << 3)
  palEntries.forEach((e, i) => {
    const start = starts[i]
    const end = Math.min(palBlockLen, ...starts.filter((s) => s > start))
    pals.push({ name: e.name, data: d.subarray(t + palBlockOff + start, t + palBlockOff + (Number.isFinite(end) ? end : palBlockLen)) })
  })
  return { texs, pals }
}

function rgb555(v: number): [number, number, number] {
  const c = (n: number) => (n << 3) | (n >> 2)
  return [c(v & 31), c((v >> 5) & 31), c((v >> 10) & 31)]
}

export function decodeTexture(tex: RawTex, pal: RawPal | undefined): Texture {
  const params = tex.params
  const w = 8 << ((params >> 20) & 7)
  const h = 8 << ((params >> 23) & 7)
  const fmt = (params >> 26) & 7
  const transparent0 = ((params >> 29) & 1) === 1
  const out = new Uint8Array(w * h * 4)
  let hasAlpha = false
  const pv = (i: number): [number, number, number] => {
    if (!pal || i * 2 + 1 >= pal.data.length) return [255, 0, 255]
    return rgb555(pal.data[i * 2] | (pal.data[i * 2 + 1] << 8))
  }
  const put = (x: number, y: number, rgb: [number, number, number], a: number) => {
    const o = (y * w + x) * 4
    out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = a
    if (a < 255) hasAlpha = true
  }
  const d = tex.data1
  if (fmt === 1) { // A3I5
    for (let i = 0; i < w * h; i++) {
      const b = d[i]
      const a3 = b >> 5
      put(i % w, (i / w) | 0, pv(b & 31), Math.round(((a3 << 2) + (a3 >> 1)) * 255 / 31))
    }
  } else if (fmt === 6) { // A5I3
    for (let i = 0; i < w * h; i++) {
      const b = d[i]
      put(i % w, (i / w) | 0, pv(b & 7), Math.round((b >> 3) * 255 / 31))
    }
  } else if (fmt === 2) { // 4 colours
    for (let i = 0; i < w * h; i++) {
      const c = (d[i >> 2] >> ((i & 3) * 2)) & 3
      put(i % w, (i / w) | 0, pv(c), transparent0 && c === 0 ? 0 : 255)
    }
  } else if (fmt === 3) { // 16 colours
    for (let i = 0; i < w * h; i++) {
      const c = (d[i >> 1] >> ((i & 1) * 4)) & 15
      put(i % w, (i / w) | 0, pv(c), transparent0 && c === 0 ? 0 : 255)
    }
  } else if (fmt === 4) { // 256 colours
    for (let i = 0; i < w * h; i++) {
      const c = d[i]
      put(i % w, (i / w) | 0, pv(c), transparent0 && c === 0 ? 0 : 255)
    }
  } else if (fmt === 7) { // direct colour
    for (let i = 0; i < w * h; i++) {
      const v = d[i * 2] | (d[i * 2 + 1] << 8)
      put(i % w, (i / w) | 0, rgb555(v), v & 0x8000 ? 255 : 0)
    }
  } else if (fmt === 5) { // 4x4 compressed
    const d2 = tex.data2!
    const bw = w / 4
    for (let by = 0; by < h / 4; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const bi = by * bw + bx
        const texels = d[bi * 4] | (d[bi * 4 + 1] << 8) | (d[bi * 4 + 2] << 16) | (d[bi * 4 + 3] << 24)
        const info = d2[bi * 2] | (d2[bi * 2 + 1] << 8)
        const base = (info & 0x3fff) * 2 // palette entries (4 bytes = 2 entries per step)
        const mode = info >> 14
        const c0 = pv(base), c1 = pv(base + 1)
        const mix = (a: number[], b: number[], wa: number, wb: number, den: number): [number, number, number] =>
          [Math.floor((a[0] * wa + b[0] * wb) / den), Math.floor((a[1] * wa + b[1] * wb) / den), Math.floor((a[2] * wa + b[2] * wb) / den)]
        let cols: Array<[[number, number, number], number]>
        if (mode === 0) cols = [[c0, 255], [c1, 255], [pv(base + 2), 255], [[0, 0, 0], 0]]
        else if (mode === 1) cols = [[c0, 255], [c1, 255], [mix(c0, c1, 1, 1, 2), 255], [[0, 0, 0], 0]]
        else if (mode === 2) cols = [[c0, 255], [c1, 255], [pv(base + 2), 255], [pv(base + 3), 255]]
        else cols = [[c0, 255], [c1, 255], [mix(c0, c1, 5, 3, 8), 255], [mix(c0, c1, 3, 5, 8), 255]]
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const c = (texels >>> ((y * 4 + x) * 2)) & 3
            put(bx * 4 + x, by * 4 + y, cols[c][0], cols[c][1])
          }
        }
      }
    }
  }
  return { name: tex.name, width: w, height: h, rgba: out, hasAlpha }
}

/** Reads a BTX0 / NSBTX file, or the texture block of a BMD0. Palettes are matched by name when used. */
export function readTexFile(raw: Uint8Array): { texs: RawTex[]; pals: RawPal[] } | null {
  const d = decompress(raw)
  const magic = ascii(d, 0, 4)
  if (magic !== 'BTX0' && magic !== 'BMD0') return null
  const t = findBlock(d, 'TEX0')
  if (t < 0) return null
  return readTexBlock(d, t)
}

// ---------------------------------------------------------------- models
export interface Vertex { x: number; y: number; z: number; u: number; v: number; r: number; g: number; b: number }
export interface Mesh { material: number; verts: Vertex[] } // triangles, 3 vertices each
export interface Material { name: string; texture: string | null; palette: string | null; width: number; height: number; alpha: number; cullBack: boolean; params: number; teximage: number }
export interface Model { name: string; meshes: Mesh[]; materials: Material[]; bounds: number[] }


const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a: number[], b: number[]): number[] { // column-major 4x4: result = a * b
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s }
  return o
}
const xf = (m: number[], x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
]

/** Decodes the display lists (the little programs that tell the DS graphics chip which triangles to draw). */
function decodeDisplayList(d: Uint8Array, mat0: number[], mesh: Mesh, texW: number, texH: number, stack?: number[][], scaleUp?: number[]): void {
  let mat = mat0
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const sizes: Record<number, number> = {
    0x00: 0, 0x10: 1, 0x11: 0, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 0, 0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9, 0x1b: 3, 0x1c: 3,
    0x20: 1, 0x21: 1, 0x22: 1, 0x23: 2, 0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1, 0x2a: 1, 0x2b: 1,
    0x30: 1, 0x31: 1, 0x32: 1, 0x33: 1, 0x34: 32, 0x40: 1, 0x41: 0, 0x50: 1, 0x60: 1, 0x70: 3, 0x71: 2, 0x72: 1,
  }
  let p = 0
  let color: [number, number, number] = [1, 1, 1]
  let u = 0, v = 0
  let vx = 0, vy = 0, vz = 0
  let shape = -1
  let pending: Vertex[] = []
  let strip: Vertex[] = []
  let stripIndex = 0

  const emitTri = (a: Vertex, b: Vertex, c: Vertex) => { mesh.verts.push(a, b, c) }
  const finishVertex = () => {
    const [x, y, z] = xf(mat, vx, vy, vz)
    const vert: Vertex = { x, y, z, u: u / texW, v: v / texH, r: color[0], g: color[1], b: color[2] }
    if (shape === 0) { pending.push(vert); if (pending.length === 3) { emitTri(pending[0], pending[1], pending[2]); pending = [] } }
    else if (shape === 1) { pending.push(vert); if (pending.length === 4) { emitTri(pending[0], pending[1], pending[2]); emitTri(pending[0], pending[2], pending[3]); pending = [] } }
    else if (shape === 2) {
      strip.push(vert)
      if (strip.length >= 3) {
        const n = strip.length
        if (stripIndex % 2 === 0) emitTri(strip[n - 3], strip[n - 2], strip[n - 1])
        else emitTri(strip[n - 2], strip[n - 3], strip[n - 1])
        stripIndex++
      }
    } else if (shape === 3) {
      strip.push(vert)
      if (strip.length >= 4 && strip.length % 2 === 0) {
        const n = strip.length
        emitTri(strip[n - 4], strip[n - 3], strip[n - 1])
        emitTri(strip[n - 4], strip[n - 1], strip[n - 2])
      }
    }
  }

  while (p + 4 <= d.length) {
    const cmds = [d[p], d[p + 1], d[p + 2], d[p + 3]]
    p += 4
    for (const c of cmds) {
      const n = sizes[c]
      if (n === undefined) { if (c === 0) continue; return }
      if (c === 0) continue
      const params: number[] = []
      for (let k = 0; k < n; k++) { params.push(dv.getUint32(p, true)); p += 4 }
      switch (c) {
        case 0x20: { const w = params[0]; color = [(w & 31) / 31, ((w >> 5) & 31) / 31, ((w >> 10) & 31) / 31]; break }
        case 0x22: { u = ((params[0] << 16) >> 16) / 16; v = ((params[0] >> 16) << 16 >> 16) / 16; break }
        case 0x23: { vx = ((params[0] << 16) >> 16) / 4096; vy = (params[0] >> 16) / 4096; vz = ((params[1] << 16) >> 16) / 4096; finishVertex(); break }
        case 0x24: { const w = params[0]; vx = (((w & 0x3ff) << 22) >> 22) / 64; vy = ((((w >> 10) & 0x3ff) << 22) >> 22) / 64; vz = ((((w >> 20) & 0x3ff) << 22) >> 22) / 64; finishVertex(); break }
        case 0x25: { vx = ((params[0] << 16) >> 16) / 4096; vy = (params[0] >> 16) / 4096; finishVertex(); break }
        case 0x26: { vx = ((params[0] << 16) >> 16) / 4096; vz = (params[0] >> 16) / 4096; finishVertex(); break }
        case 0x27: { vy = ((params[0] << 16) >> 16) / 4096; vz = (params[0] >> 16) / 4096; finishVertex(); break }
        case 0x28: { const w = params[0]; vx += (((w & 0x3ff) << 22) >> 22) / 4096; vy += ((((w >> 10) & 0x3ff) << 22) >> 22) / 4096; vz += ((((w >> 20) & 0x3ff) << 22) >> 22) / 4096; finishVertex(); break }
        case 0x14: if (stack && scaleUp && stack[params[0] & 31]) mat = mul(stack[params[0] & 31], scaleUp); break // a bone of a skinned model: use the matrix that the render program stored for it
        case 0x40: shape = params[0] & 3; pending = []; strip = []; stripIndex = 0; break
        case 0x41: shape = -1; break
        default: break
      }
    }
  }
}

/** translation / rotation (3 x 3, column by column) / scale of one object (bone); a missing part is null */
export interface Trs { t: number[] | null; r: number[] | null; s: number[] | null }

/** the 4 x 4 matrix (column by column) of T * R * S */
function trsMatrix(t: number[] | null, r: number[] | null, s: number[] | null): number[] {
  const R = r ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const [sx, sy, sz] = s ?? [1, 1, 1]
  const m = identity()
  m[0] = R[0] * sx; m[1] = R[1] * sx; m[2] = R[2] * sx
  m[4] = R[3] * sy; m[5] = R[4] * sy; m[6] = R[5] * sy
  m[8] = R[6] * sz; m[9] = R[7] * sz; m[10] = R[8] * sz
  if (t) { m[12] = t[0]; m[13] = t[1]; m[14] = t[2] }
  return m
}

/** A rotation made of one "pivot" entry (+1 or -1) and a 2 x 2 block [A B; C D] (like a cosine / sine pair); returned column by column. */
function pivotMat(select: number, neg: number, a: number, b: number): number[] {
  if (select >= 9) return [-a, 0, 0, 0, 0, 0, 0, 0, 0]
  const o = neg & 1 ? -1 : 1, c = neg & 2 ? -b : b, d = neg & 4 ? -a : a
  switch (select) {
    case 0: return [o, 0, 0, 0, a, b, 0, c, d]
    case 1: return [0, o, 0, a, 0, b, c, 0, d]
    case 2: return [0, 0, o, a, b, 0, c, d, 0]
    case 3: return [0, a, b, o, 0, 0, 0, c, d]
    case 4: return [a, 0, b, 0, o, 0, c, 0, d]
    case 5: return [a, b, 0, 0, 0, o, c, d, 0]
    case 6: return [0, a, b, 0, c, d, o, 0, 0]
    case 7: return [a, 0, b, c, 0, d, 0, o, 0]
    default: return [a, b, 0, c, d, 0, 0, 0, o]
  }
}

/** A rotation given by an orthonormal basis packed into five 16-bit numbers (the layout and the trick come from the MKDS Course Modifier, via the "apicula" project). */
function basisMat(in0: number, in1: number, in2: number, in3: number, in4: number): number[] {
  const input = [in4, in0, in1, in2, in3]
  const out = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < 5; i++) { out[i] = input[i] >> 3; out[5] = (out[5] << 3) | (input[i] & 7) }
  const f = (x: number) => { const v = x & 0x1fff; return (v & 0x1000 ? v - 0x2000 : v) / 4096 }
  const A = [f(out[1]), f(out[2]), f(out[3])], B = [f(out[4]), f(out[0]), f(out[5])]
  const C = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]]
  return [...A, ...B, ...C]
}

function readObjects(d: Uint8Array, base: number): Trs[] {
  const out: Trs[] = []
  for (const e of readDict(d, base)) {
    let p = base + u32(e.data, 0)
    const flags = u16(d, p)
    const m0 = i16(d, p + 2)
    p += 4
    const hasT = (flags & 1) === 0, hasR = ((flags >> 1) & 1) === 0, hasS = ((flags >> 2) & 1) === 0, pivot = ((flags >> 3) & 1) === 1
    let t: number[] | null = null, r: number[] | null = null, sc: number[] | null = null
    if (hasT) { t = [i32(d, p) / 4096, i32(d, p + 4) / 4096, i32(d, p + 8) / 4096]; p += 12 }
    if (pivot) {
      r = pivotMat((flags >> 4) & 15, (flags >> 8) & 15, i16(d, p) / 4096, i16(d, p + 2) / 4096)
      p += 4
    } else if (hasR) {
      r = [m0 / 4096]
      for (let k = 0; k < 8; k++) r.push(i16(d, p + k * 2) / 4096)
      p += 16
    }
    if (hasS) { sc = [i32(d, p) / 4096, i32(d, p + 4) / 4096, i32(d, p + 8) / 4096] }
    out.push({ t, r, s: sc })
  }
  return out
}

/**
 * The pose of a skeleton at one frame of a bone animation file (BCA0): for every bone the translation / rotation / scale curves
 * sampled at `frame` (a part without a curve is null: the model's own resting value is used). Format: see the "apicula" project.
 */
/** how many frames a bone animation file has */
export function poseFrameCount(raw: Uint8Array, animIndex = 0): number {
  try {
    const d = decompress(raw)
    const nBlocks = u16(d, 0xe)
    for (let i = 0; i < nBlocks; i++) { const o = u32(d, 0x10 + i * 4); if (ascii(d, o, 4) === 'JNT0') { const a = readDict(d, o + 8)[animIndex]; return a ? u16(d, o + u32(a.data, 0) + 4) : 0 } }
  } catch { /* not an animation */ }
  return 0
}

export function readPose(raw: Uint8Array, frame = 0, animIndex = 0): Trs[] | null {
  const d = decompress(raw)
  if (ascii(d, 0, 4) !== 'BCA0') return null
  let jnt = -1
  const nBlocks = u16(d, 0xe)
  for (let i = 0; i < nBlocks; i++) { const o = u32(d, 0x10 + i * 4); if (ascii(d, o, 4) === 'JNT0') jnt = o }
  if (jnt < 0) return null
  const anim = readDict(d, jnt + 8)[animIndex]
  if (!anim) return null
  const base = jnt + u32(anim.data, 0)
  const numObjects = u16(d, base + 6)
  const pivotData = base + u32(d, base + 0xc), basisData = base + u32(d, base + 0x10)
  const fetchMatrix = (x: number): number[] => {
    const idx = x & 0x7fff
    if (x >> 15) { const o = pivotData + idx * 6; const sn = u16(d, o); return pivotMat(sn & 15, (sn >> 4) & 15, i16(d, o + 2) / 4096, i16(d, o + 4) / 4096) }
    const o = basisData + idx * 10
    return basisMat(u16(d, o), u16(d, o + 2), u16(d, o + 4), u16(d, o + 6), u16(d, o + 8))
  }
  const sample = <T,>(c: { start: number; end: number; values: T[] } | T | null, lerp: (a: T, b: T, g: number) => T, isCurve: boolean): T | null => {
    if (c === null) return null
    if (!isCurve) return c as T
    const k = c as { start: number; end: number; values: T[] }
    if (!k.values.length) return null
    if (frame <= k.start) return k.values[0]
    if (frame >= k.end - 1) return k.values[k.values.length - 1]
    const idx = ((frame - k.start) / (k.end - 1 - k.start)) * (k.values.length - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    return lerp(k.values[lo], k.values[hi], idx - lo)
  }
  const num = (a: number, b: number, g: number) => a * (1 - g) + b * g
  const mat = (a: number[], b: number[], g: number) => a.map((v, i) => v * (1 - g) + b[i] * g)
  const result: Trs[] = []
  for (let i = 0; i < numObjects; i++) {
    let c = base + u16(d, base + 0x14 + i * 2)
    const flags = u16(d, c)
    c += 4
    const animated = (flags & 1) === 0
    const trs: Trs = { t: null, r: null, s: null }
    result.push(trs)
    if (!animated) continue
    const curveInfo = (x: number) => ({ start: x & 0xffff, end: (x >> 16) & 0xfff, rate: (x >>> 30) & 3, width: (x >> 28) & 3 })
    const readCurve = (width: number, count: number, offset: number, pair: boolean, wide: boolean): number[] => {
      const vals: number[] = []
      for (let k = 0; k < count; k++) {
        const stride = (wide ? 4 : 2) * (pair ? 2 : 1)
        const o = base + offset + k * stride
        vals.push(wide ? i32(d, o) / 4096 : i16(d, o) / 4096)
      }
      void width
      return vals
    }
    if (((flags >> 1) & 3) === 0) { // translation
      const t = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        if ((flags >> (3 + k)) & 1) { t[k] = i32(d, c) / 4096; c += 4 }
        else {
          const info = curveInfo(u32(d, c)), off = u32(d, c + 4); c += 8
          const n = (info.end - info.start) >> info.rate
          const cv = { start: info.start, end: info.end, values: readCurve(info.width, n, off, false, info.width === 0) }
          t[k] = sample(cv, num, true) ?? 0
        }
      }
      trs.t = t
    }
    if (((flags >> 6) & 3) === 0) { // rotation
      if ((flags >> 8) & 1) { trs.r = fetchMatrix(u16(d, c)); c += 4 }
      else {
        const info = curveInfo(u32(d, c)), off = u32(d, c + 4); c += 8
        const n = (info.end - info.start) >> info.rate
        const values: number[][] = []
        for (let k = 0; k < n; k++) values.push(fetchMatrix(u16(d, base + off + k * 2)))
        trs.r = sample({ start: info.start, end: info.end, values }, mat, true)
      }
    }
    if (((flags >> 9) & 3) === 0) { // scale
      const sc = [1, 1, 1]
      for (let k = 0; k < 3; k++) {
        if ((flags >> (11 + k)) & 1) { sc[k] = i32(d, c) / 4096; c += 8 }
        else {
          const info = curveInfo(u32(d, c)), off = u32(d, c + 4); c += 8
          const n = (info.end - info.start) >> info.rate
          const cv = { start: info.start, end: info.end, values: readCurve(info.width, n, off, true, info.width === 0) }
          sc[k] = sample(cv, num, true) ?? 1
        }
      }
      trs.s = sc
    }
  }
  return result
}

export function readModels(raw: Uint8Array, pose?: Trs[] | null): Model[] {
  const d = decompress(raw)
  if (ascii(d, 0, 4) !== 'BMD0') throw new Error('Not a BMD0 model file')
  const nBlocks = u16(d, 0xe)
  let mdl = -1
  for (let i = 0; i < nBlocks; i++) { const o = u32(d, 0x10 + i * 4); if (ascii(d, o, 4) === 'MDL0') mdl = o }
  if (mdl < 0) return []
  const out: Model[] = []
  for (const me of readDict(d, mdl + 8)) {
    const m0 = mdl + u32(me.data, 0)
    const cmdsOff = m0 + u32(d, m0 + 4)
    const matsOff = m0 + u32(d, m0 + 8)
    const piecesOff = m0 + u32(d, m0 + 12)
    const upScale = i32(d, m0 + 0x1c) / 4096
    const bounds = [0, 1, 2, 3, 4, 5].map((i) => i16(d, m0 + 0x2c + i * 2) / 4096)
    const objectTrs = readObjects(d, m0 + 0x40)
    // the bone matrices: the model's resting pose, or the given animation pose (parts that the animation does not set keep their resting value)
    const objects = objectTrs.map((o, i) => { const q = pose?.[i]; return { m: trsMatrix(q?.t ?? o.t, q?.r ?? o.r, q?.s ?? o.s) } })

    // materials
    const texPairOff = matsOff + u16(d, matsOff)
    const palPairOff = matsOff + u16(d, matsOff + 2)
    const matDict = readDict(d, matsOff + 4)
    const materials: Material[] = matDict.map((e) => {
      const o = matsOff + u32(e.data, 0)
      const polyAttr = u32(d, o + 0x0c)
      const teximage = u32(d, o + 0x14)
      const mask = u32(d, o + 0x10)
      return {
        name: e.name, texture: null, palette: null, width: u16(d, o + 0x20), height: u16(d, o + 0x22),
        alpha: ((polyAttr >> 16) & 31) / 31, cullBack: ((polyAttr >> 6) & 1) === 0, params: (teximage & mask) >>> 0, teximage,
      }
    })
    for (const [pairOff, field] of [[texPairOff, 'texture'], [palPairOff, 'palette']] as const) {
      for (const e of readDict(d, pairOff)) {
        const off = matsOff + u16(e.data, 0)
        const num = e.data[2]
        for (let k = 0; k < num; k++) { const id = d[off + k]; if (materials[id]) materials[id][field] = e.name }
      }
    }

    // pieces (display lists)
    const pieces = readDict(d, piecesOff).map((e) => {
      const ph = piecesOff + u32(e.data, 0)
      const cmds = d.subarray(ph + u32(d, ph + 8), ph + u32(d, ph + 8) + u32(d, ph + 12))
      return cmds
    })

    // run the render commands (the "SBC" program that says which piece to draw with which material and matrix)
    const meshes: Mesh[] = []
    let material = 0
    let cur = identity()
    const stack: number[][] = []
    for (let i = 0; i < 64; i++) stack.push(identity())
    let p = cmdsOff
    const scaleUp = [upScale, 0, 0, 0, 0, upScale, 0, 0, 0, 0, upScale, 0, 0, 0, 0, 1]
    for (let guard = 0; guard < 5000; guard++) {
      const op = d[p++]
      if (op === 0x01) break
      switch (op) {
        case 0x00: break
        case 0x02: p += 2; break
        case 0x03: cur = stack[d[p++]].slice(); break
        case 0x04: case 0x24: case 0x44: material = d[p++]; break
        case 0x05: {
          const pc = pieces[d[p++]]
          if (pc) {
            const mat = materials[material]
            const mesh: Mesh = { material, verts: [] }
            decodeDisplayList(pc, mul(cur, scaleUp), mesh, mat?.width || 1, mat?.height || 1, stack, scaleUp)
            if (mesh.verts.length) meshes.push(mesh)
          }
          break
        }
        case 0x06: case 0x26: case 0x46: case 0x66: {
          const obj = d[p++]
          p += 2 // parent id + unknown
          let store = -1
          let load = -1
          if (op === 0x26) store = d[p++]
          else if (op === 0x46) load = d[p++]
          else if (op === 0x66) { store = d[p++]; load = d[p++] }
          if (load >= 0) cur = stack[load].slice()
          if (objects[obj]) cur = mul(cur, objects[obj].m)
          if (store >= 0) stack[store] = cur.slice()
          break
        }
        case 0x09: { p += 1; const n = d[p++]; p += n * 3; break }
        case 0x0b: case 0x2b: break
        case 0x07: case 0x08: p += 1; break
        case 0x0c: case 0x0d: p += 2; break
        case 0x47: p += 2; break
        case 0x40: case 0x80: break
        default: break
      }
    }
    out.push({ name: me.name, meshes, materials, bounds })
  }
  return out
}

/** Just the name of the first model in a BMD0 file (cheap: no geometry is decoded). */
export function readModelName(raw: Uint8Array): string | null {
  try {
    const d = decompress(raw)
    if (ascii(d, 0, 4) !== 'BMD0') return null
    const nBlocks = u16(d, 0xe)
    for (let i = 0; i < nBlocks; i++) {
      const o = u32(d, 0x10 + i * 4)
      if (ascii(d, o, 4) === 'MDL0') return readDict(d, o + 8)[0]?.name ?? null
    }
  } catch { /* not a model */ }
  return null
}
