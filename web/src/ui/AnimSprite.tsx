import { useEffect, useRef, useState } from 'react'
import { dexNum } from '../data/dex'
import { buildAnimatedSprite, type AnimatedSprite } from '../rom/anim'
import { getSpriteFiles } from '../rom/store'
import { MAX_ROM_DEX } from '../rom/sprites'

const cache = new Map<string, AnimatedSprite | null>()

/** A Pokémon that moves, built from the animation data in the player's own Pokémon White 2 file. */
export default function AnimSprite({ species, back, shiny, scale = 2 }: { species: string; back?: boolean; shiny?: boolean; scale?: number }) {
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
    if (!sprite) return
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
  return <canvas ref={ref} width={96} height={96} style={{ width: 96 * scale, height: 96 * scale, imageRendering: 'pixelated' }} />
}