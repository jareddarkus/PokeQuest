import { useEffect, useRef } from 'react'

/**
 * The way into a battle, copied from the reference recording (times in ms):
 *   0-600     the picture flashes white twice (peaks at 150 and 450),
 *   800-2950  the picture is cut into 6 horizontal bands that turn black in thin vertical columns of different lengths (the bands in the order 1, 3, 5, 2, 4, 6),
 *   2950-4450 black,
 *   4450-4850 the black fades away (the battle picture is already underneath).
 * `onBlack` is called when the screen is hidden by the bars (swap the picture), `onFade` when the black starts to fade (the battle begins), `onDone` at the end.
 */
const FLASH: Array<[number, number]> = [[0, 0], [50, 0.1], [100, 0.47], [150, 0.85], [200, 0.72], [250, 0.34], [300, 0], [350, 0.34], [400, 0.72], [450, 0.85], [500, 0.47], [550, 0.22], [600, 0]]
const BAND_ORDER = [0, 2, 4, 1, 3, 5]
const BAND_START = [800, 1150, 1450, 1650, 1850, 2100]
const BAND_MS = 850
export const TRANSITION_BLACK_AT = 2950
export const TRANSITION_FADE_AT = 4450
const END = 4900
const COLS = 14

export default function BattleTransition({ onBlack, onFade, onDone }: { onBlack: () => void; onFade: () => void; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ onBlack, onFade, onDone })
  cb.current = { onBlack, onFade, onDone }
  useEffect(() => {
    const c = ref.current!
    c.width = window.innerWidth; c.height = window.innerHeight
    const ctx = c.getContext('2d')!
    // each band: its columns (left edge, width) and when each starts (a little delay each)
    let seed = 12345
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const bands = Array.from({ length: 6 }, () => {
      const widths = Array.from({ length: COLS }, () => 0.4 + rnd())
      const sum = widths.reduce((a, b) => a + b, 0)
      let x = 0
      return widths.map((w) => { const col = { x, w: w / sum, delay: rnd() * 380, speed: 0.6 + rnd() * 0.4 }; x += w / sum; return col })
    })
    const t0 = performance.now()
    let raf = 0, blackDone = false, fadeDone = false
    const tick = () => {
      const t = performance.now() - t0
      const W = c.width, H = c.height
      ctx.clearRect(0, 0, W, H)
      if (t < 600) {
        let a = 0
        for (let i = 1; i < FLASH.length; i++) if (t <= FLASH[i][0]) { const [t1, a1] = FLASH[i - 1], [t2, a2] = FLASH[i]; a = a1 + ((a2 - a1) * (t - t1)) / (t2 - t1); break }
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(0, 0, W, H)
      } else if (t >= TRANSITION_FADE_AT) {
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - (t - TRANSITION_FADE_AT) / 400)})`; ctx.fillRect(0, 0, W, H)
      } else if (t >= TRANSITION_BLACK_AT) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
      } else if (t >= 800) {
        ctx.fillStyle = '#000'
        const bh = H / 6
        BAND_ORDER.forEach((band, n) => {
          const start = BAND_START[n]
          for (const col of bands[band]) {
            const f = Math.max(0, Math.min(1, (t - start - col.delay) / (BAND_MS * col.speed)))
            if (f > 0) ctx.fillRect(Math.floor(col.x * W), band * bh, Math.ceil(col.w * W) + 1, Math.ceil(f * bh) + 1)
          }
        })
      }
      if (!blackDone && t >= TRANSITION_BLACK_AT) { blackDone = true; cb.current.onBlack() }
      if (!fadeDone && t >= TRANSITION_FADE_AT) { fadeDone = true; cb.current.onFade() }
      if (t >= END) { cb.current.onDone(); return }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} aria-hidden style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 60, pointerEvents: 'none' }} />
}
