// Draws the quads of a particle effect (see spl.ts) on a 2D canvas. `project` turns a world point into canvas pixels.
import type { SplQuad, SplTexture } from './spl'

const tinted = new Map<string, HTMLCanvasElement>()
function tintedPicture(tex: SplTexture, key: string, r: number, g: number, b: number): HTMLCanvasElement {
  const id = `${key}|${r}|${g}|${b}`
  let c = tinted.get(id)
  if (c) return c
  c = document.createElement('canvas'); c.width = tex.w; c.height = tex.h
  const x = c.getContext('2d')!
  x.drawImage(tex.canvas, 0, 0)
  if (r < 31 || g < 31 || b < 31) {
    x.globalCompositeOperation = 'multiply'
    x.fillStyle = `rgb(${(r * 255) / 31 | 0},${(g * 255) / 31 | 0},${(b * 255) / 31 | 0})`
    x.fillRect(0, 0, tex.w, tex.h)
    x.globalCompositeOperation = 'destination-in'
    x.drawImage(tex.canvas, 0, 0)
  }
  if (tinted.size > 600) tinted.clear()
  tinted.set(id, c)
  return c
}

export function drawQuads(ctx: CanvasRenderingContext2D, quads: SplQuad[], project: (p: [number, number, number]) => [number, number]) {
  ctx.imageSmoothingEnabled = false
  for (const q of quads) {
    const [tl, tr, , bl] = q.corners.map(project)
    const pic = tintedPicture(q.tex, String(q.tex.id), Math.round(q.color[0]), Math.round(q.color[1]), Math.round(q.color[2]))
    const w = q.tex.w, h = q.tex.h
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, q.alpha))
    let a = (tr[0] - tl[0]) / w, b = (tr[1] - tl[1]) / w, c = (bl[0] - tl[0]) / h, d = (bl[1] - tl[1]) / h, e = tl[0], f = tl[1]
    if (q.flipS) { e += a * w; a = -a; b = -b }
    if (q.flipT) { e += c * h; f += d * h; c = -c; d = -d }
    ctx.setTransform(a, b, c, d, e, f)
    ctx.drawImage(pic, 0, 0)
    ctx.restore()
  }
}
