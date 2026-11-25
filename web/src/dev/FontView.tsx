// DEVELOPER TOOL (local test server only): shows the game's fonts.  ?fontview
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { drawNftr, parseNftr } from '../rom/font'

export default function FontView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    void (async () => {
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const files = parseNarc(await nds.get('a/0/2/3'))
      const c = ref.current!
      c.width = 200; c.height = 120
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#3a4a6a'; ctx.fillRect(0, 0, c.width, c.height)
      const lines: string[] = []
      const all: unknown[] = []
      ;(window as unknown as Record<string, unknown>).__fonts = all
      let y = 4
      files.forEach((f, i) => {
        const font = parseNftr(f)
        if (!font) return
        all.push(font)
        { const dv = new DataView(f.buffer, f.byteOffset, f.byteLength); if (f.length < 32) return; let pos = dv.getUint16(12, true); const tags: string[] = []; for (let b = 0; b < dv.getUint16(14, true) && pos + 8 <= f.length; b++) { tags.push(String.fromCharCode(f[pos], f[pos + 1], f[pos + 2], f[pos + 3]) + '<' + Array.from(f.slice(pos + 8, pos + 26)).map((x) => x.toString(16).padStart(2, '0')).join('') + '>:' + dv.getUint32(pos + 4, true) + (String.fromCharCode(f[pos], f[pos + 1], f[pos + 2], f[pos + 3]) === 'PWDC' ? '[' + dv.getUint16(pos + 8, true) + '-' + dv.getUint16(pos + 10, true) + ']' : '')); pos += dv.getUint32(pos + 4, true) } lines.push('   blocks: ' + tags.join(' ')) }
        lines.push(`file ${i}: height ${font.height} cell ${font.cellW}x${font.cellH} depth ${font.depth} glyphs ${font.glyphs.length / (font.cellW * font.cellH)} chars ${font.map.size} baseline ${font.baseline}`)
        lines.push('   widthsLen ' + font.widths.length + ' firstDefined ' + font.widths.findIndex((w) => !!w) + ' sample ' + JSON.stringify(font.widths.slice(40, 46)))
        lines.push('   widths: ' + ['W', 'i', 'l', 'a', 't', ' ', '1'].map((ch) => { const g = font.map.get(ch.charCodeAt(0)); return ch + '=' + g + ':' + JSON.stringify(font.widths[g ?? -1]) }).join('  '))
        const t = 'What will butts lol do? Lv.5 22/22 PS'
        drawNftr(ctx, font, t, 6, y)
        y += font.cellH + 6
      })
      setInfo(lines.join('\n'))
    })()
  }, [])
  return (
    <div style={{ background: '#223', color: '#cfc', minHeight: '100vh' }}>
      <canvas ref={ref} style={{ imageRendering: 'pixelated', width: 800, height: 480 }} />
      <pre style={{ fontSize: 11 }}>{info}</pre>
    </div>
  )
}
