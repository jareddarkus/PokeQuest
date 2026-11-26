// Plays the game's own particle effects in the battle: the effect files (a/0/0/6) a move / stat change / healing script starts (found in the scripts a/0/6/5 and a/0/6/6).
import { loadRomBlob } from './store'
import { parseNarc } from './nds'
import { parseSpa, SplSystem, type SplFile } from './spl'
import { drawQuads } from './splDraw'

type Pt = { x: number; y: number }
const MAX_FILE = 739

/** The effect files the script of an animation starts: every "load particle file" command (6, number) in the script. */
function particleIds(script: Uint8Array, effectFiles: Uint8Array[]): number[] {
  if (script.length < 64) return []
  const n = (script.length - 60) >> 1
  const dv = new DataView(script.buffer, script.byteOffset + 60, n * 2)
  const out: number[] = []
  for (let i = 0; i + 1 < n; i++) {
    if (dv.getUint16(i * 2, true) !== 6) continue
    const id = dv.getUint16(i * 2 + 2, true)
    if (id > 0 && id < MAX_FILE && effectFiles[id] && effectFiles[id][0] === 0x20 && effectFiles[id][1] === 0x41) out.push(id)
  }
  return out
}

interface Session { sys: SplSystem; origin: Pt; k: number; track: ((frame: number) => Pt) | null; frame: number; done: () => void; maxFrames: number }

export class SplFx {
  private effects: Uint8Array[] | null = null
  private moveScripts: Uint8Array[] | null = null
  private effectScripts: Uint8Array[] | null = null
  private files = new Map<number, SplFile>()
  private sessions: Session[] = []
  private canvas: HTMLCanvasElement | null = null
  private raf = 0
  private acc = 0
  private last = 0
  /** how many canvas pixels one picture pixel of the game's 256 x 192 screen is (the effects are drawn at the DS resolution and scaled up) */
  ready = false
  /** playing speed (1 = the game's 60 frames a second); only changed by the developer tools */
  speed = 1

  async load(): Promise<boolean> {
    if (this.ready) return true
    try {
      let eff = await loadRomBlob('spl:effects'), mv = await loadRomBlob('script:move'), es = await loadRomBlob('script:effect')
      if (!eff && import.meta.env.DEV) { // the local test server reads the game file directly
        const { devRomSource } = await import('./devSource')
        const { NdsFile } = await import('./nds')
        const src = await devRomSource()
        if (src) { const nds = new NdsFile(src); await nds.open(); eff = await nds.get('a/0/0/6'); mv = await nds.get('a/0/6/5'); es = await nds.get('a/0/6/6') }
      }
      if (!eff || !mv || !es) return false
      this.effects = parseNarc(eff); this.moveScripts = parseNarc(mv); this.effectScripts = parseNarc(es)
      this.ready = true
    } catch { this.ready = false }
    return this.ready
  }

  attach(canvas: HTMLCanvasElement | null) { this.canvas = canvas }

  moveScript(move: number): Uint8Array | null { return this.ready ? this.moveScripts?.[move] ?? null : null }
  effectScript(index: number): Uint8Array | null { return this.ready ? this.effectScripts?.[index] ?? null : null }
  /** Makes sure an effect file is parsed (the scripts load them before use). */
  preload(id: number) { if (this.ready) this.file(id) }

  /** The eight pictures of a Poké Ball in an effect file (turning, opening, closed again), as image addresses; null when the file is not there. */
  ballFrames(id: number): string[] | null {
    const f = this.ready ? this.file(id) : null
    return f && f.textures.length >= 8 ? f.textures.slice(0, 8).map((t) => t.canvas.toDataURL()) : null
  }

  moveEffects(move: number): number[] { return this.ready && this.moveScripts?.[move] ? particleIds(this.moveScripts[move], this.effects!) : [] }
  effectEffects(index: number): number[] { return this.ready && this.effectScripts?.[index] ? particleIds(this.effectScripts[index], this.effects!) : [] }

  private file(id: number): SplFile | null {
    let f = this.files.get(id)
    if (!f) { try { f = parseSpa(this.effects![id]); this.files.set(id, f) } catch { return null } }
    return f
  }

