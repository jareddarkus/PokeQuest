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

// The framing of the real game's top screen, fitted on a screenshot of it (a 4:3 picture): both platforms are the same model, the camera is low and looks almost
// level (pitch 4.4 degrees, vertical field of view 51.5 degrees), the picture is shifted up a little (lens shift). Distances are in units of the platform's
// radius (0.5808 in the fit); `U` turns them into scene units once the real radius of the platform model is known.
const FIT = { r: 0.5808, h: 0.49, pitch: (4.399 * Math.PI) / 180, fov: 51.458, lens: 0.0812, me: { x: 0.0406, z: -1.7676 }, foe: { x: 1.0868, z: -2.6552 } } as const
// the opening shot (reference video): the camera starts low and close to the ground beside the far platform and flies back to the usual view in about 0.9 s
const INTRO_REL = { pos: [-0.42, 0.22, 0.57], target: [-0.02, 0.16, 0] } as const // relative to the far platform, in the old units (old platform radius = 0.85 of the real one)

export interface BattleLayout {
  foe: { x: number; y: number; w: number }
  me: { x: number; y: number; w: number }
  /** where the 4:3 screen of the game sits in the picture: left edge, width, height, and the space below it (pixels) */
  frame: { l: number; t: number; w: number; h: number; b: number }
}

