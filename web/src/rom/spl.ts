// The particle system of the game ("SPL"): the effect files of Pokémon Black 2 / White 2 (archive a/0/0/6 and others, magic "SPA ").
// A file holds emitter resources (what to emit, how it moves, how its size / colour / alpha change) and the pictures the particles use.
// Layout and rules follow the public decompilation of the same library (pret/pokeplatinum, lib/spl). Numbers are plain floats here (the game uses 20.12 fixed point: 4096 = 1.0).

const FX = 1 / 4096

let textureCounter = 0
export interface SplTexture { id: number; w: number; h: number; canvas: HTMLCanvasElement; tiles: { s: number; t: number } }
export interface SplScaleAnim { start: number; mid: number; end: number; inT: number; outT: number; loop: boolean }
export interface SplColorAnim { start: [number, number, number]; end: [number, number, number]; inT: number; peakT: number; outT: number; randomStart: boolean; loop: boolean; interpolate: boolean }
export interface SplAlphaAnim { start: number; mid: number; end: number; randomRange: number; loop: boolean; inT: number; outT: number }
export interface SplTexAnim { textures: number[]; frameCount: number; step: number; randomizeInit: boolean; loop: boolean }
export interface SplChild {
  usesBehaviors: boolean; hasScale: boolean; hasAlpha: boolean; rotationType: number; followEmitter: boolean; useChildColor: boolean; drawType: number; polyAxis: number; polyPlane: number
  randomInitVelMag: number; endScale: number; lifeTime: number; velocityRatio: number; scaleRatio: number; color: [number, number, number]
  emissionCount: number; emissionDelay: number; emissionInterval: number; texture: number; tileS: number; tileT: number; flipS: boolean; flipT: boolean; dpolFaceEmitter: boolean
}
export type SplBehavior =
  | { kind: 'gravity'; v: [number, number, number] }
  | { kind: 'random'; v: [number, number, number]; interval: number }
  | { kind: 'magnet'; target: [number, number, number]; force: number }
  | { kind: 'spin'; angle: number; axis: number }
  | { kind: 'collision'; y: number; elasticity: number; bounce: boolean }
  | { kind: 'convergence'; target: [number, number, number]; force: number }

export interface SplResource {
  emissionType: number; drawType: number; circleAxis: number
  hasScale: boolean; hasColor: boolean; hasAlpha: boolean; hasTex: boolean; hasRotation: boolean; randomInitAngle: boolean; selfMaintaining: boolean; followEmitter: boolean
  hasChild: boolean; polyAxis: number; polyPlane: number; randomizeLoop: boolean; drawChildrenFirst: boolean; hideParent: boolean; useViewSpace: boolean
  basePos: [number, number, number]; emissionCount: number; radius: number; length: number; axis: [number, number, number]; color: [number, number, number]
  initVelPos: number; initVelAxis: number; baseScale: number; aspect: number; startDelay: number; minRot: number; maxRot: number; initAngle: number
  emitterLife: number; particleLife: number; attBaseScale: number; attLife: number; attInitVel: number
  emissionInterval: number; baseAlpha: number; airResistance: number; textureIndex: number; loopFrames: number; dbbScale: number
  tileS: number; tileT: number; scaleAnimDir: number; dpolFaceEmitter: boolean; flipS: boolean; flipT: boolean; polyX: number; polyY: number
  scale?: SplScaleAnim; color2?: SplColorAnim; alpha?: SplAlphaAnim; tex?: SplTexAnim; child?: SplChild; behaviors: SplBehavior[]
}
export interface SplFile { resources: SplResource[]; textures: SplTexture[] }

const rgb = (v: number): [number, number, number] => [v & 31, (v >> 5) & 31, (v >> 10) & 31]

