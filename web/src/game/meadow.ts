// The outer ring (ring 1) of the island is a meadow made by us: flat grass with tall-grass patches, a ring road and paths to the gyms, a beach.
// All its pictures are the game's own map textures (grass ground, road, beach sand, tall grass, cliffs). The real map is not drawn out there (see uHide).
// The island is made of square rings (tiles), every ring a terrace higher than the one outside it.
import * as THREE from 'three'
import { applyClip } from '../rom/mapModel'
import type { BuiltWorld } from '../rom/chunkWorld'
import { C, RADIUS, RING_INNER, SIZE, T, dist, ringAt, type World } from './world'
import { hash2, valueNoise } from './rng'

/** How much higher each ring is than the ring outside it (tiles). */
export const RING_LIFT = 2.4
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** The extra height at ring distance d from the centre (the same formula as in the map's vertex shader). */
export function liftAt(d: number): number {
  let l = 0
  for (const b of RING_INNER.slice(0, 3)) l += 1 - smooth(b - 1, b, d)
  return l * RING_LIFT
}
const BEACH = 3 // the outermost tiles are sand
const ROAD_R = 67 // ring distance of the ring road

const SHOW_SIDE = new URLSearchParams(location.search).has('side')
/** The 2 x 2 tile cells of ring 1 that are forest (top-left tile numbers), made by prepareMeadow. */
let forestCells: number[] = []

/** The flat height of the meadow (tile units). */
export const meadowHeight = (built: BuiltWorld): number => built.waterY + 0.35

/** Makes the ring-1 tiles (before the world is generated from them): grass, scattered tall grass, paths, beach. */
export function prepareMeadow(built: BuiltWorld, seed: number): void {
  const hm = meadowHeight(built)
  let path = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y)
      if (d < RING_INNER[0] || d > RADIUS - BEACH) continue
      const dx = x + 0.5 - C, dy = y + 0.5 - C
      // the ring road (a wobbly square) and straight-ish paths from it to the inside and to the beach (3 on each side)
      let road = Math.abs(d - (ROAD_R + (valueNoise(x, y, seed + 3, 20) - 0.5) * 3)) < 1.5
      if (!road) {
        const vertical = Math.abs(dy) >= Math.abs(dx) // north / south part: the path runs up-down, its place is the x coordinate
        const along = vertical ? dy : dx, lateral = vertical ? dx : dy
        for (const off of [-28, 0, 28]) {
          const wob = (valueNoise(along, off + 200, seed + 5, 16) - 0.5) * 4
          if (Math.abs(lateral - off - wob) < 1.5) { road = true; break }
        }
      }
      if (road) path[y * SIZE + x] = 1
    }
  }
  // smooth the paths: a majority filter removes one-tile bumps, notches and diagonal-only links, so the edges run in long clean lines
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(SIZE * SIZE)
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const d = dist(x, y)
        if (d < RING_INNER[0] || d > RADIUS - BEACH) continue
        let n = 0
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) n += path[(y + b) * SIZE + x + a]
        next[y * SIZE + x] = n >= 5 ? 1 : 0
      }
    }
    path = next
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y)
      if (d < RING_INNER[0] || d > RADIUS) continue
      const i = y * SIZE + x
      let code: number = T.Grass
      if (d > RADIUS - BEACH) code = T.Sand
      else if (path[i]) { code = T.Grass }
      else {
        // scattered patches: a small-scale noise with random holes, not big uniform blocks
        const n = valueNoise(x, y, seed + 11, 4.2) * 0.75 + valueNoise(x, y, seed + 17, 11) * 0.25 + (hash2(x, y, seed) - 0.5) * 0.16
        code = n > 0.5 ? T.Tall : T.Grass
      }
      built.ground[i] = code
      built.height[i] = hm
    }
  }
  built.pathMask = path
  // forests: groups of 2 x 2 tile cells (the game's pines are 2 x 2 tiles) away from the paths
  forestCells = []
  const near = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (path[y * SIZE + x]) for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { const xx = x + a, yy = y + b; if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE) near[yy * SIZE + xx] = 1 }
  for (let cy = 0; cy < SIZE; cy += 2) {
    for (let cx = 0; cx < SIZE; cx += 2) {
      let ok = true
      for (let b = 0; b < 2 && ok; b++) for (let a = 0; a < 2; a++) { const d = dist(cx + a, cy + b); if (d < RING_INNER[0] + 1 || d > RADIUS - BEACH - 1 || near[(cy + b) * SIZE + cx + a]) { ok = false; break } }
      if (!ok) continue
      if (valueNoise(cx, cy, seed + 41, 16) * 0.8 + hash2(cx, cy, seed + 43) * 0.2 <= 0.58) continue
      forestCells.push(cy * SIZE + cx)
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { built.ground[(cy + b) * SIZE + cx + a] = T.Tree; path[(cy + b) * SIZE + cx + a] = 0 }
    }
  }
  built.uniforms.uHide.value = RING_INNER[0] - 0.2 // the real map is not drawn in the meadow
  // the inner rings are higher (terraces): the ground heights and the map's pictures (vertex shader) are lifted the same way
  built.uniforms.uLift.value = RING_LIFT
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const d = dist(x, y); if (d < RING_INNER[0]) built.height[y * SIZE + x] += liftAt(d) }
}

