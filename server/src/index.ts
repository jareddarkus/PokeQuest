// PokeQuest realtime server: it only RELAYS the small messages of a match between its players (positions, "picked", "busy", duels) over WebSockets.
// One Durable Object per match; the login of every player is checked against Supabase, so only real accounts can join.
// Messages are JSON: { e: 'pos' | 'picked' | 'busy' | 'duel', p: <payload> } and the server adds who sent it.

export interface Env {
  MATCH: DurableObjectNamespace
  STATS: DurableObjectNamespace
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
}

const MAX_BYTES = 4096 // a bigger message is thrown away
const MAX_PER_SECOND = 40 // a player sending more than this is ignored for that second
const EVENTS = new Set(['pos', 'picked', 'busy', 'duel'])

/** the username of the account behind a Supabase login token (the account's e-mail is "<username>@players.pokequest.app"), or null */
async function whoIs(env: Env, token: string): Promise<string | null> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    const u = (await r.json()) as { email?: string }
    const m = /^([^@]+)@players\.pokequest\.app$/i.exec(u.email ?? '')
    return m ? m[1].toLowerCase() : null
  } catch { return null }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const cors = { 'access-control-allow-origin': '*' }
    if (url.pathname === '/health') return new Response('ok', { headers: cors })
    if (url.pathname === '/stats') { // how much of today's free Cloudflare allowance the game has used (numbers only, an estimate counted by the server itself)
      const r = await env.STATS.get(env.STATS.idFromName('global')).fetch('https://stats/get')
      return new Response(r.body, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
    if (url.pathname !== '/ws' || req.headers.get('Upgrade') !== 'websocket') return new Response('PokeQuest realtime', { status: 404, headers: cors })
    const match = url.searchParams.get('match') ?? ''
    const token = url.searchParams.get('token') ?? ''
    const name = url.searchParams.get('name') ?? ''
    if (!/^[\w-]{1,64}$/.test(match) || !token || !name) return new Response('bad request', { status: 400, headers: cors })
    const account = await whoIs(env, token)
    if (!account || account !== name.toLowerCase()) return new Response('not logged in', { status: 401, headers: cors })
    const stub = env.MATCH.get(env.MATCH.idFromName(match))
    return stub.fetch(new Request(`https://match/ws?name=${encodeURIComponent(name)}&match=${encodeURIComponent(match)}`, req))
  },
}

interface Tag { name: string; sec: number; count: number }

const IDLE_MS = 10000 // an object with no message for this long is counted as asleep (hibernating: no duration is charged)
const FLUSH_MS = 30000 // how often a match tells the counter what it used

export class Match {
  state: DurableObjectState
  env: Env
  // what this match used since the last report to the counter (kept in memory; only for the usage bar)
  pending = { msgs: 0, connects: 0, activeMs: 0, flushes: 0 }
  lastMsgAt = 0
  lastFlush = Date.now()
  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    // "ping" -> "pong" is answered by Cloudflare itself without waking the object: no cost. The game measures every player's ping with it.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** counts this message and its time awake; now and then reports to the counter */
  count(kind: 'msg' | 'connect', ws?: WebSocket): void {
    const now = Date.now()
    if (this.lastMsgAt) this.pending.activeMs += Math.min(now - this.lastMsgAt, IDLE_MS)
    else this.pending.activeMs += 1000
    this.lastMsgAt = now
    if (kind === 'msg') this.pending.msgs++; else this.pending.connects++
    if (now - this.lastFlush >= FLUSH_MS) this.flush(ws)
  }
  flush(_ws?: WebSocket): void {
    const p = this.pending
    if (!p.msgs && !p.connects && !p.activeMs) return
    this.pending = { msgs: 0, connects: 0, activeMs: 0, flushes: 0 }
    this.lastFlush = Date.now()
    this.state.waitUntil(this.env.STATS.get(this.env.STATS.idFromName('global')).fetch('https://stats/add', { method: 'POST', body: JSON.stringify(p) }).then(() => undefined, () => undefined))
  }

