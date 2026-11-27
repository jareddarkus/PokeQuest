import { useEffect, useRef } from 'react'
import { isKey, roam } from './keys'
import { loadAlertBubble } from '../rom/grassFx'
import { hardEdges } from '../rom/anim'
import * as THREE from 'three'
import type { BuiltWorld } from '../rom/chunkWorld'
import { drawCharacter, lookSprite, randomLook, type Look } from './character'
import { SWIM_SPRITES, hasOw, owBall, owEmote, owFrame } from './ow'
import { CENTER_MODEL, GYM_MODELS } from '../rom/buildings'
import { addNoGrass, animatedTextures, applyClip } from '../rom/mapModel'
import { valueAt } from '../rom/texanim'
import { safeTileFor, type GameEvents, type GameHandle, type OtherPlayer } from './GameView'
import { hash2 } from './rng'
import { dexNum } from '../data/dex'
import { MAX_ROM_DEX } from '../rom/sprites'
import { loadFollowerPicture, romIconUrl } from '../rom/store'
import { loadPmdStrip } from '../rom/pmdFollower'
import { FOLLOWER_FILE } from '../data/followerMap'
import { getAnim, warmAnim } from '../ui/AnimSprite'
import { pixelDom } from '../ui/MonSprite'
import type { AnimatedSprite } from '../rom/anim'
import type { Settings } from './settings'
import { loadGrassTuft, loadGrassSway, loadShadowPicture, type GrassSway } from '../rom/grassFx'
import {
  DX, DY, SIZE, T, TYPE_COLOR, collapseRadius, connectRings, collapseWarn, dist, inBounds, isWalkable, tileAt, type Dir, type NpcSpec, type World,
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
  /** the first Pokémon of your team walks behind you */
  follower?: { species: string; shiny: boolean } | null
  /** trainers that other players are fighting right now: character id -> name of the player (they stand still and a Poké Ball spins above both) */
  busy?: () => Map<string, string>
  /** an eliminated player: where the camera looks (a player to watch); null = your own place */
  spectate?: () => { x: number; y: number } | null
  /** names of the players that are in a battle right now (a Poké Ball spins above them) */
  fighting?: () => Set<string>
  /** the colour of a player's name (the label above the head) */
  nameColor?: (name: string) => string
  /** false when all your Pokémon have fainted: trainers do not challenge you then, so you can still walk (to find a Revive) */
  canBattle?: boolean
  /** true while this trainer must leave you alone (you just woke up at a Center, or this trainer has just beaten you) */
  noChallenge?: (npcId: string) => boolean
}

const WALK_SECONDS = 16 / 60 // one tile = 16 pictures at 60 a second when walking (like the DS games)
const RUN_SECONDS = 8 / 60 // ... and 8 when running (hold B = the down arrow, or Shift)
const TURN_SECONDS = 0.1 // turning on the spot before the first step
// The camera of the overworld: it looks at the player from the south, tilted down (tuned by eye to match White 2).
const CAM_PITCH = 60 * (Math.PI / 180) // measured on screenshots of the real game (tiles look about 0.87 as tall as wide)
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

