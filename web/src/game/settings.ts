import { useEffect, useState } from 'react'
import { defaultLook, type Look } from './character'

export interface Settings {
  zoom: number // 0.5 .. 1.6  (smaller = more of the map is visible)
  dpadSide: 'left' | 'right'
  showDpad: boolean
  musicVolume: number // 0..1
  sfxVolume: number
  language: 'es' | 'en'
  /** how fast the battle text is typed */
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant'
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
}

/** Good starting values: zoomed out on a computer, bigger and with a D-pad on a phone. */
export function defaultSettings(): Settings {
  const touch = isTouchDevice()
  return {
    zoom: touch ? 1.0 : 0.7,
    dpadSide: 'left',
    showDpad: touch,
    musicVolume: 0.5,
    sfxVolume: 0.7,
    language: 'es',
    textSpeed: 'normal',
  }
}

const KEY_SETTINGS = 'pokequest.settings.v1'
const KEY_LOOK = 'pokequest.look.v1'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch {
    /* private window etc.: just use the defaults */
  }
  return fallback
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function hasSavedLook(): boolean {
  try {
    return localStorage.getItem(KEY_LOOK) !== null
  } catch {
    return false
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(() => load(KEY_SETTINGS, defaultSettings()))
  useEffect(() => save(KEY_SETTINGS, s), [s])
  return [s, (patch) => setS((old) => ({ ...old, ...patch }))]
}

export function useLook(): [Look, (look: Look) => void] {
  const [l, setL] = useState<Look>(() => load(KEY_LOOK, defaultLook()))
  useEffect(() => save(KEY_LOOK, l), [l])
  return [l, setL]
}
