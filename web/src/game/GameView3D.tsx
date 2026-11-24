import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { BuiltWorld } from '../rom/chunkWorld'
import { drawCharacter, lookSprite, randomLook, type Look } from './character'
import { owBall, owEmote, owFrame } from './ow'
import { GYM_MODELS } from '../rom/buildings'
import { animatedTextures } from '../rom/mapModel'
import { valueAt } from '../rom/texanim'
import { safeTileFor, type GameEvents, type GameHandle, type OtherPlayer } from './GameView'
import { hash2 } from './rng'
import type { Settings } from './settings'
import {
  DX, DY, RING_INNER, SIZE, T, TYPE_COLOR, collapseRadius, dist, isWalkable, tileAt, type Dir, type NpcSpec, type World,
} from './world'

interface Props {
  world: World
  built: BuiltWorld
  look: Look
  settings: Settings
  startTile: { x: number; y: number }
  /** milliseconds since the match started, or null for no collapse */
  elapsed: () => number | null
  others: () => OtherPlayer[]
  events: GameEvents
  handleRef: React.MutableRefObject<GameHandle | null>
  paused: boolean
}

const WALK_SECONDS = 16 / 60 // one tile = 16 pictures at 60 a second when walking (like the DS games)
const RUN_SECONDS = 8 / 60 // ... and 8 when running (hold B = the down arrow, or Shift)
const TURN_SECONDS = 0.1 // turning on the spot before the first step
// The camera of the overworld: it looks at the player from the south, tilted down (tuned by eye to match White 2).
const CAM_PITCH = 52 * (Math.PI / 180)
const CAM_FOV = 28
const CAM_DISTANCE = 17

interface NpcRuntime {
  spec: NpcSpec
  x: number
  y: number
  fx: number
  fy: number
  dir: Dir
  moving: number
  fromX: number
  fromY: number
  timer: number
  defeated: boolean
  frozen: boolean
  look: Look
  sprite: THREE.Sprite
  stp: number // which foot comes next (0 / 1)
}

function walkableFor(world: World, x: number, y: number, elapsed: number | null): boolean {
  if (!isWalkable(world, x, y)) return false
  if (elapsed !== null && dist(x, y) > collapseRadius(elapsed / 1000)) return false
  return true
}

/** Real game characters are 32x32 pictures (2 tiles wide, feet near the bottom); the drawn placeholders are smaller. */
function fit(sp: THREE.Sprite) {
  sp.renderOrder = 3 // drawn after the shadows (renderOrder 1)
  if (sp.material.userData.real) { sp.center.set(0.5, 0.1); sp.scale.set(2, 2, 1) }
  else { sp.center.set(0.5, 0.05); sp.scale.set(1.15, 1.45, 1) }
}

/** A soft dark oval on the ground under a character or Pokémon. */
const shadowGeo = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2)
function makeShadow(scene: THREE.Scene, size = 1): THREE.Mesh {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
  m.scale.set(0.8 * size, 1, 0.45 * size)
  m.renderOrder = 1
  scene.add(m)
  return m
}
/** Real game characters are drawn a little higher so their feet do not sink into the ground (the picture leans back with the camera). */
const lift = (sp: THREE.Sprite) => (sp.material.userData.real ? 0.2 : 0)

/**
 * The picture of a character is a flat card that leans back with the camera, so its top can poke into a wall behind it (and the
 * grass in front hides too much of it). Sliding the card towards the camera along the line of sight changes nothing on the screen
 * (we make it a little smaller to compensate) but puts it in front of the wall.
 */
const PUSH = 0.9
const _v = new THREE.Vector3()
function place(sp: THREE.Sprite, camera: THREE.Camera, x: number, y: number, z: number) {
  _v.set(x, y, z)
  const toCam = camera.position.clone().sub(_v)
  const dist = toCam.length()
  const d = Math.min(PUSH, dist * 0.4)
  sp.position.copy(_v.addScaledVector(toCam.normalize(), d))
  sp.scale.multiplyScalar((dist - d) / dist)
}

