// The Battle Royale island: 5 x 5 real Pokémon White 2 map chunks (160 x 160 tiles) cut into a circle of 4 rings.
// The ground, trees, water and tall grass come from the game file; this file adds rings, gyms, trainers and items.
import { hash2, mulberry32, pick } from './rng'
import type { PokeGroup } from '../world/events'

export const T = {
  Water: 0,
  Sand: 1,
  Grass: 2,
  Tall: 3,
  Tree: 4, // blocked (trees, rocks, fences, walls ...)
  Cliff: 5, // blocked (cliffs and the ring barriers)
  GymWall: 6,
  GymDoor: 7,
} as const
export type Tile = (typeof T)[keyof typeof T]

export const SIZE = 160 // tiles per side (5 chunks of 32)
export const C = SIZE / 2 // centre
export const RADIUS = 78 // the island edge
export const RING_WIDTH = 20
/** Distances (in tiles from the centre) where ring 1, 2, 3, 4 start. Ring 4 is the peak. */
export const RING_INNER = [60, 40, 20, 0] as const

export const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const
export type PType = (typeof TYPES)[number]

export const TYPE_COLOR: Record<PType, string> = {
  Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c', Ice: '#96d9d6',
  Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3', Psychic: '#f95587', Bug: '#a6b91a',
  Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad',
}

export type Dir = 0 | 1 | 2 | 3 // 0 down (south), 1 left, 2 right, 3 up (north)
export const DX = [0, -1, 1, 0]
export const DY = [1, 0, 0, -1]

export interface Gym {
  id: string
  ring: number // 1..3: beating this gym leader sends you to ring + 1
  side: 'N' | 'E' | 'S' | 'W'
  x: number // the gym entrance tile (stand next to it and walk into it)
  y: number
  doorX: number
  doorY: number
  type: PType
  leader: string
  /** made in the editor: its own lines / group, no building is drawn for it */
  custom?: { lines: string[]; group: number; tx: number; ty: number }
}

export type NpcBehavior = 'stand' | 'look' | 'walk' | 'run'
export interface NpcSpec {
  id: string
  ring: number
  x: number
  y: number
  dir: Dir
  behavior: NpcBehavior
  name: string
  look: number // seed for its colours
  /** a creature that floats on water: lives only in the little lakes inside the island (never on land, never in the sea around it) */
  swim?: boolean
  /** made in the editor: its own words and group of Pokémon (a Person only talks) */
  custom?: { lines: string[]; after: string[]; group: number; fights: boolean }
}

export interface PickupSpec {
  id: string
  ring: number
  x: number
  y: number
}

export interface World {
  seed: number
  tiles: Uint8Array
  gyms: Gym[]
  npcs: NpcSpec[]
  pickups: PickupSpec[]
  spawns: { x: number; y: number }[]
  /** 1 = a tile of one of the little lakes (water that is not connected to the sea around the island) */
  lake: Uint8Array
  /** made in the editor: what happens when you step on a tile, the groups of wild Pokémon of the grass, and the groups themselves */
  triggers?: Map<number, { type: number; text?: string; tx?: number; ty?: number }>
  encGroup?: Uint8Array
  groups?: Map<number, PokeGroup>
}

/** Distance from the centre in whole TILES, square rings (the island is a tile-based mountain of squares, not circles). */
export function dist(x: number, y: number): number {
  return Math.max(Math.abs(x + 0.5 - C), Math.abs(y + 0.5 - C))
}

/** The tile at square-ring distance r from the centre, in the same direction as tile (x, y). */
export function squareTile(x: number, y: number, r: number): { x: number; y: number } {
  const dx = x + 0.5 - C, dy = y + 0.5 - C
  const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1
  return { x: Math.round(C + (dx / m) * r - 0.5), y: Math.round(C + (dy / m) * r - 0.5) }
}

/** A tile on the square ring at distance r; u (0..1) goes once round it. */
export function ringPoint(r: number, u: number): { x: number; y: number } {
  const side = Math.min(3, Math.floor(u * 4)), t = u * 4 - side
  const o = (t * 2 - 1) * r
  const px = side === 0 ? o : side === 1 ? r : side === 2 ? -o : -r
  const py = side === 0 ? -r : side === 1 ? o : side === 2 ? r : -o
  return { x: Math.round(C + px - 0.5), y: Math.round(C + py - 0.5) }
}

/** 1 = outer ring ... 4 = the peak. Returns 0 outside the island. */
export function ringAt(x: number, y: number): number {
  const d = dist(x, y)
  if (d > RADIUS) return 0
  if (d >= RING_INNER[0]) return 1
  if (d >= RING_INNER[1]) return 2
  if (d >= RING_INNER[2]) return 3
  return 4
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE
}

export function tileAt(w: World, x: number, y: number): Tile {
  if (!inBounds(x, y)) return T.Water
  return w.tiles[y * SIZE + x] as Tile
}

export function isWalkable(w: World, x: number, y: number): boolean {
  const t = tileAt(w, x, y)
  return t === T.Grass || t === T.Tall || t === T.Sand || t === T.GymDoor
}

