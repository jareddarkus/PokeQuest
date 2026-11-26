// Runs one battle with the Pokémon Showdown engine (everything happens inside the player's browser).
import { Battle, Dex, Teams, extractChannelMessages } from '@pkmn/sim'
import { maxHp, type Mon } from '../data/dex'

export type Side = 'p1' | 'p2'

const STAT_NAMES: Record<string, string> = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' }

export type BattleEvent =
  | { kind: 'text'; text: string }
  | { kind: 'switch'; side: Side; uid: string; species: string; level: number; hp: number; maxHp: number; shiny: boolean }
  /** `from`: what caused it when it is not a move (burn / poison damage at the end of a turn) */
  | { kind: 'hp'; side: Side; uid: string; hp: number; maxHp: number; status?: string; from?: string }
  | { kind: 'faint'; side: Side; uid: string }
  | { kind: 'status'; side: Side; uid: string; status: string }
  /** confusion / infatuation shown on a Pokémon (the game's own animation) */
  | { kind: 'volatile'; side: Side; uid: string; what: 'confusion' | 'attract' }
  | { kind: 'move'; side: Side; uid: string; move: string }
  | { kind: 'stat'; side: Side; uid: string; amount: number }
  /** the stat stages (-6 ... +6) a Pokémon has right now, for the little badges next to its HP box */
  | { kind: 'stages'; side: Side; uid: string; stages: Record<string, number> }
  | { kind: 'turn'; n: number }
  | { kind: 'win'; side: Side | null }

export interface MoveOption { name: string; id: string; pp: number; maxpp: number; disabled: boolean; type: string }
export interface BenchOption { uid: string; species: string; level: number; hp: number; maxHp: number; fainted: boolean; active: boolean }
export interface Request {
  forceSwitch: boolean
  wait: boolean
  moves: MoveOption[]
  bench: BenchOption[]
  trapped: boolean
}

const EXTRA = 'Splash' // a hidden "do nothing" move the game uses when you spend your turn on an item or a failed catch

function toSet(m: Mon, isPlayer: boolean) {
  return {
    name: m.uid,
    species: m.species,
    moves: isPlayer ? [...m.moves, EXTRA] : [...m.moves],
    ability: m.ability,
    item: m.item,
    nature: m.nature,
    evs: m.evs,
    ivs: m.ivs,
    level: m.level,
    gender: m.gender === 'N' ? '' : m.gender,
    shiny: m.shiny,
    happiness: 255,
  }
}

const effectiveness = (atkType: string, defTypes: string[]): number => {
  let mult = 1
  for (const d of defTypes) {
    const e = Dex.types.get(d).damageTaken[atkType]
    mult *= e === 1 ? 2 : e === 2 ? 0.5 : e === 3 ? 0 : 1
  }
  return mult
}

export class BattleSession {
  private battle: Battle
  private team1: Mon[]
  private team2: Mon[]
  private listeners: Array<(e: BattleEvent[]) => void> = []
  private reqListeners: Array<(r: Request) => void> = []
  private lastP2Request: { active?: Array<{ moves: Array<{ move: string; id: string; disabled?: boolean }> }>; forceSwitch?: boolean[]; side: { pokemon: Array<{ ident: string; details: string; condition: string; active: boolean }> } } | null = null
  private p2Pending = false
  ended = false
  winner: Side | null | undefined
  /** which of the foe's Pokémon were beaten by which of our Pokémon (for experience) */
  defeated: Array<{ foe: Mon; by: string[] }> = []
  private participants = new Set<string>()
  private currentP1 = ''
  private stages = new Map<string, Record<string, number>>()
  private stagesPrev = new Map<string, Record<string, number>>()
  private turnCount = 0

  /** online duel (the host runs the battle, the guest gets the same events seen from its own side and sends its choices back) */
  pvp?: { send: (type: string, data: unknown) => void; hostName: string; guestName: string }

  constructor(team1: Mon[], team2: Mon[], pvp?: BattleSession['pvp']) {
    this.pvp = pvp
    this.team1 = team1
    this.team2 = team2
    this.battle = new Battle({
      formatid: 'gen9customgame@@@!teampreview' as never,
      send: (type: string, data: string | string[]) => this.onSend(type, data),
    } as never)
  }

