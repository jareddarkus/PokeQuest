// A fully customizable trainer, drawn with code (placeholder look until the White 2 trainer sprites are imported).
import type { Dir } from './world'

export interface Look {
  skin: string
  hairStyle: number // 0 short, 1 long, 2 spiky, 3 bald, 4 ponytail
  hair: string
  eyes: string
  top: string
  topStyle: number // 0 t-shirt, 1 jacket, 2 hoodie
  bottom: string
  bottomStyle: number // 0 trousers, 1 shorts, 2 skirt
  shoes: string
  hat: number // 0 none, 1 cap, 2 beanie, 3 wide hat
  hatColor: string
}

export const SKIN_TONES = ['#ffe0c7', '#f5cba7', '#e0ac82', '#c68642', '#8d5524', '#5c3a1e']
export const HAIR_COLORS = ['#2b1d12', '#5a3825', '#9a6a3a', '#d9b25f', '#e8e0c8', '#b3382c', '#3a6fd8', '#8a4bd1', '#2fa36b', '#e86fae']
export const EYE_COLORS = ['#2b1d12', '#5a3a1e', '#2d6bd8', '#2f9a5a', '#7a7f86', '#a04bd1']
export const CLOTH_COLORS = ['#e04b4b', '#e8913a', '#f2d13d', '#59b95a', '#3fb5b0', '#4a7be0', '#8a58d6', '#e46fae', '#f1f1f1', '#6b6b73', '#2b2b30', '#8a5a34']

export const HAIR_STYLE_NAMES = ['Short', 'Long', 'Spiky', 'Bald', 'Ponytail']
export const TOP_STYLE_NAMES = ['T-shirt', 'Jacket', 'Hoodie']
export const BOTTOM_STYLE_NAMES = ['Trousers', 'Shorts', 'Skirt']
export const HAT_NAMES = ['None', 'Cap', 'Beanie', 'Wide hat']

export function defaultLook(): Look {
  return {
    skin: SKIN_TONES[1], hairStyle: 0, hair: HAIR_COLORS[1], eyes: EYE_COLORS[0],
    top: CLOTH_COLORS[0], topStyle: 0, bottom: CLOTH_COLORS[10], bottomStyle: 0, shoes: CLOTH_COLORS[9],
    hat: 0, hatColor: CLOTH_COLORS[5],
  }
}

