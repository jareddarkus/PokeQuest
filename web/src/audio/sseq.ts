// A small player for the Nintendo DS sound format (SSEQ songs, SBNK instrument banks, SWAR sample archives) using the browser's WebAudio.
// It is a simplified version of what the DS does: notes are samples played at the right pitch with a volume envelope, PSG
// (square wave) and noise instruments are made with oscillators. Good enough to recognise the real songs of the game.
const u8 = (d: Uint8Array, o: number) => d[o]
const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8)
const s16 = (d: Uint8Array, o: number) => (u16(d, o) << 16) >> 16
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0

// ---------------------------------------------------------------- sample archive
export interface Wave { rate: number; samples: Float32Array; loopStart: number; loops: boolean }

const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767]
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]

export function parseSwar(file: Uint8Array): Array<Wave | null> {
  const count = u32(file, 0x38)
  const out: Array<Wave | null> = []
  for (let i = 0; i < count; i++) {
    const o = u32(file, 0x3c + i * 4)
    if (!o || o + 12 > file.length) { out.push(null); continue }
    const type = u8(file, o), loop = u8(file, o + 1) !== 0, rate = u16(file, o + 2)
    const loopWords = u16(file, o + 6), lenWords = u32(file, o + 8)
    const data = file.subarray(o + 12, o + 12 + (loopWords + lenWords) * 4)
    let samples: Float32Array
    let loopStart: number
    if (type === 0) { // 8-bit
      samples = new Float32Array(data.length)
      for (let k = 0; k < data.length; k++) samples[k] = ((data[k] << 24) >> 24) / 128
      loopStart = loopWords * 4
    } else if (type === 1) { // 16-bit
      samples = new Float32Array(data.length >> 1)
      for (let k = 0; k < samples.length; k++) samples[k] = s16(data, k * 2) / 32768
      loopStart = loopWords * 2
    } else { // IMA ADPCM, 4-byte header
      let pred = s16(data, 0)
      let idx = Math.min(88, Math.max(0, u16(data, 2) & 0x7f))
      samples = new Float32Array((data.length - 4) * 2)
      let n = 0
      for (let k = 4; k < data.length; k++) {
        for (let h = 0; h < 2; h++) {
          const nib = h === 0 ? data[k] & 15 : data[k] >> 4
          const step = IMA_STEP[idx]
          let diff = step >> 3
          if (nib & 1) diff += step >> 2
          if (nib & 2) diff += step >> 1
          if (nib & 4) diff += step
          pred = nib & 8 ? Math.max(-32768, pred - diff) : Math.min(32767, pred + diff)
          idx = Math.min(88, Math.max(0, idx + IMA_INDEX[nib & 7]))
          samples[n++] = pred / 32768
        }
      }
      loopStart = Math.max(0, (loopWords - 1) * 8)
    }
    out.push({ rate, samples, loopStart: Math.min(loopStart, samples.length - 1), loops: loop })
  }
  return out
}

// ---------------------------------------------------------------- instrument bank
export interface Region { kind: 'pcm' | 'psg' | 'noise'; swav: number; swar: number; note: number; a: number; d: number; s: number; r: number; pan: number }
export interface Instrument { regions: Array<{ hi: number; region: Region }> } // note ranges; hi = highest key of the region

function readRegion(d: Uint8Array, o: number, type: number): Region | null {
  const kind = type === 1 ? 'pcm' : type === 2 ? 'psg' : type === 3 ? 'noise' : null
  if (!kind) return null
  return { kind, swav: u16(d, o), swar: u16(d, o + 2), note: u8(d, o + 4), a: u8(d, o + 5), d: u8(d, o + 6), s: u8(d, o + 7), r: u8(d, o + 8), pan: u8(d, o + 9) }
}

