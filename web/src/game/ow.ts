// The real walking characters from the player's game file, kept in memory once loaded (see rom/overworld.ts).
import { OW_FRAME } from '../rom/overworld'

const strips = new Map<number, HTMLImageElement>()
export const owList: number[] = []
/** Characters used for the player by default: the boy / the girl of the game. */
export const OW_BOY = 7
export const OW_GIRL = 10

export function registerOw(idx: number, img: HTMLImageElement) {
  strips.set(idx, img)
  if (!owList.includes(idx)) owList.push(idx)
}
export const hasOw = (idx: number | undefined) => idx !== undefined && strips.has(idx)

const frameCache = new Map<string, HTMLCanvasElement>()
const rawFrame = (img: HTMLImageElement, slot: number): HTMLCanvasElement => {
  const c = document.createElement('canvas')
  c.width = OW_FRAME
  c.height = OW_FRAME
  c.getContext('2d')!.drawImage(img, slot * OW_FRAME, 0, OW_FRAME, OW_FRAME, 0, 0, OW_FRAME, OW_FRAME)
  return c
}
/** A picture is a placeholder (the game's big "X", or empty) when almost nothing of it is visible. Safety net for game files stored by an older version of this site. */
const looksEmpty = (c: HTMLCanvasElement): boolean => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let o = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) o++
  return o <= 100
}
/** One 32x32 picture: dir 0 down, 1 left, 2 right, 3 up; frame 0 stand, 1 / 2 step. A placeholder picture is never shown: the standing picture of the same / another direction is used instead. */
export function owFrame(idx: number, dir: number, frame: number, run = false): HTMLCanvasElement | null {
  const img = strips.get(idx)
  if (!img) return null
  const key = `${idx}|${dir}|${frame}|${run ? 1 : 0}`
  let c = frameCache.get(key)
  if (c) return c
  const base = run ? 12 : 0
  c = rawFrame(img, base + dir * 3 + frame)
  if (looksEmpty(c)) {
    const tries = [[dir, 0], [0, 0], [1, 0], [2, 0], [3, 0]]
    for (const [d, f] of tries) {
      const alt = rawFrame(img, base + d * 3 + f)
      if (!looksEmpty(alt)) { c = alt; break }
    }
  }
  frameCache.set(key, c)
  return c
}

// emote bubbles (speech bubbles with a symbol), 32x32
const emotes = new Map<number, HTMLImageElement>()
export function registerEmote(idx: number, img: HTMLImageElement) { emotes.set(idx, img) }
export const owEmote = (idx: number): HTMLImageElement | undefined => emotes.get(idx)

// the item ball on the ground
let fieldBall: HTMLImageElement | undefined
export function registerBall(img: HTMLImageElement) { fieldBall = img }
export const owBall = (): HTMLImageElement | undefined => fieldBall
