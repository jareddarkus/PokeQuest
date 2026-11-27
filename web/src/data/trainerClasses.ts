// Which battle picture (trainer class of the game file, archive a/0/7/1) a trainer of this island uses.
// The pictures are the game's own; which class an island trainer gets is our choice (the game decides by the trainer's class, we have no classes).
// Chosen by looking at the 188 pictures: ordinary classes for the walking trainers, the game's gym-leader-like characters for gym leaders.
export const GENERIC_CLASSES = [2, 3, 4, 5, 6, 14, 15, 16, 17, 18, 19, 24, 25, 26, 27, 28, 35, 36, 42, 46, 47, 50, 51, 52, 53, 56, 57, 60, 61, 63, 64, 65, 66, 70, 72, 73, 74, 75, 77, 82, 83, 84, 85, 86, 87, 99, 100, 104, 105, 107, 108]
/**
 * The walking trainers of the island look the same on the map and in battle: each walking character (file of a/0/4/8) is paired with the battle picture
 * (class of a/0/7/1) of the same kind of trainer. The game file has no table for this (the game's designers placed each trainer by hand), so the pairs were
 * made by looking at both: karate man, baseball player, hiker, maid, parasol lady ...; only the characters with a clear twin are used for NPC trainers.
 */
export const OW_TO_CLASS: Record<number, number> = { 17: 2, 26: 2, 24: 4, 52: 50, 63: 72, 74: 82, 70: 73, 65: 78, 71: 86, 56: 60, 42: 24, 43: 25, 35: 74, 90: 64 }
export const LEADER_CLASSES = [10, 11, 12, 20, 48, 49, 62, 94, 96, 98, 112, 114]

const hash = (s: string): number => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
/** A stable picture number for this trainer (same trainer = same picture). */
export function trainerClassFor(kind: 'trainer' | 'gym' | string, seed: string): number {
  const pool = kind === 'gym' ? LEADER_CLASSES : GENERIC_CLASSES
  return pool[hash(seed) % pool.length]
}
/** The player's back picture: 0 = the boy, 1 = the girl (archive a/0/7/2). */
export const playerBackClass = (girl: boolean): number => (girl ? 1 : 0)

/**
 * Which back picture (archive a/0/7/2) your trainer shows in battle for the walking character (file of a/0/4/8) you chose as your skin.
 * The game file only has back pictures for a few characters (the two heroes and a handful of story characters), so: the heroes keep their own picture,
 * every other character gets the girl's picture if it is a girl / woman and the boy's otherwise (the walking characters carry no gender in the file:
 * the list of girls below was made by looking at the pictures).
 */
const OW_TO_BACK: Record<number, number> = { 7: 0, 10: 1 }
const FEMALE_OW = new Set([10, 15, 19, 21, 22, 23, 29, 36, 37, 39, 47, 49, 51, 53, 54, 57, 59, 66, 68, 71, 75, 80, 82, 83, 85, 86, 87, 88, 90, 92, 94, 96, 98, 99, 102, 108, 147, 149, 152, 160, 174, 193, 195, 206, 218, 229, 231, 234, 239, 242, 245, 246, 249, 257, 258, 261, 268, 274, 276, 277, 278, 281])
export const backClassForSprite = (sprite: number | undefined): number => (sprite === undefined ? 0 : OW_TO_BACK[sprite] ?? (FEMALE_OW.has(sprite) ? 1 : 0))
