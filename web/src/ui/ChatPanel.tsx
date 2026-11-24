import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from './useChat'

export default function ChatPanel({ messages, status, send, canChat, onClose }: {
  messages: ChatMessage[]
  status: 'off' | 'connecting' | 'on' | 'error'
  send: (text: string) => boolean
  canChat: boolean
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages])
  const submit = () => { if (send(text)) setText('') }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal chat-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Chat</h2>
        {!canChat && <p className="sub">Log in with your account to chat with your friends. (Chat is off when you play without an account.)</p>}
        {canChat && status !== 'on' && <p className="sub">{status === 'error' ? 'The chat could not connect. Try again in a moment.' : 'Connecting…'}</p>}
        <div className="chat-log">
          {messages.length === 0 && canChat && status === 'on' && <span className="muted">No messages yet. Say hello!</span>}
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
              <b>{m.from}</b> <span>{m.text}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {canChat && (
          <div className="chat-input">
            <input
              value={text}
              maxLength={140}
              placeholder="Type a message…"
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit() }}
            />
            <button className="primary" onClick={submit} disabled={status !== 'on'}>Send</button>
          </div>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
