import { useEffect, useRef, useState } from 'react'
import { loadGameFonts } from '../rom/store'
import { measureNftr, renderLine, type NftrFont } from '../rom/font'

let cache: NftrFont[] | null | undefined
/** The game's fonts once loaded (null = not available). */
export function useGameFonts(): NftrFont[] | null | undefined {
  const [fonts, setFonts] = useState<NftrFont[] | null | undefined>(cache)
  useEffect(() => {
    let live = true
    if (cache === undefined) void loadGameFonts().then((f) => { cache = f; if (live) setFonts(f) })
    return () => { live = false }
  }, [])
  return fonts
}

/** Cuts `text` into lines no wider than `maxW` font pixels. */
function wrap(f: NftrFont, text: string, maxW: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const word of para.split(' ')) {
      const t = cur ? `${cur} ${word}` : word
      if (cur && measureNftr(f, t) > maxW) { lines.push(cur); cur = word } else cur = t
    }
    lines.push(cur)
  }
  return lines
}

/**
 * Text in the game's own font (from the player's game file). `k` = screen pixels per font pixel (whole numbers keep it crisp).
 * `font`: 0 = the main text font (15 px), 1 = the small one (10 px), 2 = the medium one (13 px).
 * Falls back to ordinary page text while the font is not there (before the game file is imported).
 */
export default function FontText({ text, k = 2, font = 0, color = '#ffffff', shadow = '#6b6b78', maxWidth, align = 'left', outline = false, reveal, style }: {
  text: string; reveal?: number; k?: number; font?: 0 | 1 | 2 | 3; color?: string; shadow?: string | null; outline?: boolean; maxWidth?: number; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties
}) {
  const fonts = useGameFonts()
  const ref = useRef<HTMLCanvasElement>(null)
  const f = fonts?.[font]
  const lines = f ? (maxWidth ? wrap(f, text, maxWidth) : [text]) : []
  let left = reveal ?? Infinity
  const shown = lines.map((l) => { const part = l.slice(0, Math.max(0, left)); left -= l.length + 1; return part })
  const key = f ? shown.join('\n') : ''
  const W = f ? Math.max(1, ...lines.map((l) => measureNftr(f, l) + 2)) : 0
  const lineH = f ? f.cellH + 1 : 0
  useEffect(() => {
    const c = ref.current
    if (!c || !f) return
    c.width = W; c.height = Math.max(1, lines.length * lineH + 1)
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    shown.forEach((l, i) => {
      const w = measureNftr(f, l)
      const x = align === 'right' ? W - w - 2 : align === 'center' ? Math.round((W - w) / 2) : 0
      if (l) ctx.drawImage(renderLine(f, l, color, shadow, outline), x, i * lineH)
    })
  }, [f, key, color, shadow, align, W, k, outline])
  if (!f) return <span style={style}>{reveal === undefined ? text : text.slice(0, reveal)}</span>
  return <canvas ref={ref} aria-label={text} role="img" style={{ width: W * k, height: (lines.length * lineH + 1) * k, imageRendering: 'pixelated', display: 'block', ...style }} />
}
