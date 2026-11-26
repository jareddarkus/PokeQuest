// The look of the UI: "modern" (slanted white cards, Unbounded Black titles, Lexend text - the look of the Pokémon info window) or "classic" (the game's own panels and fonts).
// It is the `data-theme` of the page (the stylesheet `modern.css` only applies to "modern") and, for the screens that are built from pictures of the game, picked in the code with useTheme().
import { useSyncExternalStore } from 'react'

export type Theme = 'modern' | 'classic'

function initial(): Theme {
  try {
    const raw = localStorage.getItem('pokequest.settings.v1')
    if (raw && JSON.parse(raw).theme === 'classic') return 'classic'
  } catch { /* private window: use the default */ }
  return 'modern'
}

let current: Theme = initial()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.dataset.theme = current

export const getTheme = (): Theme => current
export function setTheme(t: Theme): void {
  if (t === current) return
  current = t
  document.documentElement.dataset.theme = t
  listeners.forEach((f) => f())
}
export function useTheme(): Theme {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => current)
}
