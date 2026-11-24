// Builds the 3D island from the real map chunks and works out, for every tile, whether it can be walked on.
import * as THREE from 'three'
import { buildModelObject, type ClipUniforms } from './mapModel'
import { parsePack } from './buildings'
import { readModels, readTexFile, type Model } from './nitro'
import type { WorldData } from './worldData'

const T = { Water: 0, Grass: 2, Tall: 3, Tree: 4 }

export interface BuiltWorld {
  group: THREE.Group
  size: number // tiles per side
  ground: Uint8Array // tile codes: 0 water, 2 grass, 3 tall grass, 4 blocked
  height: Float32Array // ground height of every tile (in tile units)
  waterY: number
  uniforms: ClipUniforms
  /** A real building model (from a building pack) ready to put into the scene, or null. Size in tiles is in `size`. */
  makeBuilding: (pack: number, model: number) => { obj: THREE.Group; w: number; d: number; h: number } | null
}

const TALL = new Set([4, 5, 6, 7, 8, 9, 0x21, 0x22])

/** What a tile is, from the game's own tile table (behaviour + flags). */
function classify(beh: number, fl: number): number {
  if (beh === 1 && fl & 1) return T.Tree // can't pass
  if (beh === 0xff) return T.Tree
  if ((beh >= 0x3d && beh <= 0x44) || beh === 0x12 || (fl & 2 && beh !== 0x17)) return T.Water // lakes and sea
  if (beh >= 0x51 && beh <= 0x58) return T.Tree // one-sided walls
  if (beh >= 0x72 && beh <= 0x79) return T.Tree // ledges / spin tiles
  if (beh >= 0xd4 && beh <= 0xe2) return T.Tree // PCs, signs, machines
  if (beh === 0x1d || beh === 0x30 || beh === 0x32 || beh === 0x9c || beh === 0xbe) return T.Tree
  if (TALL.has(beh)) return T.Tall
  return T.Grass
}

const NOT_GROUND = ['ki', 'kusa', 'plant', 'hana', 'saku', 'fence', 'nagakusa', 'yamasaba', 'kisetu', 'ike_', 'out07saku']
const isGroundMaterial = (name: string) => !NOT_GROUND.some((p) => name.startsWith(p))

/** Looks straight down at every tile centre of a chunk and records the height of the ground. */
function rasterHeights(model: Model, out: Float32Array, ox: number, oz: number, size: number): void {
  const best = new Float32Array(32 * 32).fill(-1e9)
  for (const mesh of model.meshes) {
    const name = model.materials[mesh.material]?.name ?? ''
    if (!isGroundMaterial(name)) continue
    const v = mesh.verts
    for (let t = 0; t + 2 < v.length; t += 3) {
      const a = v[t], b = v[t + 1], c = v[t + 2]
      const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
      const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
      const len = Math.hypot(nx, ny, nz) || 1
      if (Math.abs(ny / len) < 0.35) continue // walls
      const minx = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x) / 16 + 16)), maxx = Math.min(31, Math.ceil(Math.max(a.x, b.x, c.x) / 16 + 16))
      const minz = Math.max(0, Math.floor(Math.min(a.z, b.z, c.z) / 16 + 16)), maxz = Math.min(31, Math.ceil(Math.max(a.z, b.z, c.z) / 16 + 16))
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
      if (Math.abs(d) < 1e-6) continue
      for (let tz = minz; tz <= maxz; tz++) {
        for (let tx = minx; tx <= maxx; tx++) {
          const px = (tx - 16 + 0.5) * 16, pz = (tz - 16 + 0.5) * 16
          const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d
          const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d
          const l3 = 1 - l1 - l2
          if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue
          const y = l1 * a.y + l2 * b.y + l3 * c.y
          if (y > best[tz * 32 + tx]) best[tz * 32 + tx] = y
        }
      }
    }
  }
  for (let tz = 0; tz < 32; tz++) for (let tx = 0; tx < 32; tx++) {
    const y = best[tz * 32 + tx]
    out[(oz + tz) * size + ox + tx] = y > -1e8 ? y / 16 : 0
  }
}

