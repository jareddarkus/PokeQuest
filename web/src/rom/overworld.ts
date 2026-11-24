// The walking characters of Pokémon Black 2 / White 2 (archive a/0/4/8, files 7-354). Each file is a small texture pack:
// one 32x32 picture per walking frame, all sharing one palette. We rebuild each as a 12-picture strip:
//   down (stand, step, step), left (...), right (...), up (...)   (the same order the game code uses for directions 0 1 2 3).
import { decodeTexture, readTexFile } from './nitro'
import { decompress } from './nds'
import { paletteOf } from './items'

export const OVERWORLD_NARC = 'a/0/4/8'
export const OW_FIRST = 7
export const OW_LAST = 354
export const OW_FRAME = 32
/** In the 12/24-picture files, are the first side pictures (6-8) the ones that look to the left? Checked by eye in the game. */
export const FIRST_SIDE_IS_LEFT = true

function frameCanvas(tx: { width: number; height: number; rgba: Uint8Array }): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = tx.width
  c.height = tx.height
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tx.rgba), tx.width, tx.height), 0, 0)
  return c
}

function mirrored(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')!
  ctx.translate(src.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(src, 0, 0)
  return c
}

/** The 12 pictures (dir 0..3 x 3 frames) of one walking character, or null if this file is not a normal walker. */
export function buildStrip(raw: Uint8Array): HTMLCanvasElement | null {
  const t = readTexFile(raw)
  if (!t || !t.pals.length) return null
  const n = t.texs.length
  if (n !== 7 && n !== 12 && n !== 24) return null
  const frames = t.texs.map((tex) => decodeTexture(tex, t.pals[0]))
  if (frames.some((f) => f.width !== OW_FRAME || f.height !== OW_FRAME)) return null
  const f = frames.map(frameCanvas)
  const make = (g: HTMLCanvasElement[]): HTMLCanvasElement[] => {
    // order: down x3, left x3, right x3, up x3 (stand, step, step)
    if (n === 7) {
      // 0 up, 1 up step, 2 down, 3 down step, 4 side, 5 side step, 6 side step; the other foot / other side is the mirror image
      const up = [g[0], g[1], mirrored(g[1])]
      const down = [g[2], g[3], mirrored(g[3])]
      const side = [g[4], g[5], g[6]]
      return [...down, ...side, ...side.map(mirrored), ...up]
    }
    const up = [g[0], g[1], g[2]]
    const down = [g[3], g[4], g[5]]
    const a = [g[6], g[7], g[8]]
    const b = [g[9], g[10], g[11]]
    return FIRST_SIDE_IS_LEFT ? [...down, ...a, ...b, ...up] : [...down, ...b, ...a, ...up]
  }
  const walk = make(f.slice(0, n === 7 ? 7 : 12))
  const run = n === 24 ? make(f.slice(12, 24)) : walk // only the 24-picture files (the heroes) have separate running pictures
  const slots = [...walk, ...run]
  const strip = document.createElement('canvas')
  strip.width = OW_FRAME * 24
  strip.height = OW_FRAME
  const ctx = strip.getContext('2d')!
  slots.forEach((s, i) => ctx.drawImage(s, i * OW_FRAME, 0))
  return strip
}

/** Decodes every normal walking character; `put` stores each strip under its file number. Returns the numbers. */
export async function decodeOverworld(files: Uint8Array[], put: (idx: number, blob: Blob) => Promise<void>): Promise<number[]> {
  const ok: number[] = []
  for (let i = OW_FIRST; i <= OW_LAST && i < files.length; i++) {
    try {
      const strip = buildStrip(files[i])
      if (!strip) continue
      const blob = await new Promise<Blob | null>((res) => strip.toBlob(res, 'image/png'))
      if (blob) { await put(i, blob); ok.push(i) }
    } catch { /* not a walker */ }
  }
  return ok
}

// ---------------------------------------------------------------- emote bubbles (a/1/7/1, files 7-18)
export const EMOTE_NARC = 'a/1/7/1'
export const EMOTE_EXCLAIM = 15 // the "!" shown when a trainer spots you
/** 32x32 speech bubbles (smile, "I won!", "Lv.Up!", "!", ...); colours = the first 16 of palette file 0. */
export async function decodeEmotes(files: Uint8Array[], put: (idx: number, blob: Blob) => Promise<void>): Promise<number[]> {
  const pal = paletteOf(files[0])
  const ok: number[] = []
  if (!pal) return ok
  for (let i = 7; i <= 18 && i < files.length; i++) {
    const d = decompress(files[i])
    let p = -1
    for (let k = 0; k + 4 <= d.length; k++) if (d[k] === 0x52 && d[k + 1] === 0x41 && d[k + 2] === 0x48 && d[k + 3] === 0x43) { p = k; break }
    if (p < 0) continue
    const px = d.subarray(p + 32, p + 32 + 512)
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 32
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(32, 32)
    for (let t = 0; t < 16; t++) {
      const bx = (t % 4) * 8, by = Math.floor(t / 4) * 8
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
          const v = x & 1 ? b >> 4 : b & 15
          if (v === 0) continue
          const rgb = pal[v] ?? [255, 0, 255]
          const o = ((by + y) * 32 + bx + x) * 4
          img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
    if (blob) { await put(i, blob); ok.push(i) }
  }
  return ok
}

/** The item ball lying on the ground (file 115 of a/0/4/8, one 32x32 picture). */
export async function decodeFieldBall(files: Uint8Array[]): Promise<Blob | null> {
  const t = readTexFile(files[115])
  if (!t || !t.texs.length || !t.pals.length) return null
  const c = frameCanvas(decodeTexture(t.texs[0], t.pals[0]))
  return new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
}
