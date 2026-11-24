// A trainer's stuff during a match: team (max 6), PC boxes, bag. Plain data, updated by simple helper functions.
import {
  STAT_IDS, calcStat, createMon, evolutionsOf, expForLevel, learnableMoves, levelUpMoves, maxHp, newUid, type Mon, type StatId,
} from '../data/dex'
import { ITEMS } from '../data/items'
import { mulberry32 } from './rng'

export interface Trainer {
  team: Mon[]
  pc: Mon[]
  bag: Record<string, number>
  legendaryCount: number
}

export const emptyTrainer = (): Trainer => ({ team: [], pc: [], bag: {}, legendaryCount: 0 })

export function addItems(bag: Record<string, number>, items: Record<string, number>): Record<string, number> {
  const out = { ...bag }
  for (const [id, n] of Object.entries(items)) out[id] = (out[id] ?? 0) + n
  return out
}

export function useItemFromBag(bag: Record<string, number>, id: string): Record<string, number> {
  const out = { ...bag }
  out[id] = (out[id] ?? 0) - 1
  if (out[id] <= 0) delete out[id]
  return out
}

/** Put a Pokémon on the team if there is room, otherwise in the PC. */
export function addMon(t: Trainer, m: Mon): Trainer {
  if (t.team.length < 6) return { ...t, team: [...t.team, m] }
  return { ...t, pc: [...t.pc, m] }
}

export const LEGENDARY_LIMIT = 2

// ---------------------------------------------------------------- experience, levels, evolutions
export interface LevelUpResult {
  mon: Mon
  levelsGained: number
  newMoves: string[] // moves that could be learned at the new levels (the player decides)
  evolvedFrom?: string
}

/** Real EV yields would need PokéAPI; this gives 1 EV (2 for strong or evolved Pokémon) in the foe's best stat. */
export function evYield(species: string): Partial<Record<StatId, number>> {
  return { [bestStat(species)]: 1 }
}

import { Dex } from '@pkmn/sim'
function bestStat(species: string): StatId {
  const bs = Dex.species.get(species).baseStats
  let best: StatId = 'hp'
  for (const s of STAT_IDS) if (bs[s] > bs[best]) best = s
  return best
}

export function addEvs(m: Mon, gain: Partial<Record<StatId, number>>): Mon {
  const evs = { ...m.evs }
  let total = STAT_IDS.reduce((a, s) => a + evs[s], 0)
  for (const s of STAT_IDS) {
    const add = Math.min(gain[s] ?? 0, 252 - evs[s], 510 - total)
    if (add > 0) { evs[s] += add; total += add }
  }
  return { ...m, evs }
}

/** The experience a won battle gives to one Pokémon (match rule: x5, trainers x1.5). */
export function expGain(foeSpecies: string, foeLevel: number, trainer: boolean, share: number): number {
  const bs = Dex.species.get(foeSpecies).baseStats
  const bst = bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe
  const base = bst / 5
  return Math.max(1, Math.floor(((base * foeLevel) / 7) * 5 * (trainer ? 1.5 : 1) * share))
}

export async function gainExp(m: Mon, amount: number): Promise<LevelUpResult> {
  let mon = { ...m, exp: m.exp + amount }
  let gained = 0
  const oldMax = maxHp(m)
  const newMoves: string[] = []
  while (mon.level < 100 && mon.exp >= expForLevel(mon.level + 1)) {
    mon = { ...mon, level: mon.level + 1 }
    gained++
    const learned = (await levelUpMoves(mon.species)).filter((e) => e.level === mon.level).map((e) => e.move)
    for (const mv of learned) if (!mon.moves.includes(mv)) newMoves.push(mv)
  }
  if (gained > 0) {
    const grown = maxHp(mon) - oldMax
    if (mon.hp > 0) mon = { ...mon, hp: Math.min(maxHp(mon), mon.hp + Math.max(0, grown)) }
  }
  return { mon, levelsGained: gained, newMoves }
}

