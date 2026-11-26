import { useEffect, useRef } from 'react'
import { drawCharacter, randomLook, shade, type Look } from './character'
import { hash2 } from './rng'
import type { Settings } from './settings'
import {
  C, DX, DY, RING_INNER, SIZE, T, TYPE_COLOR, collapseRadius, dist, isWalkable, ringAt, squareTile, tileAt, type Dir, type NpcSpec,
  type World,
} from './world'

export interface OtherPlayer {
  id: string
  name: string
  x: number // tile position (can be fractional while walking)
  y: number
  dir: Dir
  look: Look
  moving: boolean
}

export interface GameEvents {
  /** the X button (up arrow) was pressed: open or close the menu */
  onMenuKey?: () => void
  /** the player finished walking onto a tile */
  onStep?: (x: number, y: number, tile: number) => void
  onPickup?: (id: string) => void
  onGym?: (gymId: string) => void
  /** the player moved (called every time a step STARTS, for the network) */
  onMoveStart?: (x: number, y: number, dir: Dir) => void
  /** the island pushed the player to a new place */
  onPushed?: (x: number, y: number, ring: number) => void
  onNpcSpotted?: (npcId: string) => void
  /** a trainer just noticed the player (the "!" appears) */
  onAlert?: () => void
  /** the player pushed against something that blocks the way (a wall, a character ...) */
  onBump?: () => void
  /** button A pressed in front of a character: talk to it */
  onNpcTalk?: (npcId: string) => void
  /** a player was clicked (name; null = yourself) at this place of the window */
  onPlayerClick?: (name: string | null, clientX: number, clientY: number) => void
}

export interface GameHandle {
  teleport: (x: number, y: number) => void
  getPos: () => { x: number; y: number; dir: Dir }
  removePickup: (id: string) => void
  defeatNpc: (id: string) => void
  setPaused: (p: boolean) => void
  setNpcFreeze: (id: string | null) => void
  /** a speech bubble (a picture of the game's emotes) above a player's head for a moment; id null = you */
  showEmote: (id: string | null, idx: number) => void
  /** where, in pixels of the game picture, the top of a trainer (or of a tile: `npc` = null) is right now, or null when it is out of view */
  screenOf: (npc: string | null, tx?: number, ty?: number) => { x: number; y: number } | null
}

