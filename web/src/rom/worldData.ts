// The part of the Unova map that the game uses as its island. At import time we copy the needed map files out of the
// player's game file into the player's browser storage; the game then builds its 3D world from those.
import { NdsFile, parseNarc } from './nds'
import { readModelName, readModels, readTexFile } from './nitro'
import { BUILDING_PACKS_NARC, BUILDING_TEX_NARC, GYM_MODELS, choosePack, parsePack, readBuildingTable, type BuildingSpec } from './buildings'

/** A block of n x n neighbouring map chunks (each 32 x 32 tiles) taken from the real Unova overworld grid. */
export interface WorldWindow { x0: number; y0: number; n: number }
export const WORLD_WINDOW: WorldWindow = { x0: 20, y0: 5, n: 5 }

export interface ChunkData { gx: number; gy: number; map: Uint8Array; texIndex: number }
export interface ChunkBuildings { gx: number; gy: number; pack: number; items: BuildingSpec[] }
export interface WorldData {
  window: WorldWindow
  chunks: ChunkData[]
  textures: Record<number, Uint8Array>
  buildings?: ChunkBuildings[]
  packs?: Record<number, { bld: Uint8Array; tex: Uint8Array }>
  anims?: Uint8Array[] // texture animation files (water ...), a/0/6/8
}

export async function extractWorldData(nds: NdsFile, win: WorldWindow, onProgress?: (t: string, done: number, total: number) => void): Promise<WorldData> {
  const maps = parseNarc(await nds.get('a/0/0/8'))
  const texFiles = parseNarc(await nds.get('a/0/1/4'))
  const archiveNames = texFiles.map((t) => { const f = readTexFile(t); return f ? new Set(f.texs.map((x) => x.name)) : null })
  const packFiles = parseNarc(await nds.get(BUILDING_PACKS_NARC))
  const packTex = parseNarc(await nds.get(BUILDING_TEX_NARC))
  const packs = packFiles.map((f) => parsePack(f))
  const buildings: ChunkBuildings[] = []
  const usedPacks: Record<number, { bld: Uint8Array; tex: Uint8Array }> = {}
  const chunks: ChunkData[] = []
  const textures: Record<number, Uint8Array> = {}
  for (let i = 0; i < maps.length; i++) {
    if (i % 25 === 0) { onProgress?.('Reading the island map…', i, maps.length); await new Promise((r) => setTimeout(r)) }
    const m = maps[i]
    const dv = new DataView(m.buffer, m.byteOffset, m.byteLength)
    const bmd = m.subarray(dv.getUint32(4, true))
    const name = readModelName(bmd)
    const mm = name ? /^map(\d+)_(\d+)$/.exec(name) : null
    if (!mm) continue
    const gx = Number(mm[1]), gy = Number(mm[2])
    if (gx < win.x0 || gx >= win.x0 + win.n || gy < win.y0 || gy >= win.y0 + win.n) continue
    const model = readModels(bmd)[0]
    const need = Array.from(new Set(model.materials.map((x) => x.texture).filter(Boolean))) as string[]
    const texIndex = archiveNames.findIndex((s) => s !== null && need.every((n) => s.has(n)))
    if (texIndex < 0) continue
    textures[texIndex] = new Uint8Array(texFiles[texIndex]) // copy
    chunks.push({ gx, gy, map: new Uint8Array(m), texIndex })
    const table = readBuildingTable(m)
    if (table.length) {
      const pk = choosePack(table.map((b) => b.id), packs)
      if (pk >= 0 && packs[pk]) {
        const items: BuildingSpec[] = []
        for (const b of table) {
          const mi = packs[pk]!.ids.indexOf(b.id)
          if (mi >= 0) items.push({ model: mi, x: b.x, y: b.y, z: b.z, rot: b.rot })
        }
        if (items.length) {
          buildings.push({ gx, gy, pack: pk, items })
          if (!usedPacks[pk]) usedPacks[pk] = { bld: new Uint8Array(packFiles[pk]), tex: new Uint8Array(packTex[pk]) }
        }
      }
    }
  }
  onProgress?.('Reading the island map…', maps.length, maps.length)
  for (const g of GYM_MODELS) if (!usedPacks[g.pack] && packFiles[g.pack]) usedPacks[g.pack] = { bld: new Uint8Array(packFiles[g.pack]), tex: new Uint8Array(packTex[g.pack]) }
  let anims: Uint8Array[] = []
  try { anims = parseNarc(await nds.get('a/0/6/8')).map((f) => new Uint8Array(f)) } catch { /* no animations */ }
  return { window: win, chunks, textures, buildings, packs: usedPacks, anims }
}

