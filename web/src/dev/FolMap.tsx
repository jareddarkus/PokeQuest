// DEVELOPER TOOL (local test server only): works out which walking-Pokémon file of archive a/0/4/8 (files 355 and up) belongs to which Pokémon,
// by lining the files up (in order) with the game's party-menu icons by colour. Opens at  ?folmap  and prints the table + a contact sheet to check by eye.
import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { decodeTexture, readTexFile } from '../rom/nitro'
import { Dex } from '@pkmn/sim'
import { romIconUrl, romSpriteUrl } from '../rom/store'

const FIRST = 355
type Feat = Float32Array

function featOf(c: HTMLCanvasElement | ImageBitmap | HTMLImageElement, sx = 0, sy = 0, w = 32, h = 32): Feat {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.drawImage(c as CanvasImageSource, sx, sy, w, h, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  // a soft histogram of hues (24 bins, weighted by how colourful and how many pixels) + 4 bins for dark / grey / light / white pixels
  const f = new Float32Array(512)
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, sat = mx === 0 ? 0 : (mx - mn) / mx
    if (v < 0.22) continue // outline
    n++
    if (sat < 0.18) { f[24 + (v > 0.85 ? 3 : v > 0.55 ? 2 : 1)] += 1; continue }
    let hh = 0
    const dd = mx - mn
    if (mx === r) hh = ((g - b) / dd) % 6; else if (mx === g) hh = (b - r) / dd + 2; else hh = (r - g) / dd + 4
    const pos = ((hh + 6) % 6) * 4 // 24 bins
    const i0 = Math.floor(pos) % 24, i1 = (i0 + 1) % 24, fr = pos - Math.floor(pos)
    f[i0] += (1 - fr) * sat; f[i1] += fr * sat
  }
  let norm = 0
  for (let i = 0; i < 28; i++) { f[i] = Math.sqrt(f[i] / Math.max(1, n)); norm += f[i] * f[i] }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < 28; i++) f[i] /= norm
  return f
}
/** a tiny 8 x 8 picture of the visible part, for comparing colours place by place */
function thumbOf(c: CanvasImageSource, w: number, h: number): Float32Array {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.drawImage(c, 0, 0)
  const d = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const bw = Math.max(1, x1 - x0 + 1), bh = Math.max(1, y1 - y0 + 1)
  const t = document.createElement('canvas')
  t.width = 8; t.height = 8
  const tc = t.getContext('2d')!
  tc.imageSmoothingEnabled = true
  tc.drawImage(cv, x0, y0, bw, bh, 0, 0, 8, 8)
  const td = tc.getImageData(0, 0, 8, 8).data
  return Float32Array.from(td)
}
/** how much the visible shapes (cut to the picture's own edges, shrunk to 12 x 12) overlap */
function maskOf(c: CanvasImageSource, w: number, h: number): Uint8Array {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  ctx.drawImage(c, 0, 0)
  const d = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const bw = Math.max(1, x1 - x0 + 1), bh = Math.max(1, y1 - y0 + 1)
  const t = document.createElement('canvas')
  t.width = 12; t.height = 12
  const tc = t.getContext('2d')!
  tc.drawImage(cv, x0, y0, bw, bh, 0, 0, 12, 12)
  const td = tc.getImageData(0, 0, 12, 12).data
  const m = new Uint8Array(144)
  for (let i = 0; i < 144; i++) m[i] = td[i * 4 + 3] > 100 ? 1 : 0
  return m
}
function maskSim(a: Uint8Array, b: Uint8Array): number {
  let i = 0, u = 0
  for (let k = 0; k < 144; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++ }
  return u ? i / u : 0
}
function thumbSim(a: Float32Array, b: Float32Array): number {
  let s = 0, wsum = 0
  for (let i = 0; i < 64; i++) {
    const aa = a[i * 4 + 3] / 255, ab = b[i * 4 + 3] / 255
    const w = Math.min(aa, ab)
    const dist = (Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2])) / 765
    s += w * (1 - dist) - 0.5 * Math.abs(aa - ab) * 0 // cells only one of them has are not counted as colour
    wsum += Math.max(aa, ab)
  }
  return wsum ? s / wsum : 0
}
const cos = (a: Feat, b: Feat) => { let s = 0; for (let i = 0; i < 512; i++) s += a[i] * b[i]; return s }

