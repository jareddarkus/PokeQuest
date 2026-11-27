import { useEffect, useRef, useState } from 'react'
import { GLOBAL, type useChat } from './useChat'

type Chat = ReturnType<typeof useChat>

/** The chat window in the bottom left corner: Global, friends and private chats (tabs). Click a name to whisper to that player. */
export default function ChatDock({ chat, canChat, open, setOpen, colorOf, onName, names }: { chat: Chat; canChat: boolean; open: boolean; setOpen: (o: boolean) => void; colorOf?: (name: string) => string; onName?: (name: string, x: number, y: number) => void; names?: string[] }) {
  // a player's name inside any text (also the game's own announcements) is written in the colour that player has in this match; the rest of the text stays as it is
  const rich = (text: string): React.ReactNode => {
    if (!colorOf || !names || names.length === 0) return text
    const esc = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const parts = text.split(new RegExp('(?<![\\w])(' + esc.join('|') + ')(?![\\w])'))
    return parts.map((p, i) => (i % 2 === 1 ? <b key={i} style={{ color: colorOf(p) }}>{p}</b> : p))
  }
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const msgs = chat.byTab[chat.active] ?? []
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, chat.active, open])
  if (!canChat) return null
  const submit = () => { if (chat.send(text)) setText('') }
  return (
    <div className={`chat-dock ${open ? 'open' : ''}`} onKeyDown={(e) => e.stopPropagation()}>
      <button className="chat-head" onClick={() => setOpen(!open)}>
        <span className="chat-ico">💬</span><span className="chat-label"> Chat</span> {chat.unread > 0 && <span className="chat-badge">{chat.unread}</span>} <span className="chat-caret">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <>
          <div className="chat-tabs">
            {[...chat.tabs, 'Amigos'].map((t) => (
              <span key={t} className={`chat-tab ${chat.active === t ? 'on' : ''}`}>
                <button onClick={() => chat.setActive(t)}>{t === GLOBAL ? 'Global' : t}{(chat.unreadBy[t] ?? 0) > 0 && <span className="chat-badge">{chat.unreadBy[t]}</span>}</button>
                {t !== GLOBAL && t !== 'Amigos' && <button className="chat-x" onClick={() => chat.closeTab(t)} aria-label="Cerrar">×</button>}
              </span>
            ))}
          </div>
          {chat.active === 'Amigos' ? (
            <div className="chat-log">
              {chat.friends.length === 0 && <span className="muted">Aún no tienes amigos. Pulsa a un jugador en el mapa para añadirlo.</span>}
              {chat.friends.map((f) => (
                <div key={f} className="chat-msg"><b>{f}</b> <button className="chat-mini" onClick={() => chat.openWhisper(f)}>Susurrar</button>{onName && <button className="chat-mini" onClick={(e) => onName(f, e.clientX, e.clientY)}>Tarjeta</button>}</div>
              ))}
            </div>
          ) : (
            <div className="chat-log">
              {chat.status !== 'on' && <span className="muted">{chat.status === 'error' ? 'No se pudo conectar el chat.' : 'Conectando…'}</span>}
              {msgs.length === 0 && chat.status === 'on' && <span className="muted">{chat.active === GLOBAL ? 'Aún no hay mensajes. ¡Saluda!' : `Chat privado con ${chat.active}. Escribe el primer mensaje.`}</span>}
              {msgs.map((m) => m.system ? (
                <div key={m.id} className="chat-msg sys">{rich(m.text)}</div>
              ) : (
                <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
                  {m.mine || m.from === '⚠' ? <b style={colorOf && m.from !== '⚠' ? { color: colorOf(m.from) } : undefined}>{m.from}</b> : <b className="chat-name" style={colorOf ? { color: colorOf(m.from) } : undefined} onClick={(e) => (onName ? onName(m.from, e.clientX, e.clientY) : chat.openWhisper(m.from))} title="Susurrar / amigo / tarjeta">{m.from}</b>} <span>{rich(m.text)}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          {chat.active !== 'Amigos' && (
            <div className="chat-input">
              <input value={text} maxLength={140} placeholder={chat.active === GLOBAL ? 'Escribe un mensaje…' : `Susurro a ${chat.active}…`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit() }} />
              <button className="primary" onClick={submit} disabled={chat.status !== 'on'}>Enviar</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