/** Reads one effect file. */
export function parseSpa(d: Uint8Array): SplFile {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const resCount = dv.getUint16(8, true), texCount = dv.getUint16(10, true), texOff = dv.getUint32(24, true)
  const resources: SplResource[] = []
  let p = 0x20
  for (let r = 0; r < resCount; r++) {
    const f = dv.getUint32(p, true)
    const b = (n: number) => ((f >> n) & 1) === 1
    const s16 = (o: number) => dv.getInt16(p + o, true) * FX
    const s32 = (o: number) => dv.getInt32(p + o, true) * FX
    const att = dv.getUint32(p + 64, true), m1 = dv.getUint32(p + 68, true), m2 = dv.getUint32(p + 72, true), m3 = dv.getUint32(p + 76, true)
    const res: SplResource = {
      emissionType: f & 15, drawType: (f >> 4) & 3, circleAxis: (f >> 6) & 3,
      hasScale: b(8), hasColor: b(9), hasAlpha: b(10), hasTex: b(11), hasRotation: b(12), randomInitAngle: b(13), selfMaintaining: b(14), followEmitter: b(15),
      hasChild: b(16), polyAxis: (f >> 17) & 3, polyPlane: (f >> 19) & 1, randomizeLoop: b(20), drawChildrenFirst: b(21), hideParent: b(22), useViewSpace: b(23),
      basePos: [s32(4), s32(8), s32(12)], emissionCount: s32(16), radius: s32(20), length: s32(24), axis: [s16(28), s16(30), s16(32)], color: rgb(dv.getUint16(p + 34, true)),
      initVelPos: s32(36), initVelAxis: s32(40), baseScale: s32(44), aspect: s16(48), startDelay: dv.getUint16(p + 50, true), minRot: dv.getInt16(p + 52, true), maxRot: dv.getInt16(p + 54, true),
      initAngle: dv.getUint16(p + 56, true), emitterLife: dv.getUint16(p + 60, true), particleLife: dv.getUint16(p + 62, true),
      attBaseScale: att & 255, attLife: (att >> 8) & 255, attInitVel: (att >> 16) & 255,
      emissionInterval: m1 & 255, baseAlpha: (m1 >> 8) & 255, airResistance: (m1 >> 16) & 255, textureIndex: (m1 >>> 24) & 255,
      loopFrames: m2 & 255, dbbScale: ((m2 >> 8) & 0xffff) * FX, tileS: (m2 >> 24) & 3, tileT: (m2 >> 26) & 3, scaleAnimDir: (m2 >> 28) & 7, dpolFaceEmitter: ((m2 >>> 31) & 1) === 1,
      flipS: (m3 & 1) === 1, flipT: ((m3 >> 1) & 1) === 1, polyX: s16(80), polyY: s16(82), behaviors: [],
    }
    p += 88
    if (res.hasScale) {
      res.scale = { start: dv.getInt16(p, true) * FX, mid: dv.getInt16(p + 2, true) * FX, end: dv.getInt16(p + 4, true) * FX, inT: dv.getUint8(p + 6), outT: dv.getUint8(p + 7), loop: (dv.getUint16(p + 8, true) & 1) === 1 }
      p += 12
    }
    if (res.hasColor) {
      const fl = dv.getUint16(p + 8, true)
      res.color2 = { start: rgb(dv.getUint16(p, true)), end: rgb(dv.getUint16(p + 2, true)), inT: dv.getUint8(p + 4), peakT: dv.getUint8(p + 5), outT: dv.getUint8(p + 6), randomStart: (fl & 1) === 1, loop: (fl & 2) === 2, interpolate: (fl & 4) === 4 }
      p += 12
    }
    if (res.hasAlpha) {
      const a = dv.getUint16(p, true), fl = dv.getUint16(p + 2, true)
      res.alpha = { start: a & 31, mid: (a >> 5) & 31, end: (a >> 10) & 31, randomRange: fl & 255, loop: (fl & 256) === 256, inT: dv.getUint8(p + 4), outT: dv.getUint8(p + 5) }
      p += 8
    }
    if (res.hasTex) {
      const prm = dv.getUint32(p + 8, true)
      res.tex = { textures: Array.from(d.subarray(p, p + 8)), frameCount: prm & 255, step: (prm >> 8) & 255, randomizeInit: ((prm >> 16) & 1) === 1, loop: ((prm >> 17) & 1) === 1 }
      p += 12
    }
    if (res.hasChild) {
      const fl = dv.getUint16(p, true), mc = dv.getUint32(p + 12, true), mc2 = dv.getUint32(p + 16, true)
      res.child = {
        usesBehaviors: (fl & 1) === 1, hasScale: (fl & 2) === 2, hasAlpha: (fl & 4) === 4, rotationType: (fl >> 3) & 3, followEmitter: (fl & 32) === 32, useChildColor: (fl & 64) === 64,
        drawType: (fl >> 7) & 3, polyAxis: (fl >> 9) & 3, polyPlane: (fl >> 11) & 1,
        randomInitVelMag: dv.getInt16(p + 2, true) * FX, endScale: dv.getInt16(p + 4, true) * FX, lifeTime: dv.getUint16(p + 6, true), velocityRatio: dv.getUint8(p + 8), scaleRatio: dv.getUint8(p + 9),
        color: rgb(dv.getUint16(p + 10, true)), emissionCount: mc & 255, emissionDelay: (mc >> 8) & 255, emissionInterval: (mc >> 16) & 255, texture: (mc >>> 24) & 255,
        tileS: mc2 & 3, tileT: (mc2 >> 2) & 3, flipS: ((mc2 >> 4) & 1) === 1, flipT: ((mc2 >> 5) & 1) === 1, dpolFaceEmitter: ((mc2 >> 6) & 1) === 1,
      }
      p += 20
    }
    const v16 = (o: number): [number, number, number] => [dv.getInt16(p + o, true) * FX, dv.getInt16(p + o + 2, true) * FX, dv.getInt16(p + o + 4, true) * FX]
    const v32 = (o: number): [number, number, number] => [dv.getInt32(p + o, true) * FX, dv.getInt32(p + o + 4, true) * FX, dv.getInt32(p + o + 8, true) * FX]
    if (b(24)) { res.behaviors.push({ kind: 'gravity', v: v16(0) }); p += 8 }
    if (b(25)) { res.behaviors.push({ kind: 'random', v: v16(0), interval: dv.getUint16(p + 6, true) }); p += 8 }
    if (b(26)) { res.behaviors.push({ kind: 'magnet', target: v32(0), force: dv.getInt16(p + 12, true) * FX }); p += 16 }
    if (b(27)) { res.behaviors.push({ kind: 'spin', angle: dv.getUint16(p, true), axis: dv.getUint16(p + 2, true) }); p += 4 }
    if (b(28)) { res.behaviors.push({ kind: 'collision', y: dv.getInt32(p, true) * FX, elasticity: dv.getInt16(p + 4, true) * FX, bounce: (dv.getUint16(p + 6, true) & 3) === 1 }); p += 8 }
    if (b(29)) { res.behaviors.push({ kind: 'convergence', target: v32(0), force: dv.getInt16(p + 12, true) * FX }); p += 16 }
    resources.push(res)
  }
  // the pictures
  const textures: SplTexture[] = []
  let q = texOff
  for (let t = 0; t < texCount; t++) {
    const param = dv.getUint32(q + 4, true), size = dv.getUint32(q + 8, true), palOff = dv.getUint32(q + 12, true), palSize = dv.getUint32(q + 16, true), resSize = dv.getUint32(q + 28, true)
    const fmt = param & 15, w = 8 << ((param >> 4) & 15), h = 8 << ((param >> 8) & 15), c0 = ((param >> 14) & 1) === 1
    const data = d.subarray(q + 32, q + 32 + size)
    const pal: Array<[number, number, number]> = []
    for (let i = 0; i < palSize / 2; i++) { const v = dv.getUint16(q + palOff + i * 2, true); pal.push([(v & 31) << 3 | (v & 31) >> 2, ((v >> 5) & 31) << 3 | ((v >> 5) & 31) >> 2, ((v >> 10) & 31) << 3 | ((v >> 10) & 31) >> 2]) }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(w, h)
    const put = (i: number, c: [number, number, number] | undefined, a: number) => { if (!c) return; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = a }
    for (let i = 0; i < w * h; i++) {
      if (fmt === 1) { const v = data[i]; put(i, pal[v & 31], Math.round(((v >> 5) * 255) / 7)) }
      else if (fmt === 6) { const v = data[i]; put(i, pal[v & 7], Math.round(((v >> 3) * 255) / 31)) }
      else if (fmt === 2) { const v = (data[i >> 2] >> ((i & 3) * 2)) & 3; put(i, pal[v], v === 0 && c0 ? 0 : 255) }
      else if (fmt === 3) { const v = (data[i >> 1] >> ((i & 1) * 4)) & 15; put(i, pal[v], v === 0 && c0 ? 0 : 255) }
      else if (fmt === 4) { const v = data[i]; put(i, pal[v], v === 0 && c0 ? 0 : 255) }
      else if (fmt === 7) { const v = data[i * 2] | (data[i * 2 + 1] << 8); put(i, [(v & 31) << 3, ((v >> 5) & 31) << 3, ((v >> 10) & 31) << 3], v & 0x8000 ? 255 : 0) }
    }
    ctx.putImageData(img, 0, 0)
    textures.push({ id: ++textureCounter, w, h, canvas: cv, tiles: { s: 1, t: 1 } })
    q += resSize
  }
  return { resources, textures }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
type V3 = [number, number, number]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a); return l < 1e-9 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l] }
const TAU = Math.PI * 2

