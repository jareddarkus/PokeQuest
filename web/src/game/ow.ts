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
/** Files of the walking-character archive that are Pokémon / objects, not people (they must never be a trainer or a player). Checked by eye. */
const CREATURES = [116, 119, 120, 121, 124, 127, 128, 129, 130, 131, 132, 133, 187, 195, 196, 197, 198, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 304, 341, 347, 354]
export const NOT_PEOPLE = new Set(CREATURES)
/** The creatures that float on water: they only live in the little lakes of the island. */
export const SWIM_SPRITES = [298, 301, 302]
/** Every walking character that is a person (in file order). */
export const owPeople = (): number[] => owList.filter((i) => !NOT_PEOPLE.has(i))
/**
 * The people who may walk the island as NPC trainers: the ordinary trainer-type characters of the game (files 14 - 145: kids, adults, workers, sailors, ...).
 * Left out (checked by eye on the contact sheet, `?owpeople`): the two players (7, 10), police / pilots / doctors / the nurse (76 - 80, 102), the named
 * gym leaders and story people (92, 94 - 100) and everything from file 147 on (named characters, Team Plasma bosses, legendary forms ...).
 */
const NOT_NPC_TRAINERS = new Set([76, 77, 78, 79, 80, 92, 94, 95, 96, 97, 98, 99, 100, 102])
export const owTrainers = (): number[] => {
  const t = owPeople().filter((i) => i >= 14 && i <= 145 && !NOT_NPC_TRAINERS.has(i))
  return t.length ? t : owPeople()
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
