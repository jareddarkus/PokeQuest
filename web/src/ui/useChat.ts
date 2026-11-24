import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

export interface ChatMessage { id: string; from: string; text: string; at: number; mine: boolean }

/**
 * The game chat: a private broadcast channel of the game's database ("chat:lobby"). Only logged-in players can read and send;
 * nothing is stored. Without a username (playing as a guest) there is no chat.
 */
export function useChat(username: string | null, open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<'off' | 'connecting' | 'on' | 'error'>(username ? 'connecting' : 'off')
  const [unread, setUnread] = useState(0)
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastSent = useRef(0)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!username) { setStatus('off'); return }
    setStatus('connecting')
    const ch = supabase.channel('chat:lobby', { config: { private: true, broadcast: { self: true } } })
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      const p = payload as { id?: string; from?: string; text?: string; at?: number }
      if (typeof p?.text !== 'string' || typeof p?.from !== 'string') return
      const m: ChatMessage = { id: p.id ?? `${p.at}-${p.from}`, from: p.from.slice(0, 24), text: p.text.slice(0, 200), at: p.at ?? Date.now(), mine: p.from === username }
      setMessages((old) => (old.some((o) => o.id === m.id) ? old : [...old, m].slice(-60)))
      if (!m.mine && !openRef.current) setUnread((n) => n + 1)
    })
    ch.subscribe((s) => { setStatus(s === 'SUBSCRIBED' ? 'on' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'error' : 'connecting') })
    chan.current = ch
    return () => { void supabase.removeChannel(ch); chan.current = null }
  }, [username])

  useEffect(() => { if (open) setUnread(0) }, [open])

  const send = useCallback((text: string) => {
    const t = text.trim().slice(0, 140)
    if (!t || !chan.current || !username) return false
    const now = Date.now()
    if (now - lastSent.current < 700) return false // no flooding
    lastSent.current = now
    void chan.current.send({ type: 'broadcast', event: 'msg', payload: { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, from: username, text: t, at: now } })
    return true
  }, [username])

  return { messages, status, unread, send }
}
