// The outer ring (ring 1) of the island is a meadow made by us: flat grass with lots of tall grass, a ring road and paths to the gyms, a beach.
// All its pictures are the game's own map textures (grass ground, road, beach sand, tall grass). The real map is not drawn out there (see uHide).
import * as THREE from 'three'
import { applyClip } from '../rom/mapModel'
import type { BuiltWorld } from '../rom/chunkWorld'
import { C, RADIUS, RING_INNER, SIZE, T, dist, ringAt, type World } from './world'
import { hash2, valueNoise } from './rng'

const BEACH = 3 // the outermost tiles are sand
const ROAD_R = 67 // radius of the ring road

/** The flat height of the meadow (tile units). */
export const meadowHeight = (built: BuiltWorld): number => built.waterY + 0.35

/** Makes the ring-1 tiles (before the world is generated from them): grass, tall grass patches, paths, beach. */
export function prepareMeadow(built: BuiltWorld, seed: number): void {
  const hm = meadowHeight(built)
  const path = new Uint8Array(SIZE * SIZE)
  const wob = (seed % 97) / 97 * Math.PI * 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y)
      if (d < RING_INNER[0] || d > RADIUS) continue
      const i = y * SIZE + x
      const ang = Math.atan2(y + 0.5 - C, x + 0.5 - C)
      // the ring road (a wavy circle) and 8 paths from it towards the inside and the beach
      let road = Math.abs(d - (ROAD_R + 2.4 * Math.sin(ang * 3 + wob))) < 1.7
      for (let k = 0; k < 8 && !road; k++) {
        const ak = (k * Math.PI) / 4 + 0.22 * Math.sin(wob + k * 1.7)
        let da = ang - ak
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        if (Math.abs(da) < 1.2 && Math.abs(d * Math.sin(da + 0.12 * Math.sin(d * 0.25 + k))) < 1.5 && d < RADIUS - BEACH) road = true
      }
      let code: number = T.Grass
      if (d > RADIUS - BEACH) code = T.Sand
      else if (road) { code = T.Grass; path[i] = 1 }
      else {
        const n = valueNoise(x, y, seed + 11, 6.5) + (hash2(x, y, seed) - 0.5) * 0.1
        code = n > 0.43 ? T.Tall : T.Grass
      }
      built.ground[i] = code
      built.height[i] = hm
    }
  }
  built.pathMask = path
  built.uniforms.uHide.value = RING_INNER[0] - 0.2 // the real map is not drawn in the meadow
}

/** More tall grass in the inner rings: patches on the plain grass tiles of the real map (returns the tile numbers that were changed). */
export function addExtraGrass(world: World, seed: number): number[] {
  const changed: number[] = []
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x
      if (world.tiles[i] !== T.Grass) continue
      const r = ringAt(x, y)
      if (r < 2) continue
      if (world.gyms.some((g) => Math.abs(g.x - x) < 3 && Math.abs(g.y - y) < 3)) continue
      if (valueNoise(x, y, seed + 29, 5) > 0.56) { world.tiles[i] = T.Tall; changed.push(i) }
    }
  }
  return changed
}

function groundMat(tex: THREE.Texture | null, color: number, built: BuiltWorld): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : color, side: THREE.DoubleSide })
  applyClip(m, built.uniforms)
  return m
}

/** The pictures of the meadow: ground, beach, road tiles and the tall grass of the meadow and of the extra patches. */
export function buildMeadowVisuals(world: World, built: BuiltWorld, extra: number[]): THREE.Group {
  const g = new THREE.Group()
  const hm = meadowHeight(built)
  const green = (r: number, gr: number, b: number) => gr - 0.6 * (r + b) / 2 // the greenest version of the picture
  const sandy = (r: number, gr: number, b: number) => r + gr - 2 * b - Math.abs(r - 220) * 0.2 // a light yellow sand
  const grass = built.textureNamed('grass01ax', true, green)
  const sand = built.textureNamed('sea_jimen', true, sandy)
  const road = built.textureNamed('michi01b', true, sandy)
  const tallA = built.textureNamed('kusa_ec1', false, green)
  const tallB = built.textureNamed('kusa_ec2', false, green)
  const ring = (inner: number, outer: number, tex: THREE.Texture | null, color: number, y: number, scale: number) => {
    const geo = new THREE.RingGeometry(inner, outer, 180, 1)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + C) / scale, (pos.getZ(i) + C) / scale)
    const mesh = new THREE.Mesh(geo, groundMat(tex, color, built))
    mesh.position.set(C, y, C)
    mesh.frustumCulled = false
    g.add(mesh)
  }
  ring(RING_INNER[0] - 0.2, RADIUS - BEACH, grass, 0x59b84a, hm, 4)
  ring(RADIUS - BEACH, RADIUS + 1.2, sand, 0xe8d890, hm + 0.001, 4)
  // flat pictures on single tiles (road, tall grass)
  const flat = (tiles: number[], tex: THREE.Texture | null, y: number, color: number, half: boolean, alpha: boolean, h: (i: number) => number) => {
    if (!tiles.length) return
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : color, transparent: false, alphaTest: alpha ? 0.4 : 0, side: THREE.DoubleSide })
    if (tex && half) { // the road picture is two tiles wide: use its left half
      const t = tex.clone(); t.repeat.set(0.5, 1); t.needsUpdate = true; mat.map = t
    }
    applyClip(mat, built.uniforms)
    const im = new THREE.InstancedMesh(geo, mat, tiles.length)
    const m4 = new THREE.Matrix4()
    tiles.forEach((i, k) => { m4.makeTranslation((i % SIZE) + 0.5, h(i) + y, ((i / SIZE) | 0) + 0.5); im.setMatrixAt(k, m4) })
    im.frustumCulled = false
    g.add(im)
  }
  const roads: number[] = [], tallsA: number[] = [], tallsB: number[] = []
  const pm = built.pathMask
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE, y = (i / SIZE) | 0
    const d = dist(x, y)
    if (pm && pm[i] && d >= RING_INNER[0] && d <= RADIUS - BEACH && world.tiles[i] === T.Grass) roads.push(i)
    else if (world.tiles[i] === T.Tall && d >= RING_INNER[0] && d <= RADIUS) (hash2(x, y, 5) < 0.5 ? tallsA : tallsB).push(i)
  }
  flat(roads, road, 0.012, 0xb08a58, false, false, () => hm)
  flat(tallsA, tallA, 0.02, 0x2a8a3a, false, true, () => hm)
  flat(tallsB, tallB ?? tallA, 0.02, 0x2a8a3a, false, true, () => hm)
  const ex = extra.filter((i) => !(dist(i % SIZE, (i / SIZE) | 0) >= RING_INNER[0]))
  flat(ex, tallA, 0.04, 0x2a8a3a, false, true, (i) => built.height[i])
  return g
}
