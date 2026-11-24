import { maxHp, type Mon } from '../data/dex'
import { MonIcon } from './MonSprite'

/** Your six Pokémon on the right side of the screen (empty places included), like the party bar of PokeMMO: icon, level and HP bar. */
export default function PartyBar({ team, onOpen }: { team: Mon[]; onOpen: () => void }) {
  const slots = Array.from({ length: 6 }, (_, i) => team[i] ?? null)
  return (
    <div className="party-bar">
      {slots.map((m, i) => {
        if (!m) return <button key={i} className="party-slot empty" onClick={onOpen} aria-label="empty place" />
        const max = maxHp(m)
        const f = Math.max(0, Math.min(1, m.hp / max))
        const color = m.hp <= 0 ? '#777' : f > 0.5 ? '#2fdc5a' : f > 0.2 ? '#f0b000' : '#ee3d5e'
        return (
          <button key={m.uid} className={`party-slot ${m.hp <= 0 ? 'fainted' : ''}`} onClick={onOpen} title={`${m.species} Lv${m.level} ${m.hp}/${max}`}>
            <MonIcon species={m.species} shiny={m.shiny} size={40} />
            <span className="party-info">
              <small>Lv{m.level}</small>
              <span className="party-hp"><span style={{ width: `${f * 100}%`, background: color }} /></span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
