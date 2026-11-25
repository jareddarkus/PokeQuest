// DEVELOPER TOOL: every walking person of the game file (standing, facing the camera) with its number.  ?owpeople[&from=0&n=120]
import { useEffect, useRef, useState } from 'react'
import { loadOverworldSprites } from '../rom/store'
import { owFrame, owPeople } from '../game/ow'

export default function OwPeople() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [msg, setMsg] = useState('loading…')
  useEffect(() => {
    void (async () => {
      await loadOverworldSprites()
      const q = new URLSearchParams(location.search)
      const list = owPeople()
      const from = Number(q.get('from') ?? 0), n = Number(q.get('n') ?? 96)
      const part = list.slice(from, from + n)
      const cols = Number(q.get("cols") ?? 12), s = Number(q.get("s") ?? 2), cell = 32 * s
      const c = ref.current!
      c.width = cols * cell; c.height = Math.ceil(part.length / cols) * (cell + 14)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#556'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.imageSmoothingEnabled = false
      ctx.font = 'bold 12px monospace'
      part.forEach((idx, k) => {
        const x = (k % cols) * cell, y = Math.floor(k / cols) * (cell + 14)
        const f = owFrame(idx, 0, 0)
        if (f) ctx.drawImage(f, x, y + 14, 32 * s, 32 * s)
        ctx.fillStyle = '#ff0'; ctx.fillText(String(idx), x + 2, y + 11)
      })
      setMsg(`${part.length} of ${list.length} people`)
    })()
  }, [])
  return <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: '#223', color: '#fff', font: '12px monospace' }}><div>{msg}</div><canvas ref={ref} /></div>
}