/** Puts the real buildings (Pokémon Centers, houses, signs ...) of every map piece into the world. */
function addBuildings(data: WorldData, group: THREE.Group, uniforms: ClipUniforms) {
  if (!data.buildings || !data.packs) return
  const parsed = new Map<number, { models: Uint8Array[]; tex: ReturnType<typeof readTexFile> }>()
  for (const cb of data.buildings) {
    let pk = parsed.get(cb.pack)
    if (!pk) {
      const raw = data.packs[cb.pack]
      const pack = raw ? parsePack(raw.bld) : null
      if (!raw || !pack) continue
      pk = { models: pack.models, tex: readTexFile(raw.tex) }
      parsed.set(cb.pack, pk)
    }
    if (!pk.tex) continue
    const ox = (cb.gx - data.window.x0) * 32 + 16
    const oz = (cb.gy - data.window.y0) * 32 + 16
    for (const it of cb.items) {
      try {
        const model = readModels(pk.models[it.model])[0]
        if (!model) continue
        const obj = buildModelObject(model, pk.tex, uniforms)
        obj.position.set(ox + it.x, it.y, oz + it.z)
        obj.rotation.y = (it.rot / 65536) * Math.PI * 2
        group.add(obj)
      } catch { /* skip a model we cannot read */ }
    }
  }
}

export function buildChunkWorld(data: WorldData): BuiltWorld {
  const n = data.window.n
  const size = n * 32
  const ground = new Uint8Array(size * size)
  const height = new Float32Array(size * size)
  const group = new THREE.Group()
  const uniforms: ClipUniforms = {
    uCut: { value: 999 }, uCenter: { value: new THREE.Vector2(size / 2, size / 2) }, uTime: { value: 0 }, uWarn: { value: 0 },
  }
  const texCache = new Map<number, ReturnType<typeof readTexFile>>()
  const waterHeights: number[] = []

  for (const c of data.chunks) {
    const dv = new DataView(c.map.buffer, c.map.byteOffset, c.map.byteLength)
    const sections = dv.getUint16(2, true)
    const offs: number[] = []
    for (let k = 0; k < sections + 1; k++) offs.push(dv.getUint32(4 + k * 4, true))
    const model = readModels(c.map.subarray(offs[0]))[0]
    let tex = texCache.get(c.texIndex)
    if (!tex) { tex = readTexFile(data.textures[c.texIndex]); texCache.set(c.texIndex, tex) }
    const ox = (c.gx - data.window.x0) * 32
    const oz = (c.gy - data.window.y0) * 32
    if (tex) {
      const obj = buildModelObject(model, tex, uniforms)
      obj.position.set(ox + 16, 0, oz + 16)
      group.add(obj)
    }
    // tile table: width, height, then 8 bytes per tile (slope, distance, behaviour, flags)
    const p = offs[1]
    const w = dv.getUint16(p, true)
    for (let t = 0; t < w * dv.getUint16(p + 2, true); t++) {
      const beh = dv.getUint16(p + 4 + t * 8 + 4, true)
      const fl = dv.getUint16(p + 4 + t * 8 + 6, true)
      ground[(oz + Math.floor(t / w)) * size + ox + (t % w)] = classify(beh, fl)
    }
    rasterHeights(model, height, ox, oz, size)
  }
  addBuildings(data, group, uniforms)
  for (let i = 0; i < size * size; i++) if (ground[i] === T.Water) waterHeights.push(height[i])
  waterHeights.sort((a, b) => a - b)
  const waterY = waterHeights.length ? waterHeights[Math.floor(waterHeights.length / 2)] : -1
  const packCache = new Map<number, { models: Uint8Array[]; tex: ReturnType<typeof readTexFile> } | null>()
  const makeBuilding = (pack: number, model: number) => {
    let pk = packCache.get(pack)
    if (pk === undefined) {
      const raw = data.packs?.[pack]
      const parsed = raw ? parsePack(raw.bld) : null
      pk = raw && parsed ? { models: parsed.models, tex: readTexFile(raw.tex) } : null
      packCache.set(pack, pk)
    }
    if (!pk || !pk.tex || !pk.models[model]) return null
    try {
      const m = readModels(pk.models[model])[0]
      if (!m) return null
      const obj = buildModelObject(m, pk.tex, uniforms)
      const box = new THREE.Box3().setFromObject(obj)
      const sz = box.getSize(new THREE.Vector3())
      return { obj, w: sz.x, d: sz.z, h: sz.y }
    } catch { return null }
  }
  return { group, size, ground, height, waterY, uniforms, makeBuilding }
}