/** The game's own random numbers (a simple linear generator), so effects play the same way every time. */
class Rng {
  state = 0
  next(): number { this.state = (Math.imul(this.state, 0x5eedf715) + 0x1b0cb173) >>> 0; return this.state }
  u(bits: number): number { return this.next() >>> (32 - bits) }
  /** a number in [-1, 1) */
  signed(): number { return (this.next() | 0) / 2147483648 }
  /** [0, 1) */
  unit(): number { return this.next() / 4294967296 }
  vec3(): V3 { return norm([this.signed(), this.signed(), this.signed()]) }
  vec2(): V3 { return norm([this.signed(), this.signed(), 0]) }
  /** the game's "scaled range": num * (255 - r * U8 / 256) / 256 */
  scaled(num: number, r: number): number { return (num * (255 - (r * this.u(8)) / 256)) / 256 }
  doubleScaled(num: number, r: number): number { return (num * (255 + r - (r * this.u(8)) / 128)) / 256 }
  range(num: number): number { return num * this.signed() }
}

interface Particle {
  pos: V3; vel: V3; emitterPos: V3; rot: number; angVel: number; life: number; age: number; loopFactor: number; lifeFactor: number
  tex: number; rateOffset: number; baseAlpha: number; animAlpha: number; baseScale: number; animScale: number; color: V3
}
export interface SplEmitter {
  res: SplResource; pos: V3; age: number; started: boolean; frac: number; terminate: boolean; paused: boolean
  particles: Particle[]; children: Particle[]
  axis: V3; crossA: V3; crossB: V3; collisionY: number | null
  /** tint: multiplies the particle colour (default 31,31,31 = unchanged) */
  tint: V3
  scaleMul: number
  vel: V3
}