  /** Call once, AFTER onEvents / onRequest are connected: the engine starts talking right away. */
  start() {
    const t1 = Teams.pack(this.team1.map((m) => toSet(m, true)) as never)
    const t2 = Teams.pack(this.team2.map((m) => toSet(m, false)) as never)
    this.battle.setPlayer('p1', { name: 'You', team: t1 })
    this.battle.setPlayer('p2', { name: 'Foe', team: t2 })
    // power points: the simulator starts every move with the PP-Up maximum (x 8/5, so Tackle would have 56); in the games a move starts with its own PP (Tackle 35)
    for (const p of [...this.battle.p1.pokemon, ...this.battle.p2.pokemon] as Array<{ moveSlots: Array<{ id: string; pp: number; maxpp: number }> }>) {
      for (const slot of p.moveSlots) { const base = Dex.moves.get(slot.id).pp; if (base) { slot.maxpp = base; slot.pp = base } }
    }
    // carry over the damage the Pokémon already have
    this.applyHp(this.battle.p1.pokemon as never, this.team1)
    this.applyHp(this.battle.p2.pokemon as never, this.team2)
    this.applyPp(this.battle.p1.pokemon as never)
    this.battle.sendUpdates()
    // the first "switch in" lines were written with full HP: correct the bars
    const fix: BattleEvent[] = []
    for (const [side, list] of [['p1', this.battle.p1.active], ['p2', this.battle.p2.active]] as const) {
      const a = list[0] as { name: string; hp: number; maxhp: number } | undefined
      if (a) fix.push({ kind: 'hp', side, uid: a.name, hp: a.hp, maxHp: a.maxhp })
    }
    this.emit(fix)
  }

  private flush() { if (!this.destroyed) this.battle.sendUpdates() }

  /** carry over the power points the Pokémon have left from earlier battles */
  private applyPp(list: Array<{ name: string; moveSlots: Array<{ pp: number; maxpp: number }> }>) {
    for (const p of list) {
      const m = this.team1.find((q) => q.uid === p.name)
      if (!m?.pp) continue
      m.moves.forEach((_, j) => { const slot = p.moveSlots[j]; if (slot && m.pp![j] !== undefined) slot.pp = Math.max(0, Math.min(slot.maxpp, m.pp![j])) })
    }
  }

  private applyHp(list: Array<{ name: string; hp: number; maxhp: number; fainted: boolean }>, team: Mon[]) {
    for (const p of list) {
      const m = team.find((q) => q.uid === p.name)
      if (m) p.hp = Math.max(1, Math.min(p.maxhp, m.hp))
    }
  }

  onEvents(cb: (e: BattleEvent[]) => void) { this.listeners.push(cb) }
  onRequest(cb: (r: Request) => void) { this.reqListeners.push(cb) }

  private emit(events: BattleEvent[]) {
    if (events.length) for (const l of this.listeners) l(events)
  }

  private nameOf(ident: string): string {
    // "p1a: m123" -> "m123"
    const i = ident.indexOf(': ')
    return i >= 0 ? ident.slice(i + 2) : ident
  }

  private monOf(uid: string): Mon | undefined {
    return this.team1.find((m) => m.uid === uid) ?? this.team2.find((m) => m.uid === uid)
  }

  private pretty(uid: string, view: Side = 'p1'): string {
    const m = this.monOf(uid)
    if (!m) return uid
    const foes = view === 'p1' ? this.team2 : this.team1 // the viewer's opponents
    return foes.includes(m) && !this.isTrainerBattle ? `The wild ${m.species}` : foes.includes(m) ? `The foe's ${m.species}` : m.species
  }

  isTrainerBattle = false
  /** the trainer's name for the messages ("Ace Trainer Sable sent out Golduck!") */
  foeName = ''

  private parseHp(s: string): { hp: number; max: number; status?: string } {
    const m = /^(\d+)\/(\d+)(?: (\w+))?/.exec(s) ?? /^(0) fnt/.exec(s)
    if (!m) return { hp: 0, max: 1 }
    return { hp: Number(m[1]), max: Number(m[2] ?? 1), status: m[3] }
  }

