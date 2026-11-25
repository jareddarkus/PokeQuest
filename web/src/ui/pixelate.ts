// A few new Pokémon (generation 8 / 9) have no pixel-art picture anywhere yet; the only pictures are 3D renders, which look out of place next to the others.
// For those few we turn the 3D render into pixel art: shrink it to a small size, use only about 18 colours, hard edges and a dark outline.
// (Pictures come from the open PokeAPI sprite collection while playing; nothing is stored by us.)
import { Dex } from '@pkmn/sim'

export const NO_PIXEL_ART = new Set([922, 933, 940, 949, 953, 954, 981, 1012, 1017, 1023])

const urls = new Map<string, string>() // `${dex}|${shiny}` -> picture (96 x 96 PNG)
const boxes = new Map<number, [number, number, number, number]>()
const pending = new Map<string, Promise<void>>()

const homeUrl = (dex: number, shiny: boolean) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${shiny ? 'shiny/' : ''}${dex}.png`

/** The pixel-art picture (once it has been made) of a Pokémon without one, or null. */
export function pixelOverride(dex: number, shiny: boolean): string | null {
  if (!NO_PIXEL_ART.has(dex)) return null
  return urls.get(`${dex}|${shiny ? 1 : 0}`) ?? urls.get(`${dex}|0`) ?? null
}
/** Where the Pokémon is inside its 96 x 96 picture: [left, top, right, bottom]. */
export function pixelBoxOverride(dex: number): [number, number, number, number] | undefined { return boxes.get(dex) }

function kmeans(px: Array<[number, number, number]>, k: number): Array<[number, number, number]> {
  const centers: Array<[number, number, number]> = []
  for (let i = 0; i < k; i++) centers.push(px[Math.floor(((i + 0.5) * px.length) / k)] ?? [0, 0, 0])
  for (let it = 0; it < 7; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (const p of px) {
      let b = 0, bd = 1e9
      for (let c = 0; c < k; c++) { const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2; if (d < bd) { bd = d; b = c } }
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++
    }
    sum.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  return centers
}

async function make(dex: number, shiny: boolean): Promise<void> {
  const img = await new Promise<HTMLImageElement | null>((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = homeUrl(dex, shiny) })
  if (!img) return
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const cx = c.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(img, 0, 0)
  const d = cx.getImageData(0, 0, c.width, c.height).data
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const height = Dex.species.all().find((sp) => sp.num === dex && !sp.forme)?.heightm ?? 1
  const target = Math.round(Math.max(30, Math.min(80, 24 + 38 * Math.sqrt(height)))) // the biggest side of the little picture (the game's own pictures: small Pokémon ~40 pixels, big ones ~80)
  const s = Math.min(target / w, target / h)
  const sw = Math.max(4, Math.round(w * s)), sh = Math.max(4, Math.round(h * s))
  const small = document.createElement('canvas'); small.width = sw; small.height = sh
  const sx = small.getContext('2d', { willReadFrequently: true })!
  sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'
  sx.drawImage(c, x0, y0, w, h, 0, 0, sw, sh)
  const sd = sx.getImageData(0, 0, sw, sh)
  const opaque: Array<[number, number, number]> = []
  for (let i = 0; i < sd.data.length; i += 4) if (sd.data[i + 3] > 140) opaque.push([sd.data[i], sd.data[i + 1], sd.data[i + 2]])
  if (!opaque.length) return
  const pal = kmeans(opaque, 18)
  // 96 x 96 picture, the Pokémon in the bottom middle, 1 pixel outline
  const out = document.createElement('canvas'); out.width = 96; out.height = 96
  const ox = out.getContext('2d')!
  const od = ox.createImageData(96, 96)
  const left = Math.round((96 - sw) / 2), top = 96 - 6 - sh
  const solid = new Uint8Array(96 * 96)
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4
    if (sd.data[i + 3] <= 140) continue
    let b = 0, bd = 1e9
    for (let k = 0; k < pal.length; k++) { const dd = (sd.data[i] - pal[k][0]) ** 2 + (sd.data[i + 1] - pal[k][1]) ** 2 + (sd.data[i + 2] - pal[k][2]) ** 2; if (dd < bd) { bd = dd; b = k } }
    const o = ((top + y) * 96 + left + x) * 4
    od.data[o] = pal[b][0]; od.data[o + 1] = pal[b][1]; od.data[o + 2] = pal[b][2]; od.data[o + 3] = 255
    solid[(top + y) * 96 + left + x] = 1
  }
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    if (solid[y * 96 + x]) continue
    const near = (x > 0 && solid[y * 96 + x - 1]) || (x < 95 && solid[y * 96 + x + 1]) || (y > 0 && solid[(y - 1) * 96 + x]) || (y < 95 && solid[(y + 1) * 96 + x])
    if (near) { const o = (y * 96 + x) * 4; od.data[o] = 28; od.data[o + 1] = 24; od.data[o + 2] = 36; od.data[o + 3] = 255 }
  }
  ox.putImageData(od, 0, 0)
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'))
  if (!blob) return
  urls.set(`${dex}|${shiny ? 1 : 0}`, URL.createObjectURL(blob))
  if (!boxes.has(dex)) boxes.set(dex, [Math.max(0, left - 1), Math.max(0, top - 1), Math.min(95, left + sw), Math.min(95, top + sh)])
}

/** Makes the pixel pictures of all those Pokémon ahead of time (normal colours; shiny ones when asked for). */
export function warmPixelArt(dex?: number, shiny = false): Promise<void> {
  const list = dex ? [dex] : [...NO_PIXEL_ART]
  return Promise.all(list.map((n) => {
    const key = `${n}|${shiny ? 1 : 0}`
    if (!NO_PIXEL_ART.has(n)) return Promise.resolve()
    let p = pending.get(key)
    if (!p) { p = make(n, shiny).catch(() => {}); pending.set(key, p) }
    return p
  })).then(() => {})
}