/** More tall grass in the inner rings: scattered patches on the plain grass tiles of the real map (returns the tile numbers that were changed). */
export function addExtraGrass(world: World, built: BuiltWorld, seed: number): number[] {
  const changed: number[] = []
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x
      if (world.tiles[i] !== T.Grass) continue
      if (ringAt(x, y) < 2) continue
      // never on stairs or slopes: the ground there is not level
      const h0 = built.height[i]
      let steep = false
      for (let b = -2; b <= 2 && !steep; b++) for (let a = -2; a <= 2; a++) { const xx = x + a, yy = y + b; if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && Math.abs(built.height[yy * SIZE + xx] - h0) > 0.12 * Math.max(Math.abs(a), Math.abs(b))) { steep = true; break } }
      if (steep) continue
      if (world.gyms.some((g) => Math.abs(g.x - x) < 3 && Math.abs(g.y - y) < 3)) continue
      if (valueNoise(x, y, seed + 29, 4) + (hash2(x, y, seed + 2) - 0.5) * 0.2 > 0.6) { world.tiles[i] = T.Tall; changed.push(i) }
    }
  }
  return changed
}

function groundMat(tex: THREE.Texture | null, color: number, built: BuiltWorld): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : color, side: THREE.DoubleSide })
  applyClip(m, built.uniforms)
  return m
}