export default function FolMap() {
  const [info, setInfo] = useState('loading…')
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    void (async () => {
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const files = parseNarc(await nds.get('a/0/4/8'))
      const sprites: Array<{ file: number; front: HTMLCanvasElement; feat: Feat; th: Float32Array; mk: Uint8Array }> = []
      for (let i = FIRST; i < files.length; i++) {
        const t = readTexFile(files[i])
        if (!t || t.texs.length < 6) continue
        const tx = decodeTexture(t.texs[2], t.pals[0])
        const c = document.createElement('canvas')
        c.width = tx.width; c.height = tx.height
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tx.rgba), tx.width, tx.height), 0, 0)
        sprites.push({ file: i, front: c, feat: featOf(c), th: thumbOf(c, 32, 32), mk: maskOf(c, 32, 32) })
      }
      const icons: Array<{ dex: number; img: HTMLImageElement; big?: HTMLImageElement; feat: Feat; feat2: Feat; th: Float32Array; th2: Float32Array; mk: Uint8Array }> = []
      for (let dex = 1; dex <= 649; dex++) {
        const u = await romIconUrl(dex)
        const su = await romSpriteUrl(dex, false, false) // the battle picture has the real colours of the Pokémon
        if (!u || !su) { icons.push({ dex, img: new Image(), feat: new Float32Array(512), feat2: new Float32Array(512), th: new Float32Array(256), th2: new Float32Array(256), mk: new Uint8Array(144) }); continue }
        const img = new Image()
        img.src = u
        await img.decode()
        const big = new Image()
        big.src = su
        await big.decode()
        icons.push({ dex, img, big, feat: featOf(big, 0, 0, big.naturalWidth, big.naturalHeight), feat2: featOf(img, 0, 0, 32, 32), th: thumbOf(big, big.naturalWidth, big.naturalHeight), th2: thumbOf(img, 32, 32), mk: maskOf(img, 32, 32) })
      }
      // Arceus has 17-18 files whose shapes are identical (only the colour differs): they are all Arceus (493) and are taken out of the line-up
      const q0 = new URLSearchParams(location.search)
      const arcFrom = Number(q0.get('arc0') ?? -1), arcTo = Number(q0.get('arc1') ?? -2)
      const arceus = sprites.filter((x) => x.file >= arcFrom && x.file <= arcTo)
      for (let k = sprites.length - 1; k >= 0; k--) if (sprites[k].file >= arcFrom && sprites[k].file <= arcTo) sprites.splice(k, 1)
      const names: Record<number, string> = {}
      for (const sp of Dex.species.all()) if (sp.num > 0 && sp.num <= 649 && !names[sp.num] && !sp.forme) names[sp.num] = sp.name
      const n = sprites.length, D = 649
      const sim: Float32Array[] = sprites.map((s) => Float32Array.from(icons.map((ic) => 0.2 * (0.65 * cos(s.feat, ic.feat) + 0.35 * cos(s.feat, ic.feat2)) + 0.35 * (0.5 * thumbSim(s.th, ic.th) + 0.5 * thumbSim(s.th, ic.th2)) + 0.45 * maskSim(s.mk, ic.mk))))
      const NEG = -1e9
      const best: Float32Array[] = []
      const from: Int16Array[] = []
      const P = Number(new URLSearchParams(location.search).get('p') ?? 0.12) // a Pokémon without a file costs a little
      for (let i = 0; i < n; i++) {
        const b = new Float32Array(D).fill(NEG), fr = new Int16Array(D).fill(-1)
        for (let d = 0; d < D; d++) {
          if (i === 0) { b[d] = sim[i][d] - P * d; continue }
          // a file for a new Pokémon (any later number), or the same Pokémon again (a second, look-alike file)
          const prev = best[i - 1]
          let bestV = NEG, bestD = -1
          // same Pokémon again only when the two files look alike
          const alike = cos(sprites[i].feat, sprites[i - 1].feat)
          if (alike > 0.93 && prev[d] > NEG / 2) { bestV = prev[d] - 0.35; bestD = d }
          for (let dp = Math.max(0, d - 12); dp < d; dp++) { // missing Pokémon in between are rare: look back at most 12
            if (prev[dp] <= NEG / 2) continue
            const v = prev[dp] - P * (d - dp - 1)
            if (v > bestV) { bestV = v; bestD = dp }
          }
          if (bestD >= 0) { b[d] = bestV + sim[i][d]; fr[d] = bestD }
        }
        best.push(b); from.push(fr)
      }
      // the end: the best last position
      let d = 0
      for (let k = 0; k < D; k++) if (best[n - 1][k] > best[n - 1][d]) d = k
      const map: number[] = new Array(n).fill(0)
      for (let i = n - 1; i >= 0; i--) { map[i] = d + 1; d = from[i][d] }
      const low = map.map((dex, i) => ({ i, dex, s: sim[i][dex - 1] })).filter((x) => x.s < 0.75)
      const out: Record<number, number> = {}
      map.forEach((dex, i) => { out[sprites[i].file] = dex })
      for (const a of arceus) out[a.file] = 493
      for (let f = 903; f <= 920; f++) out[f] = 493 // Arceus's 18 forms (identical shapes); the other Pokémon the line-up put there have no walking picture
      setInfo(`files=${n} lastDex=${map[n - 1]} lowSim=${low.length}\n${JSON.stringify(out)}`)
      const sims = map.map((dex, i) => +sim[i][dex - 1].toFixed(2))
      const shapes = sprites.map((sp, i) => (i ? +maskSim(sp.mk, sprites[i - 1].mk).toFixed(2) : 0))
      ;(window as unknown as Record<string, unknown>).__folmap = { out, sims, shapes, files: sprites.map((x) => x.file), low: low.map((x) => [sprites[x.i].file, x.dex, +x.s.toFixed(2)]) }
      // contact sheet: sprite | icon, 12 per row; page chosen with &from=
      const q = new URLSearchParams(location.search)
      const from0 = Number(q.get('from') ?? 0), cnt = q.has('all') ? 9999 : Number(q.get('n') ?? 60)
      const solo = q.has('solo')
      const zoomS = Number(q.get('zs') ?? 1)
      const cols = solo ? Math.floor(8 / zoomS) : 6, cell = solo ? 86 * zoomS : 130
      const c = ref.current!
      c.width = cols * cell; c.height = Math.ceil(Math.min(cnt, n - from0) / cols) * (solo ? 100 * zoomS : 80)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#334'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.font = '10px monospace'; ctx.imageSmoothingEnabled = false
      const only = q.has('low') ? map.map((_, i) => i).filter((i) => sim[i][map[i] - 1] < Number(q.get('low') ?? 0.55)) : null
      if (only) { c.height = Math.ceil(Math.min(cnt, only.length) / cols) * 80; ctx.fillStyle = '#334'; ctx.fillRect(0, 0, c.width, c.height); ctx.font = '10px monospace'; ctx.imageSmoothingEnabled = false }
      for (let k = 0; k < cnt && (only ? from0 + k < only.length : from0 + k < n); k++) {
        const i = only ? only[from0 + k] : from0 + k
        if (solo) { const sx = (k % cols) * cell, sy = Math.floor(k / cols) * 100 * zoomS; ctx.drawImage(sprites[i].front, sx + 4, sy + 14, 80 * zoomS, 80 * zoomS); ctx.fillStyle = '#ff0'; ctx.fillText(String(sprites[i].file), sx + 4, sy + 10); continue }
        const x = (k % cols) * cell, y = Math.floor(k / cols) * 80
        ctx.drawImage(sprites[i].front, x + 2, y + 14, 56, 56)
        if (q.has('bigpic') && icons[map[i] - 1].big) ctx.drawImage(icons[map[i] - 1].big!, x + 62, y + 14, 56, 56); else ctx.drawImage(icons[map[i] - 1].img, 0, 0, 32, 32, x + 62, y + 14, 56, 56)
        ctx.fillStyle = '#ff0'; ctx.fillText(`${sprites[i].file}>${map[i]} ${names[map[i]] ?? ''}`.slice(0, 20), x + 2, y + 10)
      }
    })()
  }, [])
  return (
    <div style={{ background: '#223', color: '#cfc', minHeight: '100vh' }}>
      <canvas ref={ref} style={{ imageRendering: 'pixelated' }} />
      <pre id="folinfo" style={{ whiteSpace: 'pre-wrap', fontSize: 10 }}>{info}</pre>
    </div>
  )
}