export function parseSbnk(file: Uint8Array): Array<Instrument | null> {
  const count = u32(file, 0x38)
  const out: Array<Instrument | null> = []
  for (let i = 0; i < count; i++) {
    const type = u8(file, 0x3c + i * 4)
    const o = u16(file, 0x3c + i * 4 + 1)
    if (!type || !o) { out.push(null); continue }
    try {
      if (type >= 1 && type <= 3) {
        const r = readRegion(file, o, type)
        out.push(r ? { regions: [{ hi: 127, region: r }] } : null)
      } else if (type === 16) { // drum set: one record per key
        const lo = u8(file, o), hi = u8(file, o + 1)
        const regions: Instrument['regions'] = []
        for (let k = lo; k <= hi; k++) {
          const p = o + 2 + (k - lo) * 12
          const r = readRegion(file, p + 2, u16(file, p))
          if (r) regions.push({ hi: k, region: r })
        }
        out.push({ regions })
      } else if (type === 17) { // key split: 8 key ends, 8 records
        const regions: Instrument['regions'] = []
        for (let k = 0; k < 8; k++) {
          const end = u8(file, o + k)
          if (!end) break
          const p = o + 8 + k * 12
          const r = readRegion(file, p + 2, u16(file, p))
          if (r) regions.push({ hi: end, region: r })
        }
        out.push({ regions })
      } else out.push(null)
    } catch { out.push(null) }
  }
  return out
}

// ---------------------------------------------------------------- song
interface Track {
  pos: number; wait: number; ended: boolean
  prog: number; vol: number; expr: number; pan: number; bend: number; bendRange: number; transpose: number
  a: number; d: number; s: number; r: number
  tie: boolean; noteWait: boolean; loopStack: Array<{ pos: number; count: number }>; callStack: number[]
  lastNoteEnd: number; mono: boolean
}

function newTrack(pos: number): Track {
  return { pos, wait: 0, ended: false, prog: 0, vol: 127, expr: 127, pan: 64, bend: 0, bendRange: 2, transpose: 0, a: 255, d: 255, s: 255, r: 255, tie: false, noteWait: true, loopStack: [], callStack: [], lastNoteEnd: 0, mono: false }
}

export class SongPlayer {
  private ctx: AudioContext
  private out: GainNode
  private tracks: Track[] = []
  private data: Uint8Array
  private base: number
  private bank: Array<Instrument | null>
  private waves: Array<Array<Wave | null>>
  private buffers = new Map<Wave, AudioBuffer>()
  private tempo = 120
  private nextTick = 0
  private timer = 0
  private vars = new Int16Array(16)
  private master = 127
  private songVol: number
  private pulse: PeriodicWave[] = []
  private noiseBuf: AudioBuffer | null = null
  private active = 0
  private loop: boolean
  private onEnd?: () => void
  private stopped = false
  private paused = false

