// Pokémon data (species, moves, natures, abilities) comes from the open-source Pokémon Showdown engine data.
import { pixelOverride } from '../ui/pixelate'
import { Dex } from '@pkmn/sim'
import { mulberry32 } from '../game/rng'
import { RULES } from '../game/rules'

export type StatId = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export const STAT_IDS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
export const STAT_NAMES: Record<StatId, string> = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' }
export type Stats = Record<StatId, number>

export interface Mon {
  uid: string
  species: string // Showdown species name, e.g. "Bulbasaur"
  level: number
  exp: number
  nature: string
  ability: string
  ivs: Stats
  evs: Stats
  moves: string[] // move names
  shiny: boolean
  gender: 'M' | 'F' | 'N'
  hp: number
  item: string
  friendship: number
  /** power points left of each move (same order as `moves`); missing = all full */
  pp?: number[]
}

export const blankStats = (v = 0): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v })

let uidCounter = 0
export const newUid = () => `m${Date.now().toString(36)}${(uidCounter++).toString(36)}`

// ---------------------------------------------------------------- species lists
export interface SpeciesInfo {
  name: string
  num: number
  stage: 1 | 2 | 3
  evolves: boolean
  bst: number
  legendary: boolean
  types: string[]
}

let cache: SpeciesInfo[] | null = null

export function allSpecies(): SpeciesInfo[] {
  if (cache) return cache
  const out: SpeciesInfo[] = []
  for (const s of Dex.species.all()) {
    if (s.num <= 0 || s.num > 1025 || s.forme) continue
    if (s.isNonstandard && s.isNonstandard !== 'Past') continue
    const p1 = s.prevo ? Dex.species.get(s.prevo) : null
    const stage = (p1 ? (p1.prevo ? 3 : 2) : 1) as 1 | 2 | 3
    const bs = s.baseStats
    out.push({
      name: s.name, num: s.num, stage, evolves: s.evos.length > 0,
      bst: bs.hp + bs.atk + bs.def + bs.spa + bs.spd + bs.spe,
      legendary: s.tags.some((t) => t === 'Sub-Legendary' || t === 'Restricted Legendary' || t === 'Mythical'),
      types: [...s.types],
    })
  }
  cache = out
  return out
}

const STARTERS = [
  'Bulbasaur', 'Charmander', 'Squirtle', 'Chikorita', 'Cyndaquil', 'Totodile', 'Treecko', 'Torchic', 'Mudkip',
  'Turtwig', 'Chimchar', 'Piplup', 'Snivy', 'Tepig', 'Oshawott', 'Chespin', 'Fennekin', 'Froakie',
  'Rowlet', 'Litten', 'Popplio', 'Grookey', 'Scorbunny', 'Sobble', 'Sprigatito', 'Fuecoco', 'Quaxly',
]

/** The starter Pokémon of every generation (1-9). */
export function starterChoices(): SpeciesInfo[] {
  const all = allSpecies()
  return STARTERS.map((n) => all.find((s) => s.name === n)).filter((s): s is SpeciesInfo => !!s)
}

export function ringLevels(ring: number): [number, number] {
  const r = RULES
  return ring === 1 ? [r.lvl1Min, r.lvl1Max] : ring === 2 ? [r.lvl2Min, r.lvl2Max] : ring === 3 ? [r.lvl3Min, r.lvl3Max] : [r.lvl4Min, r.lvl4Max]
}

/** Which Pokémon can appear in the tall grass of each ring (first forms, then second forms, then final forms). */
export function ringPool(ring: number, legendaries: boolean): SpeciesInfo[] {
  const all = allSpecies().filter((s) => (legendaries ? true : !s.legendary))
  const normal = all.filter((s) => !s.legendary)
  if (legendaries) return all.filter((s) => s.legendary)
  switch (ring) {
    case 1: return normal.filter((s) => (s.stage === 1 && s.evolves) || (s.stage === 1 && !s.evolves && s.bst <= 420))
    case 2: return normal.filter((s) => s.stage === 2 || (s.stage === 1 && !s.evolves && s.bst > 420 && s.bst <= 520))
    default: return normal.filter((s) => s.stage === 3 || (s.stage === 1 && !s.evolves && s.bst > 520))
  }
}

// ---------------------------------------------------------------- building a Pokémon
export const NATURES = Dex.natures.all().map((n) => n.name)

export function natureMods(nature: string): { plus?: StatId; minus?: StatId } {
  const n = Dex.natures.get(nature)
  return { plus: (n.plus as StatId | undefined), minus: (n.minus as StatId | undefined) }
}

export function calcStat(species: string, stat: StatId, level: number, iv: number, ev: number, nature: string): number {
  const base = Dex.species.get(species).baseStats[stat]
  if (stat === 'hp') {
    if (species === 'Shedinja') return 1
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
  }
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5
  const m = natureMods(nature)
  const mult = m.plus === stat ? 1.1 : m.minus === stat ? 0.9 : 1
  return Math.floor(raw * mult)
}

export function maxHp(m: Mon): number {
  return calcStat(m.species, 'hp', m.level, m.ivs.hp, m.evs.hp, m.nature)
}

export function statsOf(m: Mon): Stats {
  const out = blankStats()
  for (const s of STAT_IDS) out[s] = calcStat(m.species, s, m.level, m.ivs[s], m.evs[s], m.nature)
  return out
}

/** Experience needed to be a level (medium-fast growth for everyone). */
export const expForLevel = (level: number) => level * level * level

interface LearnEntry { move: string; level: number }

const learnCache = new Map<string, LearnEntry[]>()

