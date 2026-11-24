import { useEffect, useMemo, useState } from 'react'
import { starterChoices, type SpeciesInfo } from '../data/dex'
import { MonIcon } from './MonSprite'

interface Props {
  /** the moment (milliseconds since 1970) when the choice is made for you; used in matches */
  until?: number
  onPick: (species: string) => void
}

/** Choose your first Pokémon (any first-form Pokémon from any generation). It starts at level 5. */
export default function StarterPick({ until, onPick }: Props) {
  const all = useMemo(() => starterChoices(), [])
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<SpeciesInfo | null>(null)
  const [left, setLeft] = useState<number | null>(until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : null)
  useEffect(() => {
    if (!until) return
    let done = false
    const id = window.setInterval(() => {
      const l = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(l)
      if (l <= 0 && !done) { done = true; window.clearInterval(id); onPick((chosen ?? all[Math.floor(Math.random() * all.length)]).name) } // time is up: your choice, or a random one
    }, 250)
    return () => window.clearInterval(id)
  }, [until, chosen])
  const list = all.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || String(s.num) === q)
  return (
    <div className="fullscreen menu-bg scroll">
      <div className="panel starter">
        <h1>Choose your starter</h1>
        <p className="sub">Any Pokémon from any generation. It starts at level 5.{left !== null && <b> {left}s left!</b>}</p>
        <input placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="starter-grid">
          {list.slice(0, 120).map((s) => (
            <button key={s.name} className={chosen?.name === s.name ? 'on' : ''} onClick={() => setChosen(s)}>
              <MonIcon species={s.name} />
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
