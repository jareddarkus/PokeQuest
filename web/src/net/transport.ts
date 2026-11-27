// How the messages of a match travel. Two ways, same messages:
//  - "socket": our own small realtime server on Cloudflare (server/ folder), used by default;
//  - "supabase": Supabase Realtime broadcast (the way it was before), used when the site is built with VITE_REALTIME_URL=off.
import { supabase } from '../supabase'
import { netStats } from './netStats'

export interface Transport {
  /** listen to one kind of message ('pos', 'picked', 'busy', 'duel') */
  on(event: string, cb: (payload: unknown) => void): void
  send(event: string, payload: unknown): void
  start(): void
  close(): void
}

// The address of our realtime server (public, like the site). Building with VITE_REALTIME_URL=off uses Supabase Realtime instead (the old way); another address replaces it.
const SERVER = (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? 'wss://pokequest-realtime.pokequest-realtime.workers.dev'
const SOCKET_URL = SERVER === 'off' || SERVER === '' ? undefined : SERVER.replace(/\/+$/, '')

function supabaseTransport(matchId: string): Transport {
  const ch = supabase.channel(`match:${matchId}`, { config: { private: true, broadcast: { self: false } } })
  return {
    on: (event, cb) => { ch.on('broadcast', { event }, ({ payload }) => cb(payload)) },
    send: (event, payload) => { void ch.send({ type: 'broadcast', event, payload }) },
    start: () => { ch.subscribe(); netStats.via = 'supabase'; netStats.ping = null },
    close: () => { void supabase.removeChannel(ch); if (netStats.via === 'supabase') netStats.via = null },
  }
}

/** Our own server. `onGiveUp` is called when it never lets us in (down, or it does not accept our login): the match then moves to Supabase. */
function socketTransport(base: string, matchId: string, me: string, onGiveUp: () => void): Transport {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  let ws: WebSocket | null = null
  let closed = false
  let everOpen = false
  let failures = 0 // connection attempts in a row that never opened
  let tries = 0
  let timer = 0
  let pong: (() => void) | null = null
  const connect = async () => {
    if (closed) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (closed) return
    if (!token) { timer = window.setTimeout(() => void connect(), 2000); return }
    const s = new WebSocket(`${base}/ws?match=${encodeURIComponent(matchId)}&name=${encodeURIComponent(me)}&token=${encodeURIComponent(token)}`)
    ws = s
    let opened = false
    s.onopen = () => {
      opened = true; everOpen = true; tries = 0; failures = 0; netStats.via = 'cloudflare'
      // the ping: the server answers "ping" with "pong" by itself (it costs nothing), the time between is our delay
      let sentAt = 0
      const ask = () => { if (s.readyState === WebSocket.OPEN) { sentAt = performance.now(); s.send('ping') } }
      ask()
      const iv = window.setInterval(ask, 2500)
      pong = (): void => { const ms = Math.round(performance.now() - sentAt); netStats.ping = netStats.ping === null ? ms : Math.round(netStats.ping * 0.6 + ms * 0.4) }
      s.addEventListener('close', () => { window.clearInterval(iv); pong = null; netStats.ping = null })
    }
    s.onmessage = (e) => {
      if (e.data === 'pong') { pong?.(); return }
      try {
        const m = JSON.parse(e.data as string) as { e?: string; p?: unknown }
        if (typeof m.e === 'string') for (const cb of handlers.get(m.e) ?? []) cb(m.p)
      } catch { /* not ours */ }
    }
    s.onclose = () => {
      ws = null
      if (closed) return
      if (!opened && ++failures >= (everOpen ? 8 : 3)) { closed = true; onGiveUp(); return } // (never let in: 3 tries; lost it later: about 20 s of failures)
      timer = window.setTimeout(() => void connect(), Math.min(5000, 300 * 2 ** tries++)) // (reconnects by itself, a little slower each time)
    }
  }
  return {
    on: (event, cb) => { handlers.set(event, [...(handlers.get(event) ?? []), cb]) },
    send: (event, payload) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ e: event, p: payload })) },
    start: () => { void connect() },
    close: () => { closed = true; window.clearTimeout(timer); try { ws?.close() } catch { /* already closed */ } ws = null },
  }
}

/** where to read today's usage of the realtime server (null when the match does not use it) */
export const statsUrl = (): string | null => (SOCKET_URL ? SOCKET_URL.replace(/^ws/, 'http') + '/stats' : null)

export function makeTransport(matchId: string, me: string, net?: 'cf' | 'sb'): Transport {
  if (!SOCKET_URL || net === 'sb') return supabaseTransport(matchId) // ('sb': somebody in this match has an older build that only knows Supabase)
  // our server first; if it never lets us in, the same match goes on over Supabase (so a problem with the server never leaves the game without multiplayer)
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  let active: Transport
  let fallback: Transport | null = null
  let closed = false
  const giveUp = () => {
    if (closed || fallback) return
    console.warn('PokeQuest: the realtime server did not accept us, using Supabase Realtime instead')
    fallback = supabaseTransport(matchId)
    for (const [ev, list] of handlers) for (const cb of list) fallback.on(ev, cb)
    active = fallback
    fallback.start()
  }
  active = socketTransport(SOCKET_URL, matchId, me, giveUp)
  return {
    on: (event, cb) => { handlers.set(event, [...(handlers.get(event) ?? []), cb]); active.on(event, cb) },
    send: (event, payload) => active.send(event, payload),
    start: () => active.start(),
    close: () => { closed = true; active.close() },
  }
}
