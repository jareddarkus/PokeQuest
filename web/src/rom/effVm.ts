// The script player of the game's battle animations: the scripts of the moves (archive a/0/6/5) and of the other battle effects (a/0/6/6).
// A script = a header (the number of variants, then 14 offsets per variant) followed by commands: a 16-bit command number and 32-bit arguments.
// Command numbers and argument counts: the public decompilation of Pokémon Black 2 / White 2 (include/asm/btlv_effvm.inc).

const ARGS: number[] = [5, 10, 6, 6, 2, 0, 1, 11, 15, 11, 10, 1, 11, 13, 11, 13, 10, 10, 7, 9, 6, 7, 6, 6, 6, 4, 2, 5, 2, 2, 7, 1, 5, 8, 2, 1, 1, 6, 6, 2, 1, 6, 5, 2, 7, 7, 7, 7, 2, 5, 1, 2, 9, 1, 8, 9, 1, 1, 1, 4, 4, 3, 1, 1, 2, 3, 0, 7, 1, 6, 3, 0, 1, 0, 1, 1, 1, 0]
const FIRST_EFFECT = 0x231 // effect numbers below this are moves

export type Side = 'me' | 'foe'

/** What the script needs from the battle screen. */
export interface EffHost {
  /** the side a position / target number stands for */
  sideOf(code: number): Side | 'all'
  load(particle: number): void
  /** an emitter of an effect file at a position (+ flying to another one) */
  emitter(particle: number, emitter: number | null, from: Side, to: Side | null, offX: number, offY: number, opts: { size: number; radius: number; life: number; frames?: number; height?: number }): Promise<void>
  sound(seq: number, delayFrames: number, volume: number): void
  sprite(side: Side | 'all', kind: 'scale' | 'move' | 'shake' | 'alpha' | 'blink' | 'rotate', a: number, b: number, frames: number, times: number): Promise<void>
  dim(from: number, to: number, frames: number): Promise<void>
  cry(side: Side | 'all'): void
  shakeCamera(amplitude: number, frames: number, count: number): Promise<void>
  /** moves the camera to a preset of the game (`moveType` 0 = jump, 1 = move) */
  camera(moveType: number, preset: number, frames: number, wait: number, brake: number): Promise<void>
  call(effect: number): Uint8Array | null
}

const fx = (v: number) => v / 4096
const sleep = (frames: number) => new Promise<void>((r) => setTimeout(r, (frames * 1000) / 60))

