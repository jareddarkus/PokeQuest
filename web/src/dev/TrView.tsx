// DEVELOPER TOOL (local test server only): shows the trainer pictures of the game file, animated.  ?trview[&back][&from=0&to=47]
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildTrainerBackSprite, buildTrainerSprite } from '../rom/anim'

export default function TrView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    let stop = false
    void (async () => {
      const q = new URLSearchParams(location.search)
      const back = q.has('back')
      const from = Number(q.get('from') ?? 0), to = Number(q.get('to') ?? 47)
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const files = parseNarc(await nds.get(back ? 'a/0/7/2' : 'a/0/7/1'))
      const sprites: Array<{ i: number; sp: NonNullable<ReturnType<typeof buildTrainerSprite>> }> = []
      const lines: string[] = []
      for (let i = from; i <= to; i++) {
        const sp = back ? buildTrainerBackSprite(files, i) : buildTrainerSprite(files, i)
        if (sp) { sprites.push({ i, sp }); lines.push(`${i}: mismatch ${sp.mismatch.toFixed(2)} loop ${sp.loopLength} order ${sp.order}`) } else lines.push(`${i}: -`)
      }
      setInfo(lines.join('\n'))
      const c = ref.current!
      const per = back ? 6 : 8, cell = back ? 140 : 100
      c.width = per * cell; c.height = Math.ceil(sprites.length / per) * cell
      const ctx = c.getContext('2d')!
      const t0 = performance.now()
      const tick = () => {
        if (stop) return
        ctx.fillStyle = '#4a7a4a'; ctx.fillRect(0, 0, c.width, c.height)
        const t = q.has('still') ? 0 : ((performance.now() - t0) / 1000) * 60
        sprites.forEach(({ sp }, k) => {
          ctx.save(); ctx.translate((k % per) * cell + 4, Math.floor(k / per) * cell + 4)
          sp.draw(ctx, t)
          ctx.restore()
        })
        requestAnimationFrame(tick)
      }
      tick()
    })()
    return () => { stop = true }
  }, [])
  return (
    <div style={{ background: '#223', color: '#cfc', minHeight: '100vh' }}>
      <canvas ref={ref} style={{ imageRendering: 'pixelated', width: 1200 }} />
      <pre style={{ fontSize: 11 }}>{info}</pre>
    </div>
  )
}
