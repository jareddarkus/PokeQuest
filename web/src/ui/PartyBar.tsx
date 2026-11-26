import { useRef, useState } from 'react'
import { maxHp, type Mon } from '../data/dex'
import { MonIcon } from './MonSprite'
import { useUiUrl } from './CmdButton'
import { useTheme } from './theme'

/**
 * Your six Pokémon on the right side of the screen (empty places included), like the party bar of PokeMMO: icon, level and HP bar.
 * Drag a Pokémon onto another place to swap them (mouse or finger); a click opens the team screen. The first place is your follower.
 */
export default function PartyBar({ team, onOpen, onReorder, hidden }: { team: Mon[]; onOpen: (slot?: number) => void; onReorder: (from: number, to: number) => void; hidden?: boolean }) {
  const slots = Array.from({ length: 6 }, (_, i) => team[i] ?? null)
  // the game's own party panels (picture 126 x 43 of the party screen) when the game file is imported; scaled to fit the corner of the screen
  const normalArt = useUiUrl('screen:party:5')
  const faintedArt = useUiUrl('screen:party:3')
  const emptyArt = useUiUrl('screen:party:6')
  const theme = useTheme()
  const art = theme === 'classic' && !!(normalArt && faintedArt && emptyArt)
  const pk = window.innerWidth <= 640 ? 0.58 : 1.05
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
    if (!d.moved) { onOpen(d.from); return }
    const to = slotAt(e.clientX, e.clientY)
    if (to !== null && to !== d.from && team[to]) onReorder(d.from, to)
  }
  const mon = dragging ? team[dragging.from] : null
  return (
    <div className={`party-bar ${hidden ? 'hidden' : ''}`} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDragging(null) }}>
      {slots.map((m, i) => {
        const box: React.CSSProperties | undefined = art ? { width: 126 * pk, height: 43 * pk, padding: 0, border: 'none', borderRadius: 0, boxShadow: i === 0 ? 'inset 3px 0 0 #ffd84a' : 'none', imageRendering: 'pixelated' } : undefined
        if (!m) return <button key={i} data-slot={i} className="party-slot empty" onClick={() => onOpen()} aria-label="empty place" style={art ? { ...box, background: `url(${emptyArt}) 0 0 / 100% 100% no-repeat`, opacity: 0.4 } : undefined} />
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
            style={{ touchAction: 'none', ...(art ? { ...box, position: 'relative', background: `url(${m.hp <= 0 ? faintedArt : normalArt}) 0 0 / 100% 100% no-repeat`, opacity: 1 } : null) }}
          >
            {art ? (
              <>
                <span style={{ position: 'absolute', left: 5 * pk, top: 5 * pk, pointerEvents: 'none' }}><MonIcon species={m.species} shiny={m.shiny} size={32 * pk} /></span>
                {pk > 0.8 && <small style={{ position: 'absolute', left: 44 * pk, top: 6 * pk, fontSize: 9 * pk, fontWeight: 700, textShadow: '0 1px 0 #000', pointerEvents: 'none' }}>Lv{m.level}</small>}
                <span style={{ position: 'absolute', left: (pk > 0.8 ? 44 : 38) * pk, top: 27 * pk, width: (pk > 0.8 ? 72 : 80) * pk, height: 5 * pk, background: '#101018', boxShadow: '0 0 0 1px #000', pointerEvents: 'none' }}>
                  <span className="party-fill" style={{ display: 'block', height: '100%', width: `${f * 100}%`, background: color }} />
                </span>
              </>
            ) : (
              <>
                <MonIcon species={m.species} shiny={m.shiny} size={40} />
                <span className="party-info">
                  <small>Lv{m.level}</small>
                  <span className="party-hp"><span style={{ width: `${f * 100}%`, background: color }} /></span>
                </span>
              </>
            )}
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
