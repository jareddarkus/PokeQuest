// The Battle Royale island. 4 rings of 20 tiles each, the peak in the middle. Built from a seed so every
// player in a match gets exactly the same island.
import { hash2, mulberry32, pick, valueNoise } from './rng'

export const T = {
  Water: 0,
  Sand: 1,
  Grass: 2,
  Tall: 3,
  Tree: 4,
  Cliff: 5,
  GymWall: 6,
  GymDoor: 7,
} as const
export type Tile = (typeof T)[keyof typeof T]

export const SIZE = 170 // tiles per side
export const C = SIZE / 2 // centre
export const RADIUS = 80 // the island edge
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

export type Dir = 0 | 1 | 2 | 3 // 0 down, 1 left, 2 right, 3 up
export const DX = [0, -1, 1, 0]
export const DY = [1, 0, 0, -1]

export interface Gym {
  id: string
  ring: number // 1..3: beating this gym leader sends you to ring + 1
  side: 'N' | 'E' | 'S' | 'W'
  x: number // top-left tile of the 7x5 building
  y: number
  doorX: number
  doorY: number
  type: PType
  leader: string
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
}

export function dist(x: number, y: number): number {
  return Math.hypot(x + 0.5 - C, y + 0.5 - C)
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

export function gymRect(ring: number, side: 'N' | 'E' | 'S' | 'W'): { x: number; y: number } {
  const rIn = RING_INNER[ring - 1]
  switch (side) {
    case 'N': return { x: C - 3, y: C - (rIn + 9) }
    case 'S': return { x: C - 3, y: C + rIn + 3 }
    case 'E': return { x: C + rIn + 2, y: C - 2 }
    case 'W': return { x: C - (rIn + 9), y: C - 2 }
  }
}

export function generateWorld(seed: number): World {
  const rng = mulberry32(seed)
  const tiles = new Uint8Array(SIZE * SIZE)

  // gyms first (4 per ring, rings 1-3), with random types
  const gyms: Gym[] = []
  const reserved = new Set<number>()
  for (let ring = 1; ring <= 3; ring++) {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const { x, y } = gymRect(ring, side)
      gyms.push({
        id: `g${ring}${side}`, ring, side, x, y, doorX: x + 3, doorY: y + 4,
        type: pick(rng, TYPES), leader: pick(rng, LEADER_NAMES),
      })
      for (let yy = y - 2; yy < y + 8; yy++) for (let xx = x - 2; xx < x + 9; xx++) reserved.add(yy * SIZE + xx)
    }
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y)
      let t: Tile = T.Grass
      if (d > RADIUS + 1) t = T.Water
      else if (d > RADIUS - 1) t = T.Sand
      else {
        const fl = Math.floor(d)
        if (fl === RING_INNER[0] - 1 || fl === RING_INNER[1] - 1 || fl === RING_INNER[2] - 1) t = T.Cliff
        else {
          const n1 = valueNoise(x, y, seed, 9)
          const n2 = valueNoise(x, y, seed + 17, 6)
          if (n2 > 0.64 && hash2(x, y, seed + 5) > 0.45 && !reserved.has(y * SIZE + x)) t = T.Tree
          else if (n1 > 0.52) t = T.Tall
        }
      }
      tiles[y * SIZE + x] = t
    }
  }

  // stamp the gym buildings
  for (const g of gyms) {
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 7; xx++) tiles[(g.y + yy) * SIZE + g.x + xx] = T.GymWall
    tiles[g.doorY * SIZE + g.doorX] = T.GymDoor
    // a clear path in front of the door
    for (let k = 1; k <= 3; k++) {
      const i = (g.doorY + k) * SIZE + g.doorX
      if (tiles[i] === T.Tree || tiles[i] === T.Cliff) tiles[i] = T.Grass
    }
  }

  // spawn points: as far apart as possible on the outer ring
  const spawns: { x: number; y: number }[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2
    const r = 70
    let x = Math.round(C + Math.cos(a) * r - 0.5)
    let y = Math.round(C + Math.sin(a) * r - 0.5)
    // find a walkable tile close by
    for (let k = 0; k < 40 && !(tiles[y * SIZE + x] === T.Grass || tiles[y * SIZE + x] === T.Tall); k++) {
      x += k % 2 === 0 ? 1 : 0
      y += k % 2 === 1 ? 1 : 0
    }
    spawns.push({ x, y })
  }

  const freeTile = (ring: number): { x: number; y: number } => {
    for (let tries = 0; tries < 500; tries++) {
      const a = rng() * Math.PI * 2
      const lo = ring === 4 ? 2 : RING_INNER[ring - 1] + 2
      const hi = ring === 1 ? RADIUS - 4 : RING_INNER[ring - 2] - 3
      const r = lo + rng() * (hi - lo)
      const x = Math.round(C + Math.cos(a) * r - 0.5)
      const y = Math.round(C + Math.sin(a) * r - 0.5)
      const t = tiles[y * SIZE + x]
      if ((t === T.Grass || t === T.Tall) && !reserved.has(y * SIZE + x)) return { x, y }
    }
    return { x: C, y: C }
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

  return { seed, tiles, gyms, npcs, pickups, spawns }
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
