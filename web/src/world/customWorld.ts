// The world made in the editor: a 160 x 160 tile map (a picture, a kind and a height for every tile) plus placed 3D models.
// It is drawn with the game's own map pictures and building models (from the player's game file) and plays like the normal island.
import * as THREE from 'three'
import { applyClip } from '../rom/mapModel'
import type { BuiltWorld } from '../rom/chunkWorld'
import { C, RADIUS, SIZE, T } from '../game/world'

/** How high one height step is (tiles). */
export const LEVEL = 0.5
export const MAX_LEVEL = 24

export interface PlacedObject {
  id: number
  kind: 'model' | 'pine'
  /** building pack + model number (kind 'model') */
  pack?: number
  model?: number
  /** the middle of the object, in tiles */
  x: number
  z: number
  /** turned by this many degrees */
  rot: number
}

export interface CustomWorld {
  v: 1
  name: string
  /** the names of the map pictures used (a tile's `tile` number is the index + 1; 0 = the plain grass picture) */
  tex: string[]
  tile: Uint16Array
  /** what a tile is: T.Water / Sand / Grass / Tall / Tree (blocked) / Cliff (blocked) */
  kind: Uint8Array
  /** height steps above the meadow level */
  level: Int8Array
  objects: PlacedObject[]
  /** the ring walls of the Battle Royale (blocked tiles between the rings) are added by the game */
  barriers: boolean
  nextId: number
}

export const DEFAULT_TEXTURE = 'grass01ax'
export const CLIFF_TEXTURE = 'yamagake01'

/** A new world: a grass island inside the sea. */
export function emptyWorld(): CustomWorld {
  const cw: CustomWorld = { v: 1, name: 'Mi mundo', tex: [], tile: new Uint16Array(SIZE * SIZE), kind: new Uint8Array(SIZE * SIZE), level: new Int8Array(SIZE * SIZE), objects: [], barriers: false, nextId: 1 }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.max(Math.abs(x + 0.5 - C), Math.abs(y + 0.5 - C))
      cw.kind[y * SIZE + x] = d > RADIUS ? T.Water : d > RADIUS - 3 ? T.Sand : T.Grass
    }
  }
  return cw
}

/** The number to store in `tile` for a picture name (added to the list when new). */
export function texIndex(cw: CustomWorld, name: string): number {
  let i = cw.tex.indexOf(name)
  if (i < 0) { cw.tex.push(name); i = cw.tex.length - 1 }
  return i + 1
}

export function cloneWorld(cw: CustomWorld): CustomWorld {
  return { ...cw, tex: [...cw.tex], tile: new Uint16Array(cw.tile), kind: new Uint8Array(cw.kind), level: new Int8Array(cw.level), objects: cw.objects.map((o) => ({ ...o })) }
}

// ---------------------------------------------------------------- saving
const b64 = (a: Uint8Array): string => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s) }
const unb64 = (s: string): Uint8Array => { const t = atob(s); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a }

export function encodeWorld(cw: CustomWorld): string {
  return JSON.stringify({
    v: 1, name: cw.name, tex: cw.tex, barriers: cw.barriers, nextId: cw.nextId, objects: cw.objects,
    tile: b64(new Uint8Array(cw.tile.buffer, cw.tile.byteOffset, cw.tile.byteLength)), kind: b64(cw.kind), level: b64(new Uint8Array(cw.level.buffer, cw.level.byteOffset, cw.level.byteLength)),
  })
}

export function decodeWorld(text: string): CustomWorld | null {
  try {
    const j = JSON.parse(text)
    if (!j || j.v !== 1) return null
    const tile = unb64(j.tile), kind = unb64(j.kind), level = unb64(j.level)
    if (kind.length !== SIZE * SIZE || level.length !== SIZE * SIZE || tile.length !== SIZE * SIZE * 2) return null
    return {
      v: 1, name: String(j.name ?? 'Mi mundo'), tex: Array.isArray(j.tex) ? j.tex.map(String) : [], barriers: !!j.barriers, nextId: Number(j.nextId) || 1,
      objects: Array.isArray(j.objects) ? j.objects : [],
      tile: new Uint16Array(tile.buffer.slice(tile.byteOffset, tile.byteOffset + tile.byteLength)), kind, level: new Int8Array(level.buffer.slice(level.byteOffset, level.byteOffset + level.byteLength)),
    }
  } catch { return null }
}

