// DEVELOPER TOOL (local test server only): shows a Pokémon's still picture next to its animation, both from the game file.
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildAnimatedSprite } from '../rom/anim'

export default function AnimTest() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    let stop = false
    void (async () => {
      const q = new URLSearchParams(location.search)
      const list = (q.get('dex') ?? '1').split(',').map(Number)
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      ;(globalThis as { __pqDebug?: boolean }).__pqDebug = q.has('debug')
      const files = parseNarc(await nds.get('a/0/0/4'))
      if (q.has('frames')) { // look for broken frames: pieces that fly apart or vanish during the animation (compared with the first frame)
        const from = Number(q.get('from') ?? 1), to = Number(q.get('to') ?? 649)
        const tmp = document.createElement('canvas'); tmp.width = 96; tmp.height = 96
        const tctx = tmp.getContext('2d', { willReadFrequently: true })!
        const stats = (t: number, sp: NonNullable<ReturnType<typeof buildAnimatedSprite>>) => {
          tctx.clearRect(0, 0, 96, 96); sp.draw(tctx, t)
          const d = tctx.getImageData(0, 0, 96, 96).data
          const m = new Uint8Array(96 * 96); let count = 0
          for (let i = 0; i < 96 * 96; i++) if (d[i * 4 + 3] > 100) { m[i] = 1; count++ }
          // pieces: connected groups of pixels, allowing a gap of 1 pixel
          const seen = new Uint8Array(96 * 96); let comps = 0; let largest = 0
          for (let i = 0; i < 96 * 96; i++) {
            if (!m[i] || seen[i]) continue
            comps++; const st = [i]; seen[i] = 1; let size = 0
            while (st.length) {
              const p = st.pop()!; size++; const x = p % 96, y = (p / 96) | 0
              for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx, ny = y + dy
                if (nx < 0 || ny < 0 || nx >= 96 || ny >= 96) continue
                const k = ny * 96 + nx
                if (m[k] && !seen[k]) { seen[k] = 1; st.push(k) }
              }
            }
            if (size > largest) largest = size
          }
          return { count, comps, frac: largest / Math.max(1, count) }
        }
        const bad: string[] = []
        for (let d = from; d <= to; d++) {
          for (const front of [true, false]) {
            const sp = buildAnimatedSprite(files, d * 20, front, false)
            if (!sp || sp.mismatch > 0.25) continue
            const s0 = stats(0, sp)
            let worst = 0, minFrac = s0.frac
            const n = Math.min(120, Math.max(30, sp.loopLength))
            for (let k = 0; k < n; k++) {
              const st = stats((k * sp.loopLength) / n, sp)
              worst = Math.max(worst, Math.abs(st.count - s0.count) / Math.max(1, s0.count))
              minFrac = Math.min(minFrac, st.frac)
            }
            if (s0.frac - minFrac > 0.18 || worst > 0.6) bad.push(`#${d}${front ? 'f' : 'b'}(body ${s0.frac.toFixed(2)}->${minFrac.toFixed(2)} area ${worst.toFixed(2)})`)
          }
          if (d % 20 === 0) { setInfo(`checking ${d}/${to}… bad so far: ${bad.join(' ')}`); await new Promise((r) => setTimeout(r, 0)) }
        }
        setInfo(`BAD: ${bad.join(' ')}`)
        return
      }
      if (q.has('all')) { // check every Pokémon: how close is the first animation picture to the game's still picture?
        const rows: Array<{ d: number; front: number; back: number; of: string; ob: string }> = []
        const from = Number(q.get('from') ?? 1), to = Number(q.get('to') ?? 649)
        for (let d = from; d <= to; d++) {
          const f = buildAnimatedSprite(files, d * 20, true, false), b = buildAnimatedSprite(files, d * 20, false, false)
          rows.push({ d, front: f ? f.mismatch : 9, back: b ? b.mismatch : 9, of: f ? f.order.map(Number).join('') : '-', ob: b ? b.order.map(Number).join('') : '-' })
          if (d % 20 === 0) { setInfo(`checking ${d}/${to}…`); await new Promise((r) => setTimeout(r, 0)) }
        }
        const worst = [...rows].sort((a, b) => Math.max(b.front, b.back) - Math.max(a.front, a.back)).slice(0, 40)
        const avg = rows.reduce((s, r) => s + r.front + r.back, 0) / (rows.length * 2)
        const orders: Record<string, number> = {}
        for (const r of rows) { orders[r.of] = (orders[r.of] ?? 0) + 1; orders[r.ob] = (orders[r.ob] ?? 0) + 1 }
        setInfo(`avg mismatch ${avg.toFixed(3)}  orders ${JSON.stringify(orders)}  worst: ` + worst.map((r) => `#${r.d} f${r.front.toFixed(2)}${r.of} b${r.back.toFixed(2)}${r.ob}`).join(' | '))
        return
      }
      const sprites: Array<{ front: ReturnType<typeof buildAnimatedSprite>; back: ReturnType<typeof buildAnimatedSprite> }> = list.map((d) => ({
        front: buildAnimatedSprite(files, d * 20, true, q.has('shiny')), back: buildAnimatedSprite(files, d * 20, false, q.has('shiny')),
      }))
      setInfo(`species ${list.join(',')}: front ${sprites.map((s) => (s.front ? 'ok' : 'FAILED')).join(',')} back ${sprites.map((s) => (s.back ? 'ok' : 'FAILED')).join(',')}`)
      const canvas = ref.current!
      const ctx = canvas.getContext('2d')!
      const S = 3
      canvas.width = list.length * 2 * 96 * S
      canvas.height = 96 * S
      const tmp = document.createElement('canvas')
      tmp.width = 96
      tmp.height = 96
      const tctx = tmp.getContext('2d')!
      const t0 = performance.now()
      const loop = () => {
        if (stop) return
        const t = ((performance.now() - t0) / 1000) * 60
        ctx.fillStyle = '#bdbde0'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingEnabled = false
        sprites.forEach((s, i) => {
          for (const [k, sp] of [s.front, s.back].entries()) {
            if (!sp) continue
            tctx.clearRect(0, 0, 96, 96)
            sp.draw(tctx, t)
            ctx.drawImage(tmp, (i * 2 + k) * 96 * S, 0, 96 * S, 96 * S)
          }
        })
        requestAnimationFrame(loop)
      }
      loop()
    })()
    return () => { stop = true }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111', overflow: 'auto' }}>
      <div style={{ position: 'fixed', top: 6, left: 6, color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,.6)', padding: '3px 6px' }}>{info}</div>
      <canvas ref={ref} style={{ marginTop: 30, imageRendering: 'pixelated' }} />
    </div>
  )
}