/**
 * The shadow under a character, a Pokémon or a ball on the ground: the game's own one. It is a 16 x 16 pixel picture with a 14 x 9 pixel ellipse (dark grey) on a flat square
 * that is one tile wide, drawn see-through (alpha 19 / 31) with hard pixels. Until the game file's picture is loaded the same ellipse is drawn by hand.
 */
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const SHADOW_ROWS = ['.....++++++.....', '...++++++++++...', '..++++++++++++..', '.++++++++++++++.', '.++++++++++++++.', '.++++++++++++++.', '..++++++++++++..', '...++++++++++...', '.....++++++.....']
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(66,66,66)'
  SHADOW_ROWS.forEach((r, y) => { for (let x = 0; x < 16; x++) if (r[x] === '+') g.fillRect(x, y + 4, 1, 1) })
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
  return t
})()
let shadowLoading = false
function makeShadow(scene: THREE.Scene, size = 1): THREE.Mesh {
  if (!shadowLoading) {
    shadowLoading = true
    void loadShadowPicture().then((c) => { if (c) { shadowTex.image = c; shadowTex.needsUpdate = true } })
  }
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, alphaTest: 0.5, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
  m.scale.set(size, 1, size)
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
const PUSH = 1.4
/** a character standing in tall grass is not pushed forward: the leaves in front of it really cover its lower body (depth), like in the game */
const TALL_PUSH = import.meta.env.DEV && new URLSearchParams(location.search).has('tp') ? Number(new URLSearchParams(location.search).get('tp')) : 0.1
const _v = new THREE.Vector3()
function place(sp: THREE.Sprite, camera: THREE.Camera, x: number, y: number, z: number, push = PUSH) {
  _v.set(x, y, z)
  const toCam = camera.position.clone().sub(_v)
  const dist = toCam.length()
  const d = Math.min(push, dist * 0.4)
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

function nameTexture(text: string, color = '#fff'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 48
  const ctx = c.getContext('2d')!
  ctx.font = '400 24px Lexend, system-ui, sans-serif'
  const w = Math.min(250, ctx.measureText(text).width + 22)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(128 - w / 2, 6, w, 36)
  ctx.fillStyle = color
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
    // the sea under the island (what is left when a ring sinks): the game's own water picture, drifting slowly, repeated every 4 tiles
    const seaTex = built.textureNamed('sea_mizu1', true)
    if (seaTex) seaTex.repeat.set(150, 150)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: seaTex ? 0xffffff : '#3a7fc0', map: seaTex ?? undefined }))
    sea.position.set(SIZE / 2, built.waterY - 0.03, SIZE / 2)
    scene.add(sea)
    // the shore: the game's own shore picture (sea_zanami, 1 x 4 tiles: white foam at the land side, fading into the blue of the sea) laid along the edge of the island, as a
    // ring of four strips that follows the edge while the island sinks
    const foamTex = built.textureNamed('sea_zanami', true)
    const FOAM_W = 4
    const foamPos = new Float32Array(4 * 4 * 3), foamUv = new Float32Array(4 * 4 * 2)
    const foamGeo = new THREE.BufferGeometry()
    foamGeo.setAttribute('position', new THREE.BufferAttribute(foamPos, 3))
    foamGeo.setAttribute('uv', new THREE.BufferAttribute(foamUv, 2))
    foamGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15])
    const foam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ map: foamTex ?? undefined, color: foamTex ? 0xffffff : 0xdff4ff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }))
    foam.frustumCulled = false; foam.renderOrder = 1
    scene.add(foam)
    const setFoam = (r: number): void => {
      const e = r - 1.0, o = e + FOAM_W, y = built.waterY + 0.015, cc = SIZE / 2
      // [x0, z0, x1, z1, x2, z2, x3, z3] of every strip: inner edge (x0,z0)-(x1,z1), outer edge (x2,z2)-(x3,z3); u runs along the strip, v from the land (0) outwards (1)
      const strips = [
        [cc - o, cc - e, cc + o, cc - e, cc + o, cc - o, cc - o, cc - o], // north
        [cc - o, cc + e, cc + o, cc + e, cc + o, cc + o, cc - o, cc + o], // south
        [cc - e, cc - o, cc - e, cc + o, cc - o, cc + o, cc - o, cc - o], // west (inner edge is x = cc - e)
        [cc + e, cc - o, cc + e, cc + o, cc + o, cc + o, cc + o, cc - o], // east
      ]
      strips.forEach((q, s) => {
        for (let k = 0; k < 4; k++) {
          foamPos.set([q[k * 2], y, q[k * 2 + 1]], (s * 4 + k) * 3)
          const along = s < 2 ? q[k * 2] : q[k * 2 + 1] // (north / south: along x; west / east: along z)
          foamUv.set([along, k < 2 ? 0 : 1], (s * 4 + k) * 2)
        }
      })
      foamGeo.attributes.position.needsUpdate = true; foamGeo.attributes.uv.needsUpdate = true
    }
    setFoam(79)

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
    let gymNo = 0
    const gymParts: Array<{ x: number; y: number; things: THREE.Object3D[] }> = [] // (a gym goes into the sea together with its ring: building and sign disappear)
    world.gyms.forEach((g) => {
      const spec = g.center ? CENTER_MODEL : GYM_MODELS[gymNo++ % GYM_MODELS.length]
      const b = g.custom ? null : built.makeBuilding(spec.pack, spec.model) // (a gym made in the editor has the building the owner placed)
      const gy = heightAt(g.x + 0.5, g.y + 0.5)
      if (b) {
        // the front of the building (its door side, towards the south) ends at the south edge of the door tile
        const box = new THREE.Box3().setFromObject(b.obj)
        b.obj.position.set(g.x + 0.5 - (box.min.x + box.max.x) / 2, gy, g.y + 1 - box.max.z)
        scene.add(b.obj)
        gymParts.push({ x: g.x, y: g.y, things: [b.obj] })
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
      const mat = new THREE.SpriteMaterial({ map: labelTexture(g.center ? 'POKÉMON CENTER' : `${g.type.toUpperCase()} GYM`, g.center ? '#e8505b' : TYPE_COLOR[g.type]), transparent: false })
      const s = new THREE.Sprite(mat)
      s.center.set(0.5, 0)
      s.scale.set(3, 0.75, 1)
      s.position.set(g.x + 0.5, gy + 2.35, g.y + 0.5) // (right above the entrance, not lying on the ground in front of it)
      scene.add(s)
      const part = gymParts.find((q) => q.x === g.x && q.y === g.y)
      if (part) part.things.push(s); else gymParts.push({ x: g.x, y: g.y, things: [s] })
    })

    // the gym buildings just closed some tiles: open the ways again so that every ring can still be walked all the way round (a sand path over the map)
    if (built.pathMask) { // every path is walkable: a path tile that is a tree, a rock or water (outside the gym buildings) is ground
      const pm = built.pathMask
      for (let i = 0; i < SIZE * SIZE; i++) if (pm[i] && (world.tiles[i] === T.Tree || world.tiles[i] === T.Water)) world.tiles[i] = T.Grass
    }
    if (world.carved) {
      const more = connectRings(world.tiles)
      if (more.length) {
        world.carved.push(...more); addNoGrass(more)
        const mat = new THREE.MeshBasicMaterial({ color: 0xe0cc8a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
        applyClip(mat, built.uniforms)
        const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, more.length)
        const m4 = new THREE.Matrix4()
        more.forEach((i, k) => { m4.makeTranslation((i % SIZE) + 0.5, built.height[i] + 0.03, ((i / SIZE) | 0) + 0.5); im.setMatrixAt(k, m4) })
        im.frustumCulled = false
        scene.add(im)
      }
    }

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
    const pickupShadows = new Map<string, THREE.Mesh>()
    for (const pk of world.pickups) {
      const s = new THREE.Sprite(ballMat)
      s.center.set(0.5, 0.1)
      const bs = ballImg ? ballImg.width / 16 : 0.5 // the picture is drawn at its real size: 16 pixels = one tile
      s.scale.set(bs, bs, 1)
      s.renderOrder = 3
      s.position.set(pk.x + 0.5, heightAt(pk.x + 0.5, pk.y + 0.5) + 0.05, pk.y + 0.5)
      scene.add(s)
      const psh = makeShadow(scene, 1.0) // the ball on the ground has a little shadow under it (a little towards the camera so it shows under the ball)
      psh.position.set(pk.x + 0.5, heightAt(pk.x + 0.5, pk.y + 0.5) + 0.04, pk.y + 0.62)
      pickupShadows.set(pk.id, psh)
      s.userData = { tx: pk.x, ty: pk.y, bs, sand: world.tiles[pk.y * SIZE + pk.x] === T.Sand }
      pickupSprites.set(pk.id, s)
    }

    const me = {
      x: propsRef.current.startTile.x, y: propsRef.current.startTile.y, fromX: 0, fromY: 0, t: 1, dir: 0 as Dir, step: 0,
      stepSec: WALK_SECONDS, run: false, idle: 1, turn: 0, cycle: 0, thrown: false,
    }
    me.fromX = me.x
    me.fromY = me.y
    // the little smoke of a landing after the sea has thrown you onto safe ground: a few round puffs that grow, rise and fade (drawn by hand in the game's hard-pixel style)
    const puffTex = (() => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 16
      const g = c.getContext('2d')!
      for (const [cx, cy, r, col] of [[8, 8, 7, '#b4b8c0'], [8, 8, 6, '#dfe2e8'], [6, 7, 3, '#f6f7fa']] as Array<[number, number, number, string]>) { g.fillStyle = col; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r) g.fillRect(x, y, 1, 1) }
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const puffs: Array<{ sp: THREE.Sprite; t0: number; vx: number; vy: number; x: number; y: number; z: number }> = []
    const spawnPuff = (tx: number, ty: number, now: number) => {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + Math.random() * 0.5
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthTest: false, depthWrite: false }))
        sp.renderOrder = 999
        scene.add(sp)
        puffs.push({ sp, t0: now, vx: Math.cos(a) * (0.9 + Math.random() * 0.6), vy: 0.5 + Math.random() * 0.7, x: tx + 0.5, y: 0.15, z: ty + 0.5 + Math.sin(a) * 0.1 })
      }
    }
    const mySprite = new THREE.Sprite(charMaterial(propsRef.current.look, 0, 0))
    fit(mySprite)
    scene.add(mySprite)
    const myShadow = makeShadow(scene)
    // the game's own grass effect ("kusaeff", model ee_kusa): a tuft of leaves lying a little above the ground at the character's feet. It bursts (four pictures) when
    // you step into grass and then stays as the last picture while you are in the grass; it is a real flat picture in the world, so it covers the legs by depth.
    let tuftTex: THREE.CanvasTexture[] | null = null
    void loadGrassTuft().then((frames) => {
      if (!frames) return
      tuftTex = frames.map((c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t })
    })
    let tuftSway: GrassSway | null = null
    void loadGrassSway().then((sw) => { tuftSway = sw })
    const tuftGeo = new THREE.BufferGeometry() // the corners of the game's model (16 units = 1 tile): a little slanted, just above the ground at the legs
    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0.05, 0.7, 1, 0.05, 0.7, 1, 0.2, -0.3, -1, 0.2, -0.3], 3)) // (the picture is 32 x 32: one picture pixel = one pixel of the map, so it is two tiles wide)
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
    tuftGeo.setIndex([0, 1, 2, 0, 2, 3])
    const makeCover = () => {
      const m = new THREE.Mesh(tuftGeo.clone(), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1, depthWrite: false, depthTest: false, side: THREE.DoubleSide })) // (drawn right over its character)
      m.visible = false; m.renderOrder = 2.5; m.frustumCulled = false; scene.add(m)
      return m
    }
    /** Characters are drawn south (nearer the camera) over north, always: the order follows the ground position. */
    const order = (sp: THREE.Sprite, z: number) => { sp.renderOrder = 3 + z * 0.001 }
    const cover = (m: THREE.Mesh, on: boolean, x: number, ground: number, z: number, _wide = 1.0, age = 1e9) => {
      m.visible = on && !!tuftTex
      if (!m.visible) return
      const t = tuftTex![Math.max(0, Math.min(3, Math.floor(age / 100)))]
      const mat = m.material as THREE.MeshBasicMaterial
      if (mat.map !== t) { mat.map = t; mat.needsUpdate = true }
      // the game's sway: the picture slides left / right and up / down for 45 frames of 1/30 s, then rests on its last position
      const sw = tuftSway, wi = sw ? Math.max(0, Math.min(sw.frames - 1, Math.floor(age / (1000 / 30)))) : 0
      const du = sw ? -sw.s[wi] : 0, dv = sw ? sw.t[wi] : 0
      const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute
      if (uv.getX(0) !== du || uv.getY(0) !== 1 + dv) { uv.array.set([du, 1 + dv, 1 + du, 1 + dv, 1 + du, dv, du, dv]); uv.needsUpdate = true }
      m.position.set(x, ground, z)
      m.renderOrder = 3 + z * 0.001 + 0.0005 // right over its own character, under the characters further south
    }
    const myCover = makeCover(), folCover = makeCover()
    if (import.meta.env.DEV) (globalThis as { __pqCover?: THREE.Mesh }).__pqCover = myCover // developer hook
    // the burst of the grass effect plays every time a character comes onto a tile of tall grass (the tile of its drawn position changes)
    const grassState = new Map<string, { tile: string; at: number }>()
    const grassFrame = (key: string, x: number, y: number, now: number): number => { // (returns the age of the effect in milliseconds)
      const tx = Math.round(x), ty = Math.round(y)
      const tile = `${tx},${ty}`
      let g = grassState.get(key)
      if (!g) { g = { tile, at: 0 }; grassState.set(key, g) }
      if (g.tile !== tile) { g.tile = tile; g.at = tileAt(world, tx, ty) === T.Tall ? now : 0 }
      let age = g.at ? now - g.at : 1e9
      if (import.meta.env.DEV && key === 'me') { // developer tools: window.__pqGrassAge holds the effect at an age (ms) for screenshots, and a log shows when it restarts
        const w = globalThis as { __pqGrassAge?: number | null; __pqGrassLog?: Array<[number, string]> }
        if (typeof w.__pqGrassAge === 'number') age = w.__pqGrassAge
        const log = (w.__pqGrassLog ??= [])
        if (g.at && (!log.length || log[log.length - 1][0] !== Math.round(g.at))) log.push([Math.round(g.at), tile])
      }
      return age
    }
    const npcCovers = new Map<NpcRuntime, THREE.Mesh>()
    const otherCovers = new Map<string, THREE.Mesh>()
    const tallAt = (tx: number, ty: number) => tileAt(world, Math.round(tx), Math.round(ty)) === T.Tall
    const npcShadows = new Map<NpcRuntime, THREE.Mesh>()

    // the follower: the first Pokémon of the team walks one tile behind you (it steps onto the tile you just left).
    // From the game file: the Pokémon's own animation, drawn on a small canvas. Newer Pokémon: Showdown's pixel picture as a page element.
    const fol = {
      x: me.x, y: me.y, fromX: me.x, fromY: me.y, t: 1, stepSec: WALK_SECONDS, key: '', mode: 'none' as 'none' | 'rom' | 'dom' | 'ow', dir: 1, strip: null as CanvasImageSource | null, owCanvas: document.createElement('canvas'), owTex: null as THREE.CanvasTexture | null,
      sprite: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.1, depthWrite: false })), shadow: makeShadow(scene, 0.8),
      anim: null as AnimatedSprite | null, canvas: document.createElement('canvas'), tex: null as THREE.CanvasTexture | null,
      dom: null as { wrap: HTMLElement; w: number; h: number } | null,
    }
    /** The follower never stands on the same tile as you: it takes a free tile beside you (or behind you when that is blocked). */
    const followerSpot = (x: number, y: number, dir: Dir): { x: number; y: number } => {
      const opposite = [3, 2, 1, 0][dir] as Dir
      // beside you first (a picture right behind you would stand in front of your back on screen), then behind, then in front
      const sides: Dir[] = dir === 0 || dir === 3 ? [1, 2] : [0, 3]
      for (const d of [...sides, opposite, dir]) {
        const nx = x + DX[d], ny = y + DY[d]
        if (isWalkable(world, nx, ny) && !world.pickups.some((q) => q.x === nx && q.y === ny)) return { x: nx, y: ny }
      }
      return { x, y }
    }
    { const f0 = followerSpot(me.x, me.y, me.dir); fol.x = f0.x; fol.y = f0.y; fol.fromX = f0.x; fol.fromY = f0.y; fol.t = 1 }
    fol.canvas.width = 96; fol.canvas.height = 96
    fol.owCanvas.width = 32; fol.owCanvas.height = 32
    let folCw = 32, folCh = 32 // size of one picture of the follower's strip
    fol.sprite.visible = false
    fol.sprite.renderOrder = 3
    scene.add(fol.sprite)
    const clearFollower = () => {
      fol.mode = 'none'; fol.anim = null; fol.strip = null; fol.sprite.visible = false
      if (fol.dom) { fol.dom.wrap.remove(); fol.dom = null }
    }
    const loadFollower = (species: string, shiny: boolean) => {
      const key = `${species}|${shiny}`
      clearFollower()
      fol.key = key
      const dx = dexNum(species)
      // the walking Pokémon picture of the game (the real "follower" look); a Pokémon without one shows its menu icon
      const setupOw = (strip: CanvasImageSource, cw = 32, ch = 32) => {
        folCw = cw; folCh = ch
        fol.owCanvas.width = cw; fol.owCanvas.height = ch
        const probe = document.createElement('canvas')
        probe.width = cw; probe.height = ch
        const pc = probe.getContext('2d')!
        pc.drawImage(strip, 2 * cw, 0, cw, ch, 0, 0, cw, ch) // the standing-down picture: where are the feet?
        const d = pc.getImageData(0, 0, cw, ch).data
        let bottom = ch - 1
        for (let y = ch - 1; y >= 0; y--) { let any = false; for (let x = 0; x < cw && !any; x++) any = d[(y * cw + x) * 4 + 3] > 0; if (any) { bottom = y; break } }
        fol.strip = strip
        if (fol.owTex) fol.owTex.dispose()
        fol.owTex = new THREE.CanvasTexture(fol.owCanvas)
        fol.owTex.magFilter = THREE.NearestFilter; fol.owTex.minFilter = THREE.NearestFilter; fol.owTex.colorSpace = THREE.SRGBColorSpace
        fol.sprite.material.map = fol.owTex
        fol.sprite.material.needsUpdate = true
        fol.sprite.center.set(0.5, 1 - (bottom + 1) / ch)
        fol.mode = 'ow'
      }
      const romFallback = () => {
        void warmAnim(species, false, shiny).then(() => {
          if (fol.key !== key) return
          const a = getAnim(species, false, shiny)
          if (!a) return
          fol.anim = a.sprite
          fol.sprite.center.set(0.5, a.gap / 96)
          fol.tex = new THREE.CanvasTexture(fol.canvas)
          fol.tex.magFilter = THREE.NearestFilter; fol.tex.minFilter = THREE.NearestFilter; fol.tex.colorSpace = THREE.SRGBColorSpace
          fol.sprite.material.map = fol.tex
          fol.sprite.material.needsUpdate = true
          fol.mode = 'rom'
        })
      }
      const showDom = () => { // last resort (no walking picture found): the still pixel picture
        const px = pixelDom(species, shiny)
        const wrap = document.createElement('div')
        wrap.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:2;transform-origin:50% 100%;width:${px.w}px;height:${px.h}px;will-change:transform`
        wrap.appendChild(px.el)
        mount.appendChild(wrap)
        fol.dom = { wrap, w: px.w, h: px.h }
        fol.mode = 'dom'
      }
      // 1) the game file's own walking picture; 2) a pixel-art walking picture (every other Pokémon, any generation); 3) the menu icon / the still picture
      void (async () => {
        let strip: CanvasImageSource | null = null
        let cw = 32, ch = 32
        if (dx > 0 && dx <= MAX_ROM_DEX) { const file = FOLLOWER_FILE[dx]; if (file) strip = await loadFollowerPicture(file) }
        if (!strip && dx > 0) {
          const pmd = await loadPmdStrip(dx)
          if (pmd) { strip = pmd; cw = pmd.width / 8; ch = pmd.height }
        }
        if (!strip && dx > 0 && dx <= MAX_ROM_DEX) { // no walking picture at all: the game's own menu icon (the same picture for every direction)
          const url = await romIconUrl(dx)
          if (url) {
            const img = new Image()
            await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
            if (img.naturalWidth) {
              const c = document.createElement('canvas')
              c.width = 32 * 8; c.height = 32
              const cx = c.getContext('2d')!
              cx.imageSmoothingEnabled = false
              for (let i = 0; i < 8; i++) cx.drawImage(img, 0, 0, 32, 32, i * 32, 0, 32, 32)
              strip = c
            }
          }
        }
        if (fol.key !== key) return
        if (strip) setupOw(strip, cw, ch)
        else if (dx > 0 && dx <= MAX_ROM_DEX) romFallback()
        else showDom()
      })()
    }

    // The "!" of a trainer that has seen you: the game's own picture (field effect file 50 of a/0/7/4): a quad one tile wide and tall, its bottom 22/16 tiles over the feet,
    // it hops for 7 frames (6, 10, 12, 12, 10, 6, 0 sixteenths of a tile) and stays 30 more; the frames of that effect are 1/30 s. Until it is loaded the round emote is used.
    let alert: { n: NpcRuntime; t: number } | null = null
    let bubble: THREE.Sprite | null = null
    let realBubble = false
    const ALERT_FRAME = 1 / 30
    const ALERT_HOP = [6, 10, 12, 12, 10, 6, 0].map((h) => h / 16)
    const ALERT_FRAMES = 37
    const nearestTex = (t: THREE.Texture) => { t.needsUpdate = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t }
    {
      const em = owEmote(15)
      bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: em ? nearestTex(new THREE.Texture(em)) : null, transparent: true, alphaTest: 0.1, depthTest: false }))
      bubble.scale.set(1.3, 1.3, 1)
      bubble.center.set(0.5, 0)
      bubble.renderOrder = 10
      bubble.visible = false
      scene.add(bubble)
      void loadAlertBubble().then((c) => {
        if (!c || !bubble) return
        const m = bubble.material as THREE.SpriteMaterial
        m.map = nearestTex(new THREE.CanvasTexture(c)); m.needsUpdate = true
        bubble.scale.set(1, 1, 1)
        realBubble = true
      })
    }

    // reactions: the game's emote pictures above a head (yours and the other players')
    const emoteTex = new Map<number, THREE.Texture>()
    const emoteBubbles = new Map<string, { sp: THREE.Sprite; until: number }>()
    const emoteFor = (idx: number): THREE.Texture | null => {
      const hit = emoteTex.get(idx)
      if (hit) return hit
      const img = owEmote(idx)
      if (!img) return null
      const t = new THREE.Texture(img); t.needsUpdate = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
      emoteTex.set(idx, t)
      return t
    }
    const showEmote = (id: string | null, idx: number) => {
      const tex = emoteFor(idx)
      if (!tex) return
      const key = id ?? ' me'
      let b = emoteBubbles.get(key)
      if (!b) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1, depthTest: false }))
        sp.scale.set(1.3, 1.3, 1); sp.center.set(0.5, 0); sp.renderOrder = 11
        scene.add(sp)
        b = { sp, until: 0 }
        emoteBubbles.set(key, b)
      }
      ;(b.sp.material as THREE.SpriteMaterial).map = tex
      b.sp.material.needsUpdate = true
      b.until = performance.now() + 2200
    }
    // clicking a player (a click, not a drag): who is under the mouse? (yours = null)
    let downAt: { x: number; y: number } | null = null
    const onCanvasDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
    const onCanvasUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || !propsRef.current.events.onPlayerClick) { downAt = null; return }
      downAt = null
      const rect = renderer.domElement.getBoundingClientRect()
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      const toScreen = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height } }
      const hit = (fx: number, fy: number, fz: number): boolean => {
        const feet = toScreen(fx, fy, fz), head = toScreen(fx, fy + 1.7, fz), side = toScreen(fx + 0.6, fy, fz)
        const r = Math.max(10, Math.abs(side.x - feet.x))
        return Math.abs(px - feet.x) < r && py >= head.y - 4 && py <= feet.y + 4
      }
      const o = propsRef.current.others()
      let best: { name: string | null; z: number } | null = null
      for (const q of o) { if (hit(q.x + 0.5, heightAt(q.x + 0.5, q.y + 0.5), q.y + 0.5) && (!best || q.y > best.z)) best = { name: q.name, z: q.y } }
      const mx = me.fromX + (me.x - me.fromX) * me.t, my = me.fromY + (me.y - me.fromY) * me.t
      if (hit(mx + 0.5, heightAt(mx + 0.5, my + 0.5), my + 0.5) && (!best || my >= best.z)) best = { name: null, z: my }
      if (best) propsRef.current.events.onPlayerClick(best.name, e.clientX, e.clientY)
    }
    renderer.domElement.addEventListener('pointerdown', onCanvasDown)
    renderer.domElement.addEventListener('pointerup', onCanvasUp)

    const removed = new Set<string>()
    // items lying on the ground are in the way: characters walking around never step on them
    const pickupAt = (x: number, y: number) => world.pickups.some((q) => q.x === x && q.y === y && !removed.has(q.id))
    const npcs: NpcRuntime[] = world.npcs.map((s) => {
      const look = randomLook(s.look, true) // NPC trainers only look like ordinary trainer-type characters
      if (s.swim) { const sw = SWIM_SPRITES.filter((i) => hasOw(i)); if (sw.length) look.sprite = sw[s.look % sw.length] }
      const sp = new THREE.Sprite(charMaterial(look, s.dir, 0))
      fit(sp)
      scene.add(sp)
      return { spec: s, x: s.x, y: s.y, fx: s.x, fy: s.y, dir: s.dir, moving: 0, fromX: s.x, fromY: s.y, timer: 1 + hash2(s.x, s.y, 3) * 3, defeated: false, frozen: false, look, sprite: sp, stp: 0 }
    })
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pq = { npcs, me, world, built, rayDown: (x: number, y: number, z: number) => { const maps = built.group.children.filter((c) => !c.userData.building); const rc = new THREE.Raycaster(); rc.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)); return rc.intersectObjects(maps, true).slice(0, 5).map((h) => [(h.object as THREE.Mesh).material instanceof THREE.Material ? ((h.object as THREE.Mesh).material as THREE.Material).name : '?', +h.point.y.toFixed(2)]) }, group: built.group, overlap: () => { const maps = built.group.children.filter((c) => !c.userData.building); const rc = new THREE.Raycaster(); return built.group.children.filter((c) => c.userData.building).map((c) => { const b = c.userData.building; rc.set(new THREE.Vector3(b.x, b.y + 4, b.z), new THREE.Vector3(0, -1, 0)); const hits = rc.intersectObjects(maps, true); return { m: b.model, pack: b.pack, x: b.x, z: b.z, y: b.y, top: hits.length ? +hits[0].point.y.toFixed(2) : null } }) }, pick: (nx: number, ny: number) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera); return rc.intersectObjects(built.group.children, true).slice(0, 4).map((h) => (h.object as THREE.Mesh).material as THREE.Material).map((m) => m.name) } } // developer test hook
    const otherSprites = new Map<string, { body: THREE.Sprite; label: THREE.Sprite; shadow: THREE.Mesh }>()
    let busyMap = new Map<string, string>() // trainers other players are fighting (refreshed every frame)
    const busyBalls = new Map<string, THREE.Sprite>() // the spinning Poké Balls above the fighters
    let specCam: { x: number; y: number } | null = null // (where the camera is while you watch somebody else)
    const busyMoved = new Set<string>() // trainers that were put next to the player who fights them
    const busyMat = ballMaterial()
    let paused = false
    const held = new Set<string>()

    const handle: GameHandle = {
      teleport: (x, y) => { alert = null; if (bubble) bubble.visible = false; /* (a "!" that was on its way ends with the jump) */ me.x = x; me.y = y; me.fromX = x; me.fromY = y; me.t = 1; const f1 = followerSpot(x, y, me.dir); fol.x = f1.x; fol.y = f1.y; fol.fromX = f1.x; fol.fromY = f1.y; fol.t = 1 },
      getPos: () => ({ x: me.x, y: me.y, dir: me.dir }),
      showEmote,
      screenOf: (npc, tx, ty) => {
        let wx: number, wy: number, wz: number
        if (npc) { const n = npcs.find((q) => q.spec.id === npc); if (!n) return null; wx = n.fx + 0.5; wz = n.fy + 0.5; wy = heightAt(wx, wz) + 1.9 }
        else { wx = (tx ?? 0) + 0.5; wz = (ty ?? 0) + 0.5; wy = heightAt(wx, wz) + 2.2 }
        const v = new THREE.Vector3(wx, wy, wz).project(camera)
        if (v.z > 1) return null
        const rect = renderer.domElement.getBoundingClientRect()
        return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top }
      },
      removePickup: (id) => { removed.add(id); const s = pickupSprites.get(id); if (s) s.visible = false; const h = pickupShadows.get(id); if (h) h.visible = false },
      defeatNpc: (id) => { const n = npcs.find((q) => q.spec.id === id); if (n) n.defeated = true },
      setPaused: (p) => { paused = p },
      setNpcFreeze: (id) => { for (const n of npcs) n.frozen = id !== null && n.spec.id === id },
    }
    propsRef.current.handleRef.current = handle

    // The keys come from game/keys.ts (every player can change them): by default W A S D walk; the arrows are the buttons of the game: right = A (talk / pick up), down = B (hold to run), up = X (menu).
    const keyDir = (k: string): Dir | null => {
      if (isKey('up', k)) return 3
      if (isKey('down', k)) return 0
      if (isKey('left', k)) return 1
      if (isKey('right', k)) return 2
      return null
    }
    const doAction = () => { // button A: use whatever is right in front of you (an item on the ground)
      if (me.t < 1 || paused || propsRef.current.paused) return
      const pk = world.pickups.find((q) => q.x === me.x + DX[me.dir] && q.y === me.y + DY[me.dir] && !removed.has(q.id))
      if (pk) propsRef.current.events.onPickup?.(pk.id)
      const fx = me.x + DX[me.dir], fy = me.y + DY[me.dir]
      const who = npcs.find((n) => !n.spec.swim && ((n.x === fx && n.y === fy) || (n.moving > 0 && Math.round(n.fx) === fx && Math.round(n.fy) === fy)))
      if (who && !pk) propsRef.current.events.onNpcTalk?.(who.spec.id)
    }
    actionRef.current = doAction
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (paused || propsRef.current.paused) return // (a menu / a battle / a speech has the keyboard: see ui/MenuNav.tsx)
      const k = e.key.toLowerCase()
      const kd = keyDir(k)
      if (kd !== null) { if (!held.has(k)) { held.add(k); tapRef.current = kd }; e.preventDefault(); return }
      if (isKey('b', k)) { held.add('b'); heldB.add(k); e.preventDefault(); return }
      if (isKey('a', k)) { if (!e.repeat) doAction(); e.preventDefault(); return }
      if (isKey('x', k)) { if (!e.repeat) propsRef.current.events.onMenuKey?.(); e.preventDefault(); return }
    }
    const heldB = new Set<string>() // the keys of button B that are down (it keeps the run going while any of them is)
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      heldB.delete(k)
      if (!heldB.size) held.delete('b')
      held.delete(k)
    }
    // leaving the page (another app, another tab) and coming back: a finger or key that was down when we left never reports being lifted, so forget every press
    const onBlur = () => { held.clear(); dpadRef.current = null; tapRef.current = null; bRef.current = false; downAt = null }
    const onVis = () => onBlur()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onBlur)
    window.addEventListener('pagehide', onBlur)
    window.addEventListener('pageshow', onBlur)
    document.addEventListener('visibilitychange', onVis)

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

    let lastBump = 0
    const now0 = () => performance.now()
    const tryStep = (d: Dir, elapsed: number | null) => {
      me.dir = d
      const nx = me.x + DX[d]
      const ny = me.y + DY[d]
      if (!walkableFor(world, nx, ny, elapsed) || npcAt(nx, ny) || pickupAt(nx, ny)) {
        if (tileAt(world, nx, ny) === T.GymDoor) {
          const g = world.gyms.find((q) => q.doorX === nx && q.doorY === ny)
          if (g) propsRef.current.events.onGym?.(g.id)
        } else if (now0() - lastBump > 380) { lastBump = now0(); propsRef.current.events.onBump?.() }
        return
      }
      // the follower steps onto the tile you leave (from wherever it is right now)
      fol.fromX = fol.x + (fol.fromX - fol.x) * (1 - fol.t)
      fol.fromY = fol.y + (fol.fromY - fol.y) * (1 - fol.t)
      fol.x = me.x
      fol.y = me.y
      fol.t = 0
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
      me.cycle = (me.cycle + 1) % 4
      propsRef.current.events.onMoveStart?.(nx, ny, d)
    }

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick) // first of all, so that one error in a frame can never stop the game for good
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = propsRef.current
      const elapsed = p.elapsed()
      const elapsedSec = elapsed === null ? 0 : elapsed / 1000

      if (elapsed !== null && dist(me.x, me.y) > collapseRadius(elapsedSec) && me.t >= 1) {
        const s = safeTileFor(world, me.x, me.y, elapsedSec)
        const ox = me.x, oy = me.y
        handle.teleport(s.x, s.y)
        me.fromX = ox; me.fromY = oy; me.t = 0; me.stepSec = 0.6; me.thrown = true; me.run = false // (the sea throws you: you fly over to the safe ground and land in a puff of smoke)
        p.events.onPushed?.(s.x, s.y, s.ring)
      }

      roam.free = !(paused || p.paused)
      if (paused || p.paused) { // nothing typed or pressed while a battle / menu is open may move the character afterwards
        held.clear(); tapRef.current = null; dpadRef.current = null; bRef.current = false; me.turn = 0
      }
      if (!paused && !p.paused) {
        let spill = 0 // the part of this frame that was left over after the step ended: it counts for the next step, so walking has no tiny hitch at every tile
        if (me.t < 1) {
          const raw = me.t + dt / me.stepSec
          spill = Math.max(0, raw - 1) * me.stepSec
          me.t = Math.min(1, raw)
          if (me.t >= 1) {
            if (me.thrown) { me.thrown = false; me.stepSec = WALK_SECONDS; spawnPuff(me.x, me.y, now) }
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
          const frame = Math.max(0, Math.floor((ALERT_FRAMES * ALERT_FRAME - alert.t) / ALERT_FRAME))
          const hop = realBubble ? (ALERT_HOP[frame] ?? 0) : 0
          bubble!.position.set(alert.n.fx + 0.5, heightAt(alert.n.fx + 0.5, alert.n.fy + 0.5) + (realBubble ? 22 / 16 : 1.7) + hop, alert.n.fy + 0.5)
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
            if (me.t === 0 && spill > 0) me.t = Math.min(0.9, spill / me.stepSec) // a new step began in this very frame: it starts with the time that was left over
            tapRef.current = null
          }
          if (!w.held && tapRef.current === null) me.turn = Math.min(me.turn, 0)
        }
        for (const n of npcs) {
          if (n.defeated || n.frozen || (busyMap.has(n.spec.id) && n.moving === 0) || (alert && alert.n === n && n.moving === 0)) continue
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
                const tileOk = n.spec.swim ? (inBounds(nx, ny) && world.lake[ny * SIZE + nx] === 1) : (walkableFor(world, nx, ny, elapsed) && tileAt(world, nx, ny) !== T.GymDoor) // swimmers: only lake water
                if (homeOk && tileOk && !(nx === me.x && ny === me.y) && !npcAt(nx, ny) && !pickupAt(nx, ny)) {
                  n.fromX = n.x; n.fromY = n.y; n.x = nx; n.y = ny; n.moving = 0.001; n.stp ^= 1
                }
                n.timer = b === 'run' ? 0.5 + Math.random() * 1.5 : 0.8 + Math.random() * 2.2
              }
            }
          }
          if (!n.spec.swim && (n.moving === 0 || n.moving > 0.5)) {
            for (let k = 1; k <= 4; k++) {
              const sx = n.x + DX[n.dir] * k
              const sy = n.y + DY[n.dir] * k
              if (!isWalkable(world, sx, sy) && tileAt(world, sx, sy) !== T.GymDoor) break
              if (sx === me.x && sy === me.y && me.t >= 1 && !alert && p.canBattle !== false && !p.noChallenge?.(n.spec.id) && !busyMap.has(n.spec.id)) { // (trainers leave you alone when none of your Pokémon can fight)
                if (bubble && (realBubble || owEmote(15))) { alert = { n, t: realBubble ? ALERT_FRAMES * ALERT_FRAME : 0.9 }; bubble.visible = true; p.events.onAlert?.(); break }
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
      // an eliminated player: the camera follows the player being watched (smoothly), your own character is not drawn
      const watched = p.spectate?.() ?? null
      if (watched) { if (!specCam) specCam = { x: watched.x, y: watched.y }; else { specCam.x += (watched.x - specCam.x) * 0.15; specCam.y += (watched.y - specCam.y) * 0.15 } } else specCam = null
      const cxp = specCam ? specCam.x : px, cyp = specCam ? specCam.y : py
      const chh = specCam ? heightAt(cxp + 0.5, cyp + 0.5) : ph
      mySprite.visible = !specCam; myShadow.visible = !specCam
      // the camera first (the characters are placed relative to it)
      const dst = CAM_DISTANCE / Math.max(0.3, p.settings.zoom)
      camera.position.set(cxp + 0.5, chh + Math.sin(CAM_PITCH) * dst, cyp + 0.5 + Math.cos(CAM_PITCH) * dst)
      camera.lookAt(cxp + 0.5, chh + 0.6, cyp + 0.5)
      // walking: the foot picture for the first half of a tile, standing for the second half; the foot changes with every tile
      // walking: the foot picture for the first half of a tile, standing for the second half. Running changes its picture only once per
      // tile (half as often as before): foot, upright, other foot, upright ...
      const myFrame = me.t >= 1 || me.thrown ? 0 : me.run ? [1, 0, 2, 0][me.cycle] : me.t < 0.5 ? 1 + me.step : 0
      mySprite.material = charMaterial(p.look, me.dir, myFrame, me.run && me.t < 1) // (standing still after a run: the normal standing picture)
      fit(mySprite)
      place(mySprite, camera, px + 0.5, ph + lift(mySprite) + (me.thrown ? Math.sin(Math.PI * me.t) * 1.6 : 0), py + 0.5, me.t < 1 ? (tallAt(me.t < 0.5 ? me.fromX : me.x, me.t < 0.5 ? me.fromY : me.y) ? TALL_PUSH : PUSH) : tallAt(me.x, me.y) ? TALL_PUSH : PUSH)
      order(mySprite, py + 0.5)
      cover(myCover, tallAt(px, py), px + 0.5, ph, py + 0.5, 1.0, grassFrame('me', px, py, now)) // in tall grass: the game's leaf effect at the feet (and the leaves of the tiles cover the legs)
      myShadow.position.set(px + 0.5, ph + 0.03, py + 0.5)
      for (let k = puffs.length - 1; k >= 0; k--) { // the smoke of a landing
        const f = puffs[k], age = (now - f.t0) / 520
        if (age >= 1) { scene.remove(f.sp); f.sp.material.dispose(); puffs.splice(k, 1); continue }
        const hh = heightAt(f.x, f.z)
        f.sp.position.set(f.x + f.vx * age, hh + f.y + f.vy * age, f.z)
        const s = 0.35 + age * 0.9; f.sp.scale.set(s, s, 1); f.sp.material.opacity = 1 - age * age
      }
      // the crates: on sand they sit a little in the sand; everywhere else they are pushed towards the camera (like the characters) so the ground does not cut them
      { // items and people on ground that has sunk into the sea are gone with it
        const rad = elapsed === null ? 999 : collapseRadius(elapsedSec)
        for (const [id, sp] of pickupSprites) { const u = sp.userData as { tx: number; ty: number }; const gone = removed.has(id) || dist(u.tx, u.ty) > rad; sp.visible = !gone; const h = pickupShadows.get(id); if (h) h.visible = !gone }
      }
      for (const sp of pickupSprites.values()) {
        const u = sp.userData as { tx: number; ty: number; bs: number; sand: boolean }
        if (!sp.visible || u.sand || Math.abs(u.tx - me.x) > 16 || Math.abs(u.ty - me.y) > 16) continue
        sp.scale.set(u.bs, u.bs, 1)
        place(sp, camera, u.tx + 0.5, heightAt(u.tx + 0.5, u.ty + 0.5) + 0.12, u.ty + 0.5)
      }
      // the follower (an error here must never stop the game: the follower is simply dropped)
      const fs = p.follower
      try {
      if (fs && `${fs.species}|${fs.shiny}` !== fol.key) loadFollower(fs.species, fs.shiny)
      if (!fs && fol.key) { clearFollower(); fol.key = '' }
      fol.stepSec = me.stepSec
      if (fol.t < 1) fol.t = Math.min(1, fol.t + dt / fol.stepSec)
      const folVisible = !!fs && fol.mode !== 'none'
      if (!folVisible) folCover.visible = false
      fol.shadow.visible = folVisible
      fol.sprite.visible = folVisible && (fol.mode === 'rom' || fol.mode === 'ow')
      if (folVisible) {
        const fx = fol.fromX + (fol.x - fol.fromX) * fol.t
        const fy = fol.fromY + (fol.y - fol.fromY) * fol.t
        const fh = heightAt(fx + 0.5, fy + 0.5)
        const hop = fol.t < 1 ? Math.abs(Math.sin(fol.t * Math.PI)) * 0.12 : 0
        fol.shadow.position.set(fx + 0.5, fh + 0.03, fy + 0.5)
        order(fol.sprite, fy + 0.5)
        cover(folCover, fol.sprite.visible && (fol.t < 0.5 ? tallAt(fol.fromX, fol.fromY) : tallAt(fol.x, fol.y)), fx + 0.5, fh, fy + 0.5, 1.2, grassFrame('fol', fx, fy, now))
        if (fol.mode === 'ow' && fol.strip) {
          const dxm = fol.x - fol.fromX, dym = fol.y - fol.fromY
          if (fol.t < 1 && (Math.abs(dxm) > 0.01 || Math.abs(dym) > 0.01)) fol.dir = Math.abs(dxm) > Math.abs(dym) ? (dxm > 0 ? 3 : 2) : (dym > 0 ? 1 : 0) // 0 up, 1 down, 2 left, 3 right
          const frame = fol.t < 1 ? (fol.t < 0.5 ? 0 : 1) : Math.floor(now / 500) % 2 // two pictures: they alternate while walking, and slowly while standing
          const cx = fol.owCanvas.getContext('2d')!
          cx.clearRect(0, 0, folCw, folCh)
          cx.drawImage(fol.strip, (fol.dir * 2 + frame) * folCw, 0, folCw, folCh, 0, 0, folCw, folCh)
          if (fol.owTex) fol.owTex.needsUpdate = true
          fol.sprite.scale.set(folCw / 16, folCh / 16, 1) // 16 picture pixels = 1 tile (32 = 2 tiles), like the characters
          place(fol.sprite, camera, fx + 0.5, fh + 0.2 + hop, fy + 0.5, (fol.t < 0.5 ? tallAt(fol.fromX, fol.fromY) : tallAt(fol.x, fol.y)) ? TALL_PUSH : PUSH)
        } else if (fol.mode === 'rom' && fol.anim) {
          const cx = fol.canvas.getContext('2d')!
          cx.clearRect(0, 0, 96, 96)
          fol.anim.draw(cx, (now / 1000) * 60)
          hardEdges(cx, 96, 96)
          if (fol.tex) fol.tex.needsUpdate = true
          fol.sprite.scale.set(1.9, 1.9, 1) // 96 picture pixels = 1.9 tiles
          place(fol.sprite, camera, fx + 0.5, fh + 0.05 + hop, fy + 0.5, (fol.t < 0.5 ? tallAt(fol.fromX, fol.fromY) : tallAt(fol.x, fol.y)) ? TALL_PUSH : PUSH)
        } else if (fol.mode === 'dom' && fol.dom) {
          const w = mount.clientWidth, h = mount.clientHeight
          const a = new THREE.Vector3(fx + 0.5, fh + 0.05 + hop, fy + 0.5).project(camera)
          const b = new THREE.Vector3(fx + 1.5, fh + 0.05 + hop, fy + 0.5).project(camera)
          const sx = (a.x * 0.5 + 0.5) * w, sy = (-a.y * 0.5 + 0.5) * h
          const tile = Math.abs((b.x - a.x) * 0.5 * w)
          const k = (tile * 1.9) / 96 // 96 picture pixels = 1.9 tiles, like the pictures from the game file
          fol.dom.wrap.style.transform = `translate(${sx - fol.dom.w / 2}px, ${sy - fol.dom.h}px) scale(${k})`
        }
      }
      } catch { clearFollower(); fol.key = fs ? `${fs.species}|${fs.shiny}` : ''; fol.mode = 'none' }
      if (seaTex) seaTex.offset.set((now / 14000) % 1, (now / 21000) % 1) // the sea drifts
      const fr = Math.floor(now / (1000 / 30)) // water pictures: 30 a second (a calm pace; the exact speed of the original is not known)
      for (const a of animatedTextures) a.tex.offset.set(valueAt(a.anim.moveS, fr), valueAt(a.anim.moveT, fr)) // moving water
      const sunkRad = elapsed === null ? 999 : collapseRadius(elapsedSec)
      for (const gp of gymParts) { const vis = dist(gp.x, gp.y) <= sunkRad + 3; for (const o of gp.things) o.visible = vis }
      for (const n of npcs) {
        const sunk = dist(n.fx + 0.5, n.fy + 0.5) > sunkRad // (its ground has sunk)
        n.sprite.visible = !sunk
        const frame = n.moving > 0 && n.moving < 0.5 ? 1 + n.stp : 0
        n.sprite.material = charMaterial(n.look, n.dir, frame, n.spec.behavior === 'run' && n.moving > 0)
        fit(n.sprite)
        const nh = n.spec.swim ? Math.max(heightAt(n.fx + 0.5, n.fy + 0.5), built.waterY - 0.02) : heightAt(n.fx + 0.5, n.fy + 0.5) // swimmers float on the water
        place(n.sprite, camera, n.fx + 0.5, nh + lift(n.sprite), n.fy + 0.5, !n.spec.swim && (n.moving > 0 && n.moving < 0.5 ? tallAt(n.fromX, n.fromY) : tallAt(n.x, n.y)) ? TALL_PUSH : PUSH)
        order(n.sprite, n.fy + 0.5)
        { let nc = npcCovers.get(n); if (!nc) { nc = makeCover(); npcCovers.set(n, nc) }
          cover(nc, !n.spec.swim && (n.moving > 0 && n.moving < 0.5 ? tallAt(n.fromX, n.fromY) : tallAt(n.x, n.y)), n.fx + 0.5, nh, n.fy + 0.5, 1.0, grassFrame(`npc:${n.spec.id}`, n.fx, n.fy, now)) }
        let sh = npcShadows.get(n)
        if (!sh) { sh = makeShadow(scene); npcShadows.set(n, sh) }
        sh.visible = !n.spec.swim && !sunk
        sh.position.set(n.fx + 0.5, nh + 0.03, n.fy + 0.5)
      }
      // fights between another player and a trainer: a Poké Ball spins above both of them (like PokéMMO), the trainer is busy
      busyMap = p.busy ? p.busy() : new Map()
      {
        const want = new Map<string, { x: number; y: number }>()
        const others = p.others()
        for (const [npcId, by] of busyMap) {
          const n = npcs.find((q) => q.spec.id === npcId)
          if (n) want.set(`npc:${npcId}`, { x: n.fx, y: n.fy })
          const o = others.find((q) => q.id === by)
          if (o) want.set(`pl:${by}`, { x: o.x, y: o.y })
        }
        for (const name of p.fighting?.() ?? []) { const o = others.find((q) => q.id === name); if (o) want.set(`pl:${name}`, { x: o.x, y: o.y }) }
        for (const [k, pos] of want) {
          let sp = busyBalls.get(k)
          if (!sp) { sp = new THREE.Sprite(busyMat); sp.center.set(0.5, 0); sp.renderOrder = 4; scene.add(sp); busyBalls.set(k, sp) }
          const spin = Math.cos(now / 140) // a ball turning round: its width goes 1 -> 0 -> -1 ...
          sp.scale.set(0.9 * Math.max(0.12, Math.abs(spin)), 0.9, 1)
          const bh = heightAt(pos.x + 0.5, pos.y + 0.5)
          sp.position.set(pos.x + 0.5, bh + 1.9 + Math.sin(now / 300) * 0.05, pos.y + 0.5)
        }
        for (const [k, sp] of busyBalls) if (!want.has(k)) { scene.remove(sp); busyBalls.delete(k) }
        // a trainer that another player is fighting stands next to that player on your screen too (its walk to the player is not sent over the network)
        for (const [npcId, by] of busyMap) {
          const n = npcs.find((q) => q.spec.id === npcId), o = others.find((q) => q.id === by)
          if (!n || !o || busyMoved.has(npcId)) continue
          if (Math.hypot(n.fx - o.x, n.fy - o.y) <= 1.6) { busyMoved.add(npcId); continue }
          const px = Math.round(o.x), py = Math.round(o.y)
          const dirs = [o.dir, 0, 1, 2, 3]
          for (const d of dirs) {
            const tx = px + DX[d], ty = py + DY[d]
            if (!walkableFor(world, tx, ty, null) || npcs.some((q) => q !== n && Math.round(q.fx) === tx && Math.round(q.fy) === ty) || (tx === me.x && ty === me.y)) continue
            n.x = n.fx = n.fromX = tx; n.y = n.fy = n.fromY = ty; n.moving = 0
            n.dir = [3, 2, 1, 0][d] as Dir
            busyMoved.add(npcId)
            break
          }
        }
        for (const id of [...busyMoved]) if (!busyMap.has(id)) { // the fight is over: the trainer goes back to where it stood
          busyMoved.delete(id)
          const n = npcs.find((q) => q.spec.id === id)
          if (n && !n.defeated) { n.x = n.fx = n.fromX = n.spec.x; n.y = n.fy = n.fromY = n.spec.y; n.moving = 0 }
        }
      }
      // other players (named, never yourself)
      const seen = new Set<string>()
      for (const o of p.others()) {
        seen.add(o.id)
        let e = otherSprites.get(o.id)
        if (!e) {
          const body = new THREE.Sprite(charMaterial(o.look, o.dir, 0))
          fit(body)
          const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(o.name, p.nameColor?.(o.name)), transparent: true, depthWrite: false, depthTest: false })) // (never hidden behind the character, a tree or a building)
          label.renderOrder = 12
          label.center.set(0.5, 0)
          label.scale.set(2.4, 0.45, 1)
          scene.add(body, label)
          e = { body, label, shadow: makeShadow(scene) }
          otherSprites.set(o.id, e)
        }
        e.body.material = charMaterial(o.look, o.dir, o.moving ? (Math.floor(now / 133) % 2 ? 0 : 1 + (Math.floor(now / 266) % 2)) : 0)
        fit(e.body)
        const h = heightAt(o.x + 0.5, o.y + 0.5)
        place(e.body, camera, o.x + 0.5, h + lift(e.body), o.y + 0.5, tallAt(o.x, o.y) ? TALL_PUSH : PUSH)
        order(e.body, o.y + 0.5)
        { let oc = otherCovers.get(o.id); if (!oc) { oc = makeCover(); otherCovers.set(o.id, oc) }
          cover(oc, tallAt(o.x, o.y), o.x + 0.5, h, o.y + 0.5, 1.0, grassFrame(`pl:${o.id}`, o.x, o.y, now)) }
        e.shadow.position.set(o.x + 0.5, h + 0.03, o.y + 0.5)
        e.label.position.set(o.x + 0.5, h + 2.3, o.y + 0.5)
      }
      for (const [id, e] of otherSprites) if (!seen.has(id)) { scene.remove(e.body, e.label, e.shadow); otherSprites.delete(id); const oc = otherCovers.get(id); if (oc) { scene.remove(oc); otherCovers.delete(id) } }


      // reaction bubbles above heads
      for (const [k, b] of emoteBubbles) {
        const t = performance.now()
        if (t > b.until) { b.sp.visible = false; continue }
        b.sp.visible = true
        let ex = 0, ey = 0
        if (k === ' me') { ex = px; ey = py } else { const q = p.others().find((z) => z.id === k); if (!q) { b.sp.visible = false; continue } ex = q.x; ey = q.y }
        b.sp.position.set(ex + 0.5, heightAt(ex + 0.5, ey + 0.5) + 1.7, ey + 0.5)
      }

      // the collapsing island
      const u = built.uniforms
      u.uTime.value = now / 1000
      u.uCut.value = elapsed === null ? 999 : collapseRadius(elapsedSec)
      setFoam(elapsed === null ? 79 : Math.min(79, collapseRadius(elapsedSec)))
      u.uWarn.value = elapsed !== null && collapseWarn(elapsedSec) ? 1 : 0

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      roam.free = false
      renderer.domElement.removeEventListener('pointerdown', onCanvasDown)
      renderer.domElement.removeEventListener('pointerup', onCanvasUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onBlur)
      window.removeEventListener('pagehide', onBlur)
      window.removeEventListener('pageshow', onBlur)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
      propsRef.current.handleRef.current = null
      clearFollower()
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
