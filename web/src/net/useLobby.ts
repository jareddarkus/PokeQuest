import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import type { Look } from '../game/character'

export interface LobbyPlayer { name: string; ready: boolean; joined: number; look: Look }
/** What every player gets when the match starts. */
export interface MatchInfo { id: string; seed: number; players: string[]; startsAt: number }

/**
 * The waiting room: everybody who is on the "lobby:main" channel is listed (Supabase presence). When there are at least 2 players and all of them
 * are ready, the player who joined first (the host) announces the match with a shared island seed and a start time.
 */
export function useLobby(username: string, look: Look) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([])
  const [match, setMatch] = useState<MatchInfo | null>(null)
  const [status, setStatus] = useState<'connecting' | 'on' | 'error'>('connecting')
  const [arenaBusy, setArenaBusy] = useState(false) // a match is being played right now: nobody can join it
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mine = useRef<LobbyPlayer>({ name: username, ready: false, joined: Date.now(), look })
  const matchRef = useRef<MatchInfo | null>(null)
  const announced = useRef(false)

  useEffect(() => {
    mine.current = { name: username, ready: false, joined: Date.now(), look }
    const ch = supabase.channel('lobby:main', { config: { private: true, presence: { key: username }, broadcast: { self: true } } })
    const sync = () => {
      const state = ch.presenceState() as Record<string, Array<Partial<LobbyPlayer>>>
      const list: LobbyPlayer[] = []
      for (const [key, metas] of Object.entries(state)) {
        const m = metas[metas.length - 1]
        if (m) list.push({ name: key, ready: !!m.ready, joined: m.joined ?? 0, look: m.look as Look })
      }
      list.sort((a, b) => a.joined - b.joined || a.name.localeCompare(b.name))
      setPlayers(list)
    }
    ch.on('presence', { event: 'sync' }, sync)
    ch.on('broadcast', { event: 'start' }, ({ payload }) => {
      const m = payload as MatchInfo
      if (matchRef.current || !m || !Array.isArray(m.players) || !m.players.includes(username)) return
      matchRef.current = m
      setMatch(m)
    })
    ch.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') { setStatus('on'); await ch.track(mine.current) }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error')
    })
    chan.current = ch
    return () => { void supabase.removeChannel(ch); chan.current = null }
  }, [username])

  const setReady = useCallback((ready: boolean) => {
    mine.current = { ...mine.current, ready }
    void chan.current?.track(mine.current)
  }, [])

  // is a match running? (the players of a match stand on the channel "match:arena" until they leave it)
  useEffect(() => {
    const ch = supabase.channel('match:arena', { config: { private: true, presence: { key: `watch-${username}-${Math.random().toString(36).slice(2, 6)}` } } })
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState() as Record<string, Array<{ playing?: boolean }>>
      setArenaBusy(Object.values(st).some((ms) => ms.some((m) => m.playing)))
    })
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [username])

  // the host (first to join) starts the match when everyone is ready
  useEffect(() => {
    if (arenaBusy || matchRef.current || announced.current || players.length < 2) return
    if (players[0].name !== username || !players.every((p) => p.ready)) return
    announced.current = true
    const info: MatchInfo = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, seed: Math.floor(Math.random() * 1e9), players: players.map((p) => p.name), startsAt: Date.now() + 6000 }
    void chan.current?.send({ type: 'broadcast', event: 'start', payload: info })
  }, [players, username, arenaBusy])

  return { players, match, status, arenaBusy, setReady, me: players.find((p) => p.name === username) }
}
