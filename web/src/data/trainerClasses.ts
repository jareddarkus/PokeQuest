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
