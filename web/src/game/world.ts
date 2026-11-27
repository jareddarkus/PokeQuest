// The Battle Royale island: 5 x 5 real Pokémon White 2 map chunks (160 x 160 tiles) cut into a circle of 4 rings.
// The ground, trees, water and tall grass come from the game file; this file adds rings, gyms, trainers and items.
import { RULES, tournamentStart } from './rules'
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
  /** a Pokémon Center (heals your team; you wake up here when all your Pokémon have fainted) instead of a gym */
  center?: boolean
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
  /** tiles that were blocked (trees, rocks, water ...) and were turned into ground so that every ring can be walked all the way round */
  carved?: number[]
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
/**
 * The real map was not made as rings: a ring can be cut into many separate pieces (you could get stuck in a dead end, or never get round the circle).
 * For every ring from 2 to the peak, the pieces of walkable ground of some size are joined to the biggest piece by the cheapest way through what blocks
 * (trees and fences first, then rocks, water last; the walls of the ring edges and of the gyms never). Returns the tile numbers that were changed into ground.
 */
export function connectRings(tiles: Uint8Array, debug?: unknown[]): number[] {
  const carved: number[] = []
  const walk = (t: number) => t === T.Grass || t === T.Tall || t === T.Sand || t === T.GymDoor
  const edgeRow = (x: number, y: number) => { const fl = Math.floor(dist(x, y)); return fl === RING_INNER[0] - 1 || fl === RING_INNER[1] - 1 || fl === RING_INNER[2] - 1 }
  const cost = (i: number, ring: number): number => {
    const x = i % SIZE, y = (i / SIZE) | 0
    if (ringAt(x, y) !== ring) return Infinity
    const t = tiles[i]
    if (walk(t)) return t === T.GymDoor ? 6 : 1
    if (edgeRow(x, y) || t === T.GymWall) return Infinity
    return t === T.Tree ? 4 : t === T.Cliff ? 30 : t === T.Water ? 14 : Infinity
  }
  for (let ring = 2; ring <= 4; ring++) {
    for (let round = 0; round < 40; round++) {
      // the separate pieces of this ring
      const comp = new Int32Array(SIZE * SIZE).fill(-1)
      const sizes: number[] = []
      for (let s = 0; s < SIZE * SIZE; s++) {
        if (comp[s] >= 0 || !walk(tiles[s]) || ringAt(s % SIZE, (s / SIZE) | 0) !== ring) continue
        const id = sizes.length
        let n = 0
        const st = [s]; comp[s] = id
        while (st.length) {
          const c = st.pop()!; n++
          const cx = c % SIZE, cy = (c / SIZE) | 0
          for (let d = 0; d < 4; d++) {
            const nx = cx + DX[d], ny = cy + DY[d]
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
            const ni = ny * SIZE + nx
            if (comp[ni] >= 0 || !walk(tiles[ni]) || ringAt(nx, ny) !== ring) continue
            comp[ni] = id; st.push(ni)
          }
        }
        sizes.push(n)
      }
      if (sizes.length < 2) break
      let main = 0
      for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k
      const wanted = new Set<number>()
      sizes.forEach((n, k) => { if (k !== main && n >= 12) wanted.add(k) })
      if (!wanted.size) break
      // the cheapest way from the biggest piece to any other big piece (Dijkstra over the tiles of this ring)
      const best = new Float64Array(SIZE * SIZE).fill(Infinity)
      const from = new Int32Array(SIZE * SIZE).fill(-1)
      const heap: Array<[number, number]> = []
      const push = (c: number, i: number) => { heap.push([c, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p } }
      const pop = (): [number, number] => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return top }
      for (let i = 0; i < SIZE * SIZE; i++) if (comp[i] === main) { best[i] = 0; push(0, i) }
      let target = -1
      while (heap.length) {
        const [c, i] = pop()
        if (c > best[i]) continue
        if (comp[i] >= 0 && wanted.has(comp[i])) { target = i; break }
        const x = i % SIZE, y = (i / SIZE) | 0
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d]
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
          const ni = ny * SIZE + nx
          const w = cost(ni, ring)
          if (!Number.isFinite(w)) continue
          const nc = c + w
          if (nc < best[ni]) { best[ni] = nc; from[ni] = i; push(nc, ni) }
        }
      }
      if (debug) debug.push({ ring, round, comps: sizes.length, main: sizes[main], wanted: [...wanted].map((k) => sizes[k]), target })
      if (target < 0) break // (no way through: the rest stay as they are)
      for (let i = target; i >= 0 && best[i] > 0; i = from[i]) if (!walk(tiles[i])) { tiles[i] = T.Grass; carved.push(i) }
    }
  }
  return carved
}

