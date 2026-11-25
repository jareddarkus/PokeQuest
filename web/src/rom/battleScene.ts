// The battle scenery of Pokémon Black 2 / White 2 (archive a/0/1/1): a backdrop (sky, horizon, field) and a round platform for each side.
// Each is a small 3D model that carries its own textures. The camera and the places of the platforms are the game's own (from the public decompilation of
// the game: src/moveeffect/btlv_effvm.c, src/battle/graphic/btlv_stage.c): the places are world units, the cameras are named presets.
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

type V = [number, number, number]
/** The ground models of a single battle (yours in front, the opponent's behind) and the Pokémon on them. */
const GROUND = { me: [0, 0, 5.45] as V, foe: [0, 0, -12.72] as V }
/** The camera presets of the game (position, look-at point), numbered like EFFVM_CAMERA_*. */
export const CAMERA_PRESETS: Record<number, { pos: V; target: V }> = {
  0: { pos: [5.79, 5.95, 19.8], target: [-0.91, 1.85, 2.5] }, // single, player
  1: { pos: [6.6, 6.95, 6.9], target: [-0.1, 2.85, -10.4] }, // single, enemy
  8: { pos: [6.7, 6.7, 17.3], target: [0, 2.6, 0] }, // default
  14: { pos: [8.7, 7.7, 23.8], target: [2, 3.6, 6.5] }, // wide
}
/** Vertical field of view (the game's own value is not certain: the sine / cosine of 13 degrees are given; this one fits its look) */
const FOV = 36

export interface BattleLayout {
  foe: { x: number; y: number; w: number }
  me: { x: number; y: number; w: number }
  /** where the 4:3 screen of the game sits in the picture: left edge, top (negative = cut off), width, height, and the space below it (pixels) */
  frame: { l: number; t: number; w: number; h: number; b: number }
}

const v3 = (a: V) => new THREE.Vector3(a[0], a[1], a[2])

