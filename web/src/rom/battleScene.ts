// The battle scenery of Pokémon Black 2 / White 2 (archive a/0/1/1): a backdrop (sky, horizon, field) and a round platform.
// Each is a small 3D model that carries its own textures.
import * as THREE from 'three'
import { buildModelObject } from './mapModel'
import { readModels, readTexFile } from './nitro'

export const BATTLE_NARC = 'a/0/1/1'

/** Which platform model + backdrop model (file numbers in the archive) to use. */
export interface BattleEnvironment { name: string; stage: number; bg: number }
export const ENVIRONMENTS: Record<string, BattleEnvironment> = {
  grass: { name: 'grass', stage: 2, bg: 76 },
  field: { name: 'field', stage: 0, bg: 74 },
}

// where things stand (in map tiles) and how the camera looks at them; tuned by eye to look like the game
const FOE_PLATFORM = { x: 0.52, z: -0.62, scale: 0.85 }
const ME_PLATFORM = { x: -0.4, z: 0.3, scale: 1.12 }
const INTRO = { pos: [0.55, 0.85, 0.2], target: [0.55, 0.12, -0.8] } as const
const CAMERA = { fov: 33, pos: [0, 0.56, 1.5], target: [0, 0.22, -0.2] } as const

export interface BattleLayout {
  foe: { x: number; y: number; w: number }
  me: { x: number; y: number; w: number }
}

export class BattleBackdrop3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private raf = 0
  private mount: HTMLElement

  constructor(mount: HTMLElement, files: Uint8Array[], env: BattleEnvironment) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    mount.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    this.scene.background = new THREE.Color('#7fc4ee')
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.01, 300)
    this.camera.position.set(...CAMERA.pos)
    this.camera.lookAt(...CAMERA.target)

    const make = (idx: number) => {
      const raw = files[idx]
      const model = readModels(raw)[0]
      const tex = readTexFile(raw)
      if (!model || !tex) return null
      return buildModelObject(model, tex)
    }
    const bg = make(env.bg)
    if (bg) this.scene.add(bg)
    for (const p of [FOE_PLATFORM, ME_PLATFORM]) {
      const st = make(env.stage)
      if (!st) continue
      st.position.set(p.x, 0, p.z)
      st.scale.setScalar(p.scale)
      this.scene.add(st)
    }
    const t0 = performance.now()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      // the opening shot: the camera starts high above the far platform and glides down to the usual view (about 1.3 s, after a short pause)
      const k = Math.max(0, Math.min(1, (performance.now() - t0 - 250) / 1300))
      const e = k * k * (3 - 2 * k)
      this.camera.position.set(INTRO.pos[0] + (CAMERA.pos[0] - INTRO.pos[0]) * e, INTRO.pos[1] + (CAMERA.pos[1] - INTRO.pos[1]) * e, INTRO.pos[2] + (CAMERA.pos[2] - INTRO.pos[2]) * e)
      this.camera.lookAt(INTRO.target[0] + (CAMERA.target[0] - INTRO.target[0]) * e, INTRO.target[1] + (CAMERA.target[1] - INTRO.target[1]) * e, INTRO.target[2] + (CAMERA.target[2] - INTRO.target[2]) * e)
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  /** Size the picture to its container and return where the two platforms are on screen (in pixels). */
  layout(): BattleLayout {
    const w = this.mount.clientWidth, h = this.mount.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    // on a tall (phone) screen the same sideways view needs a wider angle, or the two platforms fall off the sides of the screen
    const REF_ASPECT = 1.5
    this.camera.fov = this.camera.aspect >= REF_ASPECT ? CAMERA.fov : Math.min(88, (2 * Math.atan(Math.tan((CAMERA.fov * Math.PI) / 360) * REF_ASPECT / this.camera.aspect) * 180) / Math.PI)
    // slide the picture up so both platforms stay above the menu at the bottom of the screen
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.2), w, h)
    this.camera.updateProjectionMatrix()
    // where things are on screen is always measured from the usual view (the opening shot only moves the picture, before anything stands on it)
    const keepPos = this.camera.position.clone(), keepQuat = this.camera.quaternion.clone()
    this.camera.position.set(...CAMERA.pos)
    this.camera.lookAt(...CAMERA.target)
    this.camera.updateMatrixWorld()
    const at = (p: { x: number; z: number; scale: number }) => {
      const centre = new THREE.Vector3(p.x, 0.02, p.z).project(this.camera)
      const edge = new THREE.Vector3(p.x + 0.3 * p.scale, 0.02, p.z).project(this.camera)
      const x = (centre.x * 0.5 + 0.5) * w
      const y = (-centre.y * 0.5 + 0.5) * h
      return { x, y, w: Math.abs((edge.x - centre.x) * 0.5 * w) * 2 }
    }
    const out = { foe: at(FOE_PLATFORM), me: at(ME_PLATFORM) }
    this.camera.position.copy(keepPos)
    this.camera.quaternion.copy(keepQuat)
    this.camera.updateMatrixWorld()
    return out
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.mount) this.mount.removeChild(this.renderer.domElement)
  }
}