const LEADER_NAMES = ['Aster', 'Borin', 'Cedar', 'Dara', 'Elio', 'Fenna', 'Gorm', 'Hale', 'Iris', 'Juno', 'Kade', 'Luma']
const NPC_NAMES = [
  'Ada', 'Ben', 'Cleo', 'Dax', 'Eve', 'Finn', 'Gia', 'Hugo', 'Ivy', 'Jax', 'Kai', 'Lea', 'Max', 'Nia', 'Omar', 'Pia',
  'Quin', 'Rex', 'Sol', 'Tess', 'Uri', 'Vera', 'Wes', 'Xan', 'Yara', 'Zed',
]

/**
 * Builds the playable island from the ground tiles of the real map chunks.
 * `ground` has SIZE*SIZE tile codes (Water / Grass / Tall / Tree = blocked ...).
 */
export function generateWorld(seed: number, ground: Uint8Array, opts: { barriers?: boolean } = {}): World {
  const rng = mulberry32(seed)
  const tiles = new Uint8Array(ground)

  // outside the island: sea. The edge of each ring is a barrier you can only pass by beating a gym leader.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y)
      const i = y * SIZE + x
      if (d > RADIUS) tiles[i] = T.Water
      else {
        const fl = Math.floor(d)
        if (opts.barriers !== false && (fl === RING_INNER[0] - 1 || fl === RING_INNER[1] - 1 || fl === RING_INNER[2] - 1)) tiles[i] = T.Cliff
      }
    }
  }

  const main = new Uint8Array(SIZE * SIZE) // 1 = part of the biggest connected piece of ground of its ring (where things are placed)
  const walkable = (x: number, y: number) => {
    const t = tiles[y * SIZE + x]
    return (t === T.Grass || t === T.Tall) && main[y * SIZE + x] === 1
  }

  // keep only the biggest connected piece of ground in each ring (no unreachable pockets, nothing placed in them)
  {
    const seen = new Uint8Array(SIZE * SIZE)
    const comps: Array<{ ring: number; cells: number[] }> = []
    for (let s = 0; s < SIZE * SIZE; s++) {
      if (seen[s] || !(tiles[s] === T.Grass || tiles[s] === T.Tall)) continue
      const sx = s % SIZE, sy = (s / SIZE) | 0
      const ring = ringAt(sx, sy)
      const cells: number[] = []
      const stack = [s]
      seen[s] = 1
      while (stack.length) {
        const c = stack.pop()!
        cells.push(c)
        const cx = c % SIZE, cy = (c / SIZE) | 0
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d], ny = cy + DY[d]
          if (!inBounds(nx, ny)) continue
          const n = ny * SIZE + nx
          if (seen[n] || !(tiles[n] === T.Grass || tiles[n] === T.Tall) || ringAt(nx, ny) !== ring) continue
          seen[n] = 1
          stack.push(n)
        }
      }
      comps.push({ ring, cells })
    }
    // only tiny pockets (fewer than 6 tiles) are filled in; bigger grass areas stay walkable. Things (gyms, trainers, crates, spawns) are placed on the biggest piece of each ring only.
    const biggest = new Map<number, number>()
    for (const c of comps) biggest.set(c.ring, Math.max(biggest.get(c.ring) ?? 0, c.cells.length))
    for (const c of comps) {
      if (c.cells.length < 6) for (const i of c.cells) tiles[i] = T.Tree
      else if (c.cells.length === biggest.get(c.ring)) for (const i of c.cells) main[i] = 1
    }
  }
  // gyms: 4 per ring (rings 1-3) at the north, east, south and west, on the nearest free ground inside the ring
  const gyms: Gym[] = []
  const dirs: Array<['N' | 'E' | 'S' | 'W', number, number]> = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]
  for (let ring = 1; ring <= 3; ring++) {
    for (const [side, dx, dy] of dirs) {
      let spot: { x: number; y: number } | null = null
      for (let r = RING_INNER[ring - 1] + 4; r < RING_INNER[ring - 1] + 14 && !spot; r++) {
        for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
          const x = Math.round(C + dx * r - 0.5 + (dy !== 0 ? off : 0))
          const y = Math.round(C + dy * r - 0.5 + (dx !== 0 ? off : 0))
          if (inBounds(x, y) && walkable(x, y)) { spot = { x, y }; break }
        }
      }
      if (!spot) continue
      tiles[spot.y * SIZE + spot.x] = T.GymDoor
      gyms.push({
        id: `g${ring}${side}`, ring, side, x: spot.x, y: spot.y, doorX: spot.x, doorY: spot.y,
        type: pick(rng, TYPES), leader: pick(rng, LEADER_NAMES),
      })
    }
  }

  const spawns: { x: number; y: number }[] = []
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.35) / 16
    for (let r = RADIUS - 5; r >= RING_INNER[0]; r--) {
      const q = ringPoint(r, u)
      if (inBounds(q.x, q.y) && walkable(q.x, q.y)) { spawns.push(q); break }
    }
  }

  const freeTile = (ring: number): { x: number; y: number } => {
    for (let tries = 0; tries < 800; tries++) {
      const lo = ring === 4 ? 2 : RING_INNER[ring - 1] + 2
      const hi = ring === 1 ? RADIUS - 4 : RING_INNER[ring - 2] - 3
      const r = lo + rng() * (hi - lo)
      const { x, y } = ringPoint(r, rng())
      if (inBounds(x, y) && walkable(x, y) && !gyms.some((g) => Math.abs(g.x - x) < 3 && Math.abs(g.y - y) < 3)) return { x, y }
    }
    return spawns[0] ?? { x: C, y: C }
  }

  const npcs: NpcSpec[] = []
  const counts = [10, 9, 8, 6]
  const behaviors: NpcBehavior[] = ['stand', 'look', 'walk', 'run', 'look', 'stand']
  for (let ring = 1; ring <= 4; ring++) {
    for (let i = 0; i < counts[ring - 1]; i++) {
      const p = freeTile(ring)
      npcs.push({
        id: `n${ring}_${i}`, ring, x: p.x, y: p.y, dir: Math.floor(rng() * 4) as Dir,
        behavior: pick(rng, behaviors), name: pick(rng, NPC_NAMES), look: Math.floor(rng() * 1e9),
      })
    }
  }

  const pickups: PickupSpec[] = []
  const pcounts = [16, 14, 12, 8]
  for (let ring = 1; ring <= 4; ring++) {
    for (let i = 0; i < pcounts[ring - 1]; i++) {
      const p = freeTile(ring)
      pickups.push({ id: `p${ring}_${i}`, ring, x: p.x, y: p.y })
    }
  }

  // the little lakes: water that the sea around the island cannot reach (the sea is where the island collapses, so nothing may live there)
  const lake = new Uint8Array(SIZE * SIZE)
  {
    const sea = new Uint8Array(SIZE * SIZE)
    const stack: number[] = []
    for (let i = 0; i < SIZE * SIZE; i++) { const x = i % SIZE, y = (i / SIZE) | 0; if (tiles[i] === T.Water && (dist(x, y) > RADIUS - 1 || x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1)) { sea[i] = 1; stack.push(i) } }
    while (stack.length) {
      const c = stack.pop()!
      const cx = c % SIZE, cy = (c / SIZE) | 0
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d], ny = cy + DY[d]
        if (!inBounds(nx, ny)) continue
        const n = ny * SIZE + nx
        if (sea[n] || tiles[n] !== T.Water) continue
        sea[n] = 1
        stack.push(n)
      }
    }
    for (let i = 0; i < SIZE * SIZE; i++) if (tiles[i] === T.Water && !sea[i]) lake[i] = 1
  }
  // swimming creatures: a few in the middle of the lakes (a tile whose four neighbours are lake as well)
  {
    const deep: number[] = []
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!lake[i]) continue
      const x = i % SIZE, y = (i / SIZE) | 0
      if (inBounds(x - 1, y) && inBounds(x + 1, y) && inBounds(x, y - 1) && inBounds(x, y + 1) && lake[i - 1] && lake[i + 1] && lake[i - SIZE] && lake[i + SIZE] && ringAt(x, y) > 0) deep.push(i)
    }
    const want = Math.min(8, Math.floor(deep.length / 6))
    const used: number[] = []
    for (let k = 0; k < want && deep.length; k++) {
      let spot = -1
      for (let tries = 0; tries < 20; tries++) {
        const cand = deep[Math.floor(rng() * deep.length)]
        const cx = cand % SIZE, cy = (cand / SIZE) | 0
        if (used.every((u) => Math.abs((u % SIZE) - cx) + Math.abs(((u / SIZE) | 0) - cy) > 6)) { spot = cand; break }
      }
      if (spot < 0) break
      used.push(spot)
      const x = spot % SIZE, y = (spot / SIZE) | 0
      npcs.push({ id: `s${k}`, ring: ringAt(x, y), x, y, dir: Math.floor(rng() * 4) as Dir, behavior: 'walk', name: 'Swimmer', look: Math.floor(rng() * 1e9), swim: true })
    }
  }

  void hash2
  return { seed, tiles, gyms, npcs, pickups, spawns, lake }
}

// ---------------------------------------------------------------- the collapsing island
/** A tile band 1 tile thick falls into the sea every COLLAPSE_SECONDS, from the outside in. */
export const COLLAPSE_SECONDS = 15

/** Tiles further than this (from the centre) have fallen into the sea after `elapsed` seconds. */
export function collapseRadius(elapsedSeconds: number): number {
  const bands = Math.floor(Math.max(0, elapsedSeconds) / COLLAPSE_SECONDS)
  return RADIUS + 1 - bands
}

export function hasFallen(x: number, y: number, elapsedSeconds: number): boolean {
  return dist(x, y) > collapseRadius(elapsedSeconds)
}

