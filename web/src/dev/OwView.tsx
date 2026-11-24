// DEVELOPER TOOL (local test server only): contact sheet of the textures in a game-file archive.  ?owview&narc=a/0/4/8&from=0&n=60
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { decodeTexture, readTexFile } from '../rom/nitro'

export default function OwView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    void (async () => {
      const q = new URLSearchParams(location.search)
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const files = parseNarc(await nds.get(q.get('narc') ?? 'a/0/4/8'))
      const from = Number(q.get('from') ?? 0), n = Number(q.get('n') ?? 60)
      const pal = Number(q.get('pal') ?? 0)
      const scale = Number(q.get('scale') ?? 2)
      const cols = Number(q.get('cols') ?? 10)
      const cell = Number(q.get('cell') ?? 140)
      const c = ref.current!
      const rows = Math.ceil(n / cols)
      c.width = cols * cell; c.height = rows * (cell + 14)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#334'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.font = '11px monospace'
      const notes: string[] = []
      if (q.has('names')) { // every file with its first texture name and number of textures
        const out: string[] = []
        files.forEach((f, i) => { try { const t = readTexFile(f); if (t && t.texs.length) out.push(`${i}:${t.texs[0].name}x${t.texs.length}`) } catch { /* not a texture file */ } })
        setInfo(out.join(' '))
        return
      }
      const only = q.get('frames')
      if (only !== null) { // every frame of one file, in order
        for (const [fi, idxS] of only.split(',').entries()) {
          const t = readTexFile(files[Number(idxS)])
          if (!t) continue
          t.texs.forEach((tex, k) => {
            const tx = decodeTexture(tex, t.pals[0])
            const off = document.createElement('canvas'); off.width = tx.width; off.height = tx.height
            off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tx.rgba), tx.width, tx.height), 0, 0)
            const x = (k % cols) * cell, y = (fi + Math.floor(k / cols)) * (cell + 14)
            ctx.imageSmoothingEnabled = false
            ctx.fillStyle = '#ff0'; ctx.fillText(`${idxS}.${k}`, x + 2, y + 11)
            ctx.drawImage(off, x + 1, y + 13, tx.width * scale, tx.height * scale)
          })
        }
        return
      }
      for (let k = 0; k < n; k++) {
        const idx = from + k
        const f = files[idx]
        if (!f) break
        const x = (k % cols) * cell, y = Math.floor(k / cols) * (cell + 14)
        ctx.fillStyle = '#ff0'
        try {
          const t = readTexFile(f)
          if (!t || !t.texs.length) { ctx.fillText(`${idx} -`, x + 2, y + 11); continue }
          const tex = t.texs[0]
          const tx = decodeTexture(tex, t.pals[Math.min(pal, t.pals.length - 1)])
          ctx.fillText(`${idx} ${tx.width}x${tx.height} t${t.texs.length} p${t.pals.length}`, x + 2, y + 11)
          const off = document.createElement('canvas'); off.width = tx.width; off.height = tx.height
          off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tx.rgba), tx.width, tx.height), 0, 0)
          ctx.imageSmoothingEnabled = false
          const s = Math.min(scale, (cell - 2) / tx.width, (cell - 2) / tx.height)
          ctx.drawImage(off, x + 1, y + 13, tx.width * s, tx.height * s)
          if (k < 12) notes.push(`${idx}:${t.texs.map((e) => e.name).join('/')}|${t.pals.map((e) => e.name).join('/')}`)
        } catch (e) { ctx.fillText(`${idx} err`, x + 2, y + 11) }
      }
      setInfo(notes.join('  '))
    })()
  }, [])
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: '#223' }}>
      <div id="info" style={{ color: '#fff', font: '11px monospace', padding: 4 }}>{info}</div>
      <canvas ref={ref} />
    </div>
  )
}
