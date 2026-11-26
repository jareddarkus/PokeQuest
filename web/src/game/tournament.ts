// The tournament that ends a match: after the last 5 minutes at the peak, a random bracket is made, the first round is fought by all the pairs at the same time,
// the winners get a new random bracket, and so on until one player is left. With an odd number of players one of them waits (a "bye") and goes on to the next round.
// Every player keeps the same copy of this state (it is built from the messages everybody hears), so any of them can take over if the one in charge leaves.

export interface Tournament {
  /** 0 = not begun; then 1, 2, 3 ... */
  round: number
  pairs: Array<[string, string]>
  bye: string | null
  /** when the current round was announced (milliseconds) */
  roundAt: number
  /** loser -> winner, for the pairs of the current round */
  resolved: Map<string, string>
  /** everybody that has lost (in a duel at the peak or in the tournament) */
  losers: Set<string>
  /** players that already waited once (they do not wait again while somebody else can) */
  hadBye: Set<string>
  champion: string | null
}

export const newTournament = (): Tournament => ({ round: 0, pairs: [], bye: null, roundAt: 0, resolved: new Map(), losers: new Set(), hadBye: new Set(), champion: null })

export interface BracketMsg { round: number; pairs: Array<[string, string]>; bye: string | null }

/** A random bracket for these players. */
export function makeBracket(round: number, players: string[], hadBye: Set<string>, rnd: () => number = Math.random): BracketMsg {
  const list = [...players]
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]] }
  let bye: string | null = null
  if (list.length % 2 === 1) {
    const fresh = list.filter((n) => !hadBye.has(n))
    bye = (fresh.length ? fresh : list)[0]
    list.splice(list.indexOf(bye), 1)
  }
  const pairs: Array<[string, string]> = []
  for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]])
  return { round, pairs, bye }
}

/** Takes a bracket that was announced (only a new round counts: the first announcement of a round wins). */
export function applyBracket(t: Tournament, m: BracketMsg, now = Date.now()): boolean {
  if (!(m.round > t.round)) return false
  t.round = m.round
  t.pairs = m.pairs
  t.bye = m.bye
  t.roundAt = now
  t.resolved = new Map()
  if (m.bye) t.hadBye.add(m.bye)
  return true
}

/** Somebody lost (or left): the other one of their pair wins the pair. */
export function applyLoss(t: Tournament, loser: string): void {
  t.losers.add(loser)
  for (const [a, b] of t.pairs) {
    if (a === loser) t.resolved.set(a, b)
    else if (b === loser) t.resolved.set(b, a)
  }
}

/** Who this player has to fight in the current round (null: nobody, already fought, or waiting). */
export function opponentOf(t: Tournament, name: string): string | null {
  for (const [a, b] of t.pairs) {
    if (a === name || b === name) return t.resolved.has(a) || t.resolved.has(b) ? null : a === name ? b : a
  }
  return null
}

/** Is this player part of the pairs of the current round (and has not fought yet)? */
export const isPaired = (t: Tournament, name: string): boolean => t.round > 0 && t.pairs.some(([a, b]) => (a === name || b === name) && !t.resolved.has(a) && !t.resolved.has(b))

export const roundDone = (t: Tournament): boolean => t.round > 0 && t.pairs.every(([a, b]) => t.resolved.has(a) || t.resolved.has(b))

/** The players that go on to the next round: the winners of the pairs and the one that waited. */
export function winnersOf(t: Tournament): string[] {
  const out = t.pairs.map(([a, b]) => (t.resolved.has(a) ? b : a))
  if (t.bye) out.push(t.bye)
  return out
}
