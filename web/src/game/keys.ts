// The keyboard of the game, in ONE place: the keys every player can change (Settings → Controls).
// The buttons are the ones of the DS: the arrows of the pad move you, the 3 "face" buttons are A (talk / accept), B (cancel / hold to run) and X (menu).
import { useEffect, useRef, useSyncExternalStore } from 'react'

export type KeyAction = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x'

export const KEY_ACTIONS: KeyAction[] = ['up', 'down', 'left', 'right', 'a', 'b', 'x']

/** the keys of every action when nobody has changed anything (a key is its lower-case `event.key`) */
export const DEFAULT_KEYS: Record<KeyAction, string[]> = {
  up: ['w'],
  down: ['s'],
  left: ['a'],
  right: ['d'],
  a: ['arrowright', 'enter', ' '],
  b: ['arrowdown', 'shift', 'escape', 'backspace'],
  x: ['arrowup'],
}

const STORE = 'pokequest.keys.v1'

function load(): Record<KeyAction, string[]> {
  const out = { ...DEFAULT_KEYS }
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Record<KeyAction, unknown>> | null
    if (raw) for (const a of KEY_ACTIONS) { const v = raw[a]; if (Array.isArray(v) && v.length && v.every((k) => typeof k === 'string')) out[a] = v as string[] }
  } catch { /* private window etc.: the defaults */ }
  return out
}

let bindings = load()
const subs = new Set<() => void>()
const emit = () => { bindings = { ...bindings }; subs.forEach((f) => f()) }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(bindings)) } catch { /* ignore */ } }

export const keyName = (e: KeyboardEvent | string): string => (typeof e === 'string' ? e : e.key).toLowerCase()

/** does this key do this action? */
export function isKey(action: KeyAction, e: KeyboardEvent | string): boolean {
  return bindings[action].includes(keyName(e))
}
/** which action does a key do (null: none) */
export function actionOf(e: KeyboardEvent | string): KeyAction | null {
  const k = keyName(e)
  for (const a of KEY_ACTIONS) if (bindings[a].includes(k)) return a
  return null
}

/** gives an action ONE new key (the same key is taken away from the others, so two actions never share it) */
export function bindKey(action: KeyAction, key: string): void {
  const k = key.toLowerCase()
  for (const a of KEY_ACTIONS) if (a !== action) bindings[a] = bindings[a].filter((x) => x !== k)
  bindings[action] = [k]
  for (const a of KEY_ACTIONS) if (!bindings[a].length) bindings[a] = DEFAULT_KEYS[a].filter((d) => !KEY_ACTIONS.some((o) => o !== a && bindings[o].includes(d))) // (an action must never be left without a key)
  persist(); emit()
}
export function resetKeys(): void { bindings = { ...DEFAULT_KEYS }; persist(); emit() }

export function useKeyBindings(): Record<KeyAction, string[]> {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => bindings)
}

/** a readable name of a key for the Settings screen */
export function keyLabel(k: string): string {
  const names: Record<string, string> = { ' ': 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', backspace: 'Backspace', enter: 'Enter', shift: 'Shift', control: 'Ctrl', alt: 'Alt', tab: 'Tab' }
  return names[k] ?? (k.length === 1 ? k.toUpperCase() : k)
}

/** runs `cb` every time a key of the action is pressed (not while it is held down), unless a text box has the focus */
export function useKeyAction(action: KeyAction, cb: () => void, enabled = true): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    if (!enabled) return
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.repeat || !isKey(action, e)) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [action, enabled])
}

/** the overworld says here whether the character is free to walk (no menu, battle or speech open): then the keys belong to walking, otherwise to the menus (ui/MenuNav.tsx) */
export const roam = { free: false }

/** true while the Settings screen waits for the player to press the new key of an action (nothing else may react to keys then) */
export const capture = { on: false }
