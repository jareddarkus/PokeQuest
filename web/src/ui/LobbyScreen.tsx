import { useEffect, useState } from 'react'
import type { Look } from '../game/character'
import { lookSprite } from '../game/character'
import { owFrame } from '../game/ow'
import { music } from '../audio/music'
import { useLobby, type MatchInfo } from '../net/useLobby'
import { useChat } from './useChat'

function Face({ look }: { look: Look }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const idx = lookSprite(look)
    const c = idx !== undefined ? owFrame(idx, 0, 0) : null
    setUrl(c ? c.toDataURL() : null)
  }, [look])
  return url ? <img src={url} alt="" draggable={false} style={{ width: 48, height: 48, imageRendering: 'pixelated' }} /> : <span style={{ width: 48, height: 48, display: 'inline-block' }} />
}

/** The waiting room of the Battle Royale: see who is here, press Ready, chat. When everybody is ready the match counts down and starts. */
export default function LobbyScreen({ username, look, onStart, onBack }: { username: string; look: Look; onStart: (m: MatchInfo) => void; onBack: () => void }) {
  const lobby = useLobby(username, look)
  const chat = useChat(username, true)
  const [text, setText] = useState('')
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!lobby.match) return
    const m = lobby.match
    void music.playSfx('se:decide')
    const id = window.setInterval(() => {
      const ms = m.startsAt - Date.now()
      setLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0) { window.clearInterval(id); onStart(m) }
    }, 200)
    return () => window.clearInterval(id)
  }, [lobby.match])

  const players = lobby.players
  const ready = lobby.me?.ready ?? false
  const enough = players.length >= 2
  const send = () => { if (chat.send(text)) setText('') }

  return (
    <div className="fullscreen center menu-bg scroll">
      <div className="panel lobby">
        <h1>Waiting room</h1>
        <p className="sub">
          {lobby.match ? `The match starts in ${left ?? '…'}…` : lobby.status === 'error' ? 'Could not connect. Go back and try again.' : lobby.status === 'connecting' ? 'Connecting…' : enough ? 'Press Ready. The match starts when everybody is ready.' : 'Waiting for at least one more trainer…'}
        </p>
        <div className="lobby-list">
          {players.map((p) => (
            <div key={p.name} className={`lobby-row ${p.ready ? 'ready' : ''}`}>
              <Face look={p.look} />
              <strong>{p.name}{p.name === username ? ' (you)' : ''}</strong>
              <span className="lobby-state">{p.ready ? 'Ready' : 'Not ready'}</span>
            </div>
          ))}
          {players.length === 0 && <span className="muted">Nobody here yet…</span>}
        </div>
        <div className="btn-row">
          {lobby.arenaBusy && <p className="sub">A match is being played right now. You can join the next one when it is over.</p>}
          <button className="primary" disabled={lobby.status !== 'on' || !!lobby.match || lobby.arenaBusy} onClick={() => lobby.setReady(!ready)}>{ready ? 'Cancel' : 'Ready'}</button>
          <button disabled={!!lobby.match} onClick={onBack}>Leave</button>
        </div>
        <h3>Chat</h3>
        <div className="chat-log">
          {chat.messages.length === 0 && <span className="muted">No messages yet.</span>}
          {chat.messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}><b>{m.from}</b> <span>{m.text}</span></div>
          ))}
        </div>
        <div className="chat-input">
          <input value={text} maxLength={140} placeholder="Type a message…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send() }} />
          <button onClick={send} disabled={chat.status !== 'on'}>Send</button>
        </div>
      </div>
    </div>
  )
}
