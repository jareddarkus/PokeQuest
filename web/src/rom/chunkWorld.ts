// Builds the 3D island from the real map chunks and works out, for every tile, whether it can be walked on.
import * as THREE from 'three'
import { buildModelObject, type ClipUniforms } from './mapModel'
import { parsePack } from './buildings'
import { parseTextureAnim as parseBtaFile } from './texanim'
import { parseTextureAnim, type MatAnim } from './texanim'
import { decodeTexture, readModels, readTexFile, type Model } from './nitro'
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
  /** a picture of the map textures by name (e.g. 'grass01ax'), as a three.js texture; `repeat` = it tiles; null when no map piece uses it */
  textureNamed: (name: string, repeat: boolean, score?: (r: number, g: number, b: number) => number) => THREE.DataTexture | null
  /** the names of all the map pictures the game file gave us (for the world editor's palette) */
  textureNames: () => string[]
  /** the building packs: how many models each has (for the world editor's palette) */
  packModels: () => Array<{ pack: number; count: number }>
  /** 1 = a path tile of the meadow (set by game/meadow.ts) */
  pathMask?: Uint8Array
  /** 1 = a tile of a bridge (the game's upper level is walkable there; a bridge deck gets no tall grass) */
  bridge?: Uint8Array
  /** 1 = a tile under a solid object (rock, sign, house ...): never walkable, never carved through */
  solid?: Uint8Array
  /** the picture name of the top ground surface of every tile (index + 1 into `names`; 0 = none) */
  topTex?: { names: string[]; idx: Uint16Array }
  /** the map data this world was built from (the editor's copy of the island needs the placed buildings) */
  chunkInfo?: WorldData
}

const TALL = new Set([4, 5, 6, 7, 8, 9, 0x21, 0x22])

/** What a tile is, from the game's own tile table (behaviour + flags). */
export function classify(beh: number, fl: number): number {
  if (beh === 1 && fl & 1) return T.Tree // can't pass
  if (beh === 0xff) return T.Tree
  if ((beh >= 0x3d && beh <= 0x44) || beh === 0x12 || beh === 0x17 || (fl & 2 && beh !== 0x17)) return T.Water // lakes and sea (0x17 = the foam row of the shore: water you cannot walk into without Surf)
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
function rasterHeights(model: Model, out: Float32Array, ox: number, oz: number, size: number, tex?: { names: string[]; idx: Uint16Array }): void {
  const best = new Float32Array(32 * 32).fill(-1e9)
  const bestTex = new Uint16Array(32 * 32)
  for (const mesh of model.meshes) {
    const name = model.materials[mesh.material]?.name ?? ''
    if (!isGroundMaterial(name)) continue
    const texName = model.materials[mesh.material]?.texture || name
    let texNo = 0
    if (tex) { texNo = tex.names.indexOf(texName) + 1; if (texNo === 0) { tex.names.push(texName); texNo = tex.names.length } }
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
          if (y > best[tz * 32 + tx]) { best[tz * 32 + tx] = y; bestTex[tz * 32 + tx] = texNo }
        }
      }
    }
  }
  for (let tz = 0; tz < 32; tz++) for (let tx = 0; tx < 32; tx++) {
    const y = best[tz * 32 + tx]
    out[(oz + tz) * size + ox + tx] = y > -1e8 ? y / 16 : 0
    if (tex) tex.idx[(oz + tz) * size + ox + tx] = y > -1e8 ? bestTex[tz * 32 + tx] : 0
  }
}

