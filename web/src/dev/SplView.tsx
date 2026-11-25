// DEVELOPER TOOL: plays one particle effect file of the game.  ?splview&arc=a/0/0/6&id=155[&res=0][&tint=31,20,10][&s=120][&loop]
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { parseSpa, SplSystem } from '../rom/spl'
import { drawQuads } from '../rom/splDraw'

export default function SplView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    let raf = 0, alive = true
    void (async () => {
      const q = new URLSearchParams(location.search)
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM'); return }
      const nds = new NdsFile(src); await nds.open()
      const files = parseNarc(await nds.get(q.get('arc') ?? 'a/0/0/6'))
      const id = Number(q.get('id') ?? 155)
      const file = parseSpa(files[id])
      setInfo(`file ${id}: ${file.resources.length} emitters, ${file.textures.length} pictures; ` + file.resources.map((r, i) => `[${i}] type${r.emissionType} draw${r.drawType} n${r.emissionCount.toFixed(1)} life${r.particleLife} every${r.emissionInterval} scale${r.baseScale.toFixed(2)} vel${r.initVelPos.toFixed(3)}/${r.initVelAxis.toFixed(3)} col${r.color.join(',')} child${r.hasChild ? 1 : 0} life${r.emitterLife} delay${r.startDelay} self${r.selfMaintaining ? 1 : 0} alpha${r.baseAlpha} tex${r.textureIndex} sc${r.hasScale ? 1 : 0} al${r.hasAlpha ? 1 : 0} cl${r.hasColor ? 1 : 0} beh${r.behaviors.map((b) => b.kind[0]).join('')}`).join(' | '))
      const sys = new SplSystem(file)
      const tint = (q.get('tint') ?? '31,31,31').split(',').map(Number) as [number, number, number]
      const scale = Number(q.get('s') ?? 120)
      const spawn = () => { if (q.has('res')) sys.spawn(Number(q.get('res')), [0, 0, 0], tint); else sys.spawnAll([0, 0, 0], tint) }
      spawn()
      const c = ref.current!, ctx = c.getContext('2d')!
      let last = performance.now(), acc = 0, frames = 0
      const loop = (now: number) => {
        if (!alive) return
        raf = requestAnimationFrame(loop)
        acc += now - last; last = now
        const freeze = q.has('freeze') ? Number(q.get('freeze')) : Infinity
        while (acc >= 1000 / 60) { if (frames < freeze) { sys.update(); frames++ } acc -= 1000 / 60 }
        if (!sys.busy && q.has('loop')) { spawn(); frames = 0 }
        ctx.fillStyle = '#4a5f7a'; ctx.fillRect(0, 0, c.width, c.height)
        ctx.strokeStyle = '#ffffff33'; ctx.beginPath(); ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height); ctx.moveTo(0, c.height / 2); ctx.lineTo(c.width, c.height / 2); ctx.stroke()
        const quads = sys.quads({ right: [1, 0, 0], up: [0, 1, 0], look: [0, 0, -1] })
        drawQuads(ctx, quads, (p) => [c.width / 2 + p[0] * scale, c.height / 2 - p[1] * scale])
        ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(`frame ${frames}  emitters ${sys.emitters.length}  quads ${quads.length}`, 8, 16)
      }
      raf = requestAnimationFrame(loop)
    })()
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [])
  return <div style={{ background: '#223', color: '#fff', minHeight: '100vh', font: '11px monospace' }}><canvas ref={ref} width={800} height={460} style={{ display: 'block' }} /><div style={{ padding: 6 }}>{info}</div></div>
}