/** A flat square strip (x0..x1, z0..z1) at height y with the picture repeating every 4 tiles. */
function strip(pos: number[], uv: number[], idx: number[], x0: number, x1: number, z0: number, z1: number, y: number): void {
  const b = pos.length / 3
  pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1)
  uv.push(x0 / 4, z0 / 4, x1 / 4, z0 / 4, x1 / 4, z1 / 4, x0 / 4, z1 / 4)
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
}
/** A square ring of flat ground from ring distance a to b (four strips). */
function squareRing(a: number, b: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  strip(pos, uv, idx, C - b, C + b, C - b, C - a, y) // north
  strip(pos, uv, idx, C - b, C + b, C + a, C + b, y) // south
  strip(pos, uv, idx, C - b, C - a, C - a, C + a, y) // west
  strip(pos, uv, idx, C + a, C + b, C - a, C + a, y) // east
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** One 16 x 16 picture of a road tile: sand, with the grass fringe of the game's road picture along every side that does not continue as road. */
function roadTile(sand: THREE.DataTexture | null, fringe: THREE.DataTexture | null, mask: number, variant: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const toCanvas = (t: THREE.DataTexture): HTMLCanvasElement => { const k = document.createElement('canvas'); k.width = t.image.width; k.height = t.image.height; k.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.image.data as unknown as ArrayLike<number>), t.image.width, t.image.height), 0, 0); return k }
  if (sand) ctx.drawImage(toCanvas(sand), 0, 0, 16, 16); else { ctx.fillStyle = '#e8d090'; ctx.fillRect(0, 0, 16, 16) }
  if (fringe) {
    const src = toCanvas(fringe)
    const sx = variant ? 16 : 0
    // bits: 1 = north, 2 = east, 4 = south, 8 = west is not road; the fringe picture has its grass at the top, so it is turned for the other sides
    for (const [bit, rot] of [[1, 0], [2, 1], [4, 2], [8, 3]] as Array<[number, number]>) {
      if (!(mask & bit)) continue
      ctx.save()
      ctx.translate(8, 8); ctx.rotate((rot * Math.PI) / 2); ctx.translate(-8, -8)
      ctx.drawImage(src, sx, 0, 16, 6, 0, 0, 16, 6) // the top 6 rows: grass edge over sand
      ctx.restore()
    }
    // inner corners (the road goes on both ways but the tile diagonally is grass): the corner piece of the same edge picture
    for (const [bit, rot] of [[16, 0], [32, 1], [64, 2], [128, 3]] as Array<[number, number]>) {
      if (!(mask & bit)) continue
      ctx.save()
      ctx.translate(8, 8); ctx.rotate((rot * Math.PI) / 2); ctx.translate(-8, -8)
      ctx.drawImage(src, sx, 0, 6, 6, 0, 0, 6, 6)
      ctx.restore()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The pictures of the meadow: ground, beach, road tiles with grass edges, tall grass and the cliffs between the rings. */
export function buildMeadowVisuals(world: World, built: BuiltWorld, extra: number[]): THREE.Group {
  const g = new THREE.Group()
  const hm = meadowHeight(built)
  const green = (r: number, gr: number, b: number) => gr - 0.6 * (r + b) / 2 // the greenest version of the picture
  const sandy = (r: number, gr: number, b: number) => r + gr - 2 * b - Math.abs(r - 220) * 0.2 // a light yellow sand
  const grass = built.textureNamed('grass01ax', true, green)
  const sand = built.textureNamed('sea_jimen', true, sandy)
  const roadSand = built.textureNamed('michi01b', false, sandy)
  const roadEdge = built.textureNamed('michi01a', false, sandy)
  const leaf1 = built.textureNamed('kusa_ec1', true, green), leaf2 = built.textureNamed('kusa_ec2', true, green), leaf3 = built.textureNamed('kusa_ec3', true, green)
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.frustumCulled = false; g.add(m) }
  mesh(squareRing(RING_INNER[0] - 0.2, RADIUS - BEACH, hm), groundMat(grass, 0x59b84a, built))
  mesh(squareRing(RADIUS - BEACH, RADIUS + 1.2, hm + 0.001), groundMat(sand, 0xe8d890, built))

  // flat single-tile pictures
  const flat = (tiles: number[], mat: THREE.Material, y: number, h: (i: number) => number, scale = 1) => {
    if (!tiles.length) return
    const geo = new THREE.PlaneGeometry(scale, scale).rotateX(-Math.PI / 2)
    applyClip(mat, built.uniforms)
    const im = new THREE.InstancedMesh(geo, mat, tiles.length)
    const m4 = new THREE.Matrix4()
    tiles.forEach((i, k) => { m4.makeTranslation((i % SIZE) + 0.5, h(i) + y, ((i / SIZE) | 0) + 0.5); im.setMatrixAt(k, m4) })
    im.frustumCulled = false
    g.add(im)
  }
  const pm = built.pathMask
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !!pm && pm[y * SIZE + x] === 1 && dist(x, y) >= RING_INNER[0] && dist(x, y) <= RADIUS - BEACH
  const roads = new Map<number, number[]>() // (neighbour mask * 2 + picture variant) -> tiles
  const tuftsA: number[] = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE, y = (i / SIZE) | 0
    const d = dist(x, y)
    if (d < RING_INNER[0] || d > RADIUS) continue
    if (isRoad(x, y) && world.tiles[i] === T.Grass) {
      const n = isRoad(x, y - 1), e = isRoad(x + 1, y), s = isRoad(x, y + 1), w = isRoad(x - 1, y)
      const mask = (n ? 0 : 1) | (e ? 0 : 2) | (s ? 0 : 4) | (w ? 0 : 8)
        | (n && w && !isRoad(x - 1, y - 1) ? 16 : 0) | (n && e && !isRoad(x + 1, y - 1) ? 32 : 0)
        | (s && e && !isRoad(x + 1, y + 1) ? 64 : 0) | (s && w && !isRoad(x - 1, y + 1) ? 128 : 0)
      const key = mask * 2 + (hash2(x, y, 9) < 0.5 ? 0 : 1)
      ;(roads.get(key) ?? roads.set(key, []).get(key)!).push(i)
    } else if (world.tiles[i] === T.Tall) {
      tuftsA.push(i) // tall grass = the game's leaf picture on every tile (the darker bush picture has square edges that show as seams)
    }
  }
  for (const [key, tiles] of roads) flat(tiles, new THREE.MeshBasicMaterial({ map: roadTile(roadSand, roadEdge, key >> 1, key & 1) }), 0.012, () => hm)
  const alphaMat = (t: THREE.Texture | null) => new THREE.MeshBasicMaterial({ map: t ?? undefined, color: t ? 0xffffff : 0x2a8a3a, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide })
  // tall grass exactly like the game's map: three flat layers of leaf pictures one above the other (bottom kusa_ec3, middle kusa_ec2, top kusa_ec1), one picture per tile
  const grassLayers = (tiles: number[], h: (i: number) => number) => {
    flat(tiles, alphaMat(leaf3), 0.125, h); flat(tiles, alphaMat(leaf2), 0.375, h); flat(tiles, alphaMat(leaf1), 0.5, h)
  }
  grassLayers(tuftsA, () => hm)
  const ex = extra.filter((i) => dist(i % SIZE, (i / SIZE) | 0) < RING_INNER[0])
  grassLayers(ex, (i) => built.height[i])

  // the pine forests of ring 1, built like the game's own (a pine is 2 x 2 tiles: the side picture on two crossing upright planes, plus three flat layers seen from above: base, crown, tip)
  if (import.meta.env.DEV) (globalThis as { __pqForest?: number[] }).__pqForest = forestCells
  if (forestCells.length) {
    const side = built.textureNamed('ki02ax', false), crown = built.textureNamed('ki02bx', false)
    const base = built.textureNamed('ki02c', false), tip = built.textureNamed('ki02dx', false)
    const mk = () => ({ pos: [] as number[], uv: [] as number[], idx: [] as number[] })
    const quad = (m: ReturnType<typeof mk>, p: number[][], uvs: number[][]) => {
      const v = m.pos.length / 3
      for (let k = 0; k < 4; k++) { m.pos.push(...p[k]); m.uv.push(...uvs[k]) }
      m.idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    const mSide = mk(), mCrown = mk(), mBase = mk(), mTip = mk()
    const y0 = hm + 0.19, y1 = hm + 3.5
    for (const i of forestCells) {
      const x = i % SIZE, z = (i / SIZE) | 0
      const flat4 = (m: ReturnType<typeof mk>, y: number) => quad(m, [[x, y, z], [x + 2, y, z], [x + 2, y, z + 2], [x, y, z + 2]], [[0, 0], [1, 0], [1, 1], [0, 1]])
      flat4(mBase, hm + 0.19); flat4(mCrown, hm + 1.38); flat4(mTip, hm + 2.91)
      quad(mSide, [[x, y0, z + 1], [x + 2, y0, z + 1], [x + 2, y1, z + 1], [x, y1, z + 1]], [[0, 1], [1, 1], [1, 0], [0, 0]])
      quad(mSide, [[x + 1, y0, z], [x + 1, y0, z + 2], [x + 1, y1, z + 2], [x + 1, y1, z]], [[0, 1], [1, 1], [1, 0], [0, 0]])
    }
    const add = (m: ReturnType<typeof mk>, tex: THREE.Texture | null) => {
      if (!tex || !m.idx.length) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2))
      geo.setIndex(m.idx)
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide })
      applyClip(mat, built.uniforms)
      mesh(geo, mat)
    }
    add(mBase, base); add(mCrown, crown); add(mTip, tip); if (SHOW_SIDE) add(mSide, side)
  }

  // the cliffs between the rings: a slanted wall of the game's cliff picture (one picture per tile) from the lower ring up to the higher one, following the ground of both
  const cliff = built.textureNamed('yamagake01', true, (r, gg, b) => r - b - Math.abs(gg - r) * 0.2) // the game's tall mountain cliff face (16 x 32: one tile wide, two tall)
  const hAt = (fx: number, fz: number): number => built.height[Math.max(0, Math.min(SIZE - 1, Math.floor(fz))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(fx)))]
  for (const b of RING_INNER.slice(0, 3)) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    const r = b - 0.5, lean = 1.0
    const quad = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
      // the wall runs from (x0,z0) to (x1,z1) on the square of half-size r; (nx,nz) points outwards
      const sample = (x: number, z: number, out: number) => hAt(x + nx * out, z + nz * out)
      const top0 = sample(x0, z0, -1.6) + 0.1, top1 = sample(x1, z1, -1.6) + 0.1
      const bot0 = sample(x0, z0, 1.6) - 0.6, bot1 = sample(x1, z1, 1.6) - 0.6
      const v = pos.length / 3
      pos.push(x0, top0, z0, x1, top1, z1, x1 + nx * lean, bot1, z1 + nz * lean, x0 + nx * lean, bot0, z0 + nz * lean)
      uv.push(0, top0 / 2, 1, top1 / 2, 1, bot1 / 2, 0, bot0 / 2) // one picture per tile along and per two tiles of height
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    for (let k = -b; k < b; k++) {
      quad(C + k, C - r, C + k + 1, C - r, 0, -1) // north
      quad(C + k, C + r, C + k + 1, C + r, 0, 1) // south
      quad(C - r, C + k, C - r, C + k + 1, -1, 0) // west
      quad(C + r, C + k, C + r, C + k + 1, 1, 0) // east
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    mesh(geo, groundMat(cliff, 0x8a6a3a, built))
  }
  return g
}