interface Props {
  world: World
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

const TILE = 32
const STEP_SECONDS = 0.16

interface NpcRuntime {
  spec: NpcSpec
  x: number
  y: number
  fx: number
  fy: number
  dir: Dir
  moving: number // 0..1 progress, 0 = idle
  fromX: number
  fromY: number
  timer: number
  defeated: boolean
  frozen: boolean
  look: Look
}

function walkableFor(world: World, x: number, y: number, elapsed: number | null): boolean {
  if (!isWalkable(world, x, y)) return false
  if (elapsed !== null && dist(x, y) > collapseRadius(elapsed / 1000)) return false
  return true
}

export function safeTileFor(world: World, x: number, y: number, elapsedSec: number): { x: number; y: number; ring: number } {
  const ring = ringAt(x, y)
  const cutoff = collapseRadius(elapsedSec)
  let targetR = cutoff - 2
  if (ring >= 1 && ring < 4 && targetR < RING_INNER[ring - 1] + 2) targetR = RING_INNER[ring - 1] - 3 // last band of a ring: next ring
  for (let r = Math.max(1, targetR); r >= 1; r--) {
    for (const off of [0, 1, -1, 2, -2]) {
      const rr = r + off
      const { x: px, y: py } = squareTile(x, y, rr)
      if (isWalkable(world, px, py) && tileAt(world, px, py) !== T.GymDoor) return { x: px, y: py, ring: ringAt(px, py) }
    }
  }
  return { x: C, y: C, ring: 4 }
}

export default function GameView(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const dpadRef = useRef<Dir | null>(null)
  const tapRef = useRef<Dir | null>(null) // a quick tap still makes one step, even if released before the next frame

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const { world } = propsRef.current

    const me = {
      x: propsRef.current.startTile.x, y: propsRef.current.startTile.y, fromX: 0, fromY: 0, t: 1, dir: 0 as Dir, frame: 0, step: 0,
    }
    me.fromX = me.x
    me.fromY = me.y
    const removed = new Set<string>()
    const npcs: NpcRuntime[] = world.npcs.map((s) => ({
      spec: s, x: s.x, y: s.y, fx: s.x, fy: s.y, dir: s.dir, moving: 0, fromX: s.x, fromY: s.y,
      timer: 1 + hash2(s.x, s.y, 3) * 3, defeated: false, frozen: false, look: randomLook(s.look, true),
    }))
    let paused = false
    const held = new Set<string>()

    const handle: GameHandle = {
      showEmote: () => {},
      screenOf: () => null,
      teleport: (x, y) => {
        me.x = x; me.y = y; me.fromX = x; me.fromY = y; me.t = 1
      },
      getPos: () => ({ x: me.x, y: me.y, dir: me.dir }),
      removePickup: (id) => { removed.add(id) },
      defeatNpc: (id) => { const n = npcs.find((q) => q.spec.id === id); if (n) n.defeated = true },
      setPaused: (p) => { paused = p },
      setNpcFreeze: (id) => { for (const n of npcs) n.frozen = id !== null && n.spec.id === id },
    }
    propsRef.current.handleRef.current = handle

    // ---------------------------------------------------------------- input
    const keyDir = (k: string): Dir | null => {
      switch (k) {
        case 'w': case 'arrowup': return 3
        case 's': case 'arrowdown': return 0
        case 'a': case 'arrowleft': return 1
        case 'd': case 'arrowright': return 2
      }
      return null
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key.toLowerCase()
      const kd = keyDir(k)
      if (kd !== null) { held.add(k); tapRef.current = kd; e.preventDefault() }
    }
    const onKeyUp = (e: KeyboardEvent) => { held.delete(e.key.toLowerCase()) }
    const onBlur = () => held.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const wantedDir = (): Dir | null => {
      if (dpadRef.current !== null) return dpadRef.current
      // the most recently pressed key wins
      const keys = Array.from(held)
      for (let i = keys.length - 1; i >= 0; i--) {
        const d = keyDir(keys[i])
        if (d !== null) return d
      }
      const tap = tapRef.current
      tapRef.current = null
      return tap
    }

    // ---------------------------------------------------------------- the loop
    let raf = 0
    let last = performance.now()
    let width = 0
    let height = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const npcAt = (x: number, y: number) =>
      npcs.some((n) => !n.defeated && ((n.x === x && n.y === y) || (n.moving > 0 && Math.round(n.fx) === x && Math.round(n.fy) === y)))

    const tryStep = (d: Dir, elapsed: number | null) => {
      me.dir = d
      const nx = me.x + DX[d]
      const ny = me.y + DY[d]
      if (!walkableFor(world, nx, ny, elapsed) || npcAt(nx, ny)) {
        // bumping into a gym door counts as going in
        if (tileAt(world, nx, ny) === T.GymDoor) {
          const g = world.gyms.find((q) => q.doorX === nx && q.doorY === ny)
          if (g) propsRef.current.events.onGym?.(g.id)
        }
        return
      }
      me.fromX = me.x
      me.fromY = me.y
      me.x = nx
      me.y = ny
      me.t = 0
      me.step ^= 1
      propsRef.current.events.onMoveStart?.(nx, ny, d)
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = propsRef.current
      const elapsed = p.elapsed()
      const elapsedSec = elapsed === null ? 0 : elapsed / 1000

      // push the player off a falling band
      if (elapsed !== null && dist(me.x, me.y) > collapseRadius(elapsedSec) && me.t >= 1) {
        const s = safeTileFor(world, me.x, me.y, elapsedSec)
        handle.teleport(s.x, s.y)
        p.events.onPushed?.(s.x, s.y, s.ring)
      }

      if (!paused && !p.paused) {
        // player movement
        if (me.t < 1) {
          me.t = Math.min(1, me.t + dt / STEP_SECONDS)
          if (me.t >= 1) {
            const tile = tileAt(world, me.x, me.y)
            p.events.onStep?.(me.x, me.y, tile)
            const pk = world.pickups.find((q) => q.x === me.x && q.y === me.y && !removed.has(q.id))
            if (pk) p.events.onPickup?.(pk.id)
          }
        }
        if (me.t >= 1) {
          const d = wantedDir()
          if (d !== null) tryStep(d, elapsed)
        }
        // villagers
        for (const n of npcs) {
          if (n.defeated || n.frozen) continue
          if (n.moving > 0) {
            n.moving = Math.min(1, n.moving + dt / (n.spec.behavior === 'run' ? 0.1 : 0.22))
            n.fx = n.fromX + (n.x - n.fromX) * n.moving
            n.fy = n.fromY + (n.y - n.fromY) * n.moving
            if (n.moving >= 1) { n.moving = 0; n.fx = n.x; n.fy = n.y }
          } else {
            n.timer -= dt
            if (n.timer <= 0) {
              const b = n.spec.behavior
              if (b === 'stand') { n.timer = 3 + hash2(n.x, n.y, now | 0) * 4; if (hash2(n.x, n.y, now | 0) > 0.7) n.dir = Math.floor(hash2(n.y, n.x, now | 0) * 4) as Dir }
              else if (b === 'look') { n.dir = Math.floor(Math.random() * 4) as Dir; n.timer = 1.5 + Math.random() * 2.5 }
              else {
                const d = (Math.random() < 0.6 ? n.dir : Math.floor(Math.random() * 4)) as Dir
                const nx = n.x + DX[d]
                const ny = n.y + DY[d]
                n.dir = d
                const homeOk = Math.abs(nx - n.spec.x) <= 7 && Math.abs(ny - n.spec.y) <= 7
                if (homeOk && walkableFor(world, nx, ny, elapsed) && tileAt(world, nx, ny) !== T.GymDoor && !(nx === me.x && ny === me.y) && !npcAt(nx, ny)) {
                  n.fromX = n.x; n.fromY = n.y; n.x = nx; n.y = ny; n.moving = 0.001
                }
                n.timer = b === 'run' ? 0.05 + Math.random() * 0.4 : 0.4 + Math.random() * 1.6
              }
            }
          }
          // sight: 4 tiles straight ahead
          if (n.moving === 0 || n.moving > 0.5) {
            for (let k = 1; k <= 4; k++) {
              const sx = n.x + DX[n.dir] * k
              const sy = n.y + DY[n.dir] * k
              if (!isWalkable(world, sx, sy) && tileAt(world, sx, sy) !== T.GymDoor) break
              if (sx === me.x && sy === me.y && me.t >= 1) {
                p.events.onNpcSpotted?.(n.spec.id)
                break
              }
            }
          }
        }
      }

      draw(now, elapsed)
      raf = requestAnimationFrame(tick)
    }

    // ---------------------------------------------------------------- drawing
    const draw = (now: number, elapsed: number | null) => {
      const p = propsRef.current
      const S = TILE * p.settings.zoom
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#2f6fa8'
      ctx.fillRect(0, 0, width, height)

      const px = me.fromX + (me.x - me.fromX) * me.t
      const py = me.fromY + (me.y - me.fromY) * me.t
      const camX = px + 0.5
      const camY = py + 0.5
      const sx = (tx: number) => Math.round(width / 2 + (tx - camX) * S)
      const sy = (ty: number) => Math.round(height / 2 + (ty - camY) * S)

      const x0 = Math.max(0, Math.floor(camX - width / 2 / S) - 1)
      const x1 = Math.min(SIZE - 1, Math.ceil(camX + width / 2 / S) + 1)
      const y0 = Math.max(0, Math.floor(camY - height / 2 / S) - 1)
      const y1 = Math.min(SIZE - 1, Math.ceil(camY + height / 2 / S) + 3)
      const cutoff = elapsed === null ? 999 : collapseRadius(elapsed / 1000)
      const sec = elapsed === null ? 0 : elapsed / 1000
      const sinceBand = elapsed === null ? 0 : sec % 15
      const wave = now / 900

      // ground
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          let t = tileAt(world, x, y)
          const d = dist(x, y)
          const fallen = d > cutoff
          if (fallen) t = T.Water
          const X = sx(x)
          const Y = sy(y)
          const w = sx(x + 1) - X
          const h = sy(y + 1) - Y
          if (t === T.Water) {
            const s = 0.5 + 0.5 * Math.sin(wave + x * 0.7 + y * 0.9)
            ctx.fillStyle = shade('#2f6fa8', Math.round(s * 14 - 4))
            ctx.fillRect(X, Y, w, h)
            if (hash2(x, y, 9) > 0.8) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(X + w * 0.2, Y + h * (0.3 + 0.3 * s), w * 0.4, Math.max(1, h * 0.08)) }
          } else if (t === T.Sand) {
            ctx.fillStyle = hash2(x, y, 1) > 0.5 ? '#e6d49a' : '#dec98a'
            ctx.fillRect(X, Y, w, h)
          } else if (t === T.Cliff) {
            ctx.fillStyle = '#6b5a45'
            ctx.fillRect(X, Y, w, h)
            ctx.fillStyle = '#8a7658'
            ctx.fillRect(X, Y, w, h * 0.3)
            ctx.fillStyle = '#4a3d2e'
            ctx.fillRect(X, Y + h * 0.78, w, h * 0.22)
          } else {
            // grass-like base (also under trees, tall grass, buildings)
            const r = ringAt(x, y)
            const base = ['#6fbf5a', '#68b955', '#5fb04e', '#58a84a'][r > 0 ? r - 1 : 0]
            ctx.fillStyle = hash2(x, y, 2) > 0.5 ? base : shade(base, -7)
            ctx.fillRect(X, Y, w, h)
            if (t === T.Tall) {
              ctx.fillStyle = '#3f8f3a'
              ctx.fillRect(X, Y, w, h)
              ctx.fillStyle = '#58b04a'
              for (let k = 0; k < 4; k++) {
                const bx = X + w * (0.1 + k * 0.23)
                const sway = Math.sin(wave * 2 + x + k) * w * 0.03
                ctx.fillRect(bx + sway, Y + h * 0.18, w * 0.14, h * 0.62)
              }
            } else if (hash2(x, y, 4) > 0.9) {
              ctx.fillStyle = 'rgba(255,255,255,0.35)'
              ctx.fillRect(X + w * 0.3, Y + h * 0.4, w * 0.12, h * 0.12)
            }
          }
          // the next band is about to fall: warn
          if (!fallen && d > cutoff - 1 && elapsed !== null && sinceBand > 8) {
            ctx.fillStyle = `rgba(255,60,60,${0.18 + 0.18 * Math.sin(now / 120)})`
            ctx.fillRect(X, Y, w, h)
          }
        }
      }

      // things that stand up (sorted by their feet)
      type Item = { key: number; fn: () => void }
      const items: Item[] = []
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = tileAt(world, x, y)
          if (t === T.Tree && dist(x, y) <= cutoff) {
            items.push({ key: y + 1, fn: () => drawTree(ctx, sx(x), sy(y), S, hash2(x, y, 7)) })
          }
        }
      }
      for (const g of world.gyms) {
        if (g.x + 7 < x0 || g.x > x1 || g.y + 5 < y0 || g.y > y1) continue
        items.push({ key: g.y + 5, fn: () => drawGym(ctx, sx(g.x), sy(g.y), S, TYPE_COLOR[g.type], g.type) })
      }
      for (const pk of world.pickups) {
        if (removed.has(pk.id) || pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1 || dist(pk.x, pk.y) > cutoff) continue
        items.push({ key: pk.y + 0.9, fn: () => drawBall(ctx, sx(pk.x) + S / 2, sy(pk.y) + S * 0.72, S, now) })
      }
      for (const n of npcs) {
        if (n.defeated && false) continue
        if (n.fx < x0 - 2 || n.fx > x1 + 2 || n.fy < y0 - 2 || n.fy > y1 + 2) continue
        const frame = n.moving > 0 ? 1 + (Math.floor(n.moving * 2) % 2) : 0
        items.push({ key: n.fy + 1, fn: () => drawCharacter(ctx, sx(n.fx) + S / 2, sy(n.fy) + S * 0.95, S / 16 * 0.85, n.look, n.dir, frame) })
        if (!n.defeated && p.settings.zoom >= 0) {
          // a little line of sight marker so players can learn the 4-tile rule
          items.push({
            key: n.fy + 1.01,
            fn: () => {
              ctx.fillStyle = 'rgba(255,255,255,0.08)'
              for (let k = 1; k <= 4; k++) {
                const vx = n.x + DX[n.dir] * k
                const vy = n.y + DY[n.dir] * k
                if (!isWalkable(world, vx, vy)) break
                ctx.fillRect(sx(vx) + 2, sy(vy) + 2, S - 4, S - 4)
              }
            },
          })
        }
      }
      for (const o of p.others()) {
        if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue
        const frame = o.moving ? 1 + (Math.floor(now / 150) % 2) : 0
        items.push({
          key: o.y + 1,
          fn: () => {
            drawCharacter(ctx, sx(o.x) + S / 2, sy(o.y) + S * 0.95, S / 16 * 0.85, o.look, o.dir, frame)
            drawName(ctx, o.name, sx(o.x) + S / 2, sy(o.y) - S * 0.7, S)
          },
        })
      }
      const meFrame = me.t < 1 ? 1 + me.step : 0
      items.push({
        key: py + 1.001,
        fn: () => drawCharacter(ctx, sx(px) + S / 2, sy(py) + S * 0.95, S / 16 * 0.85, p.look, me.dir, meFrame),
      })
      items.sort((a, b) => a.key - b.key)
      for (const it of items) it.fn()

      // tall grass in front of the feet
      for (let y = Math.floor(py); y <= Math.ceil(py) + 0; y++) {
        for (let x = Math.floor(px); x <= Math.ceil(px); x++) {
          if (tileAt(world, x, y) === T.Tall && Math.abs(x - px) < 0.9 && Math.abs(y - py) < 0.9) {
            ctx.fillStyle = '#3f8f3a'
            ctx.fillRect(sx(x), sy(y) + S * 0.55, S, S * 0.45)
            ctx.fillStyle = '#58b04a'
            for (let k = 0; k < 4; k++) ctx.fillRect(sx(x) + S * (0.1 + k * 0.23), sy(y) + S * 0.5, S * 0.14, S * 0.42)
          }
        }
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', resize)
      propsRef.current.handleRef.current = null
    }
  }, [props.world])

  const setDir = (d: Dir | null) => {
    dpadRef.current = d
    if (d !== null) tapRef.current = d
  }
  const s = props.settings
  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" />
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
    </>
  )
}

