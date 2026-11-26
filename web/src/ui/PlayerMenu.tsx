// What happens when you click a player on the map: another player gets a menu (friend, whisper, trade); you get a menu of reactions (emote bubbles).
import { useState } from 'react'
import { owEmote } from '../game/ow'
import type { Mon } from '../data/dex'
import { MonIcon } from './MonSprite'

/** the game's emote bubbles (files 7 - 18 of the emote archive) */
export const EMOTE_IDS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

function EmoteImg({ idx }: { idx: number }) {
  const img = owEmote(idx)
  if (!img) return null
  return <img src={img.src} alt={`reacción ${idx}`} width={40} height={40} style={{ imageRendering: 'pixelated' }} draggable={false} />
}

export function PlayerPopup({ name, x, y, isFriend, onFriend, onWhisper, onTrade, onWatch, onClose }: {
  name: string; x: number; y: number; isFriend: boolean; onWatch?: () => void
  onFriend: (add: boolean) => void; onWhisper: () => void; onTrade: () => void; onClose: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const left = Math.min(Math.max(8, x + 8), window.innerWidth - 230), top = Math.min(Math.max(8, y - 10), window.innerHeight - 220)
  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="pm-popup panel" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
        <b className="pm-title">{name}</b>
        {!confirm ? (
          <>
            <button onClick={() => (isFriend ? setConfirm(true) : onFriend(true))}>{isFriend ? 'Quitar amigo' : 'Añadir amigo'}</button>
            <button onClick={onWhisper}>Susurrar</button>
            {onWatch && <button className="primary" onClick={onWatch}>Ver combate</button>}
            <button onClick={onTrade}>Intercambiar</button>
            <button className="pm-close" onClick={onClose}>Cerrar</button>
          </>
        ) : (
          <>
            <p className="pm-ask">¿Seguro que quieres quitar a {name} de tus amigos?</p>
            <button className="pm-danger" onClick={() => onFriend(false)}>Sí, quitar</button>
            <button onClick={() => setConfirm(false)}>No</button>
          </>
        )}
      </div>
    </div>
  )
}

export function ReactionPopup({ x, y, onPick, onClose }: { x: number; y: number; onPick: (idx: number) => void; onClose: () => void }) {
  const left = Math.min(Math.max(8, x - 110), window.innerWidth - 240), top = Math.min(Math.max(8, y - 150), window.innerHeight - 200)
  const ids = EMOTE_IDS.filter((i) => owEmote(i))
  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="pm-popup panel pm-react" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
        <b className="pm-title">Reacciones</b>
        <div className="pm-grid">
          {ids.map((i) => <button key={i} onClick={() => onPick(i)}><EmoteImg idx={i} /></button>)}
        </div>
        {ids.length === 0 && <p className="pm-ask">Las reacciones salen de tu archivo del juego (impórtalo otra vez si faltan).</p>}
      </div>
    </div>
  )
}

export interface TradeState { partner: string; mine: Mon | null; theirs: Mon | null; myAccept: boolean; theirAccept: boolean }

export function TradePanel({ trade, team, onOffer, onAccept, onCancel }: { trade: TradeState; team: Mon[]; onOffer: (m: Mon) => void; onAccept: () => void; onCancel: () => void }) {
  const ready = !!trade.mine && !!trade.theirs
  return (
    <div className="modal-backdrop" style={{ zIndex: 70 }}>
      <div className="panel modal pm-trade">
        <h2>Intercambio con {trade.partner}</h2>
        <div className="pm-cols">
          <div>
            <b>Tu equipo (elige uno)</b>
            <div className="pm-list">
              {team.map((m) => (
                <button key={m.uid} className={trade.mine?.uid === m.uid ? 'on' : ''} onClick={() => onOffer(m)}>
                  <MonIcon species={m.species} shiny={m.shiny} size={32} /> {m.species} Nv{m.level}
                </button>
              ))}
            </div>
          </div>
          <div>
            <b>Ofrece {trade.partner}</b>
            <div className="pm-offer">{trade.theirs ? <><MonIcon species={trade.theirs.species} shiny={trade.theirs.shiny} size={48} /> {trade.theirs.species} Nv{trade.theirs.level}</> : <span className="muted">Aún no ha elegido…</span>}</div>
            <b>Tú ofreces</b>
            <div className="pm-offer">{trade.mine ? <><MonIcon species={trade.mine.species} shiny={trade.mine.shiny} size={48} /> {trade.mine.species} Nv{trade.mine.level}</> : <span className="muted">Elige un Pokémon.</span>}</div>
          </div>
        </div>
        <p className="sub">{trade.myAccept ? (trade.theirAccept ? 'Intercambiando…' : `Esperando a que ${trade.partner} acepte…`) : trade.theirAccept ? `${trade.partner} ya aceptó.` : ready ? 'Cuando estéis de acuerdo, pulsa Aceptar.' : ''}</p>
        <button className="primary" disabled={!ready || trade.myAccept} onClick={onAccept}>Aceptar intercambio</button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
