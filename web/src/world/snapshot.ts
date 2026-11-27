// A copy of the island the Battle Royale is really played on, as a world the editor can change: the ground (kind, height, picture of every tile), the buildings of the real map,
// the pine forests, the gyms, the Pokémon Centers, the trainers, the items and the start points. (The real map is drawn from 3D pieces, so the copy looks simpler than the original.)
import { buildChunkWorld } from '../rom/chunkWorld'
import type { WorldData } from '../rom/worldData'
import { getForestCells, prepareMeadow } from '../game/meadow'
import { C, NEVER_CARVE, RING_INNER, SIZE, T, dist, generateWorld } from '../game/world'
import { CLIFF_TEXTURE, DEFAULT_TEXTURE, LEVEL, MAX_LEVEL, emptyWorld, texIndex, type CustomWorld } from './customWorld'
import { EV, newEvent } from './events'

const SEED = 20240601

export function snapshotIsland(data: WorldData): CustomWorld {
  const built = buildChunkWorld(data)
  prepareMeadow(built, SEED)
  if (built.solid) {
    const mask = new Uint8Array(SIZE * SIZE)
    for (let i = 0; i < SIZE * SIZE; i++) if (built.solid[i] && dist(i % SIZE, (i / SIZE) | 0) < RING_INNER[0] - 0.2) { mask[i] = 1; if (built.ground[i] === T.Grass || built.ground[i] === T.Tall || built.ground[i] === T.Sand) built.ground[i] = T.Tree }
    NEVER_CARVE.mask = mask
  }
  const world = generateWorld(SEED, built.ground, { connect: true, height: built.height })
  NEVER_CARVE.mask = null
  const cw = emptyWorld()
  cw.name = 'Isla actual (copia)'
  const base = built.waterY + 0.35
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE, y = (i / SIZE) | 0
    const t = world.tiles[i]
    const kind = t === T.GymWall || t === T.GymDoor ? T.Grass : t
    cw.kind[i] = kind
    cw.level[i] = kind === T.Water ? 0 : Math.max(-10, Math.min(MAX_LEVEL, Math.round((built.height[i] - base) / LEVEL)))
    if (kind === T.Water) continue
    const outer = dist(x, y) >= RING_INNER[0] - 0.2
    let name = DEFAULT_TEXTURE
    if (kind === T.Cliff) name = CLIFF_TEXTURE
    else if (built.pathMask?.[i]) name = 'michi03a'
    else if (kind === T.Sand) name = 'michi01b'
    else if (!outer && built.topTex && built.topTex.idx[i]) name = built.topTex.names[built.topTex.idx[i] - 1] ?? DEFAULT_TEXTURE
    cw.tile[i] = name === DEFAULT_TEXTURE ? 0 : texIndex(cw, name)
  }
  // the buildings of the real map and the pines of ring 1
  for (const cb of data.buildings ?? []) {
    const ox = (cb.gx - data.window.x0) * 32 + 16, oz = (cb.gy - data.window.y0) * 32 + 16
    for (const it of cb.items) {
      const x = ox + it.x, z = oz + it.z + (it.model === 19 || it.model === 20 ? 1 : 0)
      if (dist(Math.floor(x), Math.floor(z)) >= RING_INNER[0] - 0.2) continue
      cw.objects.push({ id: cw.nextId++, kind: 'model', pack: cb.pack, model: it.model, x, z, rot: (it.rot / 65536) * 360 })
    }
  }
  for (const i of getForestCells()) cw.objects.push({ id: cw.nextId++, kind: 'pine', x: (i % SIZE) + 1, z: ((i / SIZE) | 0) + 1, rot: 0 })
  // what happens where
  const add = (type: number, x: number, y: number, f?: (e: ReturnType<typeof newEvent>) => void) => { const e = newEvent(cw.nextId++, type, x, y); f?.(e); cw.events.push(e) }
  for (const s of world.spawns) add(EV.Start, s.x, s.y)
  for (const g of world.gyms) {
    if (g.center) add(EV.Heal, g.doorX, g.doorY)
    else add(EV.Gym, g.doorX, g.doorY, (e) => { e.name = g.leader; e.gymType = g.type })
  }
  for (const n of world.npcs) if (!n.swim) add(EV.Trainer, n.x, n.y, (e) => { e.name = n.name; e.dir = n.dir; e.behavior = n.behavior; e.look = n.look })
  for (const p of world.pickups) add(EV.Item, p.x, p.y)
  void C
  return cw
}
