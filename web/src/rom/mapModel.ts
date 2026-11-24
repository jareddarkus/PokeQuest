// Turns a decoded White 2 map model (+ its textures) into something three.js can draw.
import * as THREE from 'three'
import { decodeTexture, readModels, readTexFile, type Model } from './nitro'

/** One tile of the game world is 16 units in the DS map files. */
export const TILE_UNITS = 16

export interface LoadedTextures { texs: ReturnType<typeof readTexFile> }

const textureCache = new WeakMap<object, Map<string, THREE.Texture>>()

export function buildModelObject(model: Model, tex: NonNullable<ReturnType<typeof readTexFile>>): THREE.Group {
  const group = new THREE.Group()
  let cache = textureCache.get(tex)
  if (!cache) { cache = new Map(); textureCache.set(tex, cache) }
  const matCache = new Map<number, THREE.Material>()

  const materialFor = (mi: number): THREE.Material => {
    const hit = matCache.get(mi)
    if (hit) return hit
    const m = model.materials[mi]
    let map: THREE.Texture | null = null
    let transparent = false
    if (m && m.texture) {
      const key = `${m.texture}|${m.palette}|${(m.teximage >> 16) & 15}`
      map = cache!.get(key) ?? null
      if (!map) {
        const raw = tex.texs.find((t) => t.name === m.texture)
        const pal = tex.pals.find((p) => p.name === m.palette)
        if (raw) {
          const d = decodeTexture(raw, pal)
          const t = new THREE.DataTexture(new Uint8Array(d.rgba), d.width, d.height, THREE.RGBAFormat)
          const params = m.teximage // the wrap / flip settings live in the material
          const rs = (params >> 16) & 1, rt = (params >> 17) & 1, fs = (params >> 18) & 1, ft = (params >> 19) & 1
          t.wrapS = rs ? (fs ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping) : THREE.ClampToEdgeWrapping
          t.wrapT = rt ? (ft ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping) : THREE.ClampToEdgeWrapping
          t.magFilter = THREE.NearestFilter
          t.minFilter = THREE.NearestFilter
          t.colorSpace = THREE.SRGBColorSpace
          t.flipY = false
          t.needsUpdate = true
          ;(t as THREE.Texture & { hasAlpha?: boolean }).hasAlpha = d.hasAlpha
          cache!.set(key, t)
          map = t
        }
      }
      transparent = !!(map as (THREE.Texture & { hasAlpha?: boolean }) | null)?.hasAlpha
    }
    const mat = new THREE.MeshBasicMaterial({
      map: map ?? undefined, vertexColors: true, transparent: transparent || (m?.alpha ?? 1) < 1, alphaTest: transparent ? 0.4 : 0,
      opacity: m && m.alpha < 1 ? Math.max(0.35, m.alpha) : 1, side: m?.cullBack === false ? THREE.DoubleSide : THREE.FrontSide,
      color: map ? 0xffffff : 0x999999,
    })
    matCache.set(mi, mat)
    return mat
  }

  for (const mesh of model.meshes) {
    const n = mesh.verts.length
    const pos = new Float32Array(n * 3)
    const uv = new Float32Array(n * 2)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = mesh.verts[i]
      pos[i * 3] = v.x / TILE_UNITS; pos[i * 3 + 1] = v.y / TILE_UNITS; pos[i * 3 + 2] = v.z / TILE_UNITS
      uv[i * 2] = v.u; uv[i * 2 + 1] = v.v
      col[i * 3] = v.r; col[i * 3 + 1] = v.g; col[i * 3 + 2] = v.b
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    group.add(new THREE.Mesh(g, materialFor(mesh.material)))
  }
  return group
}

export { readModels, readTexFile }
