import { useEffect, useMemo, useRef } from 'react'
import { useLang } from '../i18n'
import { C, DX, DY, RING_INNER, SIZE, T, dist, inBounds, isWalkable, ringAt, type World } from '../game/world'
import type { OtherPlayer } from '../game/GameView'

const TILE_COLOR: Record<number, string> = {
  [T.Water]: '#3a7fc0', [T.Sand]: '#e6d28c', [T.Grass]: '#78c25a', [T.Tall]: '#3f8f3a', [T.Tree]: '#2c5a34', [T.Cliff]: '#8a6a3a', [T.GymWall]: '#b05a3a', [T.GymDoor]: '#f0a030',
}

/** The outer distance (in tiles from the centre) of a ring: the map shows the square that holds it */
const outerOf = (ring: number): number => (ring <= 1 ? 78 : RING_INNER[ring - 2])

/**
 * Fly: the map of the ring you are in, as big as the screen allows. Tap where you want to land: if that place cannot be stood on, the nearest place that can is used
 * (grass is fine). You can only fly inside your own ring, and never to ground that has already sunk.
 */
export default function FlyMap({ world, ring, radius, getMe, others, onPick, onClose }: {
  world: World; ring: number; radius: number; getMe: () => { x: number; y: number } | null; others: () => OtherPlayer[]
  onPick: (x: number, y: number) => void; onClose: () => void
}) {
  const es = useLang() === 'es'
  const outer = outerOf(ring)
  const size = Math.max(240, Math.min(window.innerWidth - 24, window.innerHeight - 150, 680))
  const k = size / (outer * 2)
  const ref = useRef<HTMLCanvasElement>(null)

  // where one may land: ground of this ring that has not sunk and that belongs to a piece of some size (not a closed pocket)
  const spots = useMemo(() => {
    const ok = new Uint8Array(SIZE * SIZE)
    const comp = new Int32Array(SIZE * SIZE).fill(-1)
    const stand = (x: number, y: number) => { const t = world.tiles[y * SIZE + x]; return (t === T.Grass || t === T.Tall || t === T.Sand) && ringAt(x, y) === ring && dist(x, y) <= radius - 0.5 }
    const sizes: number[] = []
    for (let s = 0; s < SIZE * SIZE; s++) {
      if (comp[s] >= 0 || !stand(s % SIZE, (s / SIZE) | 0)) continue
      const id = sizes.length, st = [s]; comp[s] = id; let n = 0
      while (st.length) {
        const c = st.pop()!; n++
        const cx = c % SIZE, cy = (c / SIZE) | 0
        for (let d = 0; d < 4; d++) { const nx = cx + DX[d], ny = cy + DY[d]; if (!inBounds(nx, ny)) continue; const ni = ny * SIZE + nx; if (comp[ni] >= 0 || !stand(nx, ny)) continue; comp[ni] = id; st.push(ni) }
      }
      sizes.push(n)
    }
    const best = sizes.length ? Math.max(...sizes) : 0
    for (let i = 0; i < SIZE * SIZE; i++) if (comp[i] >= 0 && sizes[comp[i]] >= Math.min(30, best)) ok[i] = 1
    return ok
  }, [world, ring, radius])

  useEffect(() => {
    const draw = () => {
      const c = ref.current
      if (!c) return
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#0b1520'; ctx.fillRect(0, 0, c.width, c.height)
      const x0 = Math.floor(C - outer), y0 = Math.floor(C - outer)
      for (let y = Math.max(0, y0); y < Math.min(SIZE, C + outer); y++) {
        for (let x = Math.max(0, x0); x < Math.min(SIZE, C + outer); x++) {
          const inRing = ringAt(x, y) === ring
          ctx.fillStyle = inRing ? (TILE_COLOR[world.tiles[y * SIZE + x]] ?? '#78c25a') : '#24303c'
          ctx.fillRect((x - C + outer) * k, (y - C + outer) * k, Math.ceil(k), Math.ceil(k))
          if (inRing && spots[y * SIZE + x] === 0 && isWalkable(world, x, y)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect((x - C + outer) * k, (y - C + outer) * k, Math.ceil(k), Math.ceil(k)) }
        }
      }
      if (radius < 78) { ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2; ctx.strokeRect((C - radius - C + outer) * k, (C - radius - C + outer) * k, radius * 2 * k, radius * 2 * k) }
      for (const o of others()) { if (ringAt(Math.round(o.x), Math.round(o.y)) !== ring) continue; ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc((o.x + 0.5 - C + outer) * k, (o.y + 0.5 - C + outer) * k, Math.max(3, k * 1.4), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke() }
      const me = getMe()
      if (me) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((me.x + 0.5 - C + outer) * k, (me.y + 0.5 - C + outer) * k, Math.max(4, k * 1.6), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke() }
    }
    draw()
    const id = window.setInterval(draw, 250)
    return () => window.clearInterval(id)
  }, [world, ring, radius, outer, k, spots, getMe, others])

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * outer * 2 + C - outer, fy = ((e.clientY - r.top) / r.height) * outer * 2 + C - outer
    // the nearest place that can be stood on (a growing square around the tap)
    let best = -1, bd = Infinity
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!spots[i]) continue
      const d = Math.hypot((i % SIZE) + 0.5 - fx, ((i / SIZE) | 0) + 0.5 - fy)
      if (d < bd) { bd = d; best = i }
    }
    if (best >= 0) onPick(best % SIZE, (best / SIZE) | 0)
  }
  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="fly-box" onClick={(e) => e.stopPropagation()}>
        <div className="fly-head"><b>{es ? 'Volar' : 'Fly'} · {ring >= 4 ? (es ? 'Cima' : 'Peak') : `${es ? 'Anillo' : 'Ring'} ${ring}`}</b><button onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>×</button></div>
        <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, cursor: 'crosshair', touchAction: 'manipulation' }} onClick={pick} />
        <small>{es ? 'Toca dónde quieres aterrizar. Si ahí no se puede, irás al sitio más cercano.' : 'Tap where you want to land. If you cannot stand there, you go to the nearest place that works.'}</small>
      </div>
    </div>
  )
}