export class BattleBackdrop3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private raf = 0
  private mount: HTMLElement
  /** called every frame while the camera moves, with where the platforms are on screen then */
  onFrame: ((l: BattleLayout) => void) | null = null

  private ball: THREE.Group | null = null
  private ballUntil = 0
  private ballFrom = new THREE.Vector3()
  private ballTo = new THREE.Vector3()
  private ballT0 = 0

  private R = 3.8 // the radius of a platform (world units)
  private meP = new THREE.Vector3()
  private foeP = new THREE.Vector3()
  private camPos = v3(CAMERA_PRESETS[8].pos)
  private camTarget = v3(CAMERA_PRESETS[8].target)
  // a camera move: linear steps (the game's own: `frames` steps, one every `wait + 1` frames, the steps get half as long after `brake` steps)
  private move: { posStep: THREE.Vector3; targetStep: THREE.Vector3; left: number; every: number; tick: number; brake: number; done: () => void } | null = null
  private frame = { l: 0, t: 0, w: 1, h: 1, b: 0 }
  /** pixels at the right edge of the window that the page covers with the lower screen (the picture is placed to the left of them) */
  reserveRight = 0
  private lastMs = 0
  private acc = 0
  private moving = 0 // frames of camera motion left to report to the page

  constructor(mount: HTMLElement, files: Uint8Array[], env: BattleEnvironment, ballRaw?: Uint8Array | null) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    mount.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    this.scene.background = new THREE.Color('#7fc4ee')
    this.camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.1, 600)

    const make = (idx: number) => {
      const raw = files[idx]
      const model = readModels(raw)[0]
      const tex = readTexFile(raw)
      if (!model || !tex) return null
      return buildModelObject(model, tex)
    }
    // The models of the file are small (a platform is about 0.3 across); the game's world is bigger: everything is scaled so that a platform is 3.8 units
    // in radius (worked out from a screenshot of the real game and the game's camera positions).
    const world = new THREE.Group()
    this.scene.add(world)
    const bg = make(env.bg)
    if (bg) world.add(bg)
    const stages = [make(env.stage), make(env.stage)]
    let modelR = 0.3
    const modelCentre = new THREE.Vector3()
    if (stages[0]) {
      const box = new THREE.Box3().setFromObject(stages[0])
      modelR = Math.max(0.02, (box.max.x - box.min.x) / 2)
      modelCentre.set((box.max.x + box.min.x) / 2, 0, (box.max.z + box.min.z) / 2)
    }
    const S = 3.8 / modelR
    world.scale.setScalar(S)
    this.R = 3.8
    this.meP = v3(GROUND.me); this.foeP = v3(GROUND.foe)
    ;[this.foeP, this.meP].forEach((p, i) => {
      const st = stages[i]
      if (!st) return
      st.position.set(p.x / S - modelCentre.x, p.y / S, p.z / S - modelCentre.z) // the model's own middle on the ground place
      world.add(st)
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
        pivot.scale.setScalar(0.9 / Math.max(size.x, size.y, size.z, 1e-3)) // about 0.9 units across
        pivot.visible = false
        this.ball = pivot
        this.scene.add(pivot)
      }
    }
    this.applyCamera()
    this.lastMs = performance.now()
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      // the game's pace: the camera moves in steps of 1/60 s
      this.acc += Math.min(100, now - this.lastMs); this.lastMs = now
      let stepped = false
      while (this.acc >= 1000 / 60) { this.acc -= 1000 / 60; if (this.step()) stepped = true }
      if (this.ball) {
        const t = performance.now()
        this.ball.visible = t < this.ballUntil
        if (this.ball.visible) {
          const k = Math.min(1, (t - this.ballT0) / 260) // flies from the trainer's hand to its place above the platform, then hovers and spins
          const e = 1 - (1 - k) * (1 - k)
          this.ball.position.lerpVectors(this.ballFrom, this.ballTo, e)
          this.ball.position.y += Math.sin(k * Math.PI) * 1.1
          this.ball.rotation.x = (t - this.ballT0) / 1000 * 14
        }
      }
      this.renderer.render(this.scene, this.camera)
      if (stepped || this.moving > 0) { if (this.moving > 0) this.moving--; this.onFrame?.(this.measure()) }
    }
    this.raf = requestAnimationFrame(loop)
  }

  private applyCamera() {
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camTarget)
    this.camera.updateMatrixWorld()
  }

  /** One frame of the camera move. Returns true if the camera moved. */
  private step(): boolean {
    const m = this.move
    if (!m) return false
    m.tick++
    if (m.tick % m.every !== 0) return false
    this.camPos.add(m.posStep); this.camTarget.add(m.targetStep)
    m.left--
    if (m.brake > 0) { m.brake--; if (m.brake === 0) { m.posStep.multiplyScalar(0.5); m.targetStep.multiplyScalar(0.5) } }
    this.applyCamera()
    this.moving = 2
    if (m.left <= 0) { const done = m.done; this.move = null; done() }
    return true
  }

  /** Moves the camera to one of the game's presets (or jumps there with `frames` = 0). Resolves when it has arrived. */
  moveCamera(preset: number, frames = 16, wait = 0, brake = 0): Promise<void> {
    const p = CAMERA_PRESETS[preset] ?? CAMERA_PRESETS[8]
    const pos = v3(p.pos), target = v3(p.target)
    if (this.move) { const d = this.move.done; this.move = null; d() }
    if (frames <= 0) { this.camPos.copy(pos); this.camTarget.copy(target); this.applyCamera(); this.moving = 2; return Promise.resolve() }
    return new Promise((resolve) => {
      this.move = { posStep: pos.sub(this.camPos).divideScalar(frames), targetStep: target.sub(this.camTarget).divideScalar(frames), left: frames, every: wait + 1, tick: 0, brake, done: resolve }
    })
  }

  /** Shows the spinning Poké Ball above a platform for `ms` (it starts at the trainer and flies to its place). */
  showBall(side: 'foe' | 'me', ms: number) {
    const p = side === 'foe' ? this.foeP : this.meP
    const k = this.R / 3
    this.ballFrom.set(p.x + (side === 'foe' ? 0.5 : -3) * k, p.y + (side === 'foe' ? 2.2 : 3) * k, p.z + (side === 'foe' ? 0 : 2) * k)
    this.ballTo.set(p.x, p.y + (side === 'foe' ? 4 : 3.6) * k, p.z)
    this.ballT0 = performance.now()
    this.ballUntil = this.ballT0 + ms
  }

  /** The opening shot: the camera starts low and close to the far platform and flies to the player's camera of the game (`ms` long). */
  startIntro(ms = 900) {
    const k = this.R / 3
    this.camPos.set(this.foeP.x + 3 * k, this.foeP.y + 1.6 * k, this.foeP.z + 5 * k)
    this.camTarget.set(this.foeP.x, this.foeP.y + 1.4 * k, this.foeP.z)
    this.applyCamera()
    void this.moveCamera(0, Math.round((ms * 60) / 1000), 0, 6)
  }

  /** where the two platforms (and the Pokémon standing on them) are on screen with the camera as it is right now */
  private measure(): BattleLayout {
    const w = this.mount.clientWidth, h = this.mount.clientHeight
    this.camera.updateMatrixWorld()
    const at = (p: THREE.Vector3) => {
      const centre = p.clone().project(this.camera)
      const edge = p.clone().add(new THREE.Vector3(this.R, 0, 0)).project(this.camera)
      const pw = Math.abs((edge.x - centre.x) * 0.5 * w) * 2
      // where the Pokémon's feet are: on the platform, a little in front of its middle
      const feet = p.clone().add(new THREE.Vector3(0, 0.4, 0)).project(this.camera)
      const fx = (feet.x * 0.5 + 0.5) * w, fy = (-feet.y * 0.5 + 0.5) * h
      return { x: fx, y: fy - pw * 0.1, w: pw } // (the page puts a Pokémon's feet at y + 0.1 w)
    }
    return { foe: at(this.foeP), me: at(this.meP), frame: this.frame }
  }

  /** Size the picture to its container and return where the two platforms are on screen (in pixels). */
  layout(): BattleLayout {
    const w = this.mount.clientWidth, h = this.mount.clientHeight
    this.renderer.setSize(w, h, false)
    // The game's 4:3 screen fills the window (as much as its height / 98% of its width allow); the lower screen and the log lie on top of its bottom part.
    // (wide windows: the lower screen sits in the right bottom corner, so the picture uses the part of the window to its left)
    const aw = w - this.reserveRight
    const fh = this.reserveRight > 0 ? Math.min(h, aw * 0.75) : Math.min(h, w * 0.735), fw = (fh * 4) / 3
    const fl = (aw - fw) / 2, ft = this.reserveRight > 0 ? (h - fh) / 2 : 0
    this.frame = { l: fl, t: ft, w: fw, h: fh, b: h - ft - fh }
    this.camera.aspect = 4 / 3
    this.camera.fov = FOV
    this.camera.setViewOffset(fw, fh, -fl, -ft, w, h)
    this.camera.updateProjectionMatrix()
    this.applyCamera()
    return this.measure()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.mount) this.mount.removeChild(this.renderer.domElement)
  }
}
