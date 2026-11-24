// Move animations for the battle: a small particle player that draws the effect pictures taken from the player's own
// game file (see rom/fx.ts) and tints them by move type, the way the game tints its own effect textures.
import { romUiUrl } from '../rom/store'

export interface Pt { x: number; y: number }
export interface FxMove { type: string; category: 'Physical' | 'Special' | 'Status'; contact: boolean; name: string; selfTarget: boolean }

const TYPE_COLOR: Record<string, [number, number, number]> = {
  Normal: [235, 235, 215], Fire: [255, 130, 40], Water: [60, 140, 255], Electric: [255, 235, 70], Grass: [100, 215, 80],
  Ice: [150, 235, 255], Fighting: [225, 100, 50], Poison: [180, 90, 220], Ground: [205, 165, 100], Flying: [190, 205, 255],
  Psychic: [255, 110, 185], Bug: [170, 215, 70], Rock: [190, 175, 120], Ghost: [130, 100, 190], Dragon: [110, 100, 255],
  Dark: [110, 95, 120], Steel: [195, 205, 220], Fairy: [255, 165, 225],
}
const SOLID = new Set(['Dark', 'Ghost', 'Poison', 'Ground', 'Rock']) // drawn normally, the rest glow (added light)

interface P { tex: string; x: number; y: number; vx: number; vy: number; ay: number; delay: number; life: number; s0: number; s1: number; a0: number; a1: number; rot: number; vr: number; rgb: [number, number, number]; add: boolean; age: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export class MoveFx {
  private ctx: CanvasRenderingContext2D
  private raw = new Map<string, HTMLImageElement>()
  private tinted = new Map<string, HTMLCanvasElement>()
  private parts: P[] = []
  private raf = 0
  private last = 0
  private flash = 0
  private canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; this.ctx = canvas.getContext('2d')! }

  async load(names: string[]): Promise<void> {
    await Promise.all(names.map(async (n) => {
      const url = await romUiUrl(`fx:${n}`)
      if (!url) return
      const img = new Image()
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
      if (img.width) this.raw.set(n, img)
    }))
  }
  get ready() { return this.raw.size > 0 }