  private onSend(type: string, data: string | string[]) {
    if (type === 'update') {
      const text = Array.isArray(data) ? data.join('\n') : data
      const lines = extractChannelMessages(text, [1])[1] as string[] | undefined
      this.processLines(lines ?? [])
    } else if (type === 'sideupdate') {
      const raw = Array.isArray(data) ? data.join('\n') : (data as string)
      const nl = raw.indexOf('\n')
      const side = raw.slice(0, nl)
      const body = raw.slice(nl + 1)
      if (body.startsWith('|request|')) {
        const req = JSON.parse(body.slice('|request|'.length))
        if (side === 'p2') this.onP2Request(req)
        else this.onP1Request(req)
      }
    }
  }

  private processLines(lines: string[]) {
    this.emit(this.eventsFor(lines, 'p1', true))
    if (this.pvp) { const e2 = this.eventsFor(lines, 'p2', false); if (e2.length) this.pvp.send('events', e2) } // the guest sees the same battle from its own side
  }

  /** the events of some protocol lines, seen from `view` (p2 = the guest of an online duel: sides and names are turned round); `commit` = also update our own records */
  private eventsFor(lines: string[], view: Side, commit: boolean): BattleEvent[] {
    const flip = (x: Side): Side => (view === 'p1' ? x : x === 'p1' ? 'p2' : 'p1')
    const sideOf = (id: string): Side => flip(id.startsWith('p1') ? 'p1' : 'p2')
    const ev: BattleEvent[] = []
    // stat stages, followed line by line (the second look at the same lines, for the guest of a duel, starts from what it was before)
    if (commit) this.stagesPrev = new Map([...this.stages].map(([k, v]) => [k, { ...v }]))
    const st = commit ? this.stages : new Map([...this.stagesPrev].map(([k, v]) => [k, { ...v }]))
    const stagesOf = (uid: string) => { let r = st.get(uid); if (!r) { r = {}; st.set(uid, r) } return r }
    const pushStages = (id: string) => { const uid = this.nameOf(id); ev.push({ kind: 'stages', side: sideOf(id), uid, stages: { ...stagesOf(uid) } }) }
    for (const line of lines) {
      if (!line.startsWith('|')) continue
      const p = line.slice(1).split('|')
      const cmd = p[0]
      switch (cmd) {
        case 'switch': case 'drag': {
          const side = sideOf(p[1])
          const uid = this.nameOf(p[1])
          const det = /^([^,]+), L(\d+)/.exec(p[2])
          const hp = this.parseHp(p[3])
          const mon = this.monOf(uid)
          if (commit) { if (p[1].startsWith('p1')) { this.currentP1 = uid; this.participants.add(uid) } else { this.participants = new Set([this.currentP1]) } }
          st.delete(uid)
          ev.push({ kind: 'stages', side, uid, stages: {} })
          ev.push({ kind: 'switch', side, uid, species: det ? det[1] : mon?.species ?? '?', level: det ? Number(det[2]) : mon?.level ?? 1, hp: hp.hp, maxHp: hp.max, shiny: !!mon?.shiny })
          ev.push({ kind: 'text', text: side === 'p1' ? `Go! ${mon?.species ?? ''}!` : this.pvp ? `${view === 'p1' ? this.pvp.guestName : this.pvp.hostName} sent out ${mon?.species ?? ''}!` : this.isTrainerBattle ? `${this.foeName || 'The foe'} sent out ${mon?.species ?? ''}!` : `A wild ${mon?.species ?? ''} appeared!` })
          break
        }
        case 'move': {
          const side = sideOf(p[1])
          const uid = this.nameOf(p[1])
          if (p[2] === EXTRA) break
          ev.push({ kind: 'text', text: `${this.pretty(uid, view)} used ${p[2]}!` }) // the message first, then the move plays
          ev.push({ kind: 'move', side, uid, move: p[2] })
          break
        }
        case '-damage': case '-heal': {
          const side = sideOf(p[1])
          const uid = this.nameOf(p[1])
          const h = this.parseHp(p[2])
          const src = /\[from\] (brn|psn|tox)/.exec(line)?.[1]
          ev.push({ kind: 'hp', side, uid, hp: h.hp, maxHp: h.max, status: h.status, ...(src ? { from: src } : {}) })
          if (src) ev.push({ kind: 'text', text: src === 'brn' ? `${this.pretty(uid, view)} was hurt by its burn!` : `${this.pretty(uid, view)} was hurt by poison!` }) // (in the game: the damage is shown first, then this sentence)
          break
        }
        case 'faint': {
          const side = sideOf(p[1])
          const uid = this.nameOf(p[1])
          ev.push({ kind: 'faint', side, uid })
          ev.push({ kind: 'text', text: `${this.pretty(uid, view)} fainted!` })
          if (commit && !this.pvp && p[1].startsWith('p2')) {
            const foe = this.monOf(uid)
            if (foe) this.defeated.push({ foe, by: [...this.participants] })
          }
          break
        }
        case '-supereffective': ev.push({ kind: 'text', text: "It's super effective!" }); break
        case '-resisted': ev.push({ kind: 'text', text: "It's not very effective..." }); break
        case '-crit': ev.push({ kind: 'text', text: 'A critical hit!' }); break
        case '-miss': ev.push({ kind: 'text', text: `${this.pretty(this.nameOf(p[1]), view)}'s attack missed!` }); break
        case '-immune': ev.push({ kind: 'text', text: `It doesn't affect ${this.pretty(this.nameOf(p[1]), view)}...` }); break
        case '-fail': ev.push({ kind: 'text', text: 'But it failed!' }); break
        case 'cant': ev.push({ kind: 'text', text: `${this.pretty(this.nameOf(p[1]), view)} can't move!` }); break
        case '-status': {
          const names: Record<string, string> = { brn: 'was burned', par: 'is paralyzed', slp: 'fell asleep', psn: 'was poisoned', tox: 'was badly poisoned', frz: 'was frozen solid' }
          ev.push({ kind: 'status', side: sideOf(p[1]), uid: this.nameOf(p[1]), status: p[2] })
          ev.push({ kind: 'text', text: `${this.pretty(this.nameOf(p[1]), view)} ${names[p[2]] ?? 'has a status'}!` })
          break
        }
        case '-start': case '-activate': case '-end': {
          const who = this.pretty(this.nameOf(p[1]), view)
          const what = /confusion/i.test(p[2] ?? '') ? 'confusion' : /attract/i.test(p[2] ?? '') ? 'attract' : null
          if (!what) break
          if (cmd === '-end') { if (what === 'confusion') ev.push({ kind: 'text', text: `${who} snapped out of its confusion!` }); break }
          ev.push({ kind: 'volatile', side: sideOf(p[1]), uid: this.nameOf(p[1]), what })
          ev.push({ kind: 'text', text: what === 'confusion' ? (cmd === '-start' ? `${who} became confused!` : `${who} is confused!`) : (cmd === '-start' ? `${who} fell in love!` : `${who} is in love!`) })
          break
        }
        case '-curestatus': ev.push({ kind: 'status', side: sideOf(p[1]), uid: this.nameOf(p[1]), status: '' }); break
        case '-boost': case '-unboost': {
          const up = p[0] === '-boost'
          const n = Math.max(1, Math.min(6, Number(p[3]) || 1))
          const stat = STAT_NAMES[p[2]] ?? p[2]
          const how = up ? (n === 1 ? '' : n === 2 ? ' sharply' : ' drastically') : (n === 1 ? '' : n === 2 ? ' harshly' : ' severely')
          const uid = this.nameOf(p[1])
          ev.push({ kind: 'text', text: `${this.pretty(uid, view)}'s ${stat} ${up ? 'rose' : 'fell'}${how}!` })
          ev.push({ kind: 'stat', side: sideOf(p[1]), uid, amount: up ? n : -n })
          { const r = stagesOf(uid); r[p[2]] = Math.max(-6, Math.min(6, (r[p[2]] ?? 0) + (up ? n : -n))); pushStages(p[1]) }
          break
        }
        case '-setboost': { const r = stagesOf(this.nameOf(p[1])); r[p[2]] = Math.max(-6, Math.min(6, Number(p[3]) || 0)); pushStages(p[1]); break }
        case '-clearboost': { st.set(this.nameOf(p[1]), {}); pushStages(p[1]); break }
        case '-clearnegativeboost': { const r = stagesOf(this.nameOf(p[1])); for (const k of Object.keys(r)) if (r[k] < 0) r[k] = 0; pushStages(p[1]); break }
        case '-invertboost': { const r = stagesOf(this.nameOf(p[1])); for (const k of Object.keys(r)) r[k] = -r[k]; pushStages(p[1]); break }
        case '-clearallboost': { for (const [uid] of st) { st.set(uid, {}); const side: Side = flip(this.battle.p1.pokemon.some((q: { name: string }) => q.name === uid) ? 'p1' : 'p2'); ev.push({ kind: 'stages', side, uid, stages: {} }) } break }
        case 'turn': if (commit) this.turnCount = Number(p[1]); ev.push({ kind: 'turn', n: Number(p[1]) }); break
        case 'win': {
          const w: Side = p[1] === 'You' ? 'p1' : 'p2'
          if (commit) { this.ended = true; this.winner = w }
          ev.push({ kind: 'win', side: flip(w) })
          break
        }
        case 'tie': if (commit) { this.ended = true; this.winner = null } ev.push({ kind: 'win', side: null }); break
      }
    }
    return ev
  }

