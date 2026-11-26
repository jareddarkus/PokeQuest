// The buildings of Pokémon Black 2 / White 2 maps (Pokémon Center, houses, gates, signs, parasols ...).
//  - a/2/2/5 = 70 "building packs". A pack ('AB' container) is a list of N records followed by N 3D models (BMD0): record k describes
//    model k; its first 32-bit number (low 16 bits) is the building number used by the map files.
//  - a/1/7/4 = the textures (BTX0) of every pack, same file number.
//  - every map file ends with a table: a count, then 16 bytes per building: x, y, z (16.16 fixed point, in tiles, relative to the map's
//    centre), a 16-bit turn (0 - 65535) and the 16-bit building number (high byte first).
export const BUILDING_PACKS_NARC = 'a/2/2/5'
export const BUILDING_TEX_NARC = 'a/1/7/4'

export interface BuildingSpec { model: number; x: number; y: number; z: number; rot: number }
export interface Pack { ids: number[]; models: Uint8Array[] }

export function parsePack(file: Uint8Array): Pack | null {
  if (file.length < 8 || file[0] !== 0x41 || file[1] !== 0x42) return null
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const n = dv.getUint16(2, true)
  const offs: number[] = []
  for (let i = 0; i <= n; i++) offs.push(dv.getUint32(4 + i * 4, true))
  const m = n >> 1
  const ids: number[] = []
  const models: Uint8Array[] = []
  for (let k = 0; k < m; k++) {
    ids.push(dv.getUint32(offs[k], true) & 0xffff)
    models.push(file.subarray(offs[m + k], offs[m + k + 1]))
  }
  return { ids, models }
}

/** The building list at the end of a map file: [{ building number, x, y, z, turn }]. */
export function readBuildingTable(map: Uint8Array): Array<{ id: number; x: number; y: number; z: number; rot: number }> {
  const dv = new DataView(map.buffer, map.byteOffset, map.byteLength)
  const sections = dv.getUint16(2, true)
  if (sections < 3) return []
  const p = dv.getUint32(4 + (sections - 1) * 4, true) // the building table is the last section
  if (p + 4 > map.length) return []
  const count = dv.getUint32(p, true)
  const out: Array<{ id: number; x: number; y: number; z: number; rot: number }> = []
  for (let k = 0; k < count && p + 4 + (k + 1) * 16 <= map.length; k++) {
    const o = p + 4 + k * 16
    out.push({
      x: dv.getInt32(o, true) / 65536,
      y: dv.getInt32(o + 4, true) / 65536,
      z: dv.getInt32(o + 8, true) / 65536,
      rot: dv.getUint16(o + 12, true),
      id: (map[o + 14] << 8) | map[o + 15],
    })
  }
  return out
}

/** Which pack holds all (or most) of these building numbers. */
export function choosePack(ids: number[], packs: Array<Pack | null>): number {
  let best = -1
  let bestHit = -1
  packs.forEach((p, i) => {
    if (!p) return
    const have = new Set(p.ids)
    const hit = ids.filter((id) => have.has(id)).length
    if (hit > bestHit) { bestHit = hit; best = i }
  })
  return best
}

/** The Pokémon Center building (model `pc_01`, building 0: every pack has it). */
export const CENTER_MODEL = { pack: 0, model: 0 }

/** The real gym buildings of the game (pack, model). Each gym of the island gets one. */
export const GYM_MODELS: Array<{ pack: number; model: number }> = [
  { pack: 35, model: 30 }, // c04_gym_01
  // (c04_gym_02 left out: its door is not in the middle of the building)
  { pack: 9, model: 34 }, // c06_gym_01
  { pack: 12, model: 38 }, // c8_gym_01
  { pack: 12, model: 41 }, // c8_gym_02
  // (c03_gym_01 left out: no door on its front)
  { pack: 52, model: 31 }, // c12_gym_01
  { pack: 54, model: 32 }, // c13_gym_01
  { pack: 57, model: 32 }, // c14_gym_01
  { pack: 12, model: 53 }, // c8_gym_03
  { pack: 12, model: 55 }, // c8_gym_04
]