  async fetch(req: Request): Promise<Response> {
    const name = new URL(req.url).searchParams.get('name') ?? ''
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    // the same player connecting again (a reconnect) replaces the old connection
    for (const old of this.state.getWebSockets(name.toLowerCase())) { try { old.close(1000, 'replaced') } catch { /* already closed */ } }
    this.state.acceptWebSocket(server, [name.toLowerCase()])
    this.count('connect')
    server.serializeAttachment({ name, sec: 0, count: 0 } satisfies Tag)
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    this.count('msg')
    if (typeof data !== 'string' || data.length > MAX_BYTES) return
    const tag = ws.deserializeAttachment() as Tag | null
    if (!tag) return
    const sec = Math.floor(Date.now() / 1000)
    if (tag.sec !== sec) { tag.sec = sec; tag.count = 0 }
    if (++tag.count > MAX_PER_SECOND) { ws.serializeAttachment(tag); return }
    ws.serializeAttachment(tag)
    let m: { e?: string; p?: Record<string, unknown> }
    try { m = JSON.parse(data) } catch { return }
    if (!m || typeof m.e !== 'string' || !EVENTS.has(m.e) || typeof m.p !== 'object' || m.p === null) return
    const p: Record<string, unknown> = { ...m.p }
    // the server says who sent it (a player cannot talk in the name of another)
    if (m.e === 'pos' || m.e === 'picked') p.n = tag.name
    else p.from = tag.name
    if (m.e === 'busy') p.by = tag.name
    const out = JSON.stringify({ e: m.e, p })
    const to = m.e === 'duel' && typeof p.to === 'string' ? p.to.toLowerCase() : null
    for (const other of this.state.getWebSockets(to ?? undefined)) { if (other !== ws) { try { other.send(out) } catch { /* it is closing */ } } }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void { this.flush(); try { ws.close(code, reason) } catch { /* already closed */ } }
  webSocketError(ws: WebSocket): void { try { ws.close(1011, 'error') } catch { /* already closed */ } }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The counter of the day: ONE object that adds up what every match reports, per UTC day (Cloudflare's free allowance resets at 00:00 UTC).
// The numbers are an estimate made by us (messages, connections, time awake); Cloudflare's own dashboard has the exact ones.
const FREE_REQUESTS = 100_000 // Durable Object requests a day on the free plan
const FREE_GB_SECONDS = 13_000 // Durable Object duration a day on the free plan
const OBJECT_GB = 0.125 // every object is billed as 128 MB while it is awake
const WS_RATIO = 20 // 20 incoming WebSocket messages count as 1 request

interface Day { day: string; msgs: number; connects: number; activeMs: number; flushes: number; matches: number }

export class Stats {
  state: DurableObjectState
  today: Day | null = null
  constructor(state: DurableObjectState) { this.state = state }

  async load(): Promise<Day> {
    const day = new Date().toISOString().slice(0, 10)
    if (!this.today || this.today.day !== day) this.today = (await this.state.storage.get<Day>('day:' + day)) ?? { day, msgs: 0, connects: 0, activeMs: 0, flushes: 0, matches: 0 }
    return this.today
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const d = await this.load()
    if (url.pathname === '/add' && req.method === 'POST') {
      const p = (await req.json()) as { msgs?: number; connects?: number; activeMs?: number }
      d.msgs += Number(p.msgs) || 0; d.connects += Number(p.connects) || 0; d.activeMs += Number(p.activeMs) || 0; d.flushes++
      await this.state.storage.put('day:' + d.day, d)
      return new Response('ok')
    }
    const requests = d.connects * 1 + Math.ceil(d.msgs / WS_RATIO) + d.flushes // (the reports to this counter are requests too)
    const gbSeconds = (d.activeMs / 1000) * OBJECT_GB
    const next = new Date(); next.setUTCHours(24, 0, 0, 0)
    return new Response(JSON.stringify({
      day: d.day, resetAt: next.getTime(), now: Date.now(),
      messages: d.msgs, connections: d.connects, activeSeconds: Math.round(d.activeMs / 1000),
      requests, requestsLimit: FREE_REQUESTS, requestsFraction: requests / FREE_REQUESTS,
      gbSeconds: Math.round(gbSeconds), gbSecondsLimit: FREE_GB_SECONDS, durationFraction: gbSeconds / FREE_GB_SECONDS,
      estimate: true,
    }), { headers: { 'content-type': 'application/json' } })
  }
}