function drawTree(ctx: CanvasRenderingContext2D, X: number, Y: number, S: number, v: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(X + S / 2, Y + S * 0.92, S * 0.42, S * 0.14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4a2b'
  ctx.fillRect(X + S * 0.4, Y + S * 0.45, S * 0.2, S * 0.5)
  const g = v > 0.5 ? '#2f8a3a' : '#3a9a44'
  ctx.fillStyle = shade(g, -18)
  ctx.beginPath(); ctx.arc(X + S / 2, Y - S * 0.15, S * 0.62, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(X + S / 2, Y - S * 0.25, S * 0.56, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = shade(g, 22)
  ctx.beginPath(); ctx.arc(X + S * 0.38, Y - S * 0.38, S * 0.22, 0, Math.PI * 2); ctx.fill()
}

function drawGym(ctx: CanvasRenderingContext2D, X: number, Y: number, S: number, color: string, label: string) {
  const W = 7 * S
  // roof
  ctx.fillStyle = shade(color, -40)
  ctx.fillRect(X, Y, W, S * 2.6)
  ctx.fillStyle = color
  ctx.fillRect(X + S * 0.2, Y + S * 0.2, W - S * 0.4, S * 2.2)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(X + S * 0.2, Y + S * 0.2, W - S * 0.4, S * 0.5)
  // wall
  ctx.fillStyle = '#e8e2d0'
  ctx.fillRect(X, Y + S * 2.6, W, S * 2.4)
  ctx.fillStyle = '#c9c2ac'
  ctx.fillRect(X, Y + S * 4.7, W, S * 0.3)
  // windows
  ctx.fillStyle = '#7fb4d8'
  for (const wx of [0.8, 1.9, 4.2, 5.3]) ctx.fillRect(X + wx * S, Y + S * 3.1, S * 0.8, S * 0.8)
  // door (centre, bottom)
  ctx.fillStyle = '#4a3a2a'
  ctx.fillRect(X + S * 3, Y + S * 3.9, S, S * 1.1)
  ctx.fillStyle = '#e8d070'
  ctx.fillRect(X + S * 3.75, Y + S * 4.4, S * 0.1, S * 0.1)
  // sign
  ctx.font = `900 ${Math.max(9, S * 0.42)}px Unbounded, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${label.toUpperCase()} GYM`, X + W / 2, Y + S * 1.65)
}

function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, S: number, now: number) {
  const r = S * 0.22
  const bob = Math.sin(now / 300 + cx) * S * 0.03
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.9, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e8453c'
  ctx.beginPath(); ctx.arc(cx, cy + bob, r, Math.PI, 0); ctx.fill()
  ctx.fillStyle = '#f4f4f4'
  ctx.beginPath(); ctx.arc(cx, cy + bob, r, 0, Math.PI); ctx.fill()
  ctx.fillStyle = '#222'
  ctx.fillRect(cx - r, cy + bob - r * 0.08, r * 2, r * 0.16)
  ctx.beginPath(); ctx.arc(cx, cy + bob, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#f4f4f4'; ctx.fill()
  ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke()
}

function drawName(ctx: CanvasRenderingContext2D, name: string, cx: number, y: number, S: number) {
  ctx.font = `400 ${Math.max(10, S * 0.36)}px Lexend, system-ui, sans-serif`
  ctx.textAlign = 'center'
  const w = ctx.measureText(name).width + 10
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(cx - w / 2, y - S * 0.34, w, S * 0.5)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(name, cx, y + S * 0.04)
}