/** What to draw: a quad in the world, picture, colour and opacity. */
export interface SplQuad { corners: [V3, V3, V3, V3]; tex: SplTexture; color: V3; alpha: number; flipS: boolean; flipT: boolean }

/** The camera the effect is seen with (needed for billboards). `right` / `up` / `look` are unit vectors in world space. */
export interface SplView { right: V3; up: V3; look: V3 }

export class SplSystem {
  emitters: SplEmitter[] = []
  rng = new Rng()
  file: SplFile
  constructor(file: SplFile) { this.file = file }

  /** Starts one emitter of the file at a place (world units). `tint` is a colour (0..31 per channel) the particles are multiplied with. */
  spawn(resIndex: number, pos: V3, tint: V3 = [31, 31, 31], scaleMul = 1): SplEmitter | null {
    const res = this.file.resources[resIndex]
    if (!res) return null
    const e: SplEmitter = {
      res, pos: add(pos, mul(res.basePos, scaleMul)), age: 0, started: false, frac: 0, terminate: false, paused: false, particles: [], children: [],
      axis: res.axis, crossA: [1, 0, 0], crossB: [0, 1, 0], collisionY: null, tint, scaleMul, vel: [0, 0, 0],
    }
    this.emitters.push(e)
    return e
  }
  /** Spawns every emitter resource of the file. */
  spawnAll(pos: V3, tint?: V3, scaleMul = 1) { for (let i = 0; i < this.file.resources.length; i++) this.spawn(i, pos, tint, scaleMul) }