  // ---------------------------------------------------------------- requests
  private makeRequest(who: Side, req: {
    wait?: boolean; forceSwitch?: boolean[]; teamPreview?: boolean; active?: Array<{ moves: Array<{ move: string; id: string; pp: number; maxpp: number; disabled?: boolean; type?: string }>; trapped?: boolean }>
    side: { pokemon: Array<{ ident: string; details: string; condition: string; active: boolean }> }
  }) {
    const bench: BenchOption[] = req.side.pokemon.map((pk) => {
      const uid = this.nameOf(pk.ident)
      const h = this.parseHp(pk.condition)
      const d = /^([^,]+), L(\d+)/.exec(pk.details)
      return { uid, species: d ? d[1] : '?', level: d ? Number(d[2]) : 1, hp: h.hp, maxHp: h.max, fainted: pk.condition.endsWith(' fnt') || h.hp <= 0, active: pk.active }
    })
    const moves: MoveOption[] = (req.active?.[0]?.moves ?? [])
      .filter((m) => m.move !== EXTRA)
      .map((m) => {
        const slot = (this.battle[who].active[0] as { moveSlots?: Array<{ id: string; pp: number; maxpp: number }> } | undefined)?.moveSlots?.find((x) => x.id === m.id)
        const live = slot?.pp ?? m.pp // (the first request was written before the saved power points were applied)
        return { name: m.move, id: m.id, pp: live, maxpp: slot?.maxpp ?? m.maxpp, disabled: !!m.disabled || live <= 0, type: Dex.moves.get(m.id).type }
      })
    return { forceSwitch: !!req.forceSwitch?.[0], wait: !!req.wait, moves, bench, trapped: !!req.active?.[0]?.trapped }
  }

