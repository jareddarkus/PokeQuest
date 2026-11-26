import { useEffect, useRef } from 'react'
import { hardEdges } from '../rom/anim'
import * as THREE from 'three'
import type { BuiltWorld } from '../rom/chunkWorld'
import { drawCharacter, lookSprite, randomLook, type Look } from './character'
import { SWIM_SPRITES, hasOw, owBall, owEmote, owFrame } from './ow'
import { GYM_MODELS } from '../rom/buildings'
import { animatedTextures } from '../rom/mapModel'
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
import { makeGrassCoverTexture } from './meadow'
import { loadGrassTuft } from '../rom/grassFx'
import {
  DX, DY, SIZE, T, TYPE_COLOR, collapseRadius, dist, inBounds, isWalkable, tileAt, type Dir, type NpcSpec, type World,
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
  /** false when all your Pokémon have fainted: trainers do not challenge you then, so you can still walk (to find a Revive) */
  canBattle?: boolean
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
const PUSH = 1.4
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
      const b = g.custom ? null : built.makeBuilding(spec.pack, spec.model) // (a gym made in the editor has the building the owner placed)
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
      const bs = ballImg ? ballImg.width / 16 : 0.5 // the picture is drawn at its real size: 16 pixels = one tile
      s.scale.set(bs, bs, 1)
      s.renderOrder = 3
      s.position.set(pk.x + 0.5, heightAt(pk.x + 0.5, pk.y + 0.5) + 0.05, pk.y + 0.5)
      scene.add(s)
      s.userData = { tx: pk.x, ty: pk.y, bs, sand: world.tiles[pk.y * SIZE + pk.x] === T.Sand }
      pickupSprites.set(pk.id, s)
    }

    const me = {
      x: propsRef.current.startTile.x, y: propsRef.current.startTile.y, fromX: 0, fromY: 0, t: 1, dir: 0 as Dir, step: 0,
      stepSec: WALK_SECONDS, run: false, idle: 1, turn: 0, cycle: 0,
    }
    me.fromX = me.x
    me.fromY = me.y
    const mySprite = new THREE.Sprite(charMaterial(propsRef.current.look, 0, 0))
    fit(mySprite)
    scene.add(mySprite)
    const myShadow = makeShadow(scene)
    // standing in tall grass: the grass in front of the character covers its lower body (a picture drawn over the feet, like in the game)
    const coverTex = makeGrassCoverTexture(built)
    const makeCover = () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: coverTex ?? undefined, color: coverTex ? 0xffffff : 0x2a8a3a, transparent: true, alphaTest: 0.1, depthWrite: false }))
      sp.center.set(0.5, 0); sp.visible = false; scene.add(sp)
      return sp
    }
    /** Characters are drawn south (nearer the camera) over north, always: the order follows the ground position. */
    const order = (sp: THREE.Sprite, z: number) => { sp.renderOrder = 3 + z * 0.001 }
    // the game's own grass tuft (overworld effect "kusaeff", four pictures: leaves fly up, then the tuft settles); until it is loaded the stacked leaves are used
    let tuftTex: THREE.CanvasTexture[] | null = null
    void loadGrassTuft().then((frames) => {
      if (!frames) return
      tuftTex = frames.map((c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t })
    })
    const cover = (sp: THREE.Sprite, on: boolean, x: number, ground: number, z: number, wide = 1.0, frame = 3) => {
      sp.visible = on
      if (!on) return
      sp.renderOrder = 3 + z * 0.001 + 0.0005 // right above its character, below the characters further south
      const m = sp.material as THREE.SpriteMaterial
      if (tuftTex && frame < 3) { // just stepped in: the game's own tuft effect (leaves fly up), then the grass settles
        const t = tuftTex[Math.max(0, frame)]
        if (m.map !== t) { m.map = t; m.color.set(0xffffff); m.needsUpdate = true }
        sp.scale.set(2 * wide, 2 * wide, 1) // 32 picture pixels = 2 tiles
      } else { // standing in it: the same leaf pictures as the grass of the map, stacked, in front of the lower body
        if (coverTex && m.map !== coverTex) { m.map = coverTex; m.color.set(0xffffff); m.needsUpdate = true }
        sp.scale.set(1.15 * wide, 0.9 * wide, 1)
      }
      place(sp, camera, x, ground, z, PUSH + 0.04)
    }
    const myCover = makeCover(), folCover = makeCover()
    let prevT = 1, puffAt = 0
    const npcCovers = new Map<NpcRuntime, THREE.Sprite>()
    const otherCovers = new Map<string, THREE.Sprite>()
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
    const busyMat = ballMaterial()
    let paused = false
    const held = new Set<string>()

    const handle: GameHandle = {
      teleport: (x, y) => { me.x = x; me.y = y; me.fromX = x; me.fromY = y; me.t = 1; const f1 = followerSpot(x, y, me.dir); fol.x = f1.x; fol.y = f1.y; fol.fromX = f1.x; fol.fromY = f1.y; fol.t = 1 },
      getPos: () => ({ x: me.x, y: me.y, dir: me.dir }),
      removePickup: (id) => { removed.add(id); const s = pickupSprites.get(id); if (s) s.visible = false },
      defeatNpc: (id) => { const n = npcs.find((q) => q.spec.id === id); if (n) n.defeated = true },
      setPaused: (p) => { paused = p },
      setNpcFreeze: (id) => { for (const n of npcs) n.frozen = id !== null && n.spec.id === id },
    }
    propsRef.current.handleRef.current = handle

    // W A S D walk. The arrow keys are the buttons of the game: right = A (talk / pick up), down = B (hold to run), up = X (menu), left = Y.
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
      const fx = me.x + DX[me.dir], fy = me.y + DY[me.dir]
      const who = npcs.find((n) => !n.spec.swim && ((n.x === fx && n.y === fy) || (n.moving > 0 && Math.round(n.fx) === fx && Math.round(n.fy) === fy)))
      if (who && !pk) propsRef.current.events.onNpcTalk?.(who.spec.id)
    }
    actionRef.current = doAction
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key.toLowerCase()
      const kd = keyDir(k)
      if (kd !== null) { if (!held.has(k)) { held.add(k); tapRef.current = kd }; e.preventDefault(); return }
      if (k === 'arrowdown' || k === 'shift') { held.add('b'); e.preventDefault(); return }
      if (k === 'arrowright') { if (!e.repeat) doAction(); e.preventDefault(); return }
      if (k === 'arrowup') { if (!e.repeat) propsRef.current.events.onMenuKey?.(); e.preventDefault(); return }
      if (k === 'arrowleft') e.preventDefault() // Y: not used yet
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
        handle.teleport(s.x, s.y)
        p.events.onPushed?.(s.x, s.y, s.ring)
      }

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
              if (sx === me.x && sy === me.y && me.t >= 1 && !alert && p.canBattle !== false && !busyMap.has(n.spec.id)) { // (trainers leave you alone when none of your Pokémon can fight)
                const em = owEmote(15) // the game's own "!" bubble
                if (em && bubble) { alert = { n, t: 0.9 }; bubble.visible = true; p.events.onAlert?.(); break }
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
      // walking: the foot picture for the first half of a tile, standing for the second half. Running changes its picture only once per
      // tile (half as often as before): foot, upright, other foot, upright ...
      const myFrame = me.t >= 1 ? 0 : me.run ? [1, 0, 2, 0][me.cycle] : me.t < 0.5 ? 1 + me.step : 0
      mySprite.material = charMaterial(p.look, me.dir, myFrame, me.run && me.t < 1) // (standing still after a run: the normal standing picture)
      fit(mySprite)
      place(mySprite, camera, px + 0.5, ph + lift(mySprite), py + 0.5)
      order(mySprite, py + 0.5)
      if (me.t >= 1 && prevT < 1 && tallAt(me.x, me.y)) puffAt = now // stepped into tall grass: the leaves fly up
      prevT = me.t
      cover(myCover, me.t < 1 ? tallAt(me.t < 0.5 ? me.fromX : me.x, me.t < 0.5 ? me.fromY : me.y) : tallAt(me.x, me.y), px + 0.5, ph, py + 0.5, 1.0, puffAt ? Math.min(3, Math.floor((now - puffAt) / 90)) : 3) // in tall grass the leaves cover the lower body, like in the game
      myShadow.position.set(px + 0.5, ph + 0.03, py + 0.5)
      // the crates: on sand they sit a little in the sand; everywhere else they are pushed towards the camera (like the characters) so the ground does not cut them
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
        cover(folCover, fol.sprite.visible && (fol.t < 0.5 ? tallAt(fol.fromX, fol.fromY) : tallAt(fol.x, fol.y)), fx + 0.5, fh, fy + 0.5, 1.2)
        if (fol.mode === 'ow' && fol.strip) {
          const dxm = fol.x - fol.fromX, dym = fol.y - fol.fromY
          if (fol.t < 1 && (Math.abs(dxm) > 0.01 || Math.abs(dym) > 0.01)) fol.dir = Math.abs(dxm) > Math.abs(dym) ? (dxm > 0 ? 3 : 2) : (dym > 0 ? 1 : 0) // 0 up, 1 down, 2 left, 3 right
          const frame = fol.t < 1 ? (fol.t < 0.5 ? 0 : 1) : Math.floor(now / 500) % 2 // two pictures: they alternate while walking, and slowly while standing
          const cx = fol.owCanvas.getContext('2d')!
          cx.clearRect(0, 0, folCw, folCh)
          cx.drawImage(fol.strip, (fol.dir * 2 + frame) * folCw, 0, folCw, folCh, 0, 0, folCw, folCh)
          if (fol.owTex) fol.owTex.needsUpdate = true
          fol.sprite.scale.set(folCw / 16, folCh / 16, 1) // 16 picture pixels = 1 tile (32 = 2 tiles), like the characters
          place(fol.sprite, camera, fx + 0.5, fh + 0.2 + hop, fy + 0.5)
        } else if (fol.mode === 'rom' && fol.anim) {
          const cx = fol.canvas.getContext('2d')!
          cx.clearRect(0, 0, 96, 96)
          fol.anim.draw(cx, (now / 1000) * 60)
          hardEdges(cx, 96, 96)
          if (fol.tex) fol.tex.needsUpdate = true
          fol.sprite.scale.set(1.9, 1.9, 1) // 96 picture pixels = 1.9 tiles
          place(fol.sprite, camera, fx + 0.5, fh + 0.05 + hop, fy + 0.5)
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
      const fr = Math.floor(now / (1000 / 30)) // water pictures: 30 a second (a calm pace; the exact speed of the original is not known)
      for (const a of animatedTextures) a.tex.offset.set(valueAt(a.anim.moveS, fr), valueAt(a.anim.moveT, fr)) // moving water
      for (const n of npcs) {
        n.sprite.visible = !n.defeated || true
        const frame = n.moving > 0 && n.moving < 0.5 ? 1 + n.stp : 0
        n.sprite.material = charMaterial(n.look, n.dir, frame, n.spec.behavior === 'run' && n.moving > 0)
        fit(n.sprite)
        const nh = n.spec.swim ? Math.max(heightAt(n.fx + 0.5, n.fy + 0.5), built.waterY - 0.02) : heightAt(n.fx + 0.5, n.fy + 0.5) // swimmers float on the water
        place(n.sprite, camera, n.fx + 0.5, nh + lift(n.sprite), n.fy + 0.5)
        order(n.sprite, n.fy + 0.5)
        { let nc = npcCovers.get(n); if (!nc) { nc = makeCover(); npcCovers.set(n, nc) }
          cover(nc, !n.spec.swim && (n.moving > 0 && n.moving < 0.5 ? tallAt(n.fromX, n.fromY) : tallAt(n.x, n.y)), n.fx + 0.5, nh, n.fy + 0.5) }
        let sh = npcShadows.get(n)
        if (!sh) { sh = makeShadow(scene); npcShadows.set(n, sh) }
        sh.visible = !n.spec.swim
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
        for (const [k, pos] of want) {
          let sp = busyBalls.get(k)
          if (!sp) { sp = new THREE.Sprite(busyMat); sp.center.set(0.5, 0); sp.renderOrder = 4; scene.add(sp); busyBalls.set(k, sp) }
          const spin = Math.cos(now / 140) // a ball turning round: its width goes 1 -> 0 -> -1 ...
          sp.scale.set(0.9 * Math.max(0.12, Math.abs(spin)), 0.9, 1)
          const bh = heightAt(pos.x + 0.5, pos.y + 0.5)
          sp.position.set(pos.x + 0.5, bh + 1.9 + Math.sin(now / 300) * 0.05, pos.y + 0.5)
        }
        for (const [k, sp] of busyBalls) if (!want.has(k)) { scene.remove(sp); busyBalls.delete(k) }
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
        order(e.body, o.y + 0.5)
        { let oc = otherCovers.get(o.id); if (!oc) { oc = makeCover(); otherCovers.set(o.id, oc) }
          cover(oc, tallAt(o.x, o.y), o.x + 0.5, h, o.y + 0.5) }
        e.shadow.position.set(o.x + 0.5, h + 0.03, o.y + 0.5)
        e.label.position.set(o.x + 0.5, h + 1.5, o.y + 0.5)
      }
      for (const [id, e] of otherSprites) if (!seen.has(id)) { scene.remove(e.body, e.label, e.shadow); otherSprites.delete(id); const oc = otherCovers.get(id); if (oc) { scene.remove(oc); otherCovers.delete(id) } }


      // the collapsing island
      const u = built.uniforms
      u.uTime.value = now / 1000
      u.uCut.value = elapsed === null ? 999 : collapseRadius(elapsedSec)
      u.uWarn.value = elapsed !== null && elapsedSec % 15 > 8 ? 1 : 0

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
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