  get busy(): boolean { return this.emitters.length > 0 }

  private axes(e: SplEmitter) {
    const r = e.res
    const up: V3 = [0, 1, 0]
    let axis: V3 = r.circleAxis === 0 ? [0, 0, 1] : r.circleAxis === 1 ? [0, 1, 0] : r.circleAxis === 2 ? [1, 0, 0] : norm(e.axis)
    if (Math.abs(Math.abs(dot(up, axis)) - 1) < 1e-4) axis = axis
    const v: V3 = Math.abs(Math.abs(dot(up, axis)) - 1) < 1e-4 ? [1, 0, 0] : up
    const c1 = norm(cross(axis, v))
    const c2 = norm(cross(axis, cross(axis, v)))
    e.crossA = c1; e.crossB = c2
  }

  private emit(e: SplEmitter, count: number, indexOffset: number, total: number) {
    const r = e.res, rng = this.rng, k = e.scaleMul
    this.axes(e)
    const tilt = (p: V3): V3 => { const n = norm(cross(e.crossA, e.crossB)); return add(add(mul(e.crossA, p[0]), mul(e.crossB, p[1])), mul(n, p[2])) }
    void count
    const radius = r.radius * k, length = r.length * k
    let pos: V3 = [0, 0, 0], velDir: V3 | null = null
    switch (r.emissionType) {
      case 0: break
      case 1: pos = mul(rng.vec3(), radius); break
      case 4: { const u = rng.vec3(); pos = [u[0] * radius * rng.signed(), u[1] * radius * rng.signed(), u[2] * radius * rng.signed()]; break }
      case 2: { const u = rng.vec2(); pos = tilt([u[0] * radius, u[1] * radius, 0]); break }
      case 3: { const a = ((indexOffset / Math.max(1, total)) * TAU); pos = tilt([Math.sin(a) * radius, Math.cos(a) * radius, 0]); break }
      case 5: { const u = rng.vec2(); pos = tilt([u[0] * radius * rng.signed(), u[1] * radius * rng.signed(), 0]); break }
      case 8: case 9: {
        let u = rng.vec3(); const up = cross(e.crossA, e.crossB)
        if (dot(up, u) < 0) u = mul(u, -1)
        pos = r.emissionType === 8 ? mul(u, radius) : [u[0] * radius * (0.5 + rng.unit() * 0.5), u[1] * radius * (0.5 + rng.unit() * 0.5), u[2] * radius * (0.5 + rng.unit() * 0.5)]
        break
      }
      case 6: case 7: {
        const u = rng.vec2(); const sc = r.emissionType === 7 ? rng.signed() : 1
        const raw: V3 = [u[0] * radius * sc, u[1] * radius * (r.emissionType === 7 ? rng.signed() : 1), rng.range(length)]
        velDir = tilt([u[0], u[1], 0]); pos = tilt(raw); break
      }
    }
    const magPos = rng.doubleScaled(r.initVelPos, r.attInitVel) * k, magAxis = rng.doubleScaled(r.initVelAxis, r.attInitVel) * k
    const posNorm = velDir ? norm(velDir) : (len(pos) < 1e-9 ? rng.vec3() : norm(pos))
    const vel = add(mul(posNorm, magPos), mul(norm(e.axis), magAxis))
    const life = Math.floor(rng.scaled(r.particleLife, r.attLife)) + 1
    let tex = r.textureIndex
    if (r.hasTex && r.tex) tex = r.tex.randomizeInit ? r.tex.textures[rng.u(12) % Math.max(1, r.tex.frameCount)] : r.tex.textures[0]
    let color: V3 = r.color
    if (r.color2?.randomStart) { const pick = rng.u(12) % 3; color = pick === 0 ? r.color2.start : pick === 1 ? r.color : r.color2.end }
    const p: Particle = {
      pos, vel, emitterPos: e.pos, rot: r.randomInitAngle ? rng.u(16) / 65536 * TAU : (r.initAngle / 65536) * TAU,
      angVel: r.hasRotation ? ((r.minRot + (r.maxRot - r.minRot) * rng.unit()) / 65536) * TAU : 0,
      life, age: 0, loopFactor: 255 / Math.max(1, r.loopFrames), lifeFactor: 255 / life, tex, rateOffset: r.randomizeLoop ? rng.u(8) : 0,
      baseAlpha: Math.min(31, r.baseAlpha), animAlpha: 31, baseScale: rng.doubleScaled(r.baseScale, r.attBaseScale) * k, animScale: 1, color,
    }
    e.particles.unshift(p)
  }

