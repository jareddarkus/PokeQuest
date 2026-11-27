import { useEffect, useRef, useState } from 'react'

/**
 * THE selection cursor of the game: four red corner marks around the thing that is selected (measured on a picture of the real game: they sit on the four
 * corners of a 129 x 50 frame around a move button; each is a 3 pixel line, pale outline with a crimson middle, with a diagonal corner). 14 x 13 pixels.
 * Every menu uses it (keyboard / pad and the mouse over the moves). The marks breathe a little outwards and back.
 */
const CORNER = [
  '.....WWWWWWWWW',
  '....WRRRRRRRRW',
  '...WRWWWWWWWWW',
  '..WRW.........',
  '.WRW..........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WWW...........',
]

function Corner({ P, flipX, flipY, style }: { P: number; flipX?: boolean; flipY?: boolean; style: React.CSSProperties }) {
  return (
    <svg className="pq-cur-corner" width={14 * P} height={13 * P} viewBox="0 0 14 13" shapeRendering="crispEdges" style={{ position: 'absolute', pointerEvents: 'none', ['--dx' as string]: `${(flipX ? 1 : -1) * P}px`, ['--dy' as string]: `${(flipY ? 1 : -1) * P}px`, ...style }}>
      <g transform={`translate(${flipX ? 14 : 0} ${flipY ? 13 : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`}>
        {CORNER.flatMap((row, y) => Array.from(row).map((ch, x) => ch === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={ch === 'R' ? '#b02a48' : '#f8e4ec'} />))}
      </g>
    </svg>
  )
}

// ---- who has the cursor
let target: HTMLElement | null = null
const subs = new Set<(el: HTMLElement | null) => void>()
export const getNavTarget = (): HTMLElement | null => target
/** Puts the cursor on an element (null: no cursor). */
export function setNavTarget(el: HTMLElement | null): void {
  if (el === target) return
  target = el
  subs.forEach((f) => f(el))
}
export function onNavTarget(f: (el: HTMLElement | null) => void): () => void { subs.add(f); return () => { subs.delete(f) } }

/** Draws the cursor around the element that has it, following it while it moves. */
export default function NavCursor() {
  const [el, setEl] = useState<HTMLElement | null>(target)
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number; P: number } | null>(null)
  const raf = useRef(0)
  useEffect(() => onNavTarget(setEl), [])
  useEffect(() => {
    if (!el || !el.isConnected) { setBox(null); return }
    const tick = () => {
      if (!el.isConnected) { setBox(null); return }
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) { setBox(null) } else {
        const move = el.classList.contains('ds-move')
        // a move button of the lower screen: the cursor is the game's own 129 x 50 frame (1 pixel wider, 4 higher above and 2 below the 127 x 44 button), in the size of the screen's pixels
        const P = move ? Math.max(1, r.width / 127) : 3
        const l = move ? r.left : r.left - 2 * P, t = move ? r.top - 4 * P : r.top - 2 * P
        const w = move ? 129 * P : r.width + 4 * P, h = move ? 50 * P : r.height + 4 * P
        setBox((b) => (b && b.l === l && b.t === t && b.w === w && b.h === h && b.P === P ? b : { l, t, w, h, P }))
      }
      raf.current = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf.current)
  }, [el])
  if (!el || !box) return null
  const { l, t, w, h, P } = box
  return (
    <div className="pq-cursor" aria-hidden style={{ position: 'fixed', left: l, top: t, width: w, height: h, pointerEvents: 'none', zIndex: 100000 }}>
      <Corner P={P} style={{ left: 0, top: 0 }} />
      <Corner P={P} flipX style={{ right: 0, top: 0 }} />
      <Corner P={P} flipY style={{ left: 0, bottom: 0 }} />
      <Corner P={P} flipX flipY style={{ right: 0, bottom: 0 }} />
    </div>
  )
}
