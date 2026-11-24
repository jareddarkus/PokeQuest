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
