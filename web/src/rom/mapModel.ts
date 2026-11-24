// Turns a decoded White 2 map model (+ its textures) into something three.js can draw.
import * as THREE from 'three'
import { decodeTexture, readModels, readTexFile, type Model } from './nitro'
import type { MatAnim } from './texanim'

/** One tile of the game world is 16 units in the DS map files. */
export const TILE_UNITS = 16

/** Shared values that let the game cut the island into a circle and make the outer bands fall into the sea. */
export interface ClipUniforms {
  uCut: { value: number } // tiles further than this from the centre are not drawn
  uCenter: { value: THREE.Vector2 }
  uTime: { value: number }
  uWarn: { value: number } // 1 = tint the band that is about to fall
}

/** Textures that move (water, rivers, fountains) with the animation the game file gives them. */
export const animatedTextures: Array<{ tex: THREE.Texture; anim: MatAnim }> = []

const textureCache = new WeakMap<object, Map<string, THREE.Texture>>()

export function buildModelObject(model: Model, tex: NonNullable<ReturnType<typeof readTexFile>>, clip?: ClipUniforms, anims?: Map<string, MatAnim>): THREE.Group {
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
    const anim = m ? anims?.get(m.name) : undefined
    if (map && anim) { // a moving texture gets its own copy (so that others using the same picture stay still)
      map = map.clone()
      map.wrapS = THREE.RepeatWrapping
      map.wrapT = THREE.RepeatWrapping
      map.needsUpdate = true
      animatedTextures.push({ tex: map, anim })
    }
    const mat = new THREE.MeshBasicMaterial({
      map: map ?? undefined, vertexColors: true, transparent: transparent || (m?.alpha ?? 1) < 1, alphaTest: transparent ? 0.4 : 0,
      opacity: m && m.alpha < 1 ? Math.max(0.35, m.alpha) : 1, side: m?.cullBack === false ? THREE.DoubleSide : THREE.FrontSide,
      color: map ? 0xffffff : 0x999999,
    })
    mat.name = `${m?.name ?? '?'}|${m?.texture ?? '-'}|${m?.palette ?? '-'}|a${m?.alpha ?? 1}`
    if (clip) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCut = clip.uCut
        shader.uniforms.uCenter = clip.uCenter
        shader.uniforms.uTime = clip.uTime
        shader.uniforms.uWarn = clip.uWarn
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uCut;\nuniform vec2 uCenter;\nuniform float uTime;\nuniform float uWarn;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat pqD = length(vWPos.xz - uCenter);\nif (pqD > uCut) discard;')
          .replace('#include <dithering_fragment>', 'if (uWarn > 0.5 && pqD > uCut - 1.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.2, 0.2), 0.35 + 0.15 * sin(uTime * 8.0));\n#include <dithering_fragment>')
      }
      mat.customProgramCacheKey = () => 'pq-clip'
    }
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
      // pieces that the DS lights with its own light (instead of vertex colours) come out as 0,0,0 here: show them plain
      if (v.r + v.g + v.b < 0.06) { col[i * 3] = 1; col[i * 3 + 1] = 1; col[i * 3 + 2] = 1 } else { col[i * 3] = v.r; col[i * 3 + 1] = v.g; col[i * 3 + 2] = v.b }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mesh3 = new THREE.Mesh(g, materialFor(mesh.material))
    mesh3.frustumCulled = false
    group.add(mesh3)
  }
  return group
}

export { readModels, readTexFile }