const KEY = 'pq.world.custom.v1'
export function saveLocal(cw: CustomWorld): boolean {
  try { localStorage.setItem(KEY, encodeWorld(cw)); return true } catch { return false }
}
export function loadLocal(): CustomWorld | null {
  try { const t = localStorage.getItem(KEY); return t ? decodeWorld(t) : null } catch { return null }
}

// ---------------------------------------------------------------- drawing
/** The ground height of a tile (tile units). */
export const heightOf = (built: BuiltWorld, level: number): number => built.waterY + 0.35 + level * LEVEL

interface Geo { pos: number[]; uv: number[]; idx: number[] }
const geo = (): Geo => ({ pos: [], uv: [], idx: [] })
function quad(g: Geo, p: number[][], uv: number[][]): void {
  const v = g.pos.length / 3
  for (let k = 0; k < 4; k++) { g.pos.push(...p[k]); g.uv.push(...uv[k]) }
  g.idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
}
function toGeometry(g: Geo): THREE.BufferGeometry {
  const b = new THREE.BufferGeometry()
  b.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
  b.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
  b.setIndex(g.idx)
  return b
}

/**
 * Draws a custom world and sets `built.ground` / `built.height` for the game. Returns the picture group (the caller adds it to the scene).
 * `quick` = for the editor while you paint (no tall-grass leaves or objects).
 */
