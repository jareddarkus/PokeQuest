// Watching another player's battle: the player who fights sends the events of the battle (the same ones its own screen plays); a spectator plays them on its own screen.
import { blankStats, type Mon } from '../data/dex'
import type { BattleEvent } from './engine'

/** What a spectator needs to know about the two teams (the species and levels only). */
export interface TeamSummary { species: string; level: number; shiny: boolean }
export interface BattleInfo { kind: 'wild' | 'trainer' | 'gym'; foeName: string; foeSeed: string; foeClass?: number; host: string; mine: TeamSummary[]; foe: TeamSummary[] }

export const summarize = (team: Mon[]): TeamSummary[] => team.map((m) => ({ species: m.species, level: m.level, shiny: !!m.shiny }))

/** A stand-in Pokémon made from a summary (the battle screen only needs the species, level and that it is alive). */
export const fakeMon = (s: TeamSummary, i: number): Mon => ({
  uid: `spec${i}`, species: s.species, level: s.level, exp: 0, nature: 'Hardy', ability: '', ivs: blankStats(0), evs: blankStats(0), moves: [], shiny: s.shiny, gender: 'N', hp: 1, item: '', friendship: 0,
})

/** The events that are enough to show a battle that is already running: what each side has out now (with its HP and status) and the turn. */
export function snapshotOf(history: BattleEvent[]): BattleEvent[] {
  const out: BattleEvent[] = []
  for (const side of ['p1', 'p2'] as const) {
    let sw: Extract<BattleEvent, { kind: 'switch' }> | null = null
    for (const e of history) if (e.kind === 'switch' && e.side === side) sw = e
    if (!sw) continue
    let cur: Extract<BattleEvent, { kind: 'switch' }> = { ...sw }
    let status: string | undefined
    let fainted = false
    for (let i = history.lastIndexOf(sw); i < history.length; i++) {
      const e = history[i]
      if (e.kind === 'hp' && e.uid === cur.uid) { cur = { ...cur, hp: e.hp, maxHp: e.maxHp }; if (e.status !== undefined) status = e.status }
      else if (e.kind === 'status' && e.uid === cur.uid) status = e.status
      else if (e.kind === 'faint' && e.uid === cur.uid) fainted = true
    }
    if (fainted) continue
    out.push(cur)
    if (status) out.push({ kind: 'status', side, uid: cur.uid, status })
  }
  return out
}