  /**
   * Plays effect files. `from` / `to` are positions in canvas pixels; with `travel` the effect flies from `from` to `to` (moves like Ember), otherwise it stays at `to`.
   * `k` = canvas pixels per unit of the effect's world. Resolves when everything has faded out (at most `maxFrames` frames).
   */
  play(ids: number[], from: Pt, to: Pt, k: number, opts: { travel?: boolean; maxFrames?: number; tint?: [number, number, number] } = {}): Promise<void> {
    if (!this.ready || !this.canvas || !ids.length) return Promise.resolve()
    const travelFrames = 22
    return new Promise((resolve) => {
      let pending = ids.length
      const finish = () => { if (--pending <= 0) resolve() }
      for (const id of ids) {
        const f = this.file(id)
        if (!f) { finish(); continue }
        const sys = new SplSystem(f)
        const origin = to
        const track = opts.travel ? (frame: number): Pt => { const t = Math.min(1, frame / travelFrames); return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } } : null
        const start = track ? track(0) : to
        sys.spawnAll([(start.x - origin.x) / k, -(start.y - origin.y) / k, 0], opts.tint)
        this.sessions.push({ sys, origin, k, track, frame: 0, done: finish, maxFrames: opts.maxFrames ?? 150 })
      }
      this.run()
    })
  }

  /**
   * Starts ONE effect of a file (`emitter` = which emitter of the file, or all of them) at a place (canvas pixels), optionally flying to another place.
   * `size` / `radius` / `life` are the script's scale factors. Resolves when the effect has faded out.
   */
  emit(id: number, emitter: number | null, from: Pt, to: Pt | null, k: number, opts: { size?: number; radius?: number; life?: number; frames?: number; height?: number; maxFrames?: number } = {}): Promise<void> {
    if (!this.ready || !this.canvas) return Promise.resolve()
    const f = this.file(id)
    if (!f) return Promise.resolve()
    return new Promise((resolve) => {
      const sys = new SplSystem(f)
      const origin = to ?? from
      const flight = to ? Math.max(1, opts.frames ?? 22) : 0
      const h = (opts.height ?? 0) * k
      const track = to ? (frame: number): Pt => { const t = Math.min(1, frame / flight); return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * h } } : null
      const start = track ? track(0) : from
      const at: [number, number, number] = [(start.x - origin.x) / k, -(start.y - origin.y) / k, 0]
      const o = { size: opts.size, radius: opts.radius, life: opts.life }
      if (emitter === null) sys.spawnAll(at, undefined, o); else sys.spawn(emitter, at, undefined, o)
      this.sessions.push({ sys, origin, k, track, frame: 0, done: resolve, maxFrames: opts.maxFrames ?? 240 })
      this.run()
    })
  }

  private run() {
    if (this.raf) return
    this.last = performance.now()
    const loop = (now: number) => {
      this.acc += Math.min(100, now - this.last) * this.speed; this.last = now
      while (this.acc >= 1000 / 60) { this.acc -= 1000 / 60; this.step() }
      this.draw()
      if (this.sessions.length) this.raf = requestAnimationFrame(loop)
      else { this.raf = 0; const c = this.canvas; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height) }
    }
    this.raf = requestAnimationFrame(loop)
  }

  private step() {
    for (const s of this.sessions) {
      if (s.track) { const p = s.track(s.frame); for (const e of s.sys.emitters) e.pos = [(p.x - s.origin.x) / s.k, -(p.y - s.origin.y) / s.k, 0] }
      s.sys.update()
      s.frame++
    }
    this.sessions = this.sessions.filter((s) => { const end = !s.sys.busy || s.frame >= s.maxFrames; if (end) s.done(); return !end })
  }

  private draw() {
    const c = this.canvas
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of this.sessions) {
      const quads = s.sys.quads({ right: [1, 0, 0], up: [0, 1, 0], look: [0, 0, -1] })
      drawQuads(ctx, quads, (p) => [s.origin.x + p[0] * s.k, s.origin.y - p[1] * s.k])
    }
  }
}
