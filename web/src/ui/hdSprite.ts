// Pokémon from generation 6 on are not in Pokémon White 2. Their pictures come from the open PokeAPI sprite collection (Pokémon HOME 3D
// renders, 512 x 512 pixels): sharp at any size. The empty border is cut away and the result is kept in the browser (cache storage),
// so a Pokémon only has to be downloaded once.
import { Dex } from '@pkmn/sim'

export interface HdSprite { url: string; w: number; h: number }

const memory = new Map<number, Promise<HdSprite | null>>()
const CACHE = 'pokequest-hd-sprites-v1'

const homeUrl = (dex: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${dex}.png`
const key = (dex: number) => `https://pokequest.local/hd/${dex}.png`

async function trim(blob: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return { blob, w: c.width, h: c.height }
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  const b = await new Promise<Blob>((res) => out.toBlob((x) => res(x!), 'image/png'))
  return { blob: b, w: out.width, h: out.height }
}

/** The sharp, trimmed picture of a Pokémon (front view), or null if it cannot be loaded. */
export function loadHdSprite(dex: number): Promise<HdSprite | null> {
  let p = memory.get(dex)
  if (!p) {
    p = (async () => {
      try {
        const cache = await caches.open(CACHE)
        const hit = await cache.match(key(dex))
        let blob: Blob
        let w = 0, h = 0
        if (hit) {
          blob = await hit.blob()
          const bmp = await createImageBitmap(blob)
          w = bmp.width; h = bmp.height
        } else {
          const res = await fetch(homeUrl(dex))
          if (!res.ok) return null
          const t = await trim(await res.blob())
          blob = t.blob; w = t.w; h = t.h
          await cache.put(key(dex), new Response(blob, { headers: { 'Content-Type': 'image/png' } }))
        }
        return { url: URL.createObjectURL(blob), w, h }
      } catch { return null }
    })()
    memory.set(dex, p)
  }
  return p
}

/** How tall a Pokémon is drawn compared with the width of its platform: small ones small, big ones big. */
export function hdHeightFactor(species: string): number {
  const m = Dex.species.get(species).heightm || 1
  return Math.max(0.5, Math.min(1.35, 0.42 + 0.3 * Math.sqrt(m)))
}
