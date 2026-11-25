/**
 * Pixel-perfect sizes: a picture scaled with "pixelated" looks uneven (some picture pixels wider than others, letters hard to read) unless every
 * picture pixel covers a WHOLE number of screen (device) pixels. `snap` rounds a scale down so that scale x devicePixelRatio is whole
 * (on a 3x phone screen 1.64 becomes 1.33 = 4 device pixels; on a normal screen 4.55 becomes 4).
 */
export function snap(k: number): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.max(1 / dpr, Math.floor(k * dpr + 1e-6) / dpr)
}
