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
  uLift: { value: number } // how much higher each ring is than the one outside it (the island is a mountain)
  uHide: { value: number } // the real map is not drawn further than this from the centre (the outer ring is a meadow made by us)
}

/**
 * Tiles where the real map's tall grass is NOT drawn (the owner's rule: no grass at the peak). One byte per tile of the 160 x 160 island, read by the grass materials of the map.
 * Call setNoGrass with the tile numbers (y * 160 + x) to hide, or with an empty list to show all grass again.
 */
const GRID = 160
const noGrassData = new Uint8Array(GRID * GRID)
const noGrassTex = new THREE.DataTexture(noGrassData, GRID, GRID, THREE.RedFormat, THREE.UnsignedByteType)
noGrassTex.magFilter = THREE.NearestFilter; noGrassTex.minFilter = THREE.NearestFilter; noGrassTex.needsUpdate = true
export function addNoGrass(tiles: number[]): void {
  for (const i of tiles) noGrassData[i] = 255
  noGrassTex.needsUpdate = true
}
export function setNoGrass(tiles: number[]): void {
  noGrassData.fill(0)
  for (const i of tiles) noGrassData[i] = 255
  noGrassTex.needsUpdate = true
}
/** the pictures of the map that are scenery standing on the ground (tall grass, trees, flowers, fences, ponds): hidden on the tiles of the no-grass mask */
const DECOR = ['ki', 'kusa', 'plant', 'hana', 'saku', 'fence', 'nagakusa', 'yamasaba', 'kisetu', 'ike_', 'out07saku']
/** 1 = tall grass pictures, 2 = other scenery, 0 = ground */
const decorKind = (name: string | null | undefined): number => (!name ? 0 : name.includes('kusa') || name.startsWith('ue_grass') ? 1 : DECOR.some((p) => name.startsWith(p)) ? 2 : 0)
/** the tiles where ONLY the tall grass pictures are hidden (the whole peak: no grass leftovers, trees and rocks stay) */
export function addGrassOnly(tiles: number[]): void {
  for (const i of tiles) if (noGrassData[i] < 128) noGrassData[i] = 128
  noGrassTex.needsUpdate = true
}

/** Textures that move (water, rivers, fountains) with the animation the game file gives them. */
export const animatedTextures: Array<{ tex: THREE.Texture; anim: MatAnim }> = []

const textureCache = new WeakMap<object, Map<string, THREE.Texture>>()

const SINK0 = 'transformed.y -= smoothstep(uCut - 2.5, uCut, pqd0) * 1.6;\n'
const SINK1 = 'transformed.y -= smoothstep(uCut - 2.5, uCut, max(abs(vWPos.x - uCenter.x), abs(vWPos.z - uCenter.y))) * 1.6;\n'
/** Lets a material of ours disappear with the collapsing island and glow red before it falls (same as the map). */
export function applyClip(mat: THREE.Material, clip: ClipUniforms): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCut = clip.uCut
    shader.uniforms.uCenter = clip.uCenter
    shader.uniforms.uTime = clip.uTime
    shader.uniforms.uWarn = clip.uWarn
    // the ground that is about to fall sinks into the sea first (the last 2.5 tiles before the cut slope down under the water)
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', SINK1 + '#include <project_vertex>').replace('#include <common>', '#include <common>\nuniform float uCut;\nuniform vec2 uCenter;')
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      // (flat pictures drawn as many copies in one go: each copy sits at its own place, so the clip must use the copy's matrix)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 pqP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\npqP = instanceMatrix * pqP;\n#endif\nvWPos = (modelMatrix * pqP).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uCut;\nuniform vec2 uCenter;\nuniform float uTime;\nuniform float uWarn;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat pqD = max(abs(vWPos.x - uCenter.x), abs(vWPos.z - uCenter.y));\nif (pqD > uCut) discard;')
      .replace('#include <dithering_fragment>', 'if (uWarn > 0.5 && pqD > uCut - 1.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.2, 0.2), 0.35 + 0.15 * sin(uTime * 8.0));\n#include <dithering_fragment>')
  }
  mat.customProgramCacheKey = () => 'pq-clip-ours'
}

export function buildModelObject(model: Model, tex: NonNullable<ReturnType<typeof readTexFile>>, clip?: ClipUniforms, anims?: Map<string, MatAnim>, hide = false): THREE.Group {
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
    const grassPic = decorKind(m?.texture) // (0 ground, 1 grass, 2 other scenery)
    if (clip) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uNoGrass = { value: noGrassTex }
        shader.uniforms.uCut = clip.uCut
        shader.uniforms.uCenter = clip.uCenter
        shader.uniforms.uTime = clip.uTime
        shader.uniforms.uWarn = clip.uWarn
        shader.uniforms.uHide = hide ? clip.uHide : { value: 9999 }
        shader.uniforms.uLift = hide ? clip.uLift : { value: 0 }
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', SINK0 + '#include <project_vertex>').replace('#include <common>', '#include <common>\nuniform float uCut;')
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uLift;\nuniform vec2 uCenter;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nfloat pqd0 = max(abs(vWPos.x - uCenter.x), abs(vWPos.z - uCenter.y));\ntransformed.y += uLift * ((1.0 - smoothstep(59.0, 60.0, pqd0)) + (1.0 - smoothstep(39.0, 40.0, pqd0)) + (1.0 - smoothstep(19.0, 20.0, pqd0)));')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uCut;\nuniform vec2 uCenter;\nuniform float uTime;\nuniform float uWarn;\nuniform float uHide;\nuniform sampler2D uNoGrass;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat pqD = max(abs(vWPos.x - uCenter.x), abs(vWPos.z - uCenter.y));\nif (pqD > uCut || pqD > uHide) discard;' + (grassPic ? '\nif (texture2D(uNoGrass, (floor(vWPos.xz) + 0.5) / 160.0).r > ' + (grassPic === 1 ? '0.1' : '0.9') + ') discard;' : ''))
          .replace('#include <dithering_fragment>', 'if (uWarn > 0.5 && pqD > uCut - 1.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.2, 0.2), 0.35 + 0.15 * sin(uTime * 8.0));\n#include <dithering_fragment>')
      }
      mat.customProgramCacheKey = () => (grassPic === 1 ? 'pq-clip-grass' : grassPic === 2 ? 'pq-clip-decor' : 'pq-clip')
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