const spriteCache = new Map<string, THREE.SpriteMaterial>()
function charMaterial(look: Look, dir: Dir, frame: number, run = false): THREE.SpriteMaterial {
  const real = lookSprite(look)
  const key = real !== undefined ? `real|${real}|${dir}|${frame}|${run ? 1 : 0}` : `${JSON.stringify(look)}|${dir}|${frame}`
  let m = spriteCache.get(key)
  if (m) return m
  if (real !== undefined) {
    const t = new THREE.CanvasTexture(owFrame(real, dir, frame, run)!)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.colorSpace = THREE.SRGBColorSpace
    m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.1, depthWrite: false })
    m.userData.real = true
    spriteCache.set(key, m)
    return m
  }
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 80
  const ctx = c.getContext('2d')!
  drawCharacter(ctx, 32, 76, 3.4, look, dir, frame)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.1, depthWrite: false })
  spriteCache.set(key, m)
  return m
}

function labelTexture(text: string, bg: string, fg = '#fff'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 256, 64)
  ctx.font = "900 26px Unbounded, system-ui, sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = fg
  ctx.fillText(text, 128, 34)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function nameTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 48
  const ctx = c.getContext('2d')!
  ctx.font = '400 24px Lexend, system-ui, sans-serif'
  const w = Math.min(250, ctx.measureText(text).width + 22)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(128 - w / 2, 6, w, 36)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 25)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function ballMaterial(): THREE.SpriteMaterial {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e8453c'
  ctx.beginPath(); ctx.arc(16, 16, 10, Math.PI, 0); ctx.fill()
  ctx.fillStyle = '#f4f4f4'
  ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI); ctx.fill()
  ctx.fillStyle = '#222'
  ctx.fillRect(6, 15, 20, 2)
  ctx.beginPath(); ctx.arc(16, 16, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#f4f4f4'; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke()
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })
}