/** Puts the real buildings (Pokémon Centers, houses, signs ...) of every map piece into the world. */
function addBuildings(data: WorldData, group: THREE.Group, uniforms: ClipUniforms) {
  if (!data.buildings || !data.packs) return
  const parsed = new Map<number, { models: Uint8Array[]; anims: Array<Uint8Array | null>; tex: ReturnType<typeof readTexFile> }>()
  const animCache = new Map<string, ReturnType<typeof parseBtaFile>>()
  for (const cb of data.buildings) {
    let pk = parsed.get(cb.pack)
    if (!pk) {
      const raw = data.packs[cb.pack]
      const pack = raw ? parsePack(raw.bld) : null
      if (!raw || !pack) continue
      pk = { models: pack.models, anims: pack.anims, tex: readTexFile(raw.tex) }
      parsed.set(cb.pack, pk)
    }
    if (!pk.tex) continue
    const ox = (cb.gx - data.window.x0) * 32 + 16
    const oz = (cb.gy - data.window.y0) * 32 + 16
    for (const it of cb.items) {
      try {
        const model = readModels(pk.models[it.model])[0]
        if (!model) continue
        // the building's own texture animation (the water of a fountain moves ...), read from its record in the pack
        const bta = pk.anims[it.model]
        const akey = `${cb.pack}/${it.model}`
        let anim = animCache.get(akey)
        if (anim === undefined && bta) { anim = parseBtaFile(bta); animCache.set(akey, anim) }
        const obj = buildModelObject(model, pk.tex, uniforms, anim && anim.size ? anim : undefined, true)
        // vending machines and bins (building numbers 19 and 20 of the shared set) stand one tile further south than the table says:
        // the game's tile data puts them on the row in front of the flower bed, not inside it
        const dz = it.model === 19 || it.model === 20 ? 1 : 0
        obj.position.set(ox + it.x, it.y, oz + it.z + dz)
        obj.rotation.y = (it.rot / 65536) * Math.PI * 2
        obj.userData.building = { model: it.model, pack: cb.pack, x: ox + it.x, y: it.y, z: oz + it.z }
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
    uCut: { value: 999 }, uCenter: { value: new THREE.Vector2(size / 2, size / 2) }, uTime: { value: 0 }, uWarn: { value: 0 }, uHide: { value: 9999 }, uLift: { value: 0 },
  }
  const texCache = new Map<number, ReturnType<typeof readTexFile>>()
  const animSets = (data.anims ?? []).map((f) => parseTextureAnim(f))
  /** the texture animation file that fits a map piece best (most material names in common) */
  const animFor = (names: string[]): Map<string, MatAnim> | undefined => {
    let best: Map<string, MatAnim> | undefined
    let bestN = 0
    for (const set of animSets) {
      const n = names.filter((x) => set.has(x)).length
      if (n > bestN) { bestN = n; best = set }
    }
    return best
  }
  const waterHeights: number[] = []
  const topTex = { names: [] as string[], idx: new Uint16Array(size * size) } // the picture of the highest ground surface of every tile (1 = names[0])
  const bridge = new Uint8Array(size * size) // 1 = walkable only because of the upper level (a bridge)
  const raw = import.meta.env.DEV ? { size, a: new Uint16Array(size * size), b: new Uint16Array(size * size), beh: new Uint16Array(size * size), fl: new Uint16Array(size * size) } : null

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
      const obj = buildModelObject(model, tex, uniforms, animFor(model.materials.map((x) => x.name)), true)
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
      if (raw) { const ti = (oz + Math.floor(t / w)) * size + ox + (t % w); raw.a[ti] = dv.getUint16(p + 4 + t * 8, true); raw.b[ti] = dv.getUint16(p + 4 + t * 8 + 2, true); raw.beh[ti] = beh; raw.fl[ti] = fl }
    }
    // The game keeps a SECOND tile table for the upper level (bridges, overpasses): same layout as the first one. A tile that can be walked on up there
    // (the bridge) is walkable even if the ground below it is water or blocked; the rest of that table is filled with "blocked".
    if (sections >= 3 && offs[3] - offs[2] === offs[2] - offs[1]) {
      const p2 = offs[2]
      const w2 = dv.getUint16(p2, true), h2 = dv.getUint16(p2 + 2, true)
      if (w2 === w) {
        for (let t = 0; t < w2 * h2; t++) {
          const c2 = classify(dv.getUint16(p2 + 4 + t * 8 + 4, true), dv.getUint16(p2 + 4 + t * 8 + 6, true))
          if (c2 !== T.Grass && c2 !== T.Tall) continue
          const ti = (oz + Math.floor(t / w2)) * size + ox + (t % w2)
          bridge[ti] = 1
          if (ground[ti] !== T.Grass && ground[ti] !== T.Tall) ground[ti] = c2
        }
      }
    }
    rasterHeights(model, height, ox, oz, size, topTex)
    if (raw) ((globalThis as { __pqChunks?: unknown[] }).__pqChunks ??= []).push({ ox, oz, offs, map: c.map })
    if (raw) { // (developer tool: which non-ground pictures / models lie over each tile)
      const mats = ((raw as unknown as { mats?: Map<number, Set<string>> }).mats ??= new Map())
      for (const mesh of model.meshes) {
        const name = model.materials[mesh.material]?.name ?? ''
        for (const v of mesh.verts) {
          const tx = Math.floor(v.x / 16 + 16), tz = Math.floor(v.z / 16 + 16)
          if (tx < 0 || tz < 0 || tx > 31 || tz > 31) continue
          const ti = (oz + tz) * size + ox + tx
          let set = mats.get(ti); if (!set) { set = new Set(); mats.set(ti, set) }
          set.add(name)
        }
      }
    }
  }
  addBuildings(data, group, uniforms)
  // Solid things (rocks, signs, machines, houses ...): the game blocks them through its tile table, but we change some of the ground (shores, paths, carved ways),
  // so the footprint of every tall building model is worked out from the model itself: those tiles are never walkable.
  const solid = new Uint8Array(size * size)
  group.updateMatrixWorld(true)
  for (const o of group.children) {
    if (!o.userData.building) continue
    const bb = new THREE.Box3().setFromObject(o)
    if (bb.max.y - bb.min.y < 0.9) continue // low things (flowers, mats, flat bridges) can be walked over
    const feet: number[] = [] // the ground under the building (not water): a building never hangs in the air
    for (let tz = Math.floor(bb.min.z); tz <= Math.floor(bb.max.z); tz++) for (let tx = Math.floor(bb.min.x); tx <= Math.floor(bb.max.x); tx++) {
      if (tx < 0 || tz < 0 || tx >= size || tz >= size) continue
      if (tx + 0.5 >= bb.min.x + 0.3 && tx + 0.5 <= bb.max.x - 0.3 && tz + 0.5 >= bb.min.z + 0.3 && tz + 0.5 <= bb.max.z - 0.3) { solid[tz * size + tx] = 1; if (ground[tz * size + tx] !== T.Water) feet.push(height[tz * size + tx]) }
    }
    if (feet.length >= 4) { // (a house of the real map stood 3 tiles above its plaza: the model's own height and the ground's do not always agree; set it down on the ground)
      feet.sort((a, b) => a - b)
      const gap = bb.min.y - feet[feet.length >> 1]
      if (gap > 0.8 && gap < 8) o.position.y -= gap
    }
  }
  if (raw) (globalThis as { __pqRaw?: unknown }).__pqRaw = raw
  for (let i = 0; i < size * size; i++) if (ground[i] === T.Water) waterHeights.push(height[i])
  waterHeights.sort((a, b) => a - b)
  const waterY = waterHeights.length ? waterHeights[Math.floor(waterHeights.length / 2)] : -1
  const packCache = new Map<number, { models: Uint8Array[]; anims: Array<Uint8Array | null>; tex: ReturnType<typeof readTexFile> } | null>()
  const makeBuilding = (pack: number, model: number) => {
    let pk = packCache.get(pack)
    if (pk === undefined) {
      const raw = data.packs?.[pack]
      const parsed = raw ? parsePack(raw.bld) : null
      pk = raw && parsed ? { models: parsed.models, anims: parsed.anims, tex: readTexFile(raw.tex) } : null
      packCache.set(pack, pk)
    }
    if (!pk || !pk.tex || !pk.models[model]) return null
    try {
      const m = readModels(pk.models[model])[0]
      if (!m) return null
      const bta = pk.anims[model]
      const anim = bta ? parseBtaFile(bta) : undefined
      const obj = buildModelObject(m, pk.tex, uniforms, anim && anim.size ? anim : undefined)
      const box = new THREE.Box3().setFromObject(obj)
      const sz = box.getSize(new THREE.Vector3())
      return { obj, w: sz.x, d: sz.z, h: sz.y }
    } catch { return null }
  }
  const named = new Map<string, THREE.DataTexture | null>()
  // The same picture exists in several map pieces with other colours (grass in autumn, desert sand ...): `score` picks the best-looking colours (average r, g, b of the opaque pixels)
  const textureNamed = (name: string, repeat: boolean, score?: (r: number, g: number, b: number) => number): THREE.DataTexture | null => {
    const key = `${name}|${repeat ? 1 : 0}`
    if (named.has(key)) return named.get(key)!
    let best: { d: ReturnType<typeof decodeTexture>; sc: number } | null = null
    for (const raw of Object.values(data.textures)) {
      const t = readTexFile(raw)
      const r = t?.texs.find((x) => x.name === name)
      if (!t || !r) continue
      const d = decodeTexture(r, t.pals.find((p) => p.name === `${name}_pl`) ?? t.pals.find((p) => p.name === name) ?? t.pals[0])
      let ar = 0, ag = 0, ab = 0, n = 0
      for (let i = 0; i < d.rgba.length; i += 4) if (d.rgba[i + 3] > 100) { ar += d.rgba[i]; ag += d.rgba[i + 1]; ab += d.rgba[i + 2]; n++ }
      const sc = score && n ? score(ar / n, ag / n, ab / n) : 0
      if (!best || sc > best.sc) best = { d, sc }
    }
    let out: THREE.DataTexture | null = null
    if (best) {
      const d = best.d
      const dt = new THREE.DataTexture(new Uint8Array(d.rgba), d.width, d.height, THREE.RGBAFormat)
      dt.wrapS = dt.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
      dt.magFilter = THREE.NearestFilter; dt.minFilter = THREE.NearestFilter
      dt.colorSpace = THREE.SRGBColorSpace
      dt.flipY = false
      dt.needsUpdate = true
      out = dt
    }
    named.set(key, out)
    return out
  }
  if (import.meta.env.DEV) (globalThis as { __pqTex?: () => string[] }).__pqTex = () => [...new Set(Object.values(data.textures).flatMap((raw) => readTexFile(raw)?.texs.map((x) => x.name) ?? []))]
  const textureNames = () => [...new Set(Object.values(data.textures).flatMap((raw) => readTexFile(raw)?.texs.map((x) => x.name) ?? []))].sort()
  const packModels = () => Object.keys(data.packs ?? {}).map((k) => { const raw = data.packs?.[Number(k)]; const parsed = raw ? parsePack(raw.bld) : null; return { pack: Number(k), count: parsed ? parsed.models.length : 0 } })
  return { group, size, ground, height, waterY, uniforms, makeBuilding, textureNamed, textureNames, packModels, bridge, solid, topTex, chunkInfo: data }
}
