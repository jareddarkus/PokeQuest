// The grass step effect of the game's overworld (archive a/0/7/4, "kusaeff"): a small tuft of leaves in four pictures. Played when a character steps into grass
// (leaves fly up), the last picture is the tuft that stays over the character's feet.
import { loadRomBlob } from './store'
import { parseNarc } from './nds'
import { decodeTexture, readTexFile } from './nitro'

/** Which file of the archive: 0 bright green (spring), 1 green (summer), 3 yellowish (autumn), 5 white (winter) ... */
const VARIANT = 1
let cache: Promise<HTMLCanvasElement[] | null> | null = null

export function loadGrassTuft(): Promise<HTMLCanvasElement[] | null> {
  if (cache) return cache
  cache = (async () => {
    try {
      let raw = await loadRomBlob('field:effects')
      if (!raw && import.meta.env.DEV) { // the local test server reads the game file directly
        const { devRomSource } = await import('./devSource')
        const { NdsFile } = await import('./nds')
        const src = await devRomSource()
        if (src) { const nds = new NdsFile(src); await nds.open(); raw = await nds.get('a/0/7/4') }
      }
      if (!raw) return null
      const file = parseNarc(raw)[VARIANT]
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
