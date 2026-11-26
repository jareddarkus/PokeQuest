import { useEffect, useRef, useState } from 'react'
import { GLOBAL, type useChat } from './useChat'

type Chat = ReturnType<typeof useChat>

/** The chat window in the bottom left corner: Global, friends and private chats (tabs). Click a name to whisper to that player. */
export default function ChatDock({ chat, canChat, open, setOpen }: { chat: Chat; canChat: boolean; open: boolean; setOpen: (o: boolean) => void }) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const msgs = chat.byTab[chat.active] ?? []
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, chat.active, open])
  if (!canChat) return null
  const submit = () => { if (chat.send(text)) setText('') }
  return (
    <div className={`chat-dock ${open ? 'open' : ''}`} onKeyDown={(e) => e.stopPropagation()}>
      <button className="chat-head" onClick={() => setOpen(!open)}>
        💬 Chat {chat.unread > 0 && <span className="chat-badge">{chat.unread}</span>} <span className="chat-caret">{open ? '▾' : '▴'}</span>
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
                <div key={f} className="chat-msg"><b>{f}</b> <button className="chat-mini" onClick={() => chat.openWhisper(f)}>Susurrar</button></div>
              ))}
            </div>
          ) : (
            <div className="chat-log">
              {chat.status !== 'on' && <span className="muted">{chat.status === 'error' ? 'No se pudo conectar el chat.' : 'Conectando…'}</span>}
              {msgs.length === 0 && chat.status === 'on' && <span className="muted">{chat.active === GLOBAL ? 'Aún no hay mensajes. ¡Saluda!' : `Chat privado con ${chat.active}. Escribe el primer mensaje.`}</span>}
              {msgs.map((m) => (
                <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
                  {m.mine || m.from === '⚠' ? <b>{m.from}</b> : <b className="chat-name" onClick={() => chat.openWhisper(m.from)} title="Susurrar">{m.from}</b>} <span>{m.text}</span>
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