  private anim(e: SplEmitter, p: Particle, nonLoopRate: number, loopRate: number) {
    const r = e.res
    if (r.scale) {
      const a = r.scale, rate = a.loop ? loopRate : nonLoopRate
      if (rate < a.inT) p.animScale = a.start + (rate * (a.mid - a.start)) / Math.max(1, a.inT)
      else if (rate < a.outT) p.animScale = a.mid
      else p.animScale = a.end + ((rate - 255) * (a.end - a.mid)) / Math.max(1, 255 - a.outT)
    }
    if (r.color2 && !r.color2.randomStart) {
      const a = r.color2, rate = a.loop ? loopRate : nonLoopRate
      const peak = r.color
      const lerp = (from: V3, to: V3, t: number): V3 => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
      if (rate < a.inT) p.color = a.start
      else if (rate < a.peakT) p.color = a.interpolate ? lerp(a.start, peak, (rate - a.inT) / Math.max(1, a.peakT - a.inT)) : peak
      else if (rate < a.outT) p.color = a.interpolate ? lerp(peak, a.end, (rate - a.peakT) / Math.max(1, a.outT - a.peakT)) : a.end
      else p.color = a.end
    }
    if (r.alpha) {
      const a = r.alpha, rate = a.loop ? loopRate : nonLoopRate
      let v: number
      if (rate < a.inT) v = a.start + (rate * (a.mid - a.start)) / Math.max(1, a.inT)
      else if (rate < a.outT) v = a.mid
      else v = a.end + ((rate - 255) * (a.end - a.mid)) / Math.max(1, 255 - a.outT)
      p.animAlpha = Math.max(0, this.rng.scaled(v, a.randomRange))
    }
    if (r.tex && !r.tex.randomizeInit) {
      const a = r.tex, rate = r.tex.loop ? loopRate : nonLoopRate
      for (let i = 0; i < a.frameCount; i++) if (rate < a.step * (i + 1)) { p.tex = a.textures[i]; break }
    }
  }

  private behaviours(e: SplEmitter, p: Particle, acc: V3) {
    for (const b of e.res.behaviors) {
      if (b.kind === 'gravity') { acc[0] += b.v[0]; acc[1] += b.v[1]; acc[2] += b.v[2] }
      else if (b.kind === 'random') { if (b.interval > 0 && p.age % b.interval === 0) { acc[0] += this.rng.range(b.v[0]); acc[1] += this.rng.range(b.v[1]); acc[2] += this.rng.range(b.v[2]) } }
      else if (b.kind === 'magnet') { for (let i = 0; i < 3; i++) acc[i] += b.force * ((b.target[i] - p.pos[i]) - p.vel[i]) }
      else if (b.kind === 'spin') {
        const a = (b.angle / 65536) * TAU, c = Math.cos(a), s = Math.sin(a), [x, y, z] = p.pos
        if (b.axis === 0) p.pos = [x, y * c - z * s, y * s + z * c]
        else if (b.axis === 1) p.pos = [x * c + z * s, y, -x * s + z * c]
        else p.pos = [x * c - y * s, x * s + y * c, z]
      } else if (b.kind === 'collision') {
        const y = e.collisionY ?? b.y, ey = p.emitterPos[1]
        const crossed = (ey < y && ey + p.pos[1] > y) || (ey >= y && ey + p.pos[1] < y)
        if (crossed) { p.pos[1] = y - ey; if (b.bounce) p.vel[1] = -p.vel[1] * b.elasticity; else p.age = p.life }
      } else if (b.kind === 'convergence') { for (let i = 0; i < 3; i++) p.pos[i] += b.force * (b.target[i] - p.pos[i]) }
    }
  }