  constructor(ctx: AudioContext, dest: AudioNode, sseq: Uint8Array, bank: Uint8Array, waveFiles: Array<Uint8Array | null>, songVol: number, loop: boolean, onEnd?: () => void) {
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 1
    this.out.connect(dest)
    this.data = sseq
    this.base = u32(sseq, 0x18) // start of the song data
    this.bank = parseSbnk(bank)
    this.waves = waveFiles.map((f) => (f ? parseSwar(f) : []))
    this.songVol = songVol / 127
    this.loop = loop
    this.onEnd = onEnd
    for (let duty = 0; duty < 7; duty++) {
      const n = 32
      const real = new Float32Array(n), imag = new Float32Array(n)
      const w = (duty + 1) / 8
      for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * w) // square wave with this duty
      this.pulse.push(ctx.createPeriodicWave(real, imag))
    }
    this.tracks = [newTrack(0)]
    this.nextTick = ctx.currentTime + 0.08
  }

  start() {
    this.timer = window.setInterval(() => this.pump(), 25)
  }

  /** Stops the song where it is, with a quick fade out (resume() goes on from the same place). */
  pause(fadeSeconds = 0.12) {
    if (this.stopped || this.paused) return
    this.paused = true
    window.clearInterval(this.timer)
    const t = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(0, t + fadeSeconds)
  }

  /** Goes on from where pause() stopped, with a quick fade in. */
  resume(fadeSeconds = 0.2) {
    if (this.stopped || !this.paused) return
    this.paused = false
    const t = this.ctx.currentTime
    this.nextTick = t + 0.05 // (the song's clock goes on from now: the music continues where it was)
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(1, t + fadeSeconds)
    this.timer = window.setInterval(() => this.pump(), 25)
  }

  stop(fadeSeconds = 0.4) {
    if (this.stopped) return
    this.stopped = true
    window.clearInterval(this.timer)
    const t = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(this.out.gain.value, t)
    this.out.gain.linearRampToValueAtTime(0, t + fadeSeconds)
    window.setTimeout(() => { try { this.out.disconnect() } catch { /* already gone */ } }, fadeSeconds * 1000 + 200)
  }

  private pump() {
    const ahead = this.ctx.currentTime + 0.25
    let guard = 0
    while (this.nextTick < ahead && guard++ < 4000) {
      this.tickOnce()
      this.nextTick += 60 / (this.tempo * 48)
    }
    if (this.tracks.every((t) => t.ended)) {
      window.clearInterval(this.timer)
      this.onEnd?.()
    }
  }

  private tickOnce() {
    for (let i = 0; i < this.tracks.length; i++) {
      const tr = this.tracks[i]
      if (tr.ended) continue
      if (tr.wait > 0) tr.wait--
      let steps = 0
      while (tr.wait <= 0 && !tr.ended && steps++ < 200) this.exec(tr, i)
    }
  }

  private readVar(d: Uint8Array, tr: Track): number { // variable-length number
    let v = 0
    for (let k = 0; k < 4; k++) { const b = d[this.base + tr.pos++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) break }
    return v
  }

  private exec(tr: Track, index: number) {
    const d = this.data
    const at = this.base + tr.pos
    if (at >= d.length) { tr.ended = true; return }
    const cmd = d[this.base + tr.pos++]
    if (cmd < 0x80) {
      const vel = d[this.base + tr.pos++]
      const dur = this.readVar(d, tr)
      this.note(tr, cmd, vel, dur)
      if (tr.noteWait) tr.wait = dur
      return
    }
    const rd8 = () => d[this.base + tr.pos++]
    const rd16 = () => { const v = d[this.base + tr.pos] | (d[this.base + tr.pos + 1] << 8); tr.pos += 2; return v }
    const rd24 = () => { const v = d[this.base + tr.pos] | (d[this.base + tr.pos + 1] << 8) | (d[this.base + tr.pos + 2] << 16); tr.pos += 3; return v }
    switch (cmd) {
      case 0x80: tr.wait = this.readVar(d, tr); break
      case 0x81: tr.prog = this.readVar(d, tr); break
      case 0x93: { const n = rd8(); const off = rd24(); while (this.tracks.length <= n) this.tracks.push({ ...newTrack(0), ended: true }); this.tracks[n] = newTrack(off); break }
      case 0x94: tr.pos = rd24(); break
      case 0x95: { const off = rd24(); tr.callStack.push(tr.pos); tr.pos = off; break }
      case 0xc0: tr.pan = rd8(); break
      case 0xc1: tr.vol = rd8(); break
      case 0xc2: this.master = rd8(); break
      case 0xc3: tr.transpose = (rd8() << 24) >> 24; break
      case 0xc4: tr.bend = (rd8() << 24) >> 24; break
      case 0xc5: tr.bendRange = rd8(); break
      case 0xc6: rd8(); break
      case 0xc7: tr.noteWait = rd8() !== 0; break
      case 0xc8: tr.tie = rd8() !== 0; break
      case 0xc9: rd8(); break
      case 0xca: case 0xcb: case 0xcc: case 0xcd: case 0xce: case 0xcf: rd8(); break
      case 0xd0: tr.a = rd8(); break
      case 0xd1: tr.d = rd8(); break
      case 0xd2: tr.s = rd8(); break
      case 0xd3: tr.r = rd8(); break
      case 0xd4: { const c = rd8(); tr.loopStack.push({ pos: tr.pos, count: c }); break }
      case 0xd5: tr.expr = rd8(); break
      case 0xd6: rd8(); break
      case 0xe0: rd16(); break
      case 0xe1: this.tempo = Math.max(20, rd16()); break
      case 0xe3: rd16(); break
      case 0xfc: {
        const l = tr.loopStack[tr.loopStack.length - 1]
        if (l) {
          if (l.count === 0) tr.pos = l.pos // endless
          else if (--l.count > 0) tr.pos = l.pos
          else tr.loopStack.pop()
        }
        break
      }
      case 0xfd: { const p = tr.callStack.pop(); if (p !== undefined) tr.pos = p; break }
      case 0xfe: rd16(); break
      case 0xff: tr.ended = true; if (index === 0 && this.loop && this.tracks.every((t) => t.ended)) this.restart(); break
      default:
        if (cmd >= 0xb0 && cmd <= 0xbd) { // variables
          const v = rd8(); const val = (rd16() << 16) >> 16
          const a = this.vars[v & 15]
          if (cmd === 0xb0) this.vars[v & 15] = val
          else if (cmd === 0xb1) this.vars[v & 15] = a + val
          else if (cmd === 0xb2) this.vars[v & 15] = a - val
          else if (cmd === 0xb3) this.vars[v & 15] = a * val
          else if (cmd === 0xb4) this.vars[v & 15] = val ? Math.trunc(a / val) : a
        } else if (cmd === 0xa0) { rd16(); rd16() } else if (cmd === 0xa1) { rd8() } else if (cmd === 0xa2) { /* "if": run the next command */ } else if (cmd === 0xa3) { rd8() }
        break
    }
  }

  private restart() {
    this.tracks = [newTrack(0)]
    this.tempo = 120
    this.master = 127
  }

  private bufferFor(w: Wave): AudioBuffer {
    let b = this.buffers.get(w)
    if (!b) {
      b = this.ctx.createBuffer(1, w.samples.length, w.rate)
      b.copyToChannel(w.samples as Float32Array<ArrayBuffer>, 0)
      this.buffers.set(w, b)
    }
    return b
  }

  private note(tr: Track, key: number, vel: number, dur: number) {
    if (this.active > 90) return
    const inst = this.bank[tr.prog]
    if (!inst) return
    const reg = inst.regions.find((r) => key <= r.hi)?.region
    if (!reg) return
    const t0 = Math.max(this.nextTick, this.ctx.currentTime)
    const secs = Math.max(0.02, dur * (60 / (this.tempo * 48)))
    const a = tr.a !== 255 ? tr.a : reg.a, d = tr.d !== 255 ? tr.d : reg.d, s = tr.s !== 255 ? tr.s : reg.s, r = tr.r !== 255 ? tr.r : reg.r
    const attack = 0.002 + 1.5 * ((127 - Math.min(127, a)) / 127) ** 2
    const decay = 0.01 + 3 * ((127 - Math.min(127, d)) / 127) ** 2
    const release = 0.01 + 2.5 * ((127 - Math.min(127, r)) / 127) ** 2
    const sustain = (Math.min(127, s) / 127) ** 1.5
    const amp = (vel / 127) ** 2 * (tr.vol / 127) ** 2 * (tr.expr / 127) ** 2 * (this.master / 127) ** 2 * this.songVol * 0.6
    const gain = this.ctx.createGain()
    const panNode = this.ctx.createStereoPanner()
    panNode.pan.value = Math.max(-1, Math.min(1, (tr.pan - 64) / 64 + (reg.pan - 64) / 64))
    gain.connect(panNode)
    panNode.connect(this.out)
    const semis = key + tr.transpose + (tr.bend / 127) * tr.bendRange
    let src: AudioScheduledSourceNode
    if (reg.kind === 'pcm') {
      const wave = this.waves[reg.swar]?.[reg.swav]
      if (!wave) { gain.disconnect(); return }
      const s2 = this.ctx.createBufferSource()
      s2.buffer = this.bufferFor(wave)
      s2.playbackRate.value = Math.pow(2, (semis - reg.note) / 12)
      if (wave.loops) { s2.loop = true; s2.loopStart = wave.loopStart / wave.rate; s2.loopEnd = wave.samples.length / wave.rate }
      s2.connect(gain)
      src = s2
    } else if (reg.kind === 'psg') {
      const o = this.ctx.createOscillator()
      o.setPeriodicWave(this.pulse[Math.min(6, reg.swav & 7)])
      o.frequency.value = 440 * Math.pow(2, (semis - 69) / 12)
      o.connect(gain)
      src = o
    } else {
      if (!this.noiseBuf) {
        this.noiseBuf = this.ctx.createBuffer(1, 32768, 32768)
        const ch = this.noiseBuf.getChannelData(0)
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
      }
      const n = this.ctx.createBufferSource()
      n.buffer = this.noiseBuf
      n.loop = true
      n.playbackRate.value = Math.pow(2, (semis - 60) / 12)
      n.connect(gain)
      src = n
    }
    // volume envelope: attack -> decay to sustain -> hold -> release
    const g = gain.gain
    g.setValueAtTime(0, t0)
    g.linearRampToValueAtTime(amp, t0 + attack)
    g.linearRampToValueAtTime(amp * sustain, t0 + attack + decay)
    const end = t0 + secs
    g.setValueAtTime(Math.max(0.0001, amp * (end > t0 + attack + decay ? sustain : 1)), end)
    g.linearRampToValueAtTime(0, end + release)
    src.start(t0)
    src.stop(end + release + 0.05)
    this.active++
    src.onended = () => { this.active--; try { gain.disconnect(); panNode.disconnect() } catch { /* ok */ } }
  }
}
