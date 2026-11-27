import { useEffect, useRef } from 'react'
import { makeTransport } from './transport'
import { netStats } from './netStats'
import type { Look } from '../game/character'
import type { OtherPlayer } from '../game/GameView'
import type { Dir } from '../game/world'

interface Remote { name: string; tx: number; ty: number; x: number; y: number; dir: Dir; look: Look; seen: number; moving: boolean; t: number }

const WALK_SPEED = 16 / 16 / (16 / 60) // tiles a second when walking (one tile = 16 frames at 60 a second, as in GameView3D)
const SEND_CHECK_MS = 70 // how often we look whether we have moved (a message goes out only if we did, so the others hear about a step at once)
const HEARTBEAT_MS = 1000 // ... and when we stand still, one message a second tells them we are still here

/**
 * Shares your position with the other players of the match (private broadcast channel "match:<id>", about 7 messages a second) and
 * gives back the others, moved smoothly towards where they were last seen.
 */
export interface MatchSync {
  /** this player has picked a starter (told to the others every 2 s until the match starts) */
  pickedMe: boolean
  /** everybody of the match (names) */
  expected: string[]
  /** called once when every player has picked */
  onAllPicked: () => void
  /** the match begins: stop telling */
  started: boolean
  /** called when a message arrives that a player is fighting a trainer / stopped fighting (the trainer is busy meanwhile) */
  onBusy?: (npcId: string, by: string, on: boolean) => void
  /** a message of an online duel (or an elimination notice) from another player */
  onDuel?: (msg: { to?: string; from: string; type: string; data?: unknown }) => void
}

export function useMatchPlayers(matchId: string | null, me: string | null, look: Look, getPos: () => { x: number; y: number; dir: Dir } | null, sync?: MatchSync, chanRef?: { current: { send: (npcId: string, on: boolean) => void; duel: (msg: { to?: string; type: string; data?: unknown }) => void } | null }) {
  const others = useRef(new Map<string, Remote>())
  const lookRef = useRef(look)
  lookRef.current = look
  const getRef = useRef(getPos)
  getRef.current = getPos
  const syncRef = useRef(sync)
  syncRef.current = sync
  const picked = useRef(new Set<string>())
  const allDone = useRef(false)
  const checkAll = () => {
    const sy = syncRef.current
    if (!sy || allDone.current || !sy.expected.length) return
    if (sy.expected.every((n) => picked.current.has(n))) { allDone.current = true; sy.onAllPicked() }
  }

  useEffect(() => {
    if (!matchId || !me) return
    const tr = makeTransport(matchId, me)
    tr.on('pos', (payload) => {
      const p = payload as { n?: string; x?: number; y?: number; d?: Dir; l?: Look; pg?: number }
      if (!p || typeof p.n !== 'string' || p.n === me || typeof p.x !== 'number' || typeof p.y !== 'number') return
      if (typeof p.pg === 'number') netStats.peers.set(p.n, p.pg)
      const r = others.current.get(p.n)
      if (r) { r.tx = p.x; r.ty = p.y; r.dir = (p.d ?? 0) as Dir; r.seen = Date.now(); if (p.l) r.look = p.l }
      else others.current.set(p.n, { name: p.n, tx: p.x, ty: p.y, x: p.x, y: p.y, dir: (p.d ?? 0) as Dir, look: p.l as Look, seen: Date.now(), moving: false, t: Date.now() })
    })
    tr.on('picked', (payload) => {
      const n = (payload as { n?: string } | null)?.n
      if (typeof n === 'string') { picked.current.add(n); checkAll() }
    })
    tr.on('busy', (payload) => {
      const p = payload as { npc?: string; by?: string; on?: boolean } | null
      if (p && typeof p.npc === 'string' && typeof p.by === 'string' && p.by !== me) syncRef.current?.onBusy?.(p.npc, p.by, !!p.on)
    })
    tr.on('duel', (payload) => {
      const m = payload as { to?: string; from?: string; type?: string; data?: unknown } | null
      if (m && typeof m.from === 'string' && m.from !== me && typeof m.type === 'string' && (!m.to || m.to === me)) syncRef.current?.onDuel?.({ to: m.to, from: m.from, type: m.type, data: m.data })
    })
    if (chanRef) chanRef.current = { send: (npcId, on) => { tr.send('busy', { npc: npcId, by: me, on }) }, duel: (msg) => { tr.send('duel', { ...msg, from: me }) } }
    tr.start()
    let sentLook = 0
    let pickTick = 0
    let lastSent = { x: NaN, y: NaN, d: NaN, at: 0 }
    const id = window.setInterval(() => {
      const sy = syncRef.current
      if (sy?.pickedMe && !sy.started && Date.now() - pickTick > 2000) { pickTick = Date.now(); picked.current.add(me); checkAll(); tr.send('picked', { n: me }) }
      const pos = getRef.current()
      if (!pos) return
      const now = Date.now()
      if (pos.x === lastSent.x && pos.y === lastSent.y && pos.dir === lastSent.d && now - lastSent.at < HEARTBEAT_MS) return // (nothing new to tell)
      lastSent = { x: pos.x, y: pos.y, d: pos.dir, at: now }
      const withLook = now - sentLook > 4000 // the look changes rarely, so send it every few seconds only
      if (withLook) sentLook = now
      tr.send('pos', { n: me, x: pos.x, y: pos.y, d: pos.dir, ...(netStats.ping !== null ? { pg: netStats.ping } : {}), ...(withLook ? { l: lookRef.current } : {}) })
    }, SEND_CHECK_MS)
    return () => { window.clearInterval(id); tr.close(); others.current.clear(); netStats.peers.clear(); picked.current.clear(); allDone.current = false; if (chanRef) chanRef.current = null }
  }, [matchId, me])

  return (): OtherPlayer[] => {
    const now = Date.now()
    const out: OtherPlayer[] = []
    for (const [k, r] of others.current) {
      if (now - r.seen > 6000) { others.current.delete(k); continue } // left the match or lost connection
      // they walk towards the tile they were last seen on at a steady speed (like a real walk), a little faster the further behind they are; then
      // the delay of the internet and the pauses between messages are not seen as jumps. (Measured with the clock, so it is the same on every screen.)
      const dt = Math.min(0.1, Math.max(0, (now - r.t) / 1000))
      r.t = now
      const dx = r.tx - r.x, dy = r.ty - r.y
      const d = Math.hypot(dx, dy)
      if (d > 8) { r.x = r.tx; r.y = r.ty } // (far away: a push, a respawn... they simply are there)
      else if (d > 1e-4) {
        const step = Math.min(d, WALK_SPEED * Math.max(1, d * 1.5) * dt)
        r.x += (dx / d) * step; r.y += (dy / d) * step
      }
      r.moving = Math.hypot(r.tx - r.x, r.ty - r.y) > 0.05
      if (!r.look) continue
      out.push({ id: r.name, name: r.name, x: r.x, y: r.y, dir: r.dir, look: r.look, moving: r.moving })
    }
    return out
  }
}
