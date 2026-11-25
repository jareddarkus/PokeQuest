import { useEffect, useRef, useState } from 'react'
import { dexNum } from '../data/dex'
import { buildAnimatedSprite, type AnimatedSprite } from '../rom/anim'
import { getSpriteFiles, romSpriteUrl } from '../rom/store'
import { MAX_ROM_DEX } from '../rom/sprites'
import { Dex } from '@pkmn/sim'

const cache = new Map<string, AnimatedSprite | null>()
const gaps = new Map<AnimatedSprite, number>()

/** How many empty rows there are under the Pokémon's feet in its 96 x 96 picture (so that it can be set down on its platform). */
function footGap(sp: AnimatedSprite): number {
  const hit = gaps.get(sp)
  if (hit !== undefined) return hit
  const c = document.createElement('canvas')
  c.width = 96; c.height = 96
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  sp.draw(ctx, 0)
  const px = ctx.getImageData(0, 0, 96, 96).data
  let gap = 0
  for (let y = 95; y >= 0; y--) {
    let any = false
    for (let x = 0; x < 96 && !any; x++) any = px[(y * 96 + x) * 4 + 3] > 40
    if (any) { gap = 95 - y; break }
  }
  gaps.set(sp, gap)
  return gap
}

/** The animation of a Pokémon if it has been built already (see warmAnim), with the empty rows under its feet. */
export function getAnim(species: string, back: boolean, shiny: boolean): { sprite: AnimatedSprite; gap: number } | null {
  const key = `${dexNum(species)}:${back ? 'b' : 'f'}:${shiny ? 's' : 'n'}`
  const sp = cache.get(key)
  return sp ? { sprite: sp, gap: footGap(sp) } : null
}

/** Builds the animation of a Pokémon in advance (it takes a moment), so that it shows up at once when the battle begins. */
export async function warmAnim(species: string, back: boolean, shiny: boolean): Promise<void> {
  const dex = dexNum(species)
  if (dex <= 0 || dex > MAX_ROM_DEX) return
  const key = `${dex}:${back ? 'b' : 'f'}:${shiny ? 's' : 'n'}`
  if (cache.has(key)) return
  const files = await getSpriteFiles()
  if (!files) return
  await new Promise((r) => setTimeout(r, 0))
  if (!cache.has(key)) cache.set(key, buildAnimatedSprite(files, dex * 20, !back, shiny))
}

/** The game's own still picture, used when the assembled animation does not look like the real picture (a few Pokémon, e.g. Castform, Tynamo, Cottonee). */
function StillPicture({ dex, back, shiny, scale, hover }: { dex: number; back?: boolean; shiny?: boolean; scale: number; hover: number }) {
  const [pic, setPic] = useState<{ url: string; gap: number } | null>(null)
  useEffect(() => {
    let live = true
    void romSpriteUrl(dex, !!back, !!shiny).then((url) => {
      if (!url || !live) return
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 96; c.height = 96
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 96, 96)
        const px = ctx.getImageData(0, 0, 96, 96).data
        let gap = 0
        for (let y = 95; y >= 0; y--) { let any = false; for (let x = 0; x < 96 && !any; x++) any = px[(y * 96 + x) * 4 + 3] > 40; if (any) { gap = 95 - y; break } }
        if (live) setPic({ url, gap })
      }
      img.src = url
    })
    return () => { live = false }
  }, [dex, back, shiny])
  if (!pic) return <div style={{ width: 96 * scale, height: 96 * scale }} />
  return <img src={pic.url} alt="" draggable={false} style={{ width: 96 * scale, height: 96 * scale, imageRendering: 'pixelated', transform: `translateY(${(pic.gap - hover) * scale}px)` }} />
}

/** A Pokémon that moves, built from the animation data in the player's own Pokémon White 2 file. */
export default function AnimSprite({ species, back, shiny, scale: wanted = 2 }: { species: string; back?: boolean; shiny?: boolean; scale?: number }) {
  // whole-number sizes keep every picture pixel the same size (crisp); only on small screens the size stays as asked
  const scale = wanted >= 1.5 ? Math.round(wanted) : wanted
  const ref = useRef<HTMLCanvasElement>(null)
  const [sprite, setSprite] = useState<AnimatedSprite | null>(null)
  const dex = dexNum(species)
  useEffect(() => {
    let live = true
    setSprite(null)
    if (dex <= 0 || dex > MAX_ROM_DEX) return
    const key = `${dex}:${back ? 'b' : 'f'}:${shiny ? 's' : 'n'}`
    void getSpriteFiles().then((files) => {
      if (!live || !files) return
      if (!cache.has(key)) cache.set(key, buildAnimatedSprite(files, dex * 20, !back, !!shiny))
      setSprite(cache.get(key) ?? null)
    })
    return () => { live = false }
  }, [dex, back, shiny])

  useEffect(() => {
    if (!sprite || sprite.mismatch > 0.25) return
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const t0 = performance.now()
    const loop = () => {
      ctx.clearRect(0, 0, 96, 96)
      sprite.draw(ctx, ((performance.now() - t0) / 1000) * 60)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [sprite])

  if (!sprite) return <div style={{ width: 96 * scale, height: 96 * scale }} />
  if (sprite.mismatch > 0.25) return <StillPicture dex={dex} back={back} shiny={shiny} scale={scale} hover={Dex.species.get(species).types.includes('Flying') ? 7 : 0} />
  // set the Pokémon down on its platform (flying ones hover a little above it)
  const hover = Dex.species.get(species).types.includes('Flying') ? 7 : 0
  const down = (footGap(sprite) - hover) * scale
  return <canvas ref={ref} width={96} height={96} style={{ width: 96 * scale, height: 96 * scale, imageRendering: 'pixelated', transform: `translateY(${down}px)` }} />
}