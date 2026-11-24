// The real colours of Pokémon Black 2 / White 2's trainers: every trainer picture in the game file has its own 16-colour
// palette (archives a/0/7/1 and a/0/4/0). We count which colours the game really uses for skin, hair and clothes, and keep
// the most common ones, so characters drawn in PokeQuest wear the game's own colours.
import { parseNarc } from './nds'
import { paletteOf } from './items'

export const TRAINER_NARCS = ['a/0/7/1', 'a/0/4/0']

export interface RomColors {
  skin: string[] // skin tones, light to dark
  pool: string[] // other colours the game uses a lot (hair, clothes, eyes), most used first
}

const hex = (c: [number, number, number]) => '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)

function hsl(c: [number, number, number]): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

/** Counts every colour in the trainer palettes and sorts them into skin tones and everything else. */
export function extractColors(narcs: Uint8Array[]): RomColors {
  const count = new Map<string, { c: [number, number, number]; n: number }>()
  for (const narc of narcs) {
    let files: Uint8Array[]
    try { files = parseNarc(narc) } catch { continue }
    for (const f of files) {
      let p: Array<[number, number, number]> | null = null
      try {
        if (f.length < 8) continue
        p = paletteOf(f)
      } catch { continue }
      if (!p || p.length < 16) continue
      // entry 0 is see-through, 15 is usually the outline; the colours in between are the real ones
      const seen = new Set<string>()
      for (const c of p.slice(1, 15)) {
        const k = hex(c)
        if (seen.has(k)) continue
        seen.add(k)
        const e = count.get(k)
        if (e) e.n++
        else count.set(k, { c, n: 1 })
      }
    }
  }
  const skin: Array<{ c: [number, number, number]; n: number }> = []
  const pool: Array<{ c: [number, number, number]; n: number }> = []
  for (const e of count.values()) {
    const [h, s, l] = hsl(e.c)
    if (h >= 14 && h <= 38 && s >= 0.15 && s <= 0.64 && l >= 0.28 && l <= 0.92) skin.push(e)
    else pool.push(e)
  }
  const common = (a: typeof skin, min: number) => a.filter((e) => e.n >= min).sort((x, y) => y.n - x.n)
  return {
    skin: common(skin, 3).map((e) => hex(e.c)),
    pool: common(pool, 3).map((e) => hex(e.c)),
  }
}

function dist(a: string, b: string): number {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16)
  const dr = ((x >> 16) & 255) - ((y >> 16) & 255)
  const dg = ((x >> 8) & 255) - ((y >> 8) & 255)
  const db = (x & 255) - (y & 255)
  // a little extra weight on green, like the eye sees it
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db
}

/** Replaces each wanted colour by the closest colour the game really uses (each real colour at most once). */
export function snapAll(wanted: string[], from: string[]): string[] {
  const used = new Set<string>()
  return wanted.map((w) => {
    let best = ''
    let bd = Infinity
    for (const c of from) {
      if (used.has(c)) continue
      const d = dist(w, c)
      if (d < bd) { bd = d; best = c }
    }
    if (!best) return w
    used.add(best)
    return best
  })
}
