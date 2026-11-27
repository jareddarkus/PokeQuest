import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import { trainerCard, type TrainerCardData } from '../net/social'

/** The trainer card of a player, like the one of the real games: ID number, name and what they have done (only battles against other PLAYERS count; wild Pokémon and NPC trainers do not). */
export default function TrainerCard({ name, onClose }: { name: string; onClose: () => void }) {
  const es = useLang() === 'es'
  const [card, setCard] = useState<TrainerCardData | null | 'loading'>('loading')
  useEffect(() => { let on = true; void trainerCard(name).then((c) => { if (on) setCard(c) }); return () => { on = false } }, [name])
  const row = (label: string, value: string | number) => <div className="tcard-row"><span>{label}</span><b>{value}</b></div>
  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="tcard" onClick={(e) => e.stopPropagation()}>
        <div className="tcard-head"><span>{es ? 'TARJETA DE ENTRENADOR' : 'TRAINER CARD'}</span>{card && card !== 'loading' && <span>ID No. {card.number}</span>}</div>
        {card === 'loading' && <p className="tcard-msg">{es ? 'Cargando…' : 'Loading…'}</p>}
        {card === null && <p className="tcard-msg">{es ? 'No se pudo cargar esta tarjeta.' : 'This card could not be loaded.'}</p>}
        {card && card !== 'loading' && (
          <div className="tcard-body">
            <div className="tcard-name">{card.username}</div>
            {row(es ? 'Jugadores vencidos' : 'Players beaten', card.pvp_wins)}
            {row(es ? 'Partidas ganadas' : 'Matches won', card.match_wins)}
            {row(es ? 'Partidas jugadas' : 'Matches played', card.matches_played)}
            {row(es ? 'Entrenador desde' : 'Trainer since', new Date(card.since).toLocaleDateString())}
            <p className="tcard-note">{es ? 'Solo cuentan los combates contra otros jugadores (no los salvajes ni los entrenadores).' : 'Only battles against other players count (not wild Pokémon or NPC trainers).'}</p>
          </div>
        )}
        <button className="primary" onClick={onClose}>{es ? 'Cerrar' : 'Close'}</button>
      </div>
    </div>
  )
}
