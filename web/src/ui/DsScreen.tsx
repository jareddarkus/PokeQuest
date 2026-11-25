import type { CSSProperties, ReactNode } from 'react'
import { useUiUrl } from './CmdButton'

/** How many screen pixels one DS pixel gets in a menu (whole numbers keep the pixel art sharp). */
export function dsK(max = 3): number {
  return Math.max(1, Math.min(max, Math.floor((window.innerWidth - 24) / 256), Math.floor((window.innerHeight - 140) / 192)))
}

const BASE: Record<string, string> = { 'bag:red': '#6b0010', 'bag:blue': '#0f4aa8', 'bag:dark': '#4a0818', 'sum:stats': '#181820', 'sum:info': '#181820', 'sum:moves': '#181820', 'sum:top': '#181820' }

/** A 256 x 192 DS screen: the game's own background picture with things placed on it in DS pixels. */
export function DsScreen({ bg, K, children, style }: { bg: string; K: number; children?: ReactNode; style?: CSSProperties }) {
  const url = useUiUrl(`screen:${bg}`)
  return (
    <div className="ds-screen2" style={{ position: 'relative', width: 256 * K, height: 192 * K, background: url ? `url(${url}) 0 0 / 100% 100% no-repeat` : '#1a1a22', backgroundColor: BASE[bg] ?? '#1a1a22', imageRendering: 'pixelated', overflow: 'hidden', borderRadius: 4, ...style }}>
      {children}
    </div>
  )
}

/** A text label placed at DS pixel coordinates. */
export function DsText({ x, y, w, K, size = 8, align = 'left', color = '#fff', bold = true, children, style }: {
  x: number; y: number; w?: number; K: number; size?: number; align?: 'left' | 'right' | 'center'; color?: string; bold?: boolean; children: ReactNode; style?: CSSProperties
}) {
  return (
    <span style={{ position: 'absolute', left: x * K, top: y * K, width: w !== undefined ? w * K : undefined, textAlign: align, fontSize: size * K, lineHeight: 1, fontWeight: bold ? 700 : 400, color, whiteSpace: 'nowrap', textShadow: color === '#fff' ? '1px 1px 0 rgba(0,0,0,.6)' : 'none', ...style }}>{children}</span>
  )
}
