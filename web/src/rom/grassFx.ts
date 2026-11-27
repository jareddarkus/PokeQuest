// The grass step effect of the game's overworld (archive a/0/7/4, "kusaeff"): a small tuft of leaves in four pictures. Played when a character steps into grass
// (leaves fly up), the last picture is the tuft that stays over the character's feet.
import { loadRomBlob } from './store'
import { parseNarc } from './nds'
import { decodeTexture, readTexFile } from './nitro'
import { parseTextureAnim, valueAt } from './texanim'

/** Which file of the archive: 0 bright green (spring), 1 green (summer), 3 yellowish (autumn), 5 white (winter) ... */
const VARIANT = 1
let cache: Promise<HTMLCanvasElement[] | null> | null = null

export async function loadEffectsNarc(): Promise<Uint8Array[] | null> {
  let raw = await loadRomBlob('field:effects')
  if (!raw && import.meta.env.DEV) { // the local test server reads the game file directly
    const { devRomSource } = await import('./devSource')
    const { NdsFile } = await import('./nds')
    const src = await devRomSource()
    if (src) { const nds = new NdsFile(src); await nds.open(); raw = await nds.get('a/0/7/4') }
  }
  return raw ? parseNarc(raw) : null
}

export function loadGrassTuft(): Promise<HTMLCanvasElement[] | null> {
  if (cache) return cache
  cache = (async () => {
    try {
      const narc = await loadEffectsNarc()
      const file = narc?.[VARIANT]
      const t = file ? readTexFile(file) : null
      if (!t || t.texs.length < 4) return null
      return t.texs.slice(0, 4).map((tex) => {
        const d = decodeTexture(tex, t.pals[0])
        const c = document.createElement('canvas'); c.width = d.width; c.height = d.height
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(d.rgba), d.width, d.height), 0, 0)
        return c
      })
    } catch { return null }
  })()
  return cache
}

/** The sway of the tuft: the game slides the picture left / right (S) and up / down (T) for 45 frames of 1/30 s (file 141 + VARIANT of the same archive). */
export interface GrassSway { frames: number; s: number[]; t: number[] }
let swayCache: Promise<GrassSway | null> | null = null
export function loadGrassSway(): Promise<GrassSway | null> {
  if (swayCache) return swayCache
  swayCache = (async () => {
    try {
      const narc = await loadEffectsNarc()
      const m = narc?.[141 + VARIANT] ? [...parseTextureAnim(narc[141 + VARIANT]).values()][0] : null
      if (!m) return null
      const s: number[] = [], t: number[] = []
      for (let f = 0; f < m.frames; f++) { s.push(valueAt(m.moveS, f)); t.push(valueAt(m.moveT, f)) }
      return { frames: m.frames, s, t }
    } catch { return null }
  })()
  return swayCache
}

/**
 * The game's own character shadow (file 47 of the effects archive, model "kage"): a 16 x 16 picture with a 14 x 9 pixel ellipse, drawn on a flat square one tile wide
 * with a see-through polygon (alpha 19 / 31). Returns the picture as a canvas, or null when the game file is not there.
 */
let shadowCache: Promise<HTMLCanvasElement | null> | null = null
export function loadShadowPicture(): Promise<HTMLCanvasElement | null> {
  if (shadowCache) return shadowCache
  shadowCache = (async () => {
    try {
      const narc = await loadEffectsNarc()
      const file = narc?.[47]
      const t = file ? readTexFile(file) : null
      if (!t || !t.texs[0]) return null
      const d = decodeTexture(t.texs[0], t.pals[0])
      const c = document.createElement('canvas'); c.width = d.width; c.height = d.height
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(d.rgba), d.width, d.height), 0, 0)
      return c
    } catch { return null }
  })()
  return shadowCache
}

/** The "!" bubble over a trainer that has spotted you: file 50 of the effects archive (51 = "?", 52 = a note, 53 = "..."), a 16 x 16 picture. Null when the game file is not there. */
let alertCache: Promise<HTMLCanvasElement | null> | null = null
export function loadAlertBubble(): Promise<HTMLCanvasElement | null> {
  if (alertCache) return alertCache
  alertCache = (async () => {
    try {
      const narc = await loadEffectsNarc()
      const file = narc?.[50]
      const t = file ? readTexFile(file) : null
      if (!t || !t.texs[0]) return null
      const d = decodeTexture(t.texs[0], t.pals[0])
      const c = document.createElement('canvas'); c.width = d.width; c.height = d.height
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(d.rgba), d.width, d.height), 0, 0)
      return c
    } catch { return null }
  })()
  return alertCache
}