/** Evolution that happens by levelling up (level, friendship, time of day ... all simply "when it levels up"). */
export function levelEvolution(m: Mon): string | null {
  for (const e of evolutionsOf(m.species)) {
    if (e.type === 'useItem' || e.type === 'trade' || e.type === 'tradeItem') continue
    if (e.level && m.level < e.level) continue
    if (e.cond && !e.level && !e.type) continue
    return e.to
  }
  return null
}

export function stoneEvolution(m: Mon, stone: string): string | null {
  for (const e of evolutionsOf(m.species)) if (e.type === 'useItem' && e.item === stone) return e.to
  return null
}

export function tradeEvolution(m: Mon): string | null {
  for (const e of evolutionsOf(m.species)) if (e.type === 'trade' || e.type === 'tradeItem') return e.to
  return null
}

export function evolve(m: Mon, to: string): Mon {
  const out = { ...m, species: to }
  const abilities = Object.values(Dex.species.get(to).abilities)
  if (!abilities.includes(out.ability)) out.ability = abilities[0]
  out.hp = Math.min(maxHp(out), Math.max(1, out.hp + (maxHp(out) - maxHp(m))))
  return out
}

export function healMon(m: Mon, amount: number): Mon {
  const mx = maxHp(m)
  if (m.hp <= 0) return m
  return { ...m, hp: Math.min(mx, m.hp + (amount >= 999 ? mx : amount)) }
}

export function reviveMon(m: Mon, fraction: number): Mon {
  if (m.hp > 0) return m
  return { ...m, hp: Math.max(1, Math.floor(maxHp(m) * fraction)) }
}

export function useVitamin(m: Mon, stat: StatId): Mon | null {
  if (m.evs[stat] >= 100) return null
  return addEvs(m, { [stat]: Math.min(10, 100 - m.evs[stat]) })
}

export function rareCandy(m: Mon): Mon {
  const lvl = Math.min(100, m.level + 1)
  const next = { ...m, level: lvl, exp: Math.max(m.exp, expForLevel(lvl)) }
  return { ...next, hp: Math.min(maxHp(next), m.hp + Math.max(0, maxHp(next) - maxHp(m))) }
}

export function statLine(m: Mon, s: StatId): number {
  return calcStat(m.species, s, m.level, m.ivs[s], m.evs[s], m.nature)
}

// ---------------------------------------------------------------- catching
export function catchChance(foe: Mon, ballBonus: number, legendary: boolean): number {
  if (ballBonus >= 255) return 1
  const mx = maxHp(foe)
  const bs = Dex.species.get(foe.species).baseStats
  const bst = bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe
  const rate = legendary ? 20 : Math.max(25, Math.min(255, 255 - (bst - 200) * 0.55))
  const a = ((3 * mx - 2 * foe.hp) * rate * ballBonus) / (3 * mx)
  if (a >= 255) return 1
  const b = 65536 / Math.pow(255 / a, 0.1875)
  return Math.pow(b / 65536, 4)
}

export function rollCatch(foe: Mon, ballBonus: number, legendary: boolean, rng: () => number): { shakes: number; caught: boolean } {
  if (ballBonus >= 255) return { shakes: 3, caught: true }
  const mx = maxHp(foe)
  const bs = Dex.species.get(foe.species).baseStats
  const bst = bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe
  const rate = legendary ? 20 : Math.max(25, Math.min(255, 255 - (bst - 200) * 0.55))
  const a = ((3 * mx - 2 * foe.hp) * rate * ballBonus) / (3 * mx)
  if (a >= 255) return { shakes: 3, caught: true }
  const b = 65536 / Math.pow(255 / a, 0.1875)
  let shakes = 0
  for (let i = 0; i < 4; i++) {
    if (Math.floor(rng() * 65536) < b) shakes++
    else break
  }
  return { shakes: Math.min(3, shakes), caught: shakes >= 4 }
}

export async function makeStarter(species: string): Promise<Mon> {
  return createMon(species, 5, mulberry32(Math.floor(Math.random() * 1e9)), { shiny: Math.random() < 1 / 200 })
}

export { newUid, learnableMoves, ITEMS }
