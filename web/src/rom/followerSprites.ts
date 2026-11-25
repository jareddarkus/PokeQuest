// The walking Pokémon of Pokémon Black 2 / White 2 (archive a/0/4/8, files 355 and up): small 32x32 pictures that look up / down / left / right, two pictures each
// (the right-facing pictures are separate in 8-picture files; 6-picture files only have up, down, left and right is the left one turned around).
// We rebuild each as a strip of 8 pictures: up, up, down, down, left, left, right, right.
import { decodeTexture, readTexFile } from './nitro'

export const FOLLOWER_NARC = 'a/0/4/8'
export const FOLLOWER_FRAME = 32

function frameCanvas(tx: { width: number; height: number; rgba: Uint8Array }, mirror = false): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = tx.width
  c.height = tx.height
  const src = document.createElement('canvas')
  src.width = tx.width
  src.height = tx.height
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tx.rgba), tx.width, tx.height), 0, 0)
  const ctx = c.getContext('2d')!
  if (mirror) { ctx.translate(tx.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(src, 0, 0)
  return c
}

/** The 8-picture strip of one walking Pokémon file, or null when the file is not one. */
export function buildFollowerStrip(raw: Uint8Array): HTMLCanvasElement | null {
  const t = readTexFile(raw)
  if (!t || !t.pals.length || (t.texs.length !== 6 && t.texs.length !== 8)) return null
  const tx = t.texs.map((x) => decodeTexture(x, t.pals[0]))
  if (tx.some((x) => x.width !== FOLLOWER_FRAME || x.height !== FOLLOWER_FRAME)) return null
  const right = t.texs.length === 8 ? [frameCanvas(tx[6]), frameCanvas(tx[7])] : [frameCanvas(tx[4], true), frameCanvas(tx[5], true)]
  const slots = [frameCanvas(tx[0]), frameCanvas(tx[1]), frameCanvas(tx[2]), frameCanvas(tx[3]), frameCanvas(tx[4]), frameCanvas(tx[5]), ...right]
  const strip = document.createElement('canvas')
  strip.width = FOLLOWER_FRAME * 8
  strip.height = FOLLOWER_FRAME
  const ctx = strip.getContext('2d')!
  slots.forEach((s, i) => ctx.drawImage(s, i * FOLLOWER_FRAME, 0))
  return strip
}

/** Stores `pow:<file>` (strip as a picture) for every file number asked for. Returns how many were stored. */
export async function decodeFollowers(files: Uint8Array[], wanted: number[], put: (key: string, b: Blob) => Promise<void>): Promise<number> {
  let n = 0
  for (const i of wanted) {
    if (!files[i]) continue
    try {
      const strip = buildFollowerStrip(files[i])
      if (!strip) continue
      const blob = await new Promise<Blob | null>((res) => strip.toBlob(res, 'image/png'))
      if (blob) { await put(`pow:${i}`, blob); n++ }
    } catch { /* not a walking Pokémon */ }
  }
  return n
}