  private tint(tex: string, rgb: [number, number, number]): HTMLCanvasElement | null {
    const key = `${tex}|${rgb.join(',')}`
    const hit = this.tinted.get(key)
    if (hit) return hit
    const img = this.raw.get(tex)
    if (!img) return null
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const x = c.getContext('2d')!
    x.drawImage(img, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    x.fillRect(0, 0, c.width, c.height)
    this.tinted.set(key, c)
    return c
  }

  private add(p: Partial<P> & { tex: string; rgb: [number, number, number]; add: boolean }) {
    this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, ay: 0, delay: 0, life: 500, s0: 30, s1: 30, a0: 1, a1: 0, rot: 0, vr: 0, age: 0, ...p })
  }

  private loop = (now: number) => {
    const dt = Math.min(50, now - (this.last || now)); this.last = now
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height
    ctx.clearRect(0, 0, W, H)
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt / 260) }
    for (const p of this.parts) {
      p.age += dt
      const t = p.age - p.delay
      if (t < 0) continue
      const k = t / p.life
      if (k >= 1) continue
      const sec = t / 1000
      const x = p.x + p.vx * sec, y = p.y + p.vy * sec + 0.5 * p.ay * sec * sec
      const size = p.s0 + (p.s1 - p.s0) * k
      const a = p.a0 + (p.a1 - p.a0) * k
      const img = this.tint(p.tex, p.rgb)
      if (!img || a <= 0.01) continue
      ctx.save()
      ctx.globalAlpha = Math.min(1, a)
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'
      ctx.translate(x, y); ctx.rotate(p.rot + p.vr * sec)
      const h = size * (img.height / img.width)
      ctx.drawImage(img, -size / 2, -h / 2, size, h)
      if (p.add && a > 0.5) { ctx.globalAlpha = (a - 0.5) * 0.9; ctx.drawImage(img, -size * 0.3, -h * 0.3, size * 0.6, h * 0.6) } // hot white core
      ctx.restore()
    }
    this.parts = this.parts.filter((p) => p.age - p.delay < p.life)
    if (this.parts.length || this.flash > 0) this.raf = requestAnimationFrame(this.loop)
    else { this.raf = 0; this.last = 0 }
  }
  private kick() { if (!this.raf) this.raf = requestAnimationFrame(this.loop) }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.parts = []; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height) }

  /** Plays the effect of a move. Resolves at the moment of impact (when the target should flinch). */
  play(m: FxMove, from: Pt, to: Pt, u: number): Promise<void> {
    const rgb = TYPE_COLOR[m.type] ?? TYPE_COLOR.Normal
    const add = !SOLID.has(m.type)
    const white: [number, number, number] = [255, 255, 255]
    const dx = to.x - from.x, dy = to.y - from.y
    const travel = Math.max(0, Math.min(1, Math.hypot(dx, dy) / (u * 3))) * 260 + 280
    let impactAt = 0
    const hitFlash = (at: number, big = 1) => {
      this.add({ tex: 'burst', x: to.x, y: to.y, delay: at, life: 260, s0: u * 0.3 * big, s1: u * 0.95 * big, a0: 1, a1: 0, rot: rnd(0, 6), vr: 1, rgb: white, add: true })
      this.add({ tex: 'burst', x: to.x, y: to.y, delay: at + 30, life: 320, s0: u * 0.2 * big, s1: u * 0.8 * big, a0: 0.9, a1: 0, rot: rnd(0, 6), vr: -1.2, rgb, add })
      this.add({ tex: 'ring', x: to.x, y: to.y, delay: at, life: 380, s0: u * 0.1, s1: u * 1.2 * big, a0: 0.9, a1: 0, rgb, add: true })
      for (let i = 0; i < 6; i++) {
        const ang = rnd(0, 6.28), sp = rnd(u * 1.2, u * 2.4)
        this.add({ tex: i % 2 ? 'star' : 'spark', x: to.x, y: to.y, delay: at, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rnd(300, 520), s0: u * 0.22, s1: u * 0.06, a0: 1, a1: 0, rot: rnd(0, 6), vr: rnd(-6, 6), rgb: i % 2 ? white : rgb, add: true })
      }
    }
    const shot = (tex: string, count: number, size: number, color = rgb, wob = 0.18, spin = 0) => {
      for (let i = 0; i < count; i++) {
        const d = (i / count) * travel * 0.55
        const off = (Math.random() - 0.5) * u * wob
        this.add({ tex, x: from.x, y: from.y + off, delay: d, life: travel, s0: size * 0.6, s1: size, a0: 1, a1: 0.9, vx: dx / (travel / 1000), vy: dy / (travel / 1000), rot: rnd(0, 6), vr: spin, rgb: color, add })
      }
    }

    if (m.category === 'Status') {
      const at = m.selfTarget ? from : to
      for (let i = 0; i < 9; i++) {
        const sx = at.x + rnd(-u * 0.45, u * 0.45)
        this.add({ tex: i % 3 === 0 ? 'star' : 'spark', x: sx, y: at.y + rnd(-u * 0.1, u * 0.5), delay: i * 70, life: 700, vy: -u * 0.9, vx: rnd(-10, 10), s0: u * 0.05, s1: u * 0.28, a0: 1, a1: 0, rot: rnd(0, 6), vr: rnd(-3, 3), rgb: i % 2 ? white : rgb, add: true })
      }
      this.add({ tex: 'ring', x: at.x, y: at.y + u * 0.25, delay: 0, life: 650, s0: u * 1.1, s1: u * 0.3, a0: 0, a1: 0.9, rgb, add: true })
      impactAt = 450
    } else if (m.contact && m.category === 'Physical') {
      impactAt = 40
      hitFlash(impactAt)
      if (/slash|claw|cut|scratch|cross|blade|razor|sword/i.test(m.name)) {
        for (let i = 0; i < 3; i++) this.add({ tex: 'slash', x: to.x + (i - 1) * u * 0.2, y: to.y + (i - 1) * u * 0.05, delay: 40 + i * 90, life: 260, s0: u * 0.9, s1: u * 1.15, a0: 1, a1: 0, rot: 0.7, rgb: white, add: true })
      }
    } else {
      impactAt = travel * 0.8
      switch (m.type) {
        case 'Fire':
          shot('glow', 7, u * 0.5, rgb, 0.12)
          shot('puff', 6, u * 0.4, [255, 210, 90], 0.2)
          for (let i = 0; i < 10; i++) this.add({ tex: 'puff', x: to.x + rnd(-u * 0.3, u * 0.3), y: to.y + u * 0.2, delay: impactAt + i * 40, life: 520, vy: -u * 1.2, s0: u * 0.3, s1: u * 0.7, a0: 0.9, a1: 0, rgb: i % 2 ? [255, 190, 70] : [255, 90, 30], add: true })
          break
        case 'Water':
          shot('ring', 8, u * 0.3, [170, 215, 255], 0.3, 1)
          shot('glow2', 6, u * 0.38, rgb, 0.2)
          for (let i = 0; i < 8; i++) this.add({ tex: 'ring', x: to.x + rnd(-u * 0.35, u * 0.35), y: to.y + rnd(-u * 0.2, u * 0.3), delay: impactAt + i * 40, life: 520, vy: -u * 0.5, s0: u * 0.08, s1: u * 0.35, a0: 0.9, a1: 0, rgb: [190, 225, 255], add: true })
          break
        case 'Electric':
          for (let i = 0; i < 4; i++) this.add({ tex: 'bolt', x: to.x + rnd(-u * 0.4, u * 0.4), y: to.y - u * 0.1, delay: i * 90, life: 220, s0: u * 1.2, s1: u * 1.3, a0: 1, a1: 0.2, rot: rnd(-0.3, 0.3), rgb: i % 2 ? white : rgb, add: true })
          shot('zig', 4, u * 0.5, rgb, 0.3)
          this.flash = 0.35
          impactAt = 120
          break
        case 'Grass':
          shot('crescent', 8, u * 0.32, rgb, 0.3, 9)
          shot('glow2', 3, u * 0.3, [190, 255, 150], 0.2)
          break
        case 'Ice':
          shot('star', 6, u * 0.3, rgb, 0.25, 3)
          shot('glow', 3, u * 0.4, [220, 250, 255], 0.15)
          for (let i = 0; i < 8; i++) this.add({ tex: 'star', x: to.x + rnd(-u * 0.4, u * 0.4), y: to.y - u * 0.5, delay: impactAt + i * 50, life: 600, vy: u * 0.9, s0: u * 0.12, s1: u * 0.2, a0: 1, a1: 0, rot: rnd(0, 6), vr: 2, rgb: i % 2 ? white : rgb, add: true })
          break
        case 'Psychic':
        case 'Fairy':
          shot('swirl', 3, u * 0.55, rgb, 0.2, 6)
          for (let i = 0; i < 3; i++) this.add({ tex: 'ring', x: to.x, y: to.y, delay: impactAt + i * 120, life: 520, s0: u * 0.2, s1: u * 1.3, a0: 0.9, a1: 0, rgb, add: true })
          if (m.type === 'Fairy') for (let i = 0; i < 6; i++) this.add({ tex: i % 2 ? 'heart' : 'star', x: to.x + rnd(-u * 0.4, u * 0.4), y: to.y + rnd(-u * 0.1, u * 0.4), delay: impactAt + i * 60, life: 700, vy: -u * 0.7, s0: u * 0.1, s1: u * 0.28, a0: 1, a1: 0, rgb, add: true })
          break
        case 'Ghost':
        case 'Dark':
          shot('puff', 7, u * 0.45, rgb, 0.3, 2)
          shot('crescent', 3, u * 0.5, m.type === 'Dark' ? [200, 160, 220] : [190, 150, 255], 0.2, 5)
          hitFlash(impactAt, 0.8)
          break
        case 'Poison':
          shot('ring', 7, u * 0.34, rgb, 0.3, 1)
          shot('puff', 4, u * 0.35, [150, 70, 190], 0.25)
          for (let i = 0; i < 6; i++) this.add({ tex: 'ring', x: to.x + rnd(-u * 0.35, u * 0.35), y: to.y + rnd(-u * 0.1, u * 0.4), delay: impactAt + i * 50, life: 600, vy: -u * 0.5, s0: u * 0.1, s1: u * 0.3, a0: 0.9, a1: 0, rgb, add: false })
          break
        case 'Ground':
        case 'Rock':
          for (let i = 0; i < 9; i++) this.add({ tex: 'puff', x: to.x + rnd(-u * 0.5, u * 0.5), y: to.y + u * 0.3, delay: i * 45, life: 700, vy: -u * 0.8, s0: u * 0.2, s1: u * 0.6, a0: 0.95, a1: 0, rgb, add: false })
          for (let i = 0; i < 6; i++) this.add({ tex: 'disc', x: to.x + rnd(-u * 0.3, u * 0.3), y: to.y + u * 0.2, delay: 120 + i * 40, life: 520, vx: rnd(-u, u), vy: -u * 1.6, ay: u * 4, s0: u * 0.16, s1: u * 0.1, a0: 1, a1: 0.2, rgb: [120, 100, 80], add: false })
          impactAt = 250
          break
        case 'Dragon':
          shot('swirl', 4, u * 0.55, rgb, 0.2, 7)
          shot('spark', 6, u * 0.3, white, 0.3, 4)
          break
        case 'Flying':
          shot('crescent', 5, u * 0.55, white, 0.25, 4)
          shot('swirl', 2, u * 0.45, [210, 225, 255], 0.2, 6)
          break
        case 'Bug':
          shot('zig', 5, u * 0.4, rgb, 0.3, 2)
          shot('spark', 5, u * 0.3, white, 0.3)
          break
        case 'Steel':
          shot('flash', 3, u * 0.5, rgb, 0.1)
          shot('spark', 6, u * 0.3, white, 0.25, 3)
          break
        case 'Fighting':
          shot('star', 3, u * 0.5, rgb, 0.1, 5)
          break
        default: // Normal
          shot('glow', 6, u * 0.42, rgb, 0.15)
          shot('star', 3, u * 0.28, white, 0.2, 4)
      }
      hitFlash(impactAt, 0.9)
    }
    this.kick()
    return new Promise((res) => setTimeout(res, impactAt))
  }
}

export const FX_NAMES = ['glow', 'glow2', 'puff', 'star', 'spark', 'burst', 'ring', 'bolt', 'slash', 'swirl', 'zig', 'heart', 'crescent', 'disc', 'flash']
