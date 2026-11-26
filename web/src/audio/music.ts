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
  private sfx: GainNode | null = null
  private sfxVolume = 0.7
  private files = new Map<number, Uint8Array>()

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
        this.sfx = this.ctx.createGain()
        this.sfx.gain.value = this.sfxVolume
        this.sfx.connect(this.ctx.destination)
        this.sfx.connect(this.analyser)
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

  setSfxVolume(v: number) {
    this.sfxVolume = v
    if (this.sfx) this.sfx.gain.value = v
  }

  private async file(id: number): Promise<Uint8Array | null> {
    const hit = this.files.get(id)
    if (hit) return hit
    const f = await loadMusicFile(id)
    if (f) this.files.set(id, f)
    return f
  }

  /** Plays a short sound once: 'se:select', 'se:hit', 'mv:52' (the sound of a move), 'cry:6' (a Pokémon's cry), or a jingle like 'win'. */
  async playSfx(key: string, then?: () => void) {
    if (!this.enabled || this.sfxVolume <= 0.001) return
    try {
      const ctx = this.ensure()
      if (!ctx || !this.sfx) return
      const index = await loadMusicIndex()
      const info = index?.[key]
      if (!info) return
      const [seq, bank, ...waves] = await Promise.all([this.file(info.seq), this.file(info.bank), ...info.waves.map((w) => (w >= 0 ? this.file(w) : Promise.resolve(null)))])
      if (!seq || !bank) return
      const p = new SongPlayer(ctx, this.sfx, seq, bank, waves, info.vol, false, then)
      p.start()
      window.setTimeout(() => p.stop(0.3), key.startsWith('cry:') ? 3500 : 6000) // a safety stop
    } catch { /* sounds are optional */ }
  }

  /** Plays a sound over and over until the returned function is called (the EXP gauge filling up). */
  async loopSfx(key: string): Promise<() => void> {
    if (!this.enabled || this.sfxVolume <= 0.001) return () => {}
    try {
      const ctx = this.ensure()
      if (!ctx || !this.sfx) return () => {}
      const index = await loadMusicIndex()
      const info = index?.[key]
      if (!info) return () => {}
      const [seq, bank, ...waves] = await Promise.all([this.file(info.seq), this.file(info.bank), ...info.waves.map((w) => (w >= 0 ? this.file(w) : Promise.resolve(null)))])
      if (!seq || !bank) return () => {}
      const p = new SongPlayer(ctx, this.sfx, seq, bank, waves, info.vol, true)
      p.start()
      let stopped = false
      const stop = () => { if (!stopped) { stopped = true; p.stop(0.05) } }
      window.setTimeout(stop, 8000) // a safety stop
      return stop
    } catch { return () => {} }
  }

  /** The jingle of finding an item (a game file imported before it was added only has the short "getting" sound). */
  async itemGet() {
    const index = await loadMusicIndex()
    return this.playSfx(index?.itemget ? 'itemget' : 'se:getting')
  }

  /** The healing sound of the game: one sound, then the next one right after it. */
  heal() { return this.playSfx('be:9', () => { void this.playSfx('be:14') }) }

  /** A sound by its number in the sound archive (the move / effect scripts use these numbers). */
  playSeq(id: number, then?: () => void) { return this.playSfx(`seq:${id}`, then) }

  cry(dex: number) { return this.playSfx(`cry:${dex}`) }

  /** The cry of a Pokémon by name: #1-#649 from the player's own game file; the newer ones (generations 6-9) are not in that file, so they are played from Pokémon Showdown's public cry files (a plain audio element, nothing is stored). */
  cryOf(species: string, dex: number) {
    if (dex <= 649) return this.playSfx(`cry:${dex}`)
    if (!this.enabled || this.sfxVolume <= 0.001) return Promise.resolve()
    try {
      const a = new Audio(`https://play.pokemonshowdown.com/audio/cries/${species.toLowerCase().replace(/[^a-z0-9]/g, '')}.mp3`)
      a.volume = Math.min(1, this.sfxVolume)
      void a.play().catch(() => { /* no sound is fine */ })
    } catch { /* sounds are optional */ }
    return Promise.resolve()
  }

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
      const [seq, bank, ...waves] = await Promise.all([this.file(info.seq), this.file(info.bank), ...info.waves.map((w) => (w >= 0 ? this.file(w) : Promise.resolve(null)))])
      if (!seq || !bank || this.wanted !== key) return
      this.current?.player.stop(0.4)
      const player = new SongPlayer(ctx, this.master, seq, bank, waves, info.vol, loop, then ? () => { void this.play(then) } : undefined)
      this.current = { key, player }
      player.start()
    } catch { /* music is optional */ } finally {
      this.busy = false
      // try again only if a DIFFERENT song was asked for meanwhile (retrying the same missing song looped forever and froze the page)
      if (this.wanted && this.wanted !== key && this.wanted !== this.current?.key && this.enabled) void this.play(this.wanted)
    }
  }
}

export const music = new MusicManager()
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__music = music // developer test hook