export function generateWorld(seed: number, ground: Uint8Array, opts: { barriers?: boolean; connect?: boolean } = {}): World {
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

  const carved = opts.connect ? connectRings(tiles) : [] // (every ring can be walked all the way round)

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

  // a Pokémon Center in each ring (1 - 3), on the north-east: it heals your team, and it is where you wake up when your whole team has fainted in that ring
  for (let ring = 1; ring <= 3 && RULES.centersOn > 0; ring++) {
    let spot: { x: number; y: number } | null = null
    // the north-east first, then around the ring (the walkable ground of a ring is not everywhere)
    for (const deg of [0, 12, -12, 24, -24, 36, -36, 48, -48, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const ang = ((-45 + deg) * Math.PI) / 180
      for (let r = RING_INNER[ring - 1] + 6; r < RING_INNER[ring - 1] + 17 && !spot; r++) {
        const m = Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang))) // (the rings are SQUARES: r is the square-ring distance, so every center really lies inside its own ring)
        const x = Math.round(C + (Math.cos(ang) * r) / m - 0.5), y = Math.round(C + (Math.sin(ang) * r) / m - 0.5)
        if (inBounds(x, y) && walkable(x, y) && walkable(x, y + 1) && !gyms.some((g) => Math.abs(g.x - x) < 6 && Math.abs(g.y - y) < 6)) spot = { x, y }
      }
      if (spot) break
    }
    if (!spot) continue
    tiles[spot.y * SIZE + spot.x] = T.GymDoor
    gyms.push({ id: `c${ring}`, ring, side: 'N', x: spot.x, y: spot.y, doorX: spot.x, doorY: spot.y, type: 'Normal', leader: 'Enfermera Joy', center: true })
  }

  const spawns: { x: number; y: number }[] = []
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.35) / 16
    for (let r = RADIUS - 1; r >= RING_INNER[0]; r--) { // (everybody starts on the outer shore: the sand, or the first grass inside it)
      const q = ringPoint(r, u)
      if (inBounds(q.x, q.y) && (tiles[q.y * SIZE + q.x] === T.Sand || walkable(q.x, q.y))) { spawns.push(q); break }
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
    for (let i = 0; i < (ring === 4 && RULES.peakNpcsOn <= 0 ? 0 : counts[ring - 1]); i++) { // (the peak is empty unless the owner wants people there)
      const p = freeTile(ring)
      npcs.push({
        id: `n${ring}_${i}`, ring, x: p.x, y: p.y, dir: Math.floor(rng() * 4) as Dir,
        behavior: pick(rng, behaviors), name: pick(rng, NPC_NAMES), look: Math.floor(rng() * 1e9),
      })
    }
  }

  // Poké Balls on the ground: ONE in every square of PICKUP_CELL x PICKUP_CELL tiles that has walkable ground (a random spot inside it), so they are spread evenly
  // over the whole island: a bigger ring gets more of them, a small one fewer, and there are no empty places or heaps
  const pickups: PickupSpec[] = []
  const perRing = [0, 0, 0, 0]
  const PICKUP_CELL = RULES.pickupCell // (one item in every square of this many tiles per side: a smaller number = more items)
  for (let cy = 0; cy * PICKUP_CELL < SIZE; cy++) {
    for (let cx = 0; cx * PICKUP_CELL < SIZE; cx++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = cx * PICKUP_CELL + Math.floor(rng() * PICKUP_CELL), y = cy * PICKUP_CELL + Math.floor(rng() * PICKUP_CELL)
        if (!inBounds(x, y) || !walkable(x, y) || ringAt(x, y) < 1 || gyms.some((g) => Math.abs(g.x - x) < 3 && Math.abs(g.y - y) < 3)) continue
        const ring = ringAt(x, y)
        pickups.push({ id: `p${ring}_${perRing[ring - 1]++}`, ring, x, y })
        break
      }
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
      if (ringAt(x, y) === 4 && RULES.peakNpcsOn <= 0) continue // (no swimmers in the lake of the peak either)
      npcs.push({ id: `s${k}`, ring: ringAt(x, y), x, y, dir: Math.floor(rng() * 4) as Dir, behavior: 'walk', name: 'Swimmer', look: Math.floor(rng() * 1e9), swim: true })
    }
  }

  void hash2
  if (opts.connect) carved.push(...connectRings(tiles)) // (again at the end: the gym buildings can cut a way that was open before)
  return { seed, tiles, gyms, npcs, pickups, spawns, lake, carved }
}

