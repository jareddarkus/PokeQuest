import type { CSSProperties } from 'react'
import { useUiUrl } from './CmdButton'
import { useTheme } from './theme'

/** Style for a box drawn with the game's own message window frame (null = not imported yet: the page's normal panel is used). */
export function useFrameStyle(kind: 'dark' | 'white', k = 2): CSSProperties | null {
  const url = useUiUrl(`screen:frame:${kind}`)
  const theme = useTheme()
  if (!url || theme === 'modern') return null
  return {
    border: `${8 * k}px solid transparent`,
    borderImage: `url(${url}) 8 fill / ${8 * k}px stretch`,
    background: 'none',
    boxShadow: 'none',
    imageRendering: 'pixelated',
    color: kind === 'dark' ? '#fff' : '#181820',
  }
}
