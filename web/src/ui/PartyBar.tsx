import { useRef, useState } from 'react'
import { maxHp, type Mon } from '../data/dex'
import { MonIcon } from './MonSprite'

/**
 * Your six Pokémon on the right side of the screen (empty places included), like the party bar of PokeMMO: icon, level and HP bar.
 * Drag a Pokémon onto another place to swap them (mouse or finger); a click opens the team screen. The first place is your follower.
 */
export default function PartyBar({ team, onOpen, onReorder }: { team: Mon[]; onOpen: () => void; onReorder: (from: number, to: number) => void }) {
  const slots = Array.from({ length: 6 }, (_, i) => team[i] ?? null)
  const drag = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState<{ from: number; over: number | null; x: number; y: number } | null>(null)
  const slotAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null
    return el ? Number(el.dataset.slot) : null
  }
  const down = (e: React.PointerEvent, i: number) => {
    if (!team[i]) return
    drag.current = { from: i, x: e.clientX, y: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true
    if (d.moved) setDragging({ from: d.from, over: slotAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY })
  }
  const up = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setDragging(null)
    if (!d) return
    if (!d.moved) { onOpen(); return }
    const to = slotAt(e.clientX, e.clientY)
    if (to !== null && to !== d.from && team[to]) onReorder(d.from, to)
  }
  const mon = dragging ? team[dragging.from] : null
  return (
    <div className="party-bar" onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDragging(null) }}>
      {slots.map((m, i) => {
        if (!m) return <button key={i} data-slot={i} className="party-slot empty" onClick={onOpen} aria-label="empty place" />
        const max = maxHp(m)
        const f = Math.max(0, Math.min(1, m.hp / max))
        const color = m.hp <= 0 ? '#777' : f > 0.5 ? '#2fdc5a' : f > 0.2 ? '#f0b000' : '#ee3d5e'
        const over = dragging?.over === i && dragging.from !== i
        return (
          <button
            key={m.uid}
            data-slot={i}
            className={`party-slot ${m.hp <= 0 ? 'fainted' : ''} ${dragging?.from === i ? 'lifted' : ''} ${over ? 'drop' : ''} ${i === 0 ? 'lead' : ''}`}
            onPointerDown={(e) => down(e, i)}
            title={`${m.species} Lv${m.level} ${m.hp}/${max}`}
            style={{ touchAction: 'none' }}
          >
            <MonIcon species={m.species} shiny={m.shiny} size={40} />
            <span className="party-info">
              <small>Lv{m.level}</small>
              <span className="party-hp"><span style={{ width: `${f * 100}%`, background: color }} /></span>
            </span>
          </button>
        )
      })}
      {dragging && mon && (
        <div className="party-ghost" style={{ left: dragging.x - 20, top: dragging.y - 20 }}>
          <MonIcon species={mon.species} shiny={mon.shiny} size={40} />
        </div>
      )}
    </div>
  )
}
