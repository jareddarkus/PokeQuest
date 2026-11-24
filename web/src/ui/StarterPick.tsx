import { useMemo, useState } from 'react'
import { starterChoices, type SpeciesInfo } from '../data/dex'
import MonSprite from './MonSprite'

interface Props {
  seconds?: number
  onPick: (species: string) => void
}

/** Choose your first Pokémon (any first-form Pokémon from any generation). It starts at level 5. */
export default function StarterPick({ onPick }: Props) {
  const all = useMemo(() => starterChoices(), [])
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<SpeciesInfo | null>(null)
  const list = all.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || String(s.num) === q)
  return (
    <div className="fullscreen menu-bg scroll">
      <div className="panel starter">
        <h1>Choose your starter</h1>
        <p className="sub">Any Pokémon from any generation. It starts at level 5.</p>
        <input placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="starter-grid">
          {list.slice(0, 120).map((s) => (
            <button key={s.name} className={chosen?.name === s.name ? 'on' : ''} onClick={() => setChosen(s)}>
              <MonSprite species={s.name} scale={0.8} className="mon-icon" />
              <small>#{s.num} {s.name}</small>
            </button>
          ))}
        </div>
        <button className="primary" disabled={!chosen} onClick={() => chosen && onPick(chosen.name)}>
          {chosen ? `Choose ${chosen.name}` : 'Pick a Pokémon'}
        </button>
      </div>
    </div>
  )
}
