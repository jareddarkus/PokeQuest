import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { addFriend, listFriends, listenWhispers, myUserId, removeFriend, sendWhisper } from '../net/social'

export interface ChatMessage { id: string; from: string; text: string; at: number; mine: boolean }

/** The tab of the global chat; private chats use the other player's name as their tab. */
export const GLOBAL = 'Global'

/**
 * The game chat: a private broadcast channel of the game's database ("chat:lobby") for everybody, plus private messages (whispers) that
 * only the receiver can listen to. Only logged-in players can read and send; nothing is stored. Without a username (a guest) there is no chat.
 */
export function useChat(username: string | null, open: boolean) {
  const [byTab, setByTab] = useState<Record<string, ChatMessage[]>>({ [GLOBAL]: [] })
  const [tabs, setTabs] = useState<string[]>([GLOBAL])
  const [active, setActiveState] = useState(GLOBAL)
  const [unreadBy, setUnreadBy] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<'off' | 'connecting' | 'on' | 'error'>(username ? 'connecting' : 'off')
  const [friends, setFriends] = useState<string[]>([])
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastSent = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const activeRef = useRef(active)
  activeRef.current = active

  const add = useCallback((tab: string, m: ChatMessage) => {
    setByTab((old) => { const list = old[tab] ?? []; return list.some((o) => o.id === m.id) ? old : { ...old, [tab]: [...list, m].slice(-80) } })
    setTabs((old) => (old.includes(tab) ? old : [...old, tab]))
    if (!m.mine && (!openRef.current || activeRef.current !== tab)) setUnreadBy((u) => ({ ...u, [tab]: (u[tab] ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!username) { setStatus('off'); return }
    setStatus('connecting')
    const ch = supabase.channel('chat:lobby', { config: { private: true, broadcast: { self: true } } })
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      const p = payload as { id?: string; from?: string; text?: string; at?: number }
      if (typeof p?.text !== 'string' || typeof p?.from !== 'string') return
      add(GLOBAL, { id: p.id ?? `${p.at}-${p.from}`, from: p.from.slice(0, 24), text: p.text.slice(0, 200), at: p.at ?? Date.now(), mine: p.from === username })
    })
    ch.subscribe((s) => { setStatus(s === 'SUBSCRIBED' ? 'on' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? 'error' : 'connecting') })
    chan.current = ch
    let stop = () => {}
    void myUserId().then((uid) => { if (uid) stop = listenWhispers(uid, (w) => add(w.from, { id: `${w.at}-${w.from}-${w.text.length}`, from: w.from, text: w.text, at: w.at, mine: false })) })
    void listFriends().then(setFriends)
    return () => { stop(); void supabase.removeChannel(ch); chan.current = null }
  }, [username, add])

  const setActive = useCallback((tab: string) => { setActiveState(tab); setUnreadBy((u) => ({ ...u, [tab]: 0 })) }, [])
  useEffect(() => { if (open) setUnreadBy((u) => ({ ...u, [activeRef.current]: 0 })) }, [open])

  /** Opens (or starts) a private chat with a player. */
  const openWhisper = useCallback((name: string) => {
    if (!name || name === username) return
    setTabs((old) => (old.includes(name) ? old : [...old, name]))
    setByTab((old) => (name in old ? old : { ...old, [name]: [] }))
    setActive(name)
  }, [username, setActive])
  const closeTab = useCallback((name: string) => {
    if (name === GLOBAL) return
    setTabs((old) => old.filter((t) => t !== name))
    setActiveState((a) => (a === name ? GLOBAL : a))
  }, [])

  const send = useCallback((text: string): boolean => {
    const t = text.trim().slice(0, 140)
    if (!t || !username) return false
    const now = Date.now()
    if (now - lastSent.current < 700) return false // no flooding
    const tab = activeRef.current
    if (tab === 'Amigos') return false
    lastSent.current = now
    if (tab === GLOBAL) {
      if (!chan.current) return false
      void chan.current.send({ type: 'broadcast', event: 'msg', payload: { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, from: username, text: t, at: now } })
      return true
    }
    void sendWhisper(username, tab, t).then((ok) => {
      add(tab, { id: `${now}-me-${Math.random().toString(36).slice(2, 7)}`, from: ok ? username : '⚠', text: ok ? t : `No se pudo enviar a ${tab}.`, at: now, mine: ok })
    })
    return true
  }, [username, add])

  const refreshFriends = useCallback(() => { void listFriends().then(setFriends) }, [])
  const friendAction = useCallback(async (name: string, on: boolean) => { const ok = on ? await addFriend(name) : await removeFriend(name); refreshFriends(); return ok }, [refreshFriends])
  const unread = Object.values(unreadBy).reduce((a, b) => a + b, 0)
  return { byTab, tabs, active, setActive, openWhisper, closeTab, messages: byTab[GLOBAL] ?? [], status, unread, unreadBy, send, friends, friendAction, refreshFriends }
}
