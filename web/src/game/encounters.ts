import { createMon, ringLevels, ringPool, type Mon } from '../data/dex'

/** Chance of a wild Pokémon appearing on each step in tall grass. */
export const ENCOUNTER_RATE = import.meta.env.DEV && new URLSearchParams(location.search).has('enc') ? 1 : 0.11 // ?enc = test switch (dev only)

const pickOne = <T,>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)]

export async function wildEncounter(ring: number, rng: () => number = Math.random): Promise<Mon> {
  const [lo, hi] = ringLevels(ring)
  const level = lo + Math.floor(rng() * (hi - lo + 1))
  // legendaries only start to show up in ring 3 and are rare
  const legendary = ring >= 3 && rng() < (ring === 3 ? 0.03 : 0.06)
  const pool = ringPool(Math.min(3, Math.max(1, ring)), legendary)
  const species = pickOne(pool.length ? pool : ringPool(1, false), rng)
  return createMon(species.name, legendary ? Math.max(level, 30) : level, rng)
}

export async function trainerTeam(ring: number, rng: () => number = Math.random): Promise<Mon[]> {
  const [lo, hi] = ringLevels(ring)
  const n = 1 + Math.floor(rng() * (ring >= 3 ? 3 : 2))
  const pool = ringPool(Math.min(3, ring), false)
  const team: Mon[] = []
  for (let i = 0; i < n; i++) {
    const level = lo + Math.floor(rng() * (hi - lo + 1))
    team.push(await createMon(pickOne(pool, rng).name, level, rng, { shiny: false }))
  }
  return team
}

export async function gymTeam(type: string, ring: number, rng: () => number = Math.random): Promise<Mon[]> {
  const [, hi] = ringLevels(ring)
  const pool = ringPool(Math.min(3, ring), false)
  let typed = pool.filter((s) => s.types.includes(type))
  if (typed.length < 3) typed = [...typed, ...ringPool(Math.min(3, ring + 1), false).filter((s) => s.types.includes(type))]
  if (typed.length === 0) typed = pool
  const team: Mon[] = []
  for (let i = 0; i < 3; i++) team.push(await createMon(pickOne(typed, rng).name, hi + 2 + i, rng, { shiny: false }))
  return team
}