/** Moves a species learns by levelling up (latest generation that has the move), sorted by level. */
export async function levelUpMoves(species: string): Promise<LearnEntry[]> {
  const hit = learnCache.get(species)
  if (hit) return hit
  const out: LearnEntry[] = []
  // evolutions also know the moves of their earlier forms
  const chain: string[] = []
  let cur: string | undefined = species
  while (cur) {
    chain.push(cur)
    cur = Dex.species.get(cur).prevo || undefined
  }
  const best = new Map<string, { gen: number; level: number }>()
  for (const sp of chain) {
    const ls = await Dex.learnsets.get(sp)
    if (!ls || !ls.learnset) continue
    for (const [move, sources] of Object.entries(ls.learnset)) {
      for (const src of sources) {
        const m = /^(\d+)L(\d+)$/.exec(src)
        if (!m) continue
        const gen = Number(m[1])
        const level = Number(m[2])
        const old = best.get(move)
        if (!old || gen > old.gen || (gen === old.gen && level < old.level)) best.set(move, { gen, level })
      }
    }
  }
  for (const [move, v] of best) {
    const mv = Dex.moves.get(move)
    if (!mv.exists || (mv.isNonstandard && mv.isNonstandard !== 'Past') || mv.id === 'struggle') continue
    out.push({ move: mv.name, level: v.level })
  }
  out.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
  learnCache.set(species, out)
  return out
}

export async function learnableMoves(species: string, level: number): Promise<string[]> {
  return (await levelUpMoves(species)).filter((e) => e.level <= level).map((e) => e.move)
}

export interface MoveInfo { name: string; type: string; category: string; power: number; accuracy: number | true; pp: number }
export function moveInfo(name: string): MoveInfo {
  const m = Dex.moves.get(name)
  return { name: m.name, type: m.type, category: m.category, power: m.basePower, accuracy: m.accuracy, pp: m.pp }
}

export async function randomMoves(species: string, level: number, rng: () => number): Promise<string[]> {
  const pool = await learnableMoves(species, level)
  const bag = pool.slice()
  const picked: string[] = []
  while (picked.length < 4 && bag.length) picked.push(bag.splice(Math.floor(rng() * bag.length), 1)[0])
  // make sure there is at least one attack
  if (picked.length && !picked.some((m) => Dex.moves.get(m).basePower > 0)) {
    const attacks = pool.filter((m) => Dex.moves.get(m).basePower > 0 && !picked.includes(m))
    if (attacks.length) picked[picked.length - 1] = attacks[Math.floor(rng() * attacks.length)]
  }
  if (!picked.length) picked.push('Tackle')
  return picked
}

export const SHINY_CHANCE = 1 / 200

export async function createMon(
  species: string, level: number, rng: () => number = Math.random, opts: { shiny?: boolean } = {},
): Promise<Mon> {
  const sp = Dex.species.get(species)
  const abilities = Object.entries(sp.abilities)
  const normal = abilities.filter(([k]) => k !== 'H' && k !== 'S').map(([, v]) => v)
  const hidden = sp.abilities.H
  const ability = hidden && rng() < 0.1 ? hidden : normal[Math.floor(rng() * normal.length)] ?? 'Pressure'
  let gender: 'M' | 'F' | 'N' = 'N'
  if (sp.gender) gender = sp.gender as 'M' | 'F' | 'N'
  else if (sp.genderRatio) gender = rng() < sp.genderRatio.M ? 'M' : 'F'
  const ivs = blankStats()
  for (const s of STAT_IDS) ivs[s] = Math.floor(rng() * 32)
  const mon: Mon = {
    uid: newUid(), species: sp.name, level, exp: expForLevel(level), nature: NATURES[Math.floor(rng() * NATURES.length)],
    ability, ivs, evs: blankStats(), moves: await randomMoves(sp.name, level, rng),
    shiny: opts.shiny ?? rng() < SHINY_CHANCE, gender, hp: 1, item: '', friendship: 70,
  }
  mon.hp = maxHp(mon)
  return mon
}

export function spriteId(species: string): string {
  return Dex.species.get(species).spriteid
}

/**
 * Pokémon Showdown's pixel-art pictures in the style of Pokémon Black / White (used for Pokémon that are not in Pokémon White 2):
 * stage 0 = animated picture (where one exists), 1 = still picture, 2 = the 3D picture (last resort). Loaded while the game runs, never stored by us.
 */
export function spriteUrl(species: string, opts: { back?: boolean; shiny?: boolean } = {}, stage = 0): string {
  const sp = Dex.species.get(species)
  const ov = pixelOverride(sp.num, !!opts.shiny) // Pokémon with no pixel picture anywhere: our own pixel version of the 3D render
  if (ov) return ov
  const suffix = `${opts.back ? '-back' : ''}${opts.shiny ? '-shiny' : ''}`
  const dir = stage === 0 ? 'gen5ani' : stage === 1 ? 'gen5' : 'ani'
  return `https://play.pokemonshowdown.com/sprites/${dir}${suffix}/${sp.spriteid}.${stage === 1 ? 'png' : 'gif'}`
}

export function rngFrom(seed: number) {
  return mulberry32(seed)
}

export function dexNum(species: string): number {
  return Dex.species.get(species).num
}

export function speciesTypes(species: string): string[] {
  return [...Dex.species.get(species).types]
}

export interface EvoInfo { to: string; type?: string; level?: number; item?: string; cond?: string }
export function evolutionsOf(species: string): EvoInfo[] {
  const sp = Dex.species.get(species)
  return sp.evos.map((e) => {
    const t = Dex.species.get(e)
    return { to: t.name, type: t.evoType, level: t.evoLevel, item: t.evoItem, cond: t.evoCondition }
  })
}