// ---------------------------------------------------------------- the collapsing island
/**
 * The rings fall one by one, from the outside in: after `RULES.ringSeconds` (5 minutes) ring 1 crumbles into the sea (it takes `RULES.fallSeconds`), and everybody
 * on it is sent to the next ring; after twice that time ring 2, after three times ring 3. Then only the peak is left.
 */
/** Tiles further than this (from the centre) have fallen into the sea after `elapsed` seconds. */
const ringStarts = (): number[] => [RULES.ring1Seconds, RULES.ring2Seconds, RULES.ring3Seconds]
const ringFalls = (): number[] => [RULES.fall1Seconds, RULES.fall2Seconds, RULES.fall3Seconds]
export function collapseRadius(elapsedSeconds: number): number {
  const S = ringStarts(), Fs = ringFalls()
  const outer = [RADIUS + 1, RING_INNER[0], RING_INNER[1]] // where ring 1, 2, 3 start from the outside
  let r = RADIUS + 1
  for (let k = 0; k < 3; k++) {
    const start = S[k], F = Math.max(1, Fs[k]), target = RING_INNER[k]
    if (elapsedSeconds >= start + F) r = Math.min(r, target)
    else if (elapsedSeconds > start) r = Math.min(r, outer[k] - (outer[k] - target) * ((elapsedSeconds - start) / F))
  }
  return r
}

/** What the clock says: which ring falls next and in how many seconds (or that it is falling now); after ring 3 only the peak is left. */
export function collapseInfo(elapsedSeconds: number): { ring: number; seconds: number; falling: boolean } {
  const S = ringStarts(), Fs = ringFalls()
  for (let k = 0; k < 3; k++) {
    const start = S[k], F = Math.max(1, Fs[k])
    if (elapsedSeconds < start) return { ring: k + 1, seconds: start - elapsedSeconds, falling: false }
    if (elapsedSeconds < start + F) return { ring: k + 1, seconds: start + F - elapsedSeconds, falling: true }
  }
  return { ring: 4, seconds: Math.max(0, tournamentStart() - elapsedSeconds), falling: false }
}

/** The warning (the ground shakes / reddens) shows for the last 20 seconds before a ring falls and while it falls. */
export function collapseWarn(elapsedSeconds: number): boolean {
  const S = ringStarts(), Fs = ringFalls()
  for (let k = 0; k < 3; k++) { const start = S[k]; if (RULES.warnSeconds > 0 && elapsedSeconds > start - RULES.warnSeconds && elapsedSeconds < start + Math.max(1, Fs[k])) return true }
  return false
}

export function hasFallen(x: number, y: number, elapsedSeconds: number): boolean {
  return dist(x, y) > collapseRadius(elapsedSeconds)
}