  private integrate(e: SplEmitter, p: Particle, acc: V3) {
    p.rot += p.angVel
    const air = (e.res.airResistance + 384) / 512
    p.vel = [p.vel[0] * air + acc[0], p.vel[1] * air + acc[1], p.vel[2] * air + acc[2]]
    p.pos = [p.pos[0] + p.vel[0] + e.vel[0], p.pos[1] + p.vel[1] + e.vel[1], p.pos[2] + p.vel[2] + e.vel[2]]
  }

  /** One frame (the game runs this 60 times a second). */
  update() {
    const rng = this.rng
    for (const e of this.emitters) {
      const r = e.res
      if (!e.started && e.age >= r.startDelay) { e.started = true; e.age = 0 }
      if (e.paused) continue
      // emit
      const interval = Math.max(1, r.emissionInterval)
      if ((r.emitterLife === 0 || e.age < r.emitterLife) && e.age % interval === 0 && !e.terminate && e.started) {
        const sum = r.emissionCount + e.frac
        const total = Math.floor(sum); e.frac = sum - total
        for (let i = 0; i < total; i++) this.emit(e, total, i, total)
      }
      const kids = r.child
      for (let i = e.particles.length - 1; i >= 0; i--) {
        const p = e.particles[i]
        const nonLoop = Math.min(255, p.lifeFactor * p.age), loop = (p.rateOffset + p.loopFactor * p.age) % 256
        this.anim(e, p, nonLoop, loop)
        const acc: V3 = [0, 0, 0]
        if (r.followEmitter) p.emitterPos = e.pos
        this.behaviours(e, p, acc)
        this.integrate(e, p, acc)
        if (kids) {
          const delay = (p.life * kids.emissionDelay) / 256
          const diff = p.age - delay
          if (diff >= 0 && Math.floor(diff) % Math.max(1, kids.emissionInterval) === 0) {
            for (let c = 0; c < kids.emissionCount; c++) {
              const parentScale = p.baseScale * p.animScale
              const child: Particle = {
                pos: [...p.pos], emitterPos: p.emitterPos, vel: [0, 1, 2].map((a) => p.vel[a] * (kids.velocityRatio / 256) + rng.range(kids.randomInitVelMag)) as V3,
                rot: kids.rotationType === 0 ? 0 : p.rot, angVel: kids.rotationType === 2 ? p.angVel : 0, life: Math.max(1, kids.lifeTime), age: 0, loopFactor: 0, lifeFactor: 255 / Math.max(1, kids.lifeTime),
                tex: kids.texture, rateOffset: 0, baseAlpha: (p.baseAlpha * (p.animAlpha + 1)) / 32, animAlpha: 31, baseScale: (parentScale * (kids.scaleRatio + 1)) / 64, animScale: 1,
                color: kids.useChildColor ? kids.color : p.color,
              }
              e.children.unshift(child)
            }
          }
        }
        p.age += 1
        if (p.age > p.life) e.particles.splice(i, 1)
      }
      if (kids) {
        for (let i = e.children.length - 1; i >= 0; i--) {
          const c = e.children[i]
          const rate = Math.floor(((c.age * 256) / Math.max(1, c.life)) % 256)
          if (kids.hasScale) c.animScale = kids.endScale + ((kids.endScale - 1) * (rate - 255)) / 255
          if (kids.hasAlpha) c.animAlpha = ((255 - rate) * 31) / 255
          const acc: V3 = [0, 0, 0]
          if (kids.followEmitter) c.emitterPos = e.pos
          if (kids.usesBehaviors) this.behaviours(e, c, acc)
          this.integrate(e, c, acc)
          c.age += 1
          if (c.age > c.life) e.children.splice(i, 1)
        }
      }
      e.age += 1
    }
    this.emitters = this.emitters.filter((e) => {
      const r = e.res
      const ended = (r.selfMaintaining && r.emitterLife !== 0 && e.started && e.age > r.emitterLife) || e.terminate
      return !(ended && e.particles.length === 0 && e.children.length === 0)
    })
  }