/** Plays a script. `depth` guards against scripts that call each other forever. */
export async function runEffScript(d: Uint8Array, host: EffHost, depth = 0): Promise<void> {
  if (d.length < 64 || depth > 6) return
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let pos = dv.getUint32(4, true)
  const pending: Promise<void>[] = []
  const vars = new Map<number, number>()
  let lastSound = 0
  const started = performance.now()
  const waitAll = async () => { const p = pending.splice(0); await Promise.all(p); const rest = lastSound - performance.now(); if (rest > 0) await new Promise((r) => setTimeout(r, Math.min(rest, 800))) }
  while (pos + 2 <= d.length && performance.now() - started < 9000) {
    const op = dv.getUint16(pos, true)
    if (op >= ARGS.length) break
    const n = ARGS[op]
    const a: number[] = []
    for (let i = 0; i < n; i++) a.push(dv.getInt32(pos + 2 + i * 4, true))
    const next = pos + 2 + n * 4
    pos = next
    switch (op) {
      case 0x00: pending.push(host.camera(a[0], a[1], a[2], a[3], a[4])); break
      case 0x03: pending.push(host.shakeCamera(a[1] / 4096, a[3], a[5])); break
      case 0x06: host.load(a[0]); break
      case 0x07: case 0x08: case 0x09: {
        const ortho = op === 0x09
        const offX = ortho ? fx(a[4]) : 0, offY = ortho ? fx(a[5]) : op === 0x07 ? fx(a[4]) : fx(a[8])
        const sc = op === 0x08 ? 11 : 7
        const from = host.sideOf(op === 0x08 ? 11 : a[2])
        pending.push(host.emitter(a[0], a[1], from === 'all' ? 'foe' : from, null, offX, offY, { radius: fx(a[sc]), life: fx(a[sc + 1]), size: fx(a[sc + 2]) }))
        break
      }
      case 0x0a: { // every emitter of the file
        const from = host.sideOf(a[1])
        pending.push(host.emitter(a[0], null, from === 'all' ? 'foe' : from, null, 0, fx(a[3]), { radius: fx(a[6]), life: fx(a[7]), size: fx(a[8]) }))
        break
      }
      case 0x0c: case 0x0d: case 0x0e: case 0x0f: { // an effect flying from one Pokémon to the other
        const o = op === 0x0d || op === 0x0f ? 2 : 0 // (the variants with a start position carry three more numbers)
        const from = host.sideOf(a[3 + o]), to = host.sideOf(a[4 + o])
        const frames = a[6 + o], height = fx(a[7 + o])
        pending.push(host.emitter(a[0], a[1], from === 'all' ? 'me' : from, to === 'all' ? 'foe' : to, 0, fx(a[5 + o]), { radius: 1, life: fx(a[8 + o]), size: 1, frames, height }))
        break
      }
      case 0x12: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'move', fx(a[2]), fx(a[3]), Math.max(1, a[4]), Math.max(1, a[6]))); break }
      case 0x14: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'shake', fx(a[4]), a[1], Math.max(1, a[5]), 1)); break }
      case 0x15: case 0x1e: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'scale', fx(a[2]), fx(a[3]), Math.max(1, a[4]), Math.max(1, a[6]))); break }
      case 0x16: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'rotate', (a[2] / 65536) * 360, 0, Math.max(1, a[3]), Math.max(1, a[5]))); break }
      case 0x17: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'alpha', a[2] / 31, 0, Math.max(1, a[3]), Math.max(1, a[5]))); break }
      case 0x19: { const s = host.sideOf(a[0]); pending.push(host.sprite(s, 'blink', 0, 0, Math.max(1, a[2]), Math.max(1, a[3]))); break }
      case 0x2a: pending.push(host.dim(a[1] / 16, a[2] / 16, Math.max(1, Math.abs(a[2] - a[1]) * Math.max(1, a[3])))); break
      case 0x34: { host.sound(a[0], a[3], a[5] / 127); lastSound = Math.max(lastSound, performance.now() + (a[3] * 1000) / 60 + 350); break }
      case 0x38: await waitAll(); break
      case 0x39: await sleep(a[0]); break
      case 0x3b: case 0x3c: case 0x3d: {
        let ok = false
        if (op === 0x3b) { const v = vars.get(a[0]) ?? 0; ok = [v === a[2], v !== a[2], v < a[2], v > a[2], v <= a[2], v >= a[2]][a[1]] ?? false }
        else if (op === 0x3c) { const v = vars.get(a[0]) ?? 0, w = vars.get(a[2]) ?? 0; ok = [v === w, v !== w, v < w, v > w, v <= w, v >= w][a[1]] ?? false }
        else ok = (a[0] <= 1) === (a[1] !== 0) // (singles: only the two Pokémon in front exist)
        if (ok) pos = next + a[op === 0x3d ? 2 : 3]
        break
      }
      case 0x3e: vars.set(-1, a[0]); break
      case 0x40: vars.set(a[0], a[1]); break
      case 0x43: host.cry(host.sideOf(a[0])); break
      case 0x46: { const sub = host.call(a[0]); if (sub) { await waitAll(); await runEffScript(sub, host, depth + 1) } break }
      case 0x47: case 0x4d: await waitAll(); return
      case 0x48: pos = next + a[0]; break
      default: break // (backgrounds, trainers, balls, cell actors, ... are not drawn)
    }
  }
  await waitAll()
}

export { FIRST_EFFECT }
