// The part of the Unova map that the game uses as its island. At import time we copy the needed map files out of the
// player's game file into the player's browser storage; the game then builds its 3D world from those.
import { NdsFile, parseNarc } from './nds'
import { readModelName, readModels, readTexFile } from './nitro'

/** A block of n x n neighbouring map chunks (each 32 x 32 tiles) taken from the real Unova overworld grid. */
export interface WorldWindow { x0: number; y0: number; n: number }
export const WORLD_WINDOW: WorldWindow = { x0: 20, y0: 5, n: 5 }

export interface ChunkData { gx: number; gy: number; map: Uint8Array; texIndex: number }
export interface WorldData { window: WorldWindow; chunks: ChunkData[]; textures: Record<number, Uint8Array> }

export async function extractWorldData(nds: NdsFile, win: WorldWindow, onProgress?: (t: string) => void): Promise<WorldData> {
  const maps = parseNarc(await nds.get('a/0/0/8'))
  const texFiles = parseNarc(await nds.get('a/0/1/4'))
  const archiveNames = texFiles.map((t) => { const f = readTexFile(t); return f ? new Set(f.texs.map((x) => x.name)) : null })
  const chunks: ChunkData[] = []
  const textures: Record<number, Uint8Array> = {}
  for (let i = 0; i < maps.length; i++) {
    const m = maps[i]
    const dv = new DataView(m.buffer, m.byteOffset, m.byteLength)
    const bmd = m.subarray(dv.getUint32(4, true))
    const name = readModelName(bmd)
    const mm = name ? /^map(\d+)_(\d+)$/.exec(name) : null
    if (!mm) continue
    const gx = Number(mm[1]), gy = Number(mm[2])
    if (gx < win.x0 || gx >= win.x0 + win.n || gy < win.y0 || gy >= win.y0 + win.n) continue
    onProgress?.(`Map piece ${gx},${gy}`)
    const model = readModels(bmd)[0]
    const need = Array.from(new Set(model.materials.map((x) => x.texture).filter(Boolean))) as string[]
    const texIndex = archiveNames.findIndex((s) => s !== null && need.every((n) => s.has(n)))
    if (texIndex < 0) continue
    textures[texIndex] = new Uint8Array(texFiles[texIndex]) // copy
    chunks.push({ gx, gy, map: new Uint8Array(m), texIndex })
  }
  return { window: win, chunks, textures }
}