  private onP1Request(req: Parameters<BattleSession['makeRequest']>[1] & { teamPreview?: boolean }) {
    if (req.teamPreview) { this.battle.choose('p1', 'team 1'); return }
    const r = this.makeRequest('p1', req)
    for (const l of this.reqListeners) l(r)
  }

  private onP2Request(req: NonNullable<BattleSession['lastP2Request']> & { teamPreview?: boolean; wait?: boolean }) {
    if (req.teamPreview) { this.battle.choose('p2', 'team 1'); return }
    if (this.pvp) { this.pvp.send('request', this.makeRequest('p2', req as never)); return } // the guest of an online duel chooses for itself
    if (req.wait) return
    this.lastP2Request = req
    this.p2Pending = true
    // let the player's own request arrive first, then decide
    queueMicrotask(() => this.p2Decide())
  }

  private destroyed = false

  private p2Decide() {
    const req = this.lastP2Request
    if (this.destroyed || !req || !this.p2Pending || this.ended) return
    this.p2Pending = false
    if (req.forceSwitch?.[0]) {
      const alive = req.side.pokemon.map((p, i) => ({ p, i })).filter((x) => !x.p.active && !x.p.condition.endsWith(' fnt'))
      if (alive.length) this.battle.choose('p2', `switch ${alive[0].i + 1}`)
      this.flush()
      return
    }
    const moves = req.active?.[0]?.moves ?? []
    const me = req.side.pokemon.find((p) => p.active)
    const target = this.battle.p1.active[0] as { species: { types: string[] }; hp: number } | undefined
    const myMon = this.monOf(me ? this.nameOf(me.ident) : '')
    let best = 0
    let bestScore = -1
    moves.forEach((mv, i) => {
      if (mv.disabled) return
      const info = Dex.moves.get(mv.id)
      let score = info.basePower > 0 ? info.basePower : 20
      if (target && info.basePower > 0) {
        score *= effectiveness(info.type, target.species.types)
        if (myMon && Dex.species.get(myMon.species).types.includes(info.type)) score *= 1.5
        score *= (typeof info.accuracy === 'number' ? info.accuracy : 100) / 100
      }
      score *= 0.75 + Math.random() * 0.5
      if (score > bestScore) { bestScore = score; best = i }
    })
    this.battle.choose('p2', `move ${best + 1}`)
  }
  // (the turn is committed when the player has chosen too; chooseMove / chooseSwitch / passTurn then flush)