  /** Turns every live particle into quads (world space) for the given view. */
  quads(view: SplView): SplQuad[] {
    const out: SplQuad[] = []
    for (const e of this.emitters) {
      const r = e.res
      const draw = (list: Particle[], child: boolean) => {
        const kids = r.child
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]
          const alpha = (p.baseAlpha * (p.animAlpha + 1)) / 32 / 31
          if (alpha <= 0.001) continue
          const tex = this.file.textures[child ? kids!.texture : p.tex] ?? this.file.textures[0]
          if (!tex) continue
          const aspect = r.aspect || 1
          let sy = p.baseScale, sx = p.baseScale * aspect
          if (r.scaleAnimDir === 0) { sx *= p.animScale; sy *= p.animScale } else if (r.scaleAnimDir === 1) sx *= p.animScale; else sy *= p.animScale
          const centre = add(p.pos, p.emitterPos)
          const color: V3 = [(p.color[0] * e.tint[0]) / 31, (p.color[1] * e.tint[1]) / 31, (p.color[2] * e.tint[2]) / 31]
          const dt = child ? kids!.drawType : r.drawType
          const ox = child ? 0 : r.polyX, oy = child ? 0 : r.polyY
          const mk = (xa: V3, ya: V3): [V3, V3, V3, V3] => {
            const o = add(centre, add(mul(xa, ox * 1), mul(ya, oy)))
            return [add(o, add(mul(xa, -1), mul(ya, 1))), add(o, add(mul(xa, 1), mul(ya, 1))), add(o, add(mul(xa, 1), mul(ya, -1))), add(o, add(mul(xa, -1), mul(ya, -1)))]
          }
          let corners: [V3, V3, V3, V3]
          if (dt === 0) {
            const c = Math.cos(p.rot), s = Math.sin(p.rot)
            const xa = add(mul(view.right, c * sx), mul(view.up, s * sx)), ya = add(mul(view.right, -s * sy), mul(view.up, c * sy))
            corners = mk(xa, ya)
          } else if (dt === 1) {
            let dir = norm(cross(p.vel, view.look)); if (len(dir) === 0) continue
            dir = norm(dir)
            const vd = norm(p.vel), d = Math.abs(dot(vd, mul(view.look, -1)))
            const s2 = sy * ((1 - d) * r.dbbScale + 1)
            const dir2 = norm(cross(view.look, dir))
            corners = mk(mul(dir, sx), mul(dir2, s2))
          } else {
            const plane = child ? kids!.polyPlane : r.polyPlane
            let ax: V3 = [1, 0, 0], ay: V3 = plane === 0 ? [0, 1, 0] : [0, 0, 1]
            const c = Math.cos(p.rot), s = Math.sin(p.rot)
            const rotY = (v: V3): V3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
            const axisKind = child ? kids!.polyAxis : r.polyAxis
            const rot = (v: V3): V3 => { if (axisKind === 0) return rotY(v); const d = (1 - c) / 3, sq = s / Math.sqrt(3); return [(d + c) * v[0] + (d - sq) * v[1] + (d + sq) * v[2], (d + sq) * v[0] + (d + c) * v[1] + (d - sq) * v[2], (d - sq) * v[0] + (d + sq) * v[1] + (d + c) * v[2]] }
            if (dt >= 3) {
              const unit = (child ? kids!.dpolFaceEmitter : r.dpolFaceEmitter) ? mul(norm(p.pos), -1) : norm(p.vel)
              if (len(unit) > 0) {
                const axis: V3 = Math.abs(dot(unit, [0, 1, 0])) > 0.8 ? [1, 0, 0] : [0, 1, 0]
                const d1 = norm(cross(unit, axis)), d2 = norm(cross(unit, d1))
                const frame = (v: V3): V3 => add(add(mul(d1, v[0]), mul(unit, v[1])), mul(d2, v[2]))
                ax = frame(rot(ax)); ay = frame(rot(ay))
              }
            } else { ax = rot(ax); ay = rot(ay) }
            corners = mk(mul(ax, sx), mul(ay, sy))
          }
          out.push({ corners, tex, color, alpha, flipS: r.flipS, flipT: r.flipT })
        }
      }
      const first = r.drawChildrenFirst
      if (first && r.child) draw(e.children, true)
      if (!r.hideParent) draw(e.particles, false)
      if (!first && r.child) draw(e.children, true)
    }
    return out
  }
}
