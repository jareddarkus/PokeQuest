// The guest's side of an online duel: the host runs the battle (Pokémon Showdown engine) and sends this player the events (already turned round to this
// player's point of view) and the choices to pick from; this object looks like a BattleSession to the battle screen and sends the choices back.
import type { Mon } from '../data/dex'
import type { BattleEvent, Request } from './engine'

export class PvpGuestSession {
  ended = false
  winner: 'p1' | 'p2' | null | undefined
  defeated: Array<{ foe: Mon; by: string[] }> = []
  isTrainerBattle = true
  foeName = ''
  private listeners: Array<(e: BattleEvent[]) => void> = []
  private reqListeners: Array<(r: Request) => void> = []
  private hp = new Map<string, { hp: number; max: number }>()
  private foeUid = ''
  private mine = ''
  private turnNo = 0
  private send: (type: string, data: unknown) => void
  private team: Mon[]

  constructor(team: Mon[], send: (type: string, data: unknown) => void) {
    this.team = team
    this.send = send
  }

  onEvents(cb: (e: BattleEvent[]) => void) { this.listeners.push(cb) }
  onRequest(cb: (r: Request) => void) { this.reqListeners.push(cb) }
  start() { this.send('ready', {}) } // tell the host we can receive now

  /** messages from the host */
  receive(type: string, data: unknown) {
    if (type === 'events') {
      const evs = data as BattleEvent[]
      for (const e of evs) {
        if (e.kind === 'switch' || e.kind === 'hp') { this.hp.set(e.uid, { hp: e.hp, max: e.maxHp }); if (e.kind === 'switch') { if (e.side === 'p1') this.mine = e.uid; else this.foeUid = e.uid } }
        if (e.kind === 'faint') this.hp.set(e.uid, { hp: 0, max: this.hp.get(e.uid)?.max ?? 1 })
        if (e.kind === 'turn') this.turnNo = e.n
        if (e.kind === 'win') { this.ended = true; this.winner = e.side }
      }
      for (const l of this.listeners) l(evs)
    } else if (type === 'request') {
      for (const l of this.reqListeners) l(data as Request)
    }
  }

  chooseMove(index1: number) { this.send('choice', { k: 'move', i: index1 }) }
  chooseSwitch(uid: string) { this.send('choice', { k: 'switch', uid }) }
  passTurn() { /* no items in a duel */ }
  healActive(): null { return null }
  hpOf(uid: string): number { return this.hp.get(uid)?.hp ?? 0 }
  syncBack() {
    for (const m of this.team) { const h = this.hp.get(m.uid); if (h) m.hp = Math.max(0, h.hp) }
  }
  get foeActive(): { uid: string; hp: number; maxHp: number } | null {
    const h = this.hp.get(this.foeUid)
    return h ? { uid: this.foeUid, hp: h.hp, maxHp: h.max } : null
  }
  get playerActive(): string { return this.mine }
  get participantsList(): string[] { return [] }
  get turn(): number { return this.turnNo }
  destroy() { this.listeners = []; this.reqListeners = [] }
}
