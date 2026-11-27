// The little map: the whole island (one dot per tile) with you in white and the other players as coloured dots. Bottom right corner; on phones it is a button that opens it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, SIZE, T, type World } from '../game/world'
import type { OtherPlayer } from '../game/GameView'

const TILE_COLOR: Record<number, string> = {
  [T.Water]: '#3a7fc0', [T.Sand]: '#e6d28c', [T.Grass]: '#78c25a', [T.Tall]: '#3f8f3a', [T.Tree]: '#2c5a34', [T.Cliff]: '#8a6a3a', [T.GymWall]: '#b05a3a', [T.GymDoor]: '#f0a030',
}
const DOT_COLORS = ['#ff4a4a', '#ffd23a', '#4ad0ff', '#c070ff', '#ff8a3a', '#5aff9a', '#ff6ab4', '#a0ff3a']
const dotColor = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return DOT_COLORS[h % DOT_COLORS.length] }

export function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  useEffect(() => { const q = window.matchMedia('(max-width: 700px)'); const f = () => setM(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f) }, [])
  return m
}

export default function MiniMap({ world, getMe, others, radius, collapseOn, mobile }: {
  world: World; getMe: () => { x: number; y: number } | null; others: () => OtherPlayer[]; radius: number; collapseOn: boolean; mobile: boolean
}) {
  const [big, setBig] = useState(false) // the map zoomed to the whole screen (a click on the little map; a click anywhere closes it)
  const bigRef = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => {
    const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE
    const ctx = c.getContext('2d')!
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { ctx.fillStyle = TILE_COLOR[world.tiles[y * SIZE + x]] ?? '#78c25a'; ctx.fillRect(x, y, 1, 1) }
    return c
  }, [world])
  const ref = useRef<HTMLCanvasElement>(null)
  const show = !mobile
  useEffect(() => {
    if (!show && !big) return
    const draw = () => {
      for (const c of [ref.current, bigRef.current]) if (c) paint(c)
    }
    const paint = (c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(base, 0, 0, c.width, c.height)
      const k = c.width / SIZE
      if (collapseOn && radius < 78) { // the part of the island that is still left
        ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2
        ctx.strokeRect((C - radius) * k, (C - radius) * k, radius * 2 * k, radius * 2 * k)
      }
      for (const o of others()) { ctx.fillStyle = dotColor(o.name); ctx.beginPath(); ctx.arc((o.x + 0.5) * k, (o.y + 0.5) * k, Math.max(2.5, k * 1.6), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke() }
      const me = getMe()
      if (me) {
        const pulse = 3 + (Math.sin(performance.now() / 250) + 1) * 1.5
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc((me.x + 0.5) * k, (me.y + 0.5) * k, Math.max(4, k * 2) + pulse * 0.4, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((me.x + 0.5) * k, (me.y + 0.5) * k, Math.max(3, k * 1.6), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke()
      }
    }
    draw()
    const id = window.setInterval(draw, 200)
    return () => window.clearInterval(id)
  }, [show, big, base, others, getMe, radius, collapseOn])
  const size = 176
  const bigSize = Math.max(240, Math.min(window.innerWidth - 20, window.innerHeight - 20))
  return (
    <div className={`minimap ${mobile ? 'mobile' : ''}`}>
      {mobile && <button className="mm-btn" onClick={() => setBig(true)} aria-label="Mapa">🗺</button>}
      {show && (
        <div className="mm-box">
          <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, cursor: 'zoom-in' }} onClick={() => setBig(true)} />
        </div>
      )}
      {big && (
        <div className="pm-backdrop mm-big" onClick={() => setBig(false)} style={{ display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.72)', zIndex: 60 }}>
          <canvas ref={bigRef} width={bigSize} height={bigSize} style={{ width: bigSize, height: bigSize, borderRadius: 10, boxShadow: '0 0 0 3px #fff' }} />
        </div>
      )}
    </div>
  )
}
