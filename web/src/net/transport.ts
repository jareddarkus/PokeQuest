// How the messages of a match travel. Two ways, same messages:
//  - "socket": our own small realtime server on Cloudflare (server/ folder), used when VITE_REALTIME_URL is set when the site is built;
//  - "supabase": Supabase Realtime broadcast (the way it was before), used otherwise or as the fallback.
import { supabase } from '../supabase'

export interface Transport {
  /** listen to one kind of message ('pos', 'picked', 'busy', 'duel') */
  on(event: string, cb: (payload: unknown) => void): void
  send(event: string, payload: unknown): void
  start(): void
  close(): void
}

const SOCKET_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined)?.replace(/\/+$/, '')

function supabaseTransport(matchId: string): Transport {
  const ch = supabase.channel(`match:${matchId}`, { config: { private: true, broadcast: { self: false } } })
  return {
    on: (event, cb) => { ch.on('broadcast', { event }, ({ payload }) => cb(payload)) },
    send: (event, payload) => { void ch.send({ type: 'broadcast', event, payload }) },
    start: () => { ch.subscribe() },
    close: () => { void supabase.removeChannel(ch) },
  }
}

function socketTransport(base: string, matchId: string, me: string): Transport {
  const handlers = new Map<string, Array<(p: unknown) => void>>()
  let ws: WebSocket | null = null
  let closed = false
  let tries = 0
  let timer = 0
  const connect = async () => {
    if (closed) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (closed) return
    if (!token) { timer = window.setTimeout(() => void connect(), 2000); return }
    const s = new WebSocket(`${base}/ws?match=${encodeURIComponent(matchId)}&name=${encodeURIComponent(me)}&token=${encodeURIComponent(token)}`)
    ws = s
    s.onopen = () => { tries = 0 }
    s.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as { e?: string; p?: unknown }
        if (typeof m.e === 'string') for (const cb of handlers.get(m.e) ?? []) cb(m.p)
      } catch { /* not ours */ }
    }
    s.onclose = () => { ws = null; if (!closed) timer = window.setTimeout(() => void connect(), Math.min(5000, 300 * 2 ** tries++)) } // (reconnects by itself, a little slower each time)
  }
  return {
    on: (event, cb) => { handlers.set(event, [...(handlers.get(event) ?? []), cb]) },
    send: (event, payload) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ e: event, p: payload })) },
    start: () => { void connect() },
    close: () => { closed = true; window.clearTimeout(timer); try { ws?.close() } catch { /* already closed */ } ws = null },
  }
}

export function makeTransport(matchId: string, me: string): Transport {
  return SOCKET_URL ? socketTransport(SOCKET_URL, matchId, me) : supabaseTransport(matchId)
}