export function buildCustomVisuals(cw: CustomWorld, built: BuiltWorld, opts: { only?: 'ground' | 'objects' } = {}): { group: THREE.Group; blocked: Uint8Array } {
  const group = new THREE.Group()
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; group.add(m); return m }
  const green = (r: number, gr: number, b: number) => gr - 0.6 * (r + b) / 2
  const texOf = (name: string): THREE.DataTexture | null => built.textureNamed(name, true, name === DEFAULT_TEXTURE ? green : undefined)
  const matFor = (t: THREE.Texture | null, fallback: number): THREE.MeshBasicMaterial => {
    const m = new THREE.MeshBasicMaterial({ map: t ?? undefined, color: t ? 0xffffff : fallback, side: THREE.DoubleSide, alphaTest: 0.4, transparent: true })
    applyClip(m, built.uniforms)
    return m
  }
  const lv = (i: number) => (cw.kind[i] === T.Water ? 0 : cw.level[i])
  const topY = (i: number) => (cw.kind[i] === T.Water ? built.waterY : heightOf(built, cw.level[i]))

  const byTex = new Map<number, Geo>()
  const walls = geo()
  const tall: number[] = []
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const i = z * SIZE + x
      built.ground[i] = cw.kind[i]
      built.height[i] = topY(i)
      if (cw.kind[i] === T.Water || opts.only === 'objects') continue
      const y = topY(i)
      const ti = cw.tile[i]
      const g = byTex.get(ti) ?? byTex.set(ti, geo()).get(ti)!
      quad(g, [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [[0, 0], [1, 0], [1, 1], [0, 1]])
      if (cw.kind[i] === T.Tall) tall.push(i)
      // walls where the next tile is lower or is water
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz
        const out = nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE
        const ni = nz * SIZE + nx
        const lowY = out ? built.waterY : topY(ni)
        if (lowY >= y - 0.01) continue
        const h = y - lowY
        const p: number[][] = dx === 1 ? [[x + 1, lowY, z + 1], [x + 1, lowY, z], [x + 1, y, z], [x + 1, y, z + 1]]
          : dx === -1 ? [[x, lowY, z], [x, lowY, z + 1], [x, y, z + 1], [x, y, z]]
          : dz === 1 ? [[x, lowY, z + 1], [x + 1, lowY, z + 1], [x + 1, y, z + 1], [x, y, z + 1]]
          : [[x + 1, lowY, z], [x, lowY, z], [x, y, z], [x + 1, y, z]]
        quad(walls, p, [[0, 0], [1, 0], [1, -h / 2], [0, -h / 2]].map(([u, v]) => [u, -v]))
      }
    }
  }
  if (opts.only !== 'objects') for (const [ti, g] of byTex) mesh(toGeometry(g), matFor(texOf(ti ? cw.tex[ti - 1] : DEFAULT_TEXTURE) ?? texOf(DEFAULT_TEXTURE), 0x59b84a))
  if (walls.idx.length && opts.only !== 'objects') mesh(toGeometry(walls), matFor(texOf(CLIFF_TEXTURE), 0x8a6a3a))

  // tall grass: the game's three leaf pictures one above the other
  if (tall.length && opts.only !== 'objects') {
    const flat = (tex: THREE.Texture | null, dy: number) => {
      const m = matFor(tex, 0x2a8a3a)
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, tall.length)
      const m4 = new THREE.Matrix4()
      tall.forEach((i, k) => { m4.makeTranslation((i % SIZE) + 0.5, topY(i) + dy, ((i / SIZE) | 0) + 0.5); im.setMatrixAt(k, m4) })
      im.frustumCulled = false
      group.add(im)
    }
    flat(built.textureNamed('kusa_ec3', true, green), 0.125); flat(built.textureNamed('kusa_ec2', true, green), 0.375); flat(built.textureNamed('kusa_ec1', true, green), 0.5)
  }

  const blocked = new Uint8Array(SIZE * SIZE)
  if (opts.only !== 'ground') {
    const pines = cw.objects.filter((o) => o.kind === 'pine')
    if (pines.length) {
      const side = built.textureNamed('ki02ax', false), crown = built.textureNamed('ki02bx', false), base = built.textureNamed('ki02c', false), tip = built.textureNamed('ki02dx', false)
      const mSide = geo(), mCrown = geo(), mBase = geo(), mTip = geo()
      for (const o of pines) {
        const x = Math.round(o.x - 1), z = Math.round(o.z - 1) // a pine is 2 x 2 tiles
        const gi = Math.max(0, Math.min(SIZE * SIZE - 1, Math.min(SIZE - 1, Math.max(0, x)) + Math.min(SIZE - 1, Math.max(0, z)) * SIZE))
        const y0 = topY(gi) + 0.19
        const flat4 = (g: Geo, y: number) => quad(g, [[x, y, z], [x + 2, y, z], [x + 2, y, z + 2], [x, y, z + 2]], [[0, 0], [1, 0], [1, 1], [0, 1]])
        flat4(mBase, y0); flat4(mCrown, y0 + 1.19); flat4(mTip, y0 + 2.72)
        quad(mSide, [[x, y0, z + 1], [x + 2, y0, z + 1], [x + 2, y0 + 3.3, z + 1], [x, y0 + 3.3, z + 1]], [[0, 1], [1, 1], [1, 0], [0, 0]])
        quad(mSide, [[x + 1, y0, z], [x + 1, y0, z + 2], [x + 1, y0 + 3.3, z + 2], [x + 1, y0 + 3.3, z]], [[0, 1], [1, 1], [1, 0], [0, 0]])
        for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { const tx = x + a, tz = z + b; if (tx >= 0 && tz >= 0 && tx < SIZE && tz < SIZE) blocked[tz * SIZE + tx] = 1 }
      }
      const add = (g: Geo, tex: THREE.Texture | null) => { if (tex && g.idx.length) mesh(toGeometry(g), matFor(tex, 0x2a6a3a)) }
      add(mBase, base); add(mCrown, crown); add(mTip, tip); add(mSide, side)
    }
    for (const o of cw.objects) {
      if (o.kind !== 'model' || o.pack === undefined || o.model === undefined) continue
      const b = built.makeBuilding(o.pack, o.model)
      if (!b) continue
      const holder = new THREE.Group()
      holder.add(b.obj)
      const box0 = new THREE.Box3().setFromObject(b.obj)
      b.obj.position.set(-(box0.min.x + box0.max.x) / 2, -box0.min.y, -(box0.min.z + box0.max.z) / 2) // the middle of its floor at the origin
      holder.rotation.y = (o.rot * Math.PI) / 180
      const gi = Math.max(0, Math.min(SIZE - 1, Math.floor(o.z))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(o.x)))
      holder.position.set(o.x, topY(gi), o.z)
      group.add(holder)
      holder.updateMatrixWorld(true)
      const wb = new THREE.Box3().setFromObject(holder)
      for (let tz = Math.floor(wb.min.z + 0.25); tz <= Math.floor(wb.max.z - 0.25); tz++) for (let tx = Math.floor(wb.min.x + 0.25); tx <= Math.floor(wb.max.x - 0.25); tx++) if (tx >= 0 && tz >= 0 && tx < SIZE && tz < SIZE) blocked[tz * SIZE + tx] = 1
    }
    for (let i = 0; i < SIZE * SIZE; i++) if (blocked[i] && built.ground[i] !== T.Water) built.ground[i] = T.Tree
  }
  void lv
  return { group, blocked }
}
