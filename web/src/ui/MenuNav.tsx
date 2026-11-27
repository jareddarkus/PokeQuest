import { useEffect } from 'react'
import { actionOf, capture, roam } from '../game/keys'

/**
 * The cursor of EVERY menu, with the keyboard: the keys that walk the character (W A S D by default, or the ones the player chose in
 * Settings → Controls) move a yellow frame between the buttons of the menu that is open; A presses the framed button, B / X close the menu.
 * It looks at what is really on the screen (buttons that nothing covers), so every menu of the game, present or future, works without extra code.
 */
const BACK = /^(×|✕|✖|x|close|back|cancel|cerrar|volver|atrás|atras|cancelar|salir|exit|leave|done|listo)$/i
const SELECTOR = 'button, [role="button"], a[href], input:not([type="hidden"]), select, [data-nav]'

function candidates(): HTMLElement[] {
  const out: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  const consider = (el: HTMLElement) => {
    if (seen.has(el)) return
    seen.add(el)
    if ((el as HTMLButtonElement).disabled || el.closest('[data-nonav]') || el.getAttribute('aria-hidden') === 'true') return
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const hit = document.elementFromPoint(x, y)
    if (!hit || !(el.contains(hit) || hit.contains(el))) return // (something else is on top of it: another menu)
    if (getComputedStyle(el).pointerEvents === 'none') return
    out.push(el)
  }
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach(consider)
  // things that are clickable although they are not buttons (the outermost element that shows a hand)
  document.querySelectorAll<HTMLElement>('div, span, li, img, label').forEach((el) => {
    if (seen.has(el) || !el.parentElement) return
    if (getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el.parentElement).cursor !== 'pointer') consider(el)
  })
  return out
}

const center = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }

function pick(from: HTMLElement | null, all: HTMLElement[], dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  if (!all.length) return null
  if (!from) return all.reduce((a, b) => { const A = center(a), B = center(b); return B.y + B.x * 0.2 < A.y + A.x * 0.2 ? b : a })
  const c = center(from)
  let best: HTMLElement | null = null, bestScore = Infinity
  let wrap: HTMLElement | null = null, wrapScore = Infinity
  for (const el of all) {
    if (el === from) continue
    const p = center(el)
    const dx = p.x - c.x, dy = p.y - c.y
    const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy // how far in the wanted direction (negative: the other way)
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (main > 3) { const s = main + side * 2.5; if (s < bestScore) { bestScore = s; best = el } }
    else { const s = -main + side * 2.5; if (s < wrapScore) { wrapScore = s; wrap = el } } // (nothing further that way: go around to the other end)
  }
  return best ?? wrap ?? from
}

export default function MenuNav() {
  useEffect(() => {
    let cur: HTMLElement | null = null
    const clear = () => { cur?.classList.remove('pq-nav'); cur = null }
    const setCur = (el: HTMLElement | null) => {
      if (cur === el) return
      cur?.classList.remove('pq-nav')
      cur = el
      if (el) { el.classList.add('pq-nav'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)))) return
      if (capture.on) return
      if (roam.free) { if (cur) clear(); return }
      const a = actionOf(e)
      if (!a) return
      if (cur && !cur.isConnected) clear()
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation() }
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
        const all = candidates()
        if (!all.length) return
        if (cur && !all.includes(cur)) clear()
        // a slider that has the cursor: left / right change it
        if (cur && cur instanceof HTMLInputElement && cur.type === 'range' && (a === 'left' || a === 'right')) {
          const step = Number(cur.step) || 1
          const v = Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + (a === 'right' ? step : -step)))
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(cur, String(v))
          cur.dispatchEvent(new Event('input', { bubbles: true }))
          eat(); return
        }
        setCur(pick(cur, all, a))
        eat(); return
      }
      if (e.repeat) { if (cur && (a === 'a' || a === 'b' || a === 'x')) eat(); return }
      if (a === 'a' && cur) {
        const el = cur
        eat()
        if (el instanceof HTMLInputElement && el.type === 'range') return
        el.click()
        return
      }
      if (a === 'b' || a === 'x') {
        const back = candidates().filter((el) => BACK.test((el.getAttribute('aria-label') ?? el.textContent ?? '').trim()) || /(^|[\s_-])(close|back)([\s_-]|$)/i.test(typeof el.className === 'string' ? el.className : '')).pop()
        if (back) { eat(); clear(); back.click() }
      }
    }
    const onPointer = () => { if (cur) clear() } // (the mouse / a finger takes over)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true); clear() }
  }, [])
  return null
}
