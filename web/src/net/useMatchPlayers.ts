import { useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import type { Look } from '../game/character'
import type { OtherPlayer } from '../game/GameView'
import type { Dir } from '../game/world'

interface Remote { name: string; tx: number; ty: number; x: number; y: number; dir: Dir; look: Look; seen: number; moving: boolean }

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
}

export function useMatchPlayers(matchId: string | null, me: string | null, look: Look, getPos: () => { x: number; y: number; dir: Dir } | null, sync?: MatchSync, chanRef?: { current: { send: (npcId: string, on: boolean) => void } | null }) {
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
    const ch = supabase.channel(`match:${matchId}`, { config: { private: true, broadcast: { self: false } } })
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const p = payload as { n?: string; x?: number; y?: number; d?: Dir; l?: Look }
      if (!p || typeof p.n !== 'string' || p.n === me || typeof p.x !== 'number' || typeof p.y !== 'number') return
      const r = others.current.get(p.n)
      if (r) { r.moving = Math.abs(r.tx - p.x) + Math.abs(r.ty - p.y) > 0.01; r.tx = p.x; r.ty = p.y; r.dir = (p.d ?? 0) as Dir; r.seen = Date.now(); if (p.l) r.look = p.l }
      else others.current.set(p.n, { name: p.n, tx: p.x, ty: p.y, x: p.x, y: p.y, dir: (p.d ?? 0) as Dir, look: p.l as Look, seen: Date.now(), moving: false })
    })
    ch.on('broadcast', { event: 'picked' }, ({ payload }) => {
      const n = (payload as { n?: string } | null)?.n
      if (typeof n === 'string') { picked.current.add(n); checkAll() }
    })
    ch.on('broadcast', { event: 'busy' }, ({ payload }) => {
      const p = payload as { npc?: string; by?: string; on?: boolean } | null
      if (p && typeof p.npc === 'string' && typeof p.by === 'string' && p.by !== me) syncRef.current?.onBusy?.(p.npc, p.by, !!p.on)
    })
    if (chanRef) chanRef.current = { send: (npcId, on) => { void ch.send({ type: 'broadcast', event: 'busy', payload: { npc: npcId, by: me, on } }) } }
    ch.subscribe()
    let sentLook = 0
    let pickTick = 0
    const id = window.setInterval(() => {
      const sy = syncRef.current
      if (sy?.pickedMe && !sy.started && Date.now() - pickTick > 2000) { pickTick = Date.now(); picked.current.add(me); checkAll(); void ch.send({ type: 'broadcast', event: 'picked', payload: { n: me } }) }
      const pos = getRef.current()
      if (!pos) return
      const now = Date.now()
      const withLook = now - sentLook > 4000 // the look changes rarely, so send it every few seconds only
      if (withLook) sentLook = now
      void ch.send({ type: 'broadcast', event: 'pos', payload: { n: me, x: pos.x, y: pos.y, d: pos.dir, ...(withLook ? { l: lookRef.current } : {}) } })
    }, 140)
    return () => { window.clearInterval(id); void supabase.removeChannel(ch); others.current.clear(); picked.current.clear(); allDone.current = false; if (chanRef) chanRef.current = null }
  }, [matchId, me])

  return (): OtherPlayer[] => {
    const now = Date.now()
    const out: OtherPlayer[] = []
    for (const [k, r] of others.current) {
      if (now - r.seen > 6000) { others.current.delete(k); continue } // left the match or lost connection
      r.x += (r.tx - r.x) * 0.25
      r.y += (r.ty - r.y) * 0.25
      if (!r.look) continue
      out.push({ id: r.name, name: r.name, x: r.x, y: r.y, dir: r.dir, look: r.look, moving: r.moving && Math.abs(r.tx - r.x) + Math.abs(r.ty - r.y) > 0.02 })
    }
    return out
  }
}