  // ---------------------------------------------------------------- the player's choices
  chooseMove(index1: number) { this.battle.choose('p1', `move ${index1}`); if (!this.pvp) this.p2Decide(); this.flush() }
  chooseSwitch(uid: string) {
    const i = (this.battle.p1.pokemon as Array<{ name: string }>).findIndex((p) => p.name === uid)
    if (i >= 0) { this.battle.choose('p1', `switch ${i + 1}`); if (!this.pvp) this.p2Decide(); this.flush() }
  }
  /** online duel: what the guest chose */
  remoteChoice(c: { k: 'move'; i: number } | { k: 'switch'; uid: string }) {
    if (this.destroyed || this.ended) return
    if (c.k === 'move') this.battle.choose('p2', `move ${c.i}`)
    else { const i = (this.battle.p2.pokemon as Array<{ name: string }>).findIndex((p) => p.name === c.uid); if (i >= 0) this.battle.choose('p2', `switch ${i + 1}`) }
    this.flush()
  }
  /** spend the turn doing nothing (using an item, a failed catch ...): the foe still acts */
  passTurn() {
    const n = this.team1.find((m) => m.uid === this.currentP1)?.moves.length ?? 0
    this.battle.choose('p1', `move ${n + 1}`)
    this.p2Decide()
    this.flush()
  }

  /** heal the Pokémon on the field (used by potions in battle) */
  healActive(amount: number): { hp: number; max: number; uid: string } | null {
    const a = this.battle.p1.active[0] as { name: string; hp: number; maxhp: number } | undefined
    if (!a) return null
    a.hp = Math.min(a.maxhp, a.hp + amount)
    return { hp: a.hp, max: a.maxhp, uid: a.name }
  }

  /** bring a fainted team mate back (not possible mid-battle in the real games either, so only used after battle) */
  hpOf(uid: string): number {
    const p = (this.battle.p1.pokemon as Array<{ name: string; hp: number }>).find((x) => x.name === uid)
    return p ? p.hp : 0
  }

  /** copy the final HP of every Pokémon back to our own records */
  syncBack() {
    for (const p of this.battle.p1.pokemon as Array<{ name: string; hp: number; moveSlots: Array<{ pp: number }> }>) {
      const m = this.team1.find((q) => q.uid === p.name)
      if (m) { m.hp = Math.max(0, p.hp); m.pp = m.moves.map((_, j) => p.moveSlots[j]?.pp ?? 0) }
    }
  }

  get foeActive(): { uid: string; hp: number; maxHp: number } | null {
    const a = this.battle.p2.active[0] as { name: string; hp: number; maxhp: number } | undefined
    return a ? { uid: a.name, hp: a.hp, maxHp: a.maxhp } : null
  }

  get playerActive(): string { return this.currentP1 }
  get participantsList(): string[] { return [...this.participants] }
  get turn(): number { return this.turnCount }

  destroy() {
    this.destroyed = true
    this.listeners = []
    this.reqListeners = []
    try { this.battle.destroy() } catch { /* ignore */ }
  }
}

export { maxHp }
