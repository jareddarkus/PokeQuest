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

/** A cheap fingerprint of a picture (used to recognise the game's identical "X" placeholder pictures) and how many pixels of it are visible. */
function pictureInfo(c: HTMLCanvasElement): { hash: string; mask: string; opaque: number } {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let h = 2166136261, m = 2166136261, o = 0
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] > 0) o++
    m = Math.imul(m ^ d[k + 3], 16777619)
    if (k % 28 === 0) h = Math.imul(h ^ d[k], 16777619)
  }
  return { hash: `${c.width}x${c.height}:${h >>> 0}`, mask: `${m >>> 0}`, opaque: o }
}

/** What the game uses to fill pictures a character never needs: the shapes (silhouettes) of its big "X" pictures. */
export interface Placeholders { masks: Set<string> }

/**
 * Some characters only have the pictures the game needs (a gym leader that only ever faces you has no "up" pictures, no step pictures ...):
 * the game file fills the rest with a big X (black or white) or leaves the picture empty. We swap every such picture for a real picture of
 * the same character (the standing picture of the same direction, or of another direction when that one is missing too).
 * Returns null when the file is a one-direction object / a tiny creature and not a character.
 */
function withoutPlaceholders(g: HTMLCanvasElement[], bad: Placeholders): HTMLCanvasElement[] | null {
  const isBad = (c: HTMLCanvasElement) => { const i = pictureInfo(c); return i.opaque < 60 || bad.masks.has(i.mask) }
  const stands = [0, 1, 2, 3].map((d) => g[d * 3]).filter((c) => !isBad(c))
  if (stands.length < 3 || isBad(g[0]) || pictureInfo(g[0]).opaque < 120) return null
  const out = g.slice()
  for (let d = 0; d < 4; d++) {
    const stand = isBad(g[d * 3]) ? stands[0] : g[d * 3]
    out[d * 3] = stand
    for (const k of [1, 2]) if (isBad(g[d * 3 + k])) out[d * 3 + k] = stand
  }
  return out
}

/** The 12 pictures (dir 0..3 x 3 frames) of one walking character, or null if this file is not a normal walker. `count` collects how often each picture appears in the whole game; `bad` = the placeholder pictures to replace. */
export function buildStrip(raw: Uint8Array, opts?: { count?: Map<string, { n: number; mask: string; opaque: number }>; bad?: Placeholders }): HTMLCanvasElement | null {
  const t = readTexFile(raw)
  if (!t || !t.pals.length) return null
  const n = t.texs.length
  if (n !== 7 && n !== 12 && n !== 24) return null
  const frames = t.texs.map((tex) => decodeTexture(tex, t.pals[0]))
  if (frames.some((f) => f.width !== OW_FRAME || f.height !== OW_FRAME)) return null
  const f = frames.map(frameCanvas)
  if (opts?.count) {
    const here = new Map(f.map((c) => { const i = pictureInfo(c); return [i.hash, i] as const }))
    for (const [h, i] of here) { const e = opts.count.get(h); if (e) e.n++; else opts.count.set(h, { n: 1, mask: i.mask, opaque: i.opaque }) }
  }
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
  const walk0 = make(f.slice(0, n === 7 ? 7 : 12))
  const walk = opts?.bad ? withoutPlaceholders(walk0, opts.bad) : walk0
  if (!walk) return null
  const run0 = n === 24 ? make(f.slice(12, 24)) : null
  const run = run0 ? (opts?.bad ? withoutPlaceholders(run0, opts.bad) ?? walk : run0) : walk // only the 24-picture files (the heroes) have separate running pictures
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
  // The game file holds a number of identical "X" pictures for characters that do not exist (dummy entries): any picture that appears
  // four or more times is such a placeholder and is left out, so no character is ever drawn as a big black X.
  const hashOf = (c: HTMLCanvasElement): string => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let h = 2166136261
    for (let k = 0; k < d.length; k += 7) h = Math.imul(h ^ d[k], 16777619)
    return `${c.width}x${c.height}:${h >>> 0}`
  }
  const seen = new Map<string, number>()
  const hashes = new Map<number, string>()
  const count = new Map<string, { n: number; mask: string; opaque: number }>() // how many files contain each single picture
  for (let i = OW_FIRST; i <= OW_LAST && i < files.length; i++) {
    try {
      const strip = buildStrip(files[i], { count })
      if (!strip) continue
      const h = hashOf(strip)
      hashes.set(i, h)
      seen.set(h, (seen.get(h) ?? 0) + 1)
    } catch { /* not a walker */ }
  }
  const bad: Placeholders = { masks: new Set() } // a single picture that shows up in many different files is the placeholder "X": remember its shape
  for (const e of count.values()) if (e.n >= 12 && e.opaque >= 60 && e.opaque <= 100) bad.masks.add(e.mask)
  for (const [i, h] of hashes) {
    if ((seen.get(h) ?? 0) >= 4) continue
    try {
      const strip = buildStrip(files[i], { bad })
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
