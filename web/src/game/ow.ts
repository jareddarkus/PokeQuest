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
/** One 32x32 picture: dir 0 down, 1 left, 2 right, 3 up; frame 0 stand, 1 / 2 step. */
export function owFrame(idx: number, dir: number, frame: number): HTMLCanvasElement | null {
  const img = strips.get(idx)
  if (!img) return null
  const key = `${idx}|${dir}|${frame}`
  let c = frameCache.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = OW_FRAME
  c.height = OW_FRAME
  c.getContext('2d')!.drawImage(img, (dir * 3 + frame) * OW_FRAME, 0, OW_FRAME, OW_FRAME, 0, 0, OW_FRAME, OW_FRAME)
  frameCache.set(key, c)
  return c
}
