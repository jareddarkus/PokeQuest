// Trainer pictures for battles, built from the player's own game file (see anim.ts).
import { buildTrainerBackSprite, trainerStillCanvas, type AnimatedSprite } from './anim'
import { loadTrainerNarcs } from './store'

const fronts = new Map<number, HTMLCanvasElement | null>()
const backs = new Map<number, AnimatedSprite | null>()

/** The still picture (80 x 80) of a trainer class; null when there is none (game file not imported / empty class). */
export async function trainerFrontPic(index: number, fallbacks: number[] = []): Promise<{ index: number; canvas: HTMLCanvasElement } | null> {
  const n = await loadTrainerNarcs()
  if (!n) return null
  for (const i of [index, ...fallbacks]) {
    if (!fronts.has(i)) fronts.set(i, trainerStillCanvas(n.front, i))
    const c = fronts.get(i)
    if (c) return { index: i, canvas: c }
  }
  return null
}

/** The player's animated back picture (the throw); null when unavailable. */
export async function trainerBackPic(index: number): Promise<AnimatedSprite | null> {
  const n = await loadTrainerNarcs()
  if (!n) return null
  if (!backs.has(index)) backs.set(index, buildTrainerBackSprite(n.back, index))
  return backs.get(index) ?? null
}
