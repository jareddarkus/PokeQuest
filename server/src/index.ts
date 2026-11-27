// PokeQuest realtime server: it only RELAYS the small messages of a match between its players (positions, "picked", "busy", duels) over WebSockets.
// One Durable Object per match; the login of every player is checked against Supabase, so only real accounts can join.
// Messages are JSON: { e: 'pos' | 'picked' | 'busy' | 'duel', p: <payload> } and the server adds who sent it.

export interface Env {
  MATCH: DurableObjectNamespace
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
    if (url.pathname !== '/ws' || req.headers.get('Upgrade') !== 'websocket') return new Response('PokeQuest realtime', { status: 404, headers: cors })
    const match = url.searchParams.get('match') ?? ''
    const token = url.searchParams.get('token') ?? ''
    const name = url.searchParams.get('name') ?? ''
    if (!/^[\w-]{1,64}$/.test(match) || !token || !name) return new Response('bad request', { status: 400, headers: cors })
    const account = await whoIs(env, token)
    if (!account || account !== name.toLowerCase()) return new Response('not logged in', { status: 401, headers: cors })
    const stub = env.MATCH.get(env.MATCH.idFromName(match))
    return stub.fetch(new Request(`https://match/ws?name=${encodeURIComponent(name)}`, req))
  },
}

interface Tag { name: string; sec: number; count: number }

export class Match {
  state: DurableObjectState
  constructor(state: DurableObjectState) { this.state = state }

  async fetch(req: Request): Promise<Response> {
    const name = new URL(req.url).searchParams.get('name') ?? ''
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    // the same player connecting again (a reconnect) replaces the old connection
    for (const old of this.state.getWebSockets(name.toLowerCase())) { try { old.close(1000, 'replaced') } catch { /* already closed */ } }
    this.state.acceptWebSocket(server, [name.toLowerCase()])
    server.serializeAttachment({ name, sec: 0, count: 0 } satisfies Tag)
    return new Response(null, { status: 101, webSocket: client })
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
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

  webSocketClose(ws: WebSocket, code: number, reason: string): void { try { ws.close(code, reason) } catch { /* already closed */ } }
  webSocketError(ws: WebSocket): void { try { ws.close(1011, 'error') } catch { /* already closed */ } }
}