export class BattleBackdrop3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private raf = 0
  private mount: HTMLElement
  private introAt = Infinity // when the opening shot starts (the camera waits at the first pose until then)
  private introMs = 900
  /** called every frame while the camera moves, with where the platforms are on screen then */
  onFrame: ((l: BattleLayout) => void) | null = null
  private moving = false

  private ball: THREE.Group | null = null
  private ballUntil = 0
  private ballFrom = new THREE.Vector3()
  private ballTo = new THREE.Vector3()
  private ballT0 = 0

  private R = 0.3 // the real radius of the platform model
  private meP = { x: 0, z: 0 }
  private foeP = { x: 0, z: 0 }
  private camPos = new THREE.Vector3()
  private camTarget = new THREE.Vector3()
  private introPos = new THREE.Vector3()
  private introTarget = new THREE.Vector3()
  private frame = { l: 0, t: 0, w: 1, h: 1, b: 0 }

  constructor(mount: HTMLElement, files: Uint8Array[], env: BattleEnvironment, ballRaw?: Uint8Array | null) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    mount.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    this.scene.background = new THREE.Color('#7fc4ee')
    this.camera = new THREE.PerspectiveCamera(FIT.fov, 4 / 3, 0.01, 300)

    const make = (idx: number) => {
      const raw = files[idx]
      const model = readModels(raw)[0]
      const tex = readTexFile(raw)
      if (!model || !tex) return null
      return buildModelObject(model, tex)
    }
    const bg = make(env.bg)
    if (bg) this.scene.add(bg)
    const stages = [make(env.stage), make(env.stage)]
    if (stages[0]) { const box = new THREE.Box3().setFromObject(stages[0]); this.R = Math.max(0.05, (box.max.x - box.min.x) / 2) }
    const U = this.R / FIT.r // scene units per unit of the fit
    this.meP = { x: FIT.me.x * U, z: FIT.me.z * U }
    this.foeP = { x: FIT.foe.x * U, z: FIT.foe.z * U }
    this.camPos.set(0, FIT.h * U, 0)
    this.camTarget.set(0, FIT.h * U - Math.sin(FIT.pitch) * 10 * U, -Math.cos(FIT.pitch) * 10 * U)
    const S = 1 / 0.85
    this.introPos.set(this.foeP.x + INTRO_REL.pos[0] * S, INTRO_REL.pos[1] * S, this.foeP.z + INTRO_REL.pos[2] * S)
    this.introTarget.set(this.foeP.x + INTRO_REL.target[0] * S, INTRO_REL.target[1] * S, this.foeP.z + INTRO_REL.target[2] * S)
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camTarget)
    ;[this.foeP, this.meP].forEach((p, i) => {
      const st = stages[i]
      if (!st) return
      st.position.set(p.x, 0, p.z)
      this.scene.add(st)
    })
    if (ballRaw) { // the game's own Poké Ball (a small 3D ball that spins in the air before the Pokémon comes out)
      const model = readModels(ballRaw)[0], tex = readTexFile(ballRaw)
      if (model && tex) {
        const obj = buildModelObject(model, tex)
        const box = new THREE.Box3().setFromObject(obj)
        const size = box.getSize(new THREE.Vector3())
        const centre = box.getCenter(new THREE.Vector3())
        const pivot = new THREE.Group()
        obj.position.sub(centre)
        pivot.add(obj)
        pivot.scale.setScalar((0.055 * (1 / 0.85)) / Math.max(size.x, size.y, size.z, 1e-3))
        pivot.visible = false
        this.ball = pivot
        this.scene.add(pivot)
      }
    }
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const k = Math.max(0, Math.min(1, (performance.now() - this.introAt) / this.introMs))
      const e = 1 - (1 - k) * (1 - k) // fast at first, settling at the end
      this.camera.position.lerpVectors(this.introPos, this.camPos, e)
      const look = new THREE.Vector3().lerpVectors(this.introTarget, this.camTarget, e)
      this.camera.lookAt(look)
      if (this.ball) {
        const now = performance.now()
        this.ball.visible = now < this.ballUntil
        if (this.ball.visible) {
          const k = Math.min(1, (now - this.ballT0) / 260) // flies from the trainer's hand to its place above the platform, then hovers and spins
          const e = 1 - (1 - k) * (1 - k)
          this.ball.position.lerpVectors(this.ballFrom, this.ballTo, e)
          this.ball.position.y += Math.sin(k * Math.PI) * 0.12 * (1 / 0.85)
          this.ball.rotation.x = (now - this.ballT0) / 1000 * 14
        }
      }
      this.renderer.render(this.scene, this.camera)
      if (this.moving) { this.onFrame?.(this.measure()); if (k >= 1) { this.moving = false; this.onFrame?.(this.layout()) } }
    }
    loop()
  }

  /** Shows the spinning Poké Ball above a platform for `ms` (it starts at the trainer and flies to its place). */
  showBall(side: 'foe' | 'me', ms: number) {
    const p = side === 'foe' ? this.foeP : this.meP
    const s = 1 / 0.85
    this.ballFrom.set(p.x + (side === 'foe' ? 0.04 : 0.2) * s, (side === 'foe' ? 0.22 : 0.3) * s, p.z + (side === 'foe' ? 0 : 0.18) * s)
    this.ballTo.set(p.x + (side === 'foe' ? 0 : 0.1) * s, (side === 'foe' ? 0.4 : 0.36) * s, p.z)
    this.ballT0 = performance.now()
    this.ballUntil = this.ballT0 + ms
  }

  /** Starts the opening shot now (takes `ms`); until then the camera waits at the first pose. */
  startIntro(ms = 900) { this.introAt = performance.now(); this.introMs = ms; this.moving = true }

  /** where the two platforms are on screen with the camera as it is right now */
  private measure(): BattleLayout {
    const w = this.mount.clientWidth, h = this.mount.clientHeight
    this.camera.updateMatrixWorld()
    const at = (p: { x: number; z: number }) => {
      const centre = new THREE.Vector3(p.x, 0.02, p.z).project(this.camera)
      const edge = new THREE.Vector3(p.x + this.R, 0.02, p.z).project(this.camera)
      return { x: (centre.x * 0.5 + 0.5) * w, y: (-centre.y * 0.5 + 0.5) * h, w: Math.abs((edge.x - centre.x) * 0.5 * w) * 2 }
    }
    return { foe: at(this.foeP), me: at(this.meP), frame: this.frame }
  }

  /** Size the picture to its container and return where the two platforms are on screen (in pixels). */
  layout(): BattleLayout {
    const w = this.mount.clientWidth, h = this.mount.clientHeight
    this.renderer.setSize(w, h, false)
    // The picture fills the whole window. The game's own 4:3 screen is fitted into the part above the lower screen / log (`--bottom-h`), centred; the view carries
    // on around it (sides and below) so the field looks the same all over the window.
    const bottom = parseFloat(getComputedStyle(this.mount).getPropertyValue('--bottom-h')) || 0
    const hl = Math.max(1, h - bottom)
    // The game's screen is drawn bigger than the free part of the window when the lower screen takes much room: its empty sky at the top is cut off and its bottom
    // fifth lies under the log box / lower screen (as the log box does in the game), so both platforms and Pokémon look close.
    // (whole device pixels per picture pixel of the game's screen: the biggest size whose platform stays above the log box)
    const dpr = window.devicePixelRatio || 1
    const cut = (fh: number) => (fh > hl ? Math.min(0.16 * fh, Math.max(0, 0.79 * fh - 0.97 * hl)) : 0)
    let K = Math.max(1 / dpr, Math.floor(((w * 3) / 4 / 192) * dpr) / dpr)
    while (K > 1 / dpr && (0.66 * 192 * K - cut(192 * K) > 0.83 * hl || 192 * K > hl * 1.6)) K -= 1 / dpr
    const fh = 192 * K, fw = 256 * K
    const t = cut(fh) // how much of the top of the frame is cut off
    this.frame = { l: (w - fw) / 2, t: -t, w: fw, h: fh, b: h - (fh - t) }
    this.camera.aspect = 4 / 3
    this.camera.fov = FIT.fov
    this.camera.setViewOffset(fw, fh, -(w - fw) / 2, Math.round(FIT.lens * fh + t), w, h)
    this.camera.updateProjectionMatrix()
    // where things are on screen is always measured from the usual view (the opening shot only moves the picture, before anything stands on it)
    const keepPos = this.camera.position.clone(), keepQuat = this.camera.quaternion.clone()
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camTarget)
    const out = this.measure()
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
