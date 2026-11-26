// Puts the events of a custom world into the game's World: trainers and people, gyms, items, start points, tiles that do something, and the wild groups of the grass.
import { SIZE, T, ringAt, type Dir, type Gym, type NpcSpec, type PType, type PickupSpec, type World } from '../game/world'
import { EV } from './events'
import type { CustomWorld } from './customWorld'

export function applyCustomEvents(world: World, cw: CustomWorld): void {
  world.encGroup = cw.enc
  world.groups = new Map(cw.groups.map((g) => [g.id, g]))
  if (cw.events.length === 0) return // no events: the game keeps its own trainers, gyms and items
  // everything the game made by itself is replaced by what the editor says
  for (const g of world.gyms) { const i = g.doorY * SIZE + g.doorX; if (world.tiles[i] === T.GymDoor) world.tiles[i] = T.Grass }
  const npcs: NpcSpec[] = [], gyms: Gym[] = [], pickups: PickupSpec[] = [], spawns: Array<{ x: number; y: number }> = []
  const triggers = new Map<number, { type: number; text?: string; tx?: number; ty?: number }>()
  for (const e of cw.events) {
    if (e.x < 0 || e.y < 0 || e.x >= SIZE || e.y >= SIZE) continue
    const ring = ringAt(e.x, e.y) || 1
    const i = e.y * SIZE + e.x
    if (e.type === EV.Start) spawns.push({ x: e.x, y: e.y })
    else if (e.type === EV.Trainer || e.type === EV.Person) {
      npcs.push({
        id: `e${e.id}`, ring, x: e.x, y: e.y, dir: ((e.dir ?? 0) & 3) as Dir, behavior: e.behavior ?? 'stand', name: e.name || 'Entrenador', look: e.look ?? e.id * 7919,
        custom: { lines: e.lines?.length ? e.lines : ['…'], after: e.after?.length ? e.after : ['…'], group: e.group ?? 0, fights: e.type === EV.Trainer },
      })
    } else if (e.type === EV.Gym) {
      gyms.push({ id: `ge${e.id}`, ring, side: 'N', x: e.x, y: e.y, doorX: e.x, doorY: e.y, type: (e.gymType ?? 'Normal') as PType, leader: e.name || 'Líder', custom: { lines: e.lines?.length ? e.lines : ['…'], group: e.group ?? 0, tx: e.tx ?? -1, ty: e.ty ?? -1 } })
      world.tiles[i] = T.GymDoor
    } else if (e.type === EV.Item) pickups.push({ id: `pe${e.id}`, ring, x: e.x, y: e.y })
    else if (e.type === EV.Heal || e.type === EV.Teleport || e.type === EV.Sign) triggers.set(i, { type: e.type, text: e.text, tx: e.tx, ty: e.ty })
  }
  world.npcs = npcs
  world.gyms = gyms
  world.pickups = pickups
  if (spawns.length) world.spawns = spawns
  world.triggers = triggers
}