export function randomLook(seed: number): Look {
  let s = seed >>> 0
  const r = (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s >>> 8) % n
  }
  return {
    // people in the game mostly have natural hair/eye colours, dark trousers and dark shoes
    skin: SKIN_TONES[r(SKIN_TONES.length)], hairStyle: r(5), hair: HAIR_COLORS[r(6)],
    eyes: EYE_COLORS[r(4)], top: CLOTH_COLORS[r(CLOTH_COLORS.length)], topStyle: r(3),
    bottom: CLOTH_COLORS[[5, 9, 10, 11][r(4)]], bottomStyle: r(3), shoes: CLOTH_COLORS[[9, 10, 11][r(3)]],
    hat: r(4) === 0 ? 1 + r(3) : 0, hatColor: CLOTH_COLORS[r(CLOTH_COLORS.length)],
  }
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/**
 * Draws the trainer so its feet are at (cx, footY). `u` is the size of one sprite pixel (the sprite is 16 x 24 pixels).
 * frame: 0 standing, 1 / 2 walking steps.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D, cx: number, footY: number, u: number, look: Look, dir: Dir, frame: number,
): void {
  const x0 = cx - 8 * u
  const y0 = footY - 24 * u
  const rect = (gx: number, gy: number, gw: number, gh: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x0 + gx * u), Math.round(y0 + gy * u), Math.ceil(gw * u), Math.ceil(gh * u))
  }
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0
  const bob = frame === 0 ? 0 : 0.5

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(cx, footY - u * 0.3, 5 * u, 1.6 * u, 0, 0, Math.PI * 2)
  ctx.fill()

  const side = dir === 1 || dir === 2
  const flip = dir === 1 ? -1 : 1

  // legs
  const legColor = look.bottomStyle === 1 || look.bottomStyle === 2 ? look.skin : look.bottom
  if (side) {
    rect(6.5 + step * 1.2 * flip, 17 - bob, 3, 5, legColor)
    rect(6.5 - step * 1.2 * flip, 17 - bob, 3, 5, shade(legColor, -20))
    rect(6.5 + step * 1.2 * flip, 22 - bob, 4, 2, look.shoes)
    rect(6.5 - step * 1.2 * flip, 22 - bob, 4, 2, shade(look.shoes, -25))
  } else {
    rect(5, 17 - bob + (step > 0 ? -0.5 : 0), 3, 5 + (step > 0 ? 0.5 : 0), legColor)
    rect(8, 17 - bob + (step < 0 ? -0.5 : 0), 3, 5 + (step < 0 ? 0.5 : 0), shade(legColor, -10))
    rect(4.6, 22 - bob + (step > 0 ? -0.5 : 0), 3.6, 2, look.shoes)
    rect(7.8, 22 - bob + (step < 0 ? -0.5 : 0), 3.6, 2, look.shoes)
  }

  // bottoms (shorts / skirt over the legs)
  if (look.bottomStyle === 1) rect(side ? 6 : 4.5, 16 - bob, side ? 4 : 7, 3, look.bottom)
  if (look.bottomStyle === 2) rect(side ? 5 : 3.5, 15.5 - bob, side ? 6 : 9, 4, look.bottom)
  if (look.bottomStyle === 0) rect(side ? 6 : 4.5, 15.5 - bob, side ? 4 : 7, 2, shade(look.bottom, -10))

  // arms (behind the body when seen from the side)
  const armSwing = step * 1.2
  if (!side) {
    rect(2.5, 10.5 - bob + (step > 0 ? 0.6 : 0), 2, 6, look.topStyle === 0 ? look.skin : look.top)
    rect(11.5, 10.5 - bob + (step < 0 ? 0.6 : 0), 2, 6, look.topStyle === 0 ? look.skin : look.top)
  }
  // torso
  rect(side ? 5.5 : 4.5, 10 - bob, side ? 5 : 7, 6, look.top)
  if (look.topStyle === 1) rect(7.5, 10 - bob, 1, 6, shade(look.top, -45))
  if (look.topStyle === 2) rect(5, 10 - bob, 6, 2, shade(look.top, -25))
  if (side) rect(7 + armSwing * flip * 0.6, 10.5 - bob, 2, 6, look.topStyle === 0 ? look.skin : shade(look.top, -15))

  // head
  const headY = 2 - bob
  rect(4, headY, 8, 8, look.skin)
  // hair (back layer for long styles)
  const back = dir === 3
  if (look.hairStyle === 1) {
    rect(3.5, headY - 0.5, 9, 4, look.hair)
    rect(3.5, headY, 1.5, 9, look.hair)
    rect(11, headY, 1.5, 9, look.hair)
    if (back) rect(4, headY, 8, 9, look.hair)
  } else if (look.hairStyle === 4) {
    rect(3.5, headY - 0.5, 9, 3.5, look.hair)
    if (back || side) rect(side ? (dir === 1 ? 10.5 : 3) : 7, headY + 2, 2, 7, look.hair)
    else rect(11.5, headY + 2, 2, 6, look.hair)
    if (back) rect(4, headY, 8, 6, look.hair)
  } else if (look.hairStyle === 2) {
    rect(3.5, headY - 1, 9, 4, look.hair)
    rect(4.5, headY - 2.5, 2, 2, look.hair)
    rect(7.2, headY - 3, 2, 2.5, look.hair)
    rect(9.5, headY - 2.5, 2, 2, look.hair)
    if (back) rect(4, headY, 8, 6, look.hair)
  } else if (look.hairStyle === 0) {
    rect(3.5, headY - 0.5, 9, 3, look.hair)
    if (back) rect(4, headY, 8, 6, look.hair)
    else rect(3.5, headY, 1.5, 4, look.hair)
    if (!back) rect(11, headY, 1.5, 4, look.hair)
  }
  // eyes
  if (!back) {
    if (side) rect(dir === 1 ? 5.2 : 9.8, headY + 4, 1.3, 2, look.eyes)
    else {
      rect(5.5, headY + 4, 1.5, 2, look.eyes)
      rect(9, headY + 4, 1.5, 2, look.eyes)
    }
  }
  // hat
  if (look.hat === 1) {
    rect(3.5, headY - 1.2, 9, 3.2, look.hatColor)
    if (dir === 0) rect(3.5, headY + 1.6, 9, 1.2, shade(look.hatColor, -30))
    else if (dir === 1) rect(1.5, headY + 1.2, 4, 1.2, shade(look.hatColor, -30))
    else if (dir === 2) rect(10.5, headY + 1.2, 4, 1.2, shade(look.hatColor, -30))
  } else if (look.hat === 2) {
    rect(3.5, headY - 1.8, 9, 4, look.hatColor)
    rect(3.2, headY + 1.2, 9.6, 1.1, shade(look.hatColor, -35))
  } else if (look.hat === 3) {
    rect(1.5, headY + 0.6, 13, 1.6, look.hatColor)
    rect(4, headY - 2, 8, 3, look.hatColor)
  }
}
