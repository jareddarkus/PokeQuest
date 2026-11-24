// The walking characters of Pokémon Black 2 / White 2 (archive a/0/4/8, files 7-354). Each file is a small texture pack:
// one 32x32 picture per walking frame, all sharing one palette. We rebuild each as a 12-picture strip:
//   down (stand, step, step), left (...), right (...), up (...)   (the same order the game code uses for directions 0 1 2 3).
import { decodeTexture, readTexFile } from './nitro'

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
  let slots: HTMLCanvasElement[] // order: down x3, left x3, right x3, up x3
  if (n === 7) {
    // 0 up, 1 up step, 2 down, 3 down step, 4 side, 5 side step, 6 side step; the other foot / other side is the mirror image
    const up = [f[0], f[1], mirrored(f[1])]
    const down = [f[2], f[3], mirrored(f[3])]
    const side = [f[4], f[5], f[6]] // these look to one side; the other side is the mirror image
    slots = [...down, ...side, ...side.map(mirrored), ...up]
  } else {
    const up = [f[0], f[1], f[2]]
    const down = [f[3], f[4], f[5]]
    const a = [f[6], f[7], f[8]]
    const b = [f[9], f[10], f[11]]
    slots = FIRST_SIDE_IS_LEFT ? [...down, ...a, ...b, ...up] : [...down, ...b, ...a, ...up]
  }
  const strip = document.createElement('canvas')
  strip.width = OW_FRAME * 12
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