export default function GameView3D(props: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const dpadRef = useRef<Dir | null>(null)
  const actionRef = useRef<() => void>(() => {})
  const bRef = useRef(false)
  const tapRef = useRef<Dir | null>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const { world, built } = propsRef.current

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.className = 'game-canvas'
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#3a7fc0')
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 400)

    scene.add(built.group)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a7fc0' }))
    sea.position.set(SIZE / 2, built.waterY - 0.03, SIZE / 2)
    scene.add(sea)

    // the ring barriers (you can only pass by beating a gym leader)
    for (const k of [0, 1, 2]) {
      const r = RING_INNER[k] - 0.5
      const geo = new THREE.CylinderGeometry(r, r, 4, 96, 1, true)
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
      const wall = new THREE.Mesh(geo, mat)
      wall.position.set(SIZE / 2, 2, SIZE / 2)
      scene.add(wall)
    }

    const heightAt = (fx: number, fz: number): number => {
      const cx = Math.min(SIZE - 1.001, Math.max(0, fx - 0.5))
      const cz = Math.min(SIZE - 1.001, Math.max(0, fz - 0.5))
      const x0 = Math.floor(cx), z0 = Math.floor(cz)
      const ax = cx - x0, az = cz - z0
      const h = built.height
      const a = h[z0 * SIZE + x0], b = h[z0 * SIZE + x0 + 1], c = h[(z0 + 1) * SIZE + x0], d = h[(z0 + 1) * SIZE + x0 + 1]
      return a * (1 - ax) * (1 - az) + b * ax * (1 - az) + c * (1 - ax) * az + d * ax * az
    }

    // gyms: the real gym buildings of the game (a sign at the entrance if the building is not available)
    world.gyms.forEach((g, gi) => {
      const spec = GYM_MODELS[gi % GYM_MODELS.length]
      const b = built.makeBuilding(spec.pack, spec.model)
      const gy = heightAt(g.x + 0.5, g.y + 0.5)
      if (b) {
        // the front of the building (its door side, towards the south) ends at the south edge of the door tile
        const box = new THREE.Box3().setFromObject(b.obj)
        b.obj.position.set(g.x + 0.5 - (box.min.x + box.max.x) / 2, gy, g.y + 1 - box.max.z)
        scene.add(b.obj)
        // you cannot walk through the building (the door tile and the row in front of it stay open)
        const wb = new THREE.Box3().setFromObject(b.obj)
        for (let ty = Math.floor(wb.min.z + 0.2); ty < g.y; ty++) {
          for (let tx = Math.floor(wb.min.x + 0.2); tx <= Math.floor(wb.max.x - 0.2); tx++) {
            if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) continue
            const t = world.tiles[ty * SIZE + tx]
            if (t === T.Grass || t === T.Tall || t === T.Sand) world.tiles[ty * SIZE + tx] = T.GymWall
          }
        }
      }
      const mat = new THREE.SpriteMaterial({ map: labelTexture(`${g.type.toUpperCase()} GYM`, TYPE_COLOR[g.type]), transparent: false })
      const s = new THREE.Sprite(mat)
      s.center.set(0.5, 0)
      s.scale.set(3, 0.75, 1)
      s.position.set(g.x + 0.5, gy + 0.2, g.y + 0.5)
      scene.add(s)
    })

    const ballMat = ballMaterial()
    // every item on the ground is drawn with the game's own item ball (a/0/4/8 file 115)
    const ballImg = owBall()
    if (ballImg) {
      const tex = new THREE.Texture(ballImg)
      tex.needsUpdate = true
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.colorSpace = THREE.SRGBColorSpace
      ballMat.map = tex
      ballMat.color.set(0xffffff)
      ballMat.alphaTest = 0.1
      ballMat.transparent = true
      ballMat.needsUpdate = true
    }
    const pickupSprites = new Map<string, THREE.Sprite>()
    for (const pk of world.pickups) {
      const s = new THREE.Sprite(ballMat)
      s.center.set(0.5, 0.1)
      s.scale.set(ballImg ? 1.1 : 0.5, ballImg ? 1.1 : 0.5, 1)
      s.renderOrder = 3
      s.position.set(pk.x + 0.5, heightAt(pk.x + 0.5, pk.y + 0.5) + 0.05, pk.y + 0.5)
      scene.add(s)
      pickupSprites.set(pk.id, s)
    }

    const me = {
      x: propsRef.current.startTile.x, y: propsRef.current.startTile.y, fromX: 0, fromY: 0, t: 1, dir: 0 as Dir, step: 0,
      stepSec: WALK_SECONDS, run: false, idle: 1, turn: 0,
    }
    me.fromX = me.x
    me.fromY = me.y
    const mySprite = new THREE.Sprite(charMaterial(propsRef.current.look, 0, 0))
    fit(mySprite)
    scene.add(mySprite)
    const myShadow = makeShadow(scene)
    const npcShadows = new Map<NpcRuntime, THREE.Mesh>()

    let alert: { n: NpcRuntime; t: number } | null = null
    let bubble: THREE.Sprite | null = null
    const em = owEmote(15)
    if (em) {
      const tex = new THREE.Texture(em)
      tex.needsUpdate = true
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.colorSpace = THREE.SRGBColorSpace
      bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1, depthTest: false }))
      bubble.scale.set(1.3, 1.3, 1)
      bubble.center.set(0.5, 0)
      bubble.renderOrder = 10
      bubble.visible = false
      scene.add(bubble)
    }

    const removed = new Set<string>()
    // items lying on the ground are in the way: characters walking around never step on them
    const pickupAt = (x: number, y: number) => world.pickups.some((q) => q.x === x && q.y === y && !removed.has(q.id))
    const npcs: NpcRuntime[] = world.npcs.map((s) => {
      const look = randomLook(s.look)
      const sp = new THREE.Sprite(charMaterial(look, s.dir, 0))
      fit(sp)
      scene.add(sp)
      return { spec: s, x: s.x, y: s.y, fx: s.x, fy: s.y, dir: s.dir, moving: 0, fromX: s.x, fromY: s.y, timer: 1 + hash2(s.x, s.y, 3) * 3, defeated: false, frozen: false, look, sprite: sp, stp: 0 }
    })
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pq = { npcs, me, world, built, rayDown: (x: number, y: number, z: number) => { const maps = built.group.children.filter((c) => !c.userData.building); const rc = new THREE.Raycaster(); rc.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)); return rc.intersectObjects(maps, true).slice(0, 5).map((h) => [(h.object as THREE.Mesh).material instanceof THREE.Material ? ((h.object as THREE.Mesh).material as THREE.Material).name : '?', +h.point.y.toFixed(2)]) }, group: built.group, overlap: () => { const maps = built.group.children.filter((c) => !c.userData.building); const rc = new THREE.Raycaster(); return built.group.children.filter((c) => c.userData.building).map((c) => { const b = c.userData.building; rc.set(new THREE.Vector3(b.x, b.y + 4, b.z), new THREE.Vector3(0, -1, 0)); const hits = rc.intersectObjects(maps, true); return { m: b.model, pack: b.pack, x: b.x, z: b.z, y: b.y, top: hits.length ? +hits[0].point.y.toFixed(2) : null } }) }, pick: (nx: number, ny: number) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera); return rc.intersectObjects(built.group.children, true).slice(0, 4).map((h) => (h.object as THREE.Mesh).material as THREE.Material).map((m) => m.name) } } // developer test hook
    const otherSprites = new Map<string, { body: THREE.Sprite; label: THREE.Sprite; shadow: THREE.Mesh }>()
    let paused = false
    const held = new Set<string>()

    const handle: GameHandle = {
      teleport: (x, y) => { me.x = x; me.y = y; me.fromX = x; me.fromY = y; me.t = 1 },
      getPos: () => ({ x: me.x, y: me.y, dir: me.dir }),
      removePickup: (id) => { removed.add(id); const s = pickupSprites.get(id); if (s) s.visible = false },
      defeatNpc: (id) => { const n = npcs.find((q) => q.spec.id === id); if (n) n.defeated = true },
      setPaused: (p) => { paused = p },
      setNpcFreeze: (id) => { for (const n of npcs) n.frozen = id !== null && n.spec.id === id },
    }
    propsRef.current.handleRef.current = handle

    // W A S D walk. The arrow keys are the buttons of the game: left = A (talk / pick up), down = B (hold to run), up = X (menu), right = Y.
    const keyDir = (k: string): Dir | null => {
      switch (k) {
        case 'w': return 3
        case 's': return 0
        case 'a': return 1
        case 'd': return 2
      }
      return null
    }
    const doAction = () => { // button A: use whatever is right in front of you (an item on the ground)
      if (me.t < 1 || paused || propsRef.current.paused) return
      const pk = world.pickups.find((q) => q.x === me.x + DX[me.dir] && q.y === me.y + DY[me.dir] && !removed.has(q.id))
      if (pk) propsRef.current.events.onPickup?.(pk.id)
    }
    actionRef.current = doAction
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key.toLowerCase()
      const kd = keyDir(k)
      if (kd !== null) { if (!held.has(k)) { held.add(k); tapRef.current = kd }; e.preventDefault(); return }
      if (k === 'arrowdown' || k === 'shift') { held.add('b'); e.preventDefault(); return }
      if (k === 'arrowleft') { if (!e.repeat) doAction(); e.preventDefault(); return }
      if (k === 'arrowup') { if (!e.repeat) propsRef.current.events.onMenuKey?.(); e.preventDefault(); return }
      if (k === 'arrowright') e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'arrowdown' || k === 'shift') held.delete('b')
      held.delete(k)
    }
    const onBlur = () => held.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // the direction asked for right now: the key held longest ago... no: the one pressed last that is still down, or a quick tap that has not been used yet
    const wantedDir = (): { dir: Dir | null; held: boolean } => {
      if (dpadRef.current !== null) return { dir: dpadRef.current, held: true }
      const keys = Array.from(held)
      for (let i = keys.length - 1; i >= 0; i--) {
        const d = keyDir(keys[i])
        if (d !== null) return { dir: d, held: true }
      }
      return { dir: tapRef.current, held: false }
    }

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    const npcAt = (x: number, y: number) =>
      npcs.some((n) => !n.defeated && ((n.x === x && n.y === y) || (n.moving > 0 && Math.round(n.fx) === x && Math.round(n.fy) === y)))

    const tryStep = (d: Dir, elapsed: number | null) => {
      me.dir = d
      const nx = me.x + DX[d]
      const ny = me.y + DY[d]
      if (!walkableFor(world, nx, ny, elapsed) || npcAt(nx, ny) || pickupAt(nx, ny)) {
        if (tileAt(world, nx, ny) === T.GymDoor) {
          const g = world.gyms.find((q) => q.doorX === nx && q.doorY === ny)
          if (g) propsRef.current.events.onGym?.(g.id)
        }
        return
      }
      // walking onto the gym door tile starts the challenge too
      me.fromX = me.x
      me.fromY = me.y
      me.x = nx
      me.y = ny
      me.t = 0
      me.stepSec = held.has('b') || bRef.current ? RUN_SECONDS : WALK_SECONDS
      me.run = me.stepSec === RUN_SECONDS
      me.idle = 0
      me.step ^= 1
      propsRef.current.events.onMoveStart?.(nx, ny, d)
    }

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = propsRef.current
      const elapsed = p.elapsed()
      const elapsedSec = elapsed === null ? 0 : elapsed / 1000

      if (elapsed !== null && dist(me.x, me.y) > collapseRadius(elapsedSec) && me.t >= 1) {
        const s = safeTileFor(world, me.x, me.y, elapsedSec)
        handle.teleport(s.x, s.y)
        p.events.onPushed?.(s.x, s.y, s.ring)
      }

      if (!paused && !p.paused) {
        if (me.t < 1) {
          me.t = Math.min(1, me.t + dt / me.stepSec)
          if (me.t >= 1) {
            const tile = tileAt(world, me.x, me.y)
            p.events.onStep?.(me.x, me.y, tile)
            if (tile === T.GymDoor) {
              const g = world.gyms.find((q) => q.doorX === me.x && q.doorY === me.y)
              if (g) p.events.onGym?.(g.id)
            }
          }
        }
        if (alert) { // a trainer has spotted you: the "!" bubble shows for a moment, then the battle begins
          alert.t -= dt
          bubble!.position.set(alert.n.fx + 0.5, heightAt(alert.n.fx + 0.5, alert.n.fy + 0.5) + 1.7, alert.n.fy + 0.5)
          if (alert.t <= 0) {
            const id = alert.n.spec.id
            alert = null
            bubble!.visible = false
            p.events.onNpcSpotted?.(id)
          }
        }
        if (me.t >= 1) me.idle += dt
        if (me.t >= 1 && !alert) {
          const w = wantedDir()
          if (w.dir === null) { me.turn = 0 }
          else if (w.dir !== me.dir && me.idle > 0.06) {
            // standing still and asking for another direction: first turn on the spot (a quick tap only turns)
            me.dir = w.dir
            me.turn = TURN_SECONDS
            tapRef.current = null
          } else if (me.turn > 0) {
            me.turn -= dt
          } else {
            tryStep(w.dir, elapsed)
            tapRef.current = null
          }
          if (!w.held && tapRef.current === null) me.turn = Math.min(me.turn, 0)
        }
        for (const n of npcs) {
          if (n.defeated || n.frozen || (alert && alert.n === n && n.moving === 0)) continue
          if (n.moving > 0) {
            n.moving = Math.min(1, n.moving + dt / (n.spec.behavior === 'run' ? 0.2 : WALK_SECONDS))
            n.fx = n.fromX + (n.x - n.fromX) * n.moving
            n.fy = n.fromY + (n.y - n.fromY) * n.moving
            if (n.moving >= 1) { n.moving = 0; n.fx = n.x; n.fy = n.y }
          } else {
            n.timer -= dt
            if (n.timer <= 0) {
              const b = n.spec.behavior
              if (b === 'stand') { n.timer = 3 + Math.random() * 4; if (Math.random() > 0.7) n.dir = Math.floor(Math.random() * 4) as Dir }
              else if (b === 'look') { n.dir = Math.floor(Math.random() * 4) as Dir; n.timer = 1.5 + Math.random() * 2.5 }
              else {
                const d = (Math.random() < 0.6 ? n.dir : Math.floor(Math.random() * 4)) as Dir
                const nx = n.x + DX[d]
                const ny = n.y + DY[d]
                n.dir = d
                const homeOk = Math.abs(nx - n.spec.x) <= 7 && Math.abs(ny - n.spec.y) <= 7
                if (homeOk && walkableFor(world, nx, ny, elapsed) && tileAt(world, nx, ny) !== T.GymDoor && !(nx === me.x && ny === me.y) && !npcAt(nx, ny) && !pickupAt(nx, ny)) {
                  n.fromX = n.x; n.fromY = n.y; n.x = nx; n.y = ny; n.moving = 0.001; n.stp ^= 1
                }
                n.timer = b === 'run' ? 0.5 + Math.random() * 1.5 : 0.8 + Math.random() * 2.2
              }
            }
          }
          if (n.moving === 0 || n.moving > 0.5) {
            for (let k = 1; k <= 4; k++) {
              const sx = n.x + DX[n.dir] * k
              const sy = n.y + DY[n.dir] * k
              if (!isWalkable(world, sx, sy) && tileAt(world, sx, sy) !== T.GymDoor) break
              if (sx === me.x && sy === me.y && me.t >= 1 && !alert) {
                const em = owEmote(15) // the game's own "!" bubble
                if (em && bubble) { alert = { n, t: 0.9 }; bubble.visible = true; break }
                p.events.onNpcSpotted?.(n.spec.id)
                break
              }
            }
          }
        }
      }

      // ---- draw
      const px = me.fromX + (me.x - me.fromX) * me.t
      const py = me.fromY + (me.y - me.fromY) * me.t
      const ph = heightAt(px + 0.5, py + 0.5)
      // the camera first (the characters are placed relative to it)
      const dst = CAM_DISTANCE / Math.max(0.3, p.settings.zoom)
      camera.position.set(px + 0.5, ph + Math.sin(CAM_PITCH) * dst, py + 0.5 + Math.cos(CAM_PITCH) * dst)
      camera.lookAt(px + 0.5, ph + 0.6, py + 0.5)
      // walking: the foot picture for the first half of a tile, standing for the second half; the foot changes with every tile
      mySprite.material = charMaterial(p.look, me.dir, me.t < 1 && me.t < 0.5 ? 1 + me.step : 0, me.run)
      fit(mySprite)
      place(mySprite, camera, px + 0.5, ph + lift(mySprite), py + 0.5)
      myShadow.position.set(px + 0.5, ph + 0.03, py + 0.5)
      const fr = Math.floor(now / (1000 / 30)) // water pictures: 30 a second (a calm pace; the exact speed of the original is not known)
      for (const a of animatedTextures) a.tex.offset.set(valueAt(a.anim.moveS, fr), valueAt(a.anim.moveT, fr)) // moving water
      for (const n of npcs) {
        n.sprite.visible = !n.defeated || true
        const frame = n.moving > 0 && n.moving < 0.5 ? 1 + n.stp : 0
        n.sprite.material = charMaterial(n.look, n.dir, frame, n.spec.behavior === 'run')
        fit(n.sprite)
        const nh = heightAt(n.fx + 0.5, n.fy + 0.5)
        place(n.sprite, camera, n.fx + 0.5, nh + lift(n.sprite), n.fy + 0.5)
        let sh = npcShadows.get(n)
        if (!sh) { sh = makeShadow(scene); npcShadows.set(n, sh) }
        sh.position.set(n.fx + 0.5, nh + 0.03, n.fy + 0.5)
      }
      // other players (named, never yourself)
      const seen = new Set<string>()
      for (const o of p.others()) {
        seen.add(o.id)
        let e = otherSprites.get(o.id)
        if (!e) {
          const body = new THREE.Sprite(charMaterial(o.look, o.dir, 0))
          fit(body)
          const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(o.name), transparent: true, depthWrite: false }))
          label.center.set(0.5, 0)
          label.scale.set(2.4, 0.45, 1)
          scene.add(body, label)
          e = { body, label, shadow: makeShadow(scene) }
          otherSprites.set(o.id, e)
        }
        e.body.material = charMaterial(o.look, o.dir, o.moving ? (Math.floor(now / 133) % 2 ? 0 : 1 + (Math.floor(now / 266) % 2)) : 0)
        fit(e.body)
        const h = heightAt(o.x + 0.5, o.y + 0.5)
        place(e.body, camera, o.x + 0.5, h + lift(e.body), o.y + 0.5)
        e.shadow.position.set(o.x + 0.5, h + 0.03, o.y + 0.5)
        e.label.position.set(o.x + 0.5, h + 1.5, o.y + 0.5)
      }
      for (const [id, e] of otherSprites) if (!seen.has(id)) { scene.remove(e.body, e.label, e.shadow); otherSprites.delete(id) }


      // the collapsing island
      const u = built.uniforms
      u.uTime.value = now / 1000
      u.uCut.value = elapsed === null ? 999 : collapseRadius(elapsedSec)
      u.uWarn.value = elapsed !== null && elapsedSec % 15 > 8 ? 1 : 0

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', resize)
      propsRef.current.handleRef.current = null
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [props.world, props.built])

  const setDir = (d: Dir | null) => {
    dpadRef.current = d
    if (d !== null) tapRef.current = d
  }
  const s = props.settings
  return (
    <>
      <div ref={mountRef} className="game-mount" />
      {s.showDpad && (
        <div className={`dpad ${s.dpadSide}`} onContextMenu={(e) => e.preventDefault()}>
          {([['up', 3], ['left', 1], ['right', 2], ['down', 0]] as const).map(([name, d]) => (
            <button
              key={name}
              className={`dpad-${name}`}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDir(d as Dir) }}
              onPointerUp={() => setDir(null)}
              onPointerCancel={() => setDir(null)}
              onLostPointerCapture={() => setDir(null)}
              aria-label={name}
            >
              {name === 'up' ? '▲' : name === 'down' ? '▼' : name === 'left' ? '◀' : '▶'}
            </button>
          ))}
        </div>
      )}
      {s.showDpad && (
        <div className={`abpad ${s.dpadSide === 'left' ? 'right' : 'left'}`} onContextMenu={(e) => e.preventDefault()}>
          <button onPointerDown={() => actionRef.current()} aria-label="A">A</button>
          <button onPointerDown={() => { bRef.current = true }} onPointerUp={() => { bRef.current = false }} onPointerCancel={() => { bRef.current = false }} onPointerLeave={() => { bRef.current = false }} aria-label="B">B</button>
        </div>
      )}
    </>
  )
}
