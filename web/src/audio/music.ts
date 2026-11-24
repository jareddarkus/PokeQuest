// Plays the songs taken from the player's own game file (see rom/sdat.ts). One song at a time, with a short fade between songs.
import { loadMusicFile, loadMusicIndex } from '../rom/store'
import { SongPlayer } from './sseq'

class MusicManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private current: { key: string; player: SongPlayer } | null = null
  private wanted: string | null = null
  private volume = 0.5
  private enabled = true
  private busy = false
  private analyser: AnalyserNode | null = null

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.volume
        this.master.connect(this.ctx.destination)
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 2048
        this.master.connect(this.analyser)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    } catch { return null }
  }

  /** How loud the music is right now (0..1); used by the developer test and the settings meter. */
  level(): number {
    if (!this.analyser) return 0
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += v * v
    return Math.sqrt(sum / buf.length)
  }

  state(): string { return `${this.ctx?.state ?? 'none'} / ${this.current?.key ?? '-'}` }

  setVolume(v: number) {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.stop()
    else if (this.wanted) void this.play(this.wanted)
  }

  stop() {
    this.current?.player.stop(0.3)
    this.current = null
  }

  /** Starts a song (by our short name, e.g. "field1", "wild", "trainer") unless it is already playing. `loop` = repeat until changed. */
  async play(key: string, loop = true, then?: string) {
    this.wanted = key
    if (!this.enabled || this.volume <= 0.001) return
    if (this.current?.key === key) return
    if (this.busy) return
    this.busy = true
    try {
      const ctx = this.ensure()
      if (!ctx || !this.master) return
      const index = await loadMusicIndex()
      const info = index?.[key]
      if (!info) return
      const [seq, bank, ...waves] = await Promise.all([loadMusicFile(info.seq), loadMusicFile(info.bank), ...info.waves.map((w) => (w >= 0 ? loadMusicFile(w) : Promise.resolve(null)))])
      if (!seq || !bank || this.wanted !== key) return
      this.current?.player.stop(0.4)
      const player = new SongPlayer(ctx, this.master, seq, bank, waves, info.vol, loop, then ? () => { void this.play(then) } : undefined)
      this.current = { key, player }
      player.start()
    } catch { /* music is optional */ } finally {
      this.busy = false
      if (this.wanted && this.wanted !== this.current?.key && this.enabled) void this.play(this.wanted)
    }
  }
}

export const music = new MusicManager()
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__music = music // developer test hook
