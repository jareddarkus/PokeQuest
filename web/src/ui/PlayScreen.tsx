import { useKeyAction } from '../game/keys'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type GameEvents, type GameHandle } from '../game/GameView'
import GameView3D from '../game/GameView3D'
import { buildChunkWorld, type BuiltWorld } from '../rom/chunkWorld'
import { loadWorldData } from '../rom/store'
import { randomLook, type Look } from '../game/character'
import { OW_TO_CLASS } from '../data/trainerClasses'
import { useLang } from '../i18n'
import type { Settings } from '../game/settings'
import { ENCOUNTER_RATE, groupMon, groupTeam, gymTeam, trainerTeam, wildEncounter } from '../game/encounters'
import { addItems, emptyTrainer, makeStarter, type Trainer } from '../game/state'
import { ITEMS, STARTING_BAG, rollPickup } from '../data/items'
import ItemIcon from './ItemIcon'
import { createMon, maxHp, newUid, type Mon } from '../data/dex'
import {
  C, collapseInfo, squareTile, RADIUS, RING_INNER, SIZE, T, collapseRadius, generateWorld, isWalkable, ringAt, type Dir, type World,
} from '../game/world'
import BattleScreen, { CHAR_MS, TypedText, type BattleKind, type BattleOutcome, type PvpLink } from './BattleScreen'
import { addExtraGrass, buildMeadowVisuals, prepareMeadow } from '../game/meadow'
import { buildCustomVisuals, type CustomWorld } from '../world/customWorld'
import { fetchPublishedWorld } from '../world/publish'
import { applyCustomEvents } from '../world/applyEvents'
import { applyRules, RULES } from '../game/rules'
import { busyLine, leaderLine, lossLine, preBattleLine } from '../data/npcLines'
import { BagPanel, CaughtPanel, PcPanel, TeamPanel } from './MenuPanels'
import SettingsPanel from './SettingsPanel'
import StarterPick from './StarterPick'
import MenuButton from './MenuButton'
import PartyBar from './PartyBar'
import { useFrameStyle } from './DsFrame'
import ChatDock from './ChatPanel'
import MiniMap, { useIsMobile } from './MiniMap'
import { announcementText, nameColor, type Announcement } from '../net/announce'
import { fakeMon, snapshotOf, summarize, type BattleInfo } from '../battle/spectate'
import type { BattleEvent } from '../battle/engine'
import { applyBracket, applyLoss, type BracketMsg, isPaired, makeBracket, newTournament, opponentOf, roundDone, winnersOf } from '../game/tournament'
import { PlayerPopup, ReactionPopup, TradePanel, type TradeState } from './PlayerMenu'
import { supabase } from '../supabase'
import { useMatchPlayers } from '../net/useMatchPlayers'
import { useChat } from './useChat'
import { music } from '../audio/music'
import { ProgressBar, type Progress } from './ProgressBar'

export interface RoyaleInfo { id: string; seed: number; players: string[]; startsAt: number }

interface Props {
  /** set when this is a real match (from the waiting room) */
  royale?: RoyaleInfo
  username: string | null
  look: Look
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onExit: () => void
  onCustomize: () => void
  /** a world made in the editor (instead of the normal island) */
  custom?: CustomWorld | null
}

interface ActiveBattle { id?: number; kind: BattleKind; foe: Mon[]; name?: string; onWin?: () => void; npcId?: string; pvp?: PvpLink; foeSeed?: string; foeClass?: number; spectate?: { who: string; girl: boolean; mine: Mon[]; listen: (cb: (evs: BattleEvent[]) => void) => () => void } }
let battleCounter = 0

function PlayInner({ royale, username, look, settings, onSettings, onExit, onCustomize, world, built }: Props & { world: World; built: BuiltWorld }) {
  // in a match everybody starts at a different place of the outer ring, as far apart as possible
  const myIndex = royale && username ? Math.max(0, royale.players.indexOf(username)) : 0
  const spawn = royale ? world.spawns[Math.round((myIndex * world.spawns.length) / Math.max(1, royale.players.length)) % world.spawns.length] : world.spawns[0]
  // the match begins 30 seconds after the start at the latest (time to pick a starter), or at once when everybody has picked
  const [t0, setT0] = useState(royale ? royale.startsAt + 30_000 : 0)
  const handleRef = useRef<GameHandle | null>(null)
  if (import.meta.env.DEV) (globalThis as { __pqTp?: unknown }).__pqTp = (x: number, y: number) => handleRef.current?.teleport(x, y) // developer hook
  const startRef = useRef(royale ? t0 : Date.now())
  const t0Ref = useRef(t0)
  t0Ref.current = t0
  const [collapseOn, setCollapseOn] = useState(true) // (the shrinking circle is on by default, also on the practice island)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!royale) return; const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id) }, [])
  const waiting = !!royale && now < t0 // everybody waits for the others until the match really begins
  const collapseRef = useRef(false)
  collapseRef.current = collapseOn
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<null | 'settings' | 'team' | 'bag' | 'pc' | 'chat'>(null)
  const [teamSel, setTeamSel] = useState<number | null>(null) // a Pokémon clicked in the side bar opens its summary straight away
  const [caughtMon, setCaughtMon] = useState<Mon | null>(null) // right after a catch: its summary
  const [toast, setToast] = useState<string | null>(null)
  const [toastItems, setToastItems] = useState<Record<string, number> | null>(null) // the things you took from a ball (shown with their icons)
  // a trainer (or gym leader) talks before the battle: { who, line, then }
  type SpeechAt = { npc: string } | { x: number; y: number }
  const [speech, setSpeech] = useState<null | { who: string; line: string; then: () => void; at?: SpeechAt }>(null)
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null) // where the speech bubble is (above the one who talks)
  const [speechSkip, setSpeechSkip] = useState(0)
  const speechTyping = useRef(0) // until when (ms since 1970) the sentence is still being typed
  const talking = useRef(false)
  const nextAt = useRef<SpeechAt | undefined>(undefined) // who talks next (set just before speakThen)
  const speakThen = (who: string, line: string, then: () => void, at0?: SpeechAt) => {
    if (talking.current) return
    const at = at0 ?? nextAt.current
    nextAt.current = undefined
    talking.current = true
    speechTyping.current = Date.now() + line.length * CHAR_MS[settings.textSpeed ?? 'normal']
    setSpeechSkip(0)
    setSpeech({ who, line, then, at })
  }
  // the bubble follows the one who talks (it moves with the camera)
  useEffect(() => {
    const at = speech?.at
    if (!at) { setBubble(null); return }
    const upd = () => { const h = handleRef.current; setBubble(h ? h.screenOf('npc' in at ? at.npc : null, 'x' in at ? at.x : undefined, 'y' in at ? at.y : undefined) : null) }
    upd()
    const id = window.setInterval(upd, 40)
    return () => window.clearInterval(id)
  }, [speech])
  const closeSpeech = () => {
    const sp = speech
    if (!sp) return
    talking.current = false
    setSpeech(null)
    sp.then()
  }
  useEffect(() => {
    if (!speech) return
    const id = window.setTimeout(closeSpeech, speech.line.length * CHAR_MS[settings.textSpeed ?? 'normal'] + 2600)
    return () => window.clearTimeout(id)
  }, [speech])
  /** a tap on the speech or the A button: first the sentence is finished, then it closes */
  const advanceSpeech = () => { if (Date.now() < speechTyping.current) { speechTyping.current = 0; setSpeechSkip((k) => k + 1) } else closeSpeech() }
  useKeyAction('a', advanceSpeech, speech !== null)
  const toastFrame = useFrameStyle('white', 2)
  const hudFrame2 = useFrameStyle('dark', 2)
  const hudFrame = useFrameStyle('dark', 1) // the game's own dark message window for the info boxes
  const [ring, setRing] = useState(1)
  const [clock, setClock] = useState<{ ring: number; seconds: number; falling: boolean }>({ ring: 1, seconds: 300, falling: false })
  const [radius, setRadius] = useState(RADIUS)
  const [trainer, setTrainerState] = useState<Trainer>(() => ({ ...emptyTrainer(), bag: { ...STARTING_BAG } }))
  const trainerRef = useRef(trainer)
  const langRef = useRef('en')
  langRef.current = useLang()
  const announceRef = useRef<(a: Announcement) => void>(() => {})
  const showAnnRef = useRef<(a: Announcement) => void>(() => {})
  const setTrainer = (t: Trainer) => {
    // a Pokémon of the team that became another species (evolved): announced without saying which one
    const old = trainerRef.current
    if (old.team.some((m) => t.team.some((n) => n.uid === m.uid && n.species !== m.species))) announceRef.current({ k: 'evolve', a: username ?? '' })
    trainerRef.current = t; setTrainerState(t)
  }
  const [battle, setBattle] = useState<ActiveBattle | null>(null)
  const battleRef = useRef<ActiveBattle | null>(null)
  battleRef.current = battle
  const defeatedNpcs = useRef(new Set<string>())
  const beatenGyms = useRef(new Set<string>())
  const busy = useRef(false)

  const say = (t: string) => { setToastItems(null); setToast(t) }
  if (import.meta.env.DEV) (globalThis as { __pqFound?: unknown }).__pqFound = (items: Record<string, number>) => { setToastItems(items); setToast('You found:' + Date.now()) } // developer hook
  const mobile = useIsMobile()
  const [chatOpen, setChatOpen] = useState(false)
  const chatUser = username ?? (import.meta.env.DEV && new URLSearchParams(location.search).has('devuser') ? 'DevUser' : null) // (developer test without an account: ?devuser)
  const chat = useChat(chatUser, chatOpen)
  // announcements of the match (grey lines in the chat): shown here and told to the others (only in a match with other players)
  showAnnRef.current = (a) => chat.addSystem(announcementText(a, langRef.current === 'es'))
  announceRef.current = (a) => { if (!royale) return; showAnnRef.current(a); busySender.current?.duel({ type: 'ann', data: a }) }
  const matchId = royale?.id ?? ''
  const colorOf = (name: string) => nameColor(name, matchId)
  // clicking players: a menu for another player (friend, whisper, trade), reactions for yourself; trading with a player
  const [pmenu, setPmenu] = useState<null | { name: string | null; x: number; y: number }>(null)
  const [trade, setTradeState] = useState<TradeState | null>(null)
  const tradeRef = useRef<TradeState | null>(null)
  const setTrade = (t: TradeState | null) => { tradeRef.current = t; setTradeState(t) }
  const [tradeAsk, setTradeAsk] = useState<string | null>(null) // a player asks to trade
  const tradeAskRef = useRef<string | null>(null)
  tradeAskRef.current = tradeAsk
  // trainers that other players are fighting right now (message "busy" every 3 s; forgotten after 9 s)
  const busyNpcs = useRef(new Map<string, { by: string; until: number }>())
  const busySender = useRef<{ send: (npcId: string, on: boolean) => void; duel: (msg: { to?: string; type: string; data?: unknown }) => void } | null>(null)
  // while the match is played, this player stands on the channel "match:arena" (so that nobody can join a running match)
  useEffect(() => {
    if (!royale || !username) return
    const ch = supabase.channel('match:arena', { config: { private: true, presence: { key: `play-${username}` } } })
    ch.subscribe(async (st) => { if (st === 'SUBSCRIBED') await ch.track({ playing: true, id: royale.id }) })
    return () => { void supabase.removeChannel(ch) }
  }, [royale?.id, username])
  // online duels at the peak
  const [eliminated, setEliminated] = useState(false)
  const eliminatedRef = useRef(false)
  const capturedCount = useRef(0)
  const pushedAt = useRef(0)
  const prevRing = useRef(0)
  const goneRings = useRef(new Set<number>())
  const outPlayers = useRef(new Set<string>()) // players that are out of the match
  const duelPending = useRef<string | null>(null)
  // the tournament after the last 5 minutes at the peak (state shared by everybody through messages)
  const tour = useRef(newTournament())
  const [tourRound, setTourRound] = useState(0)
  const [champion, setChampion] = useState<string | null>(null)
  // watching battles: the fighter sends its events to the ones that asked to watch; the watcher plays them
  const battleLog = useRef<BattleEvent[]>([]) // every event of my own battle so far
  const spectators = useRef(new Set<string>())
  const myBat = useRef<BattleInfo | null>(null)
  const batInfo = useRef(new Map<string, { info: BattleInfo; until: number }>()) // players that are fighting right now (what they told us every 3 s)
  const watching = useRef<string | null>(null) // the fighter I am watching (or about to)
  const specBuf = useRef<BattleEvent[]>([])
  const specListeners = useRef(new Set<(evs: BattleEvent[]) => void>())
  const pvpListeners = useRef(new Set<(type: string, data: unknown) => void>())
  const startDuelRef = useRef<(role: 'host' | 'guest', opp: string, team: Mon[]) => void>(() => {})
  const players = useMatchPlayers(royale?.id ?? null, username, look, () => handleRef.current?.getPos() ?? null, royale ? {
    pickedMe: trainer.team.length > 0 || trainer.pc.length > 0,
    expected: royale.players,
    started: Date.now() >= t0Ref.current,
    onAllPicked: () => { const nt = Date.now() + 1500; if (nt < t0Ref.current) { startRef.current = nt; t0Ref.current = nt; setT0(nt) } }, // everybody is ready: start right away
    onBusy: (npc, by, on) => { if (on) busyNpcs.current.set(npc, { by, until: Date.now() + 9000 }); else busyNpcs.current.delete(npc) },
    onDuel: (m) => {
      if (m.type === 'ann') { const a = m.data as Announcement; if (a && typeof a.k === 'string') showAnnRef.current(a); return }
      if (m.type === 'eliminated') { outPlayers.current.add(m.from); applyLoss(tour.current, m.from); return }
      if (m.type === 'telim') { const l = (m.data as { loser?: string } | undefined)?.loser; if (typeof l === 'string') { outPlayers.current.add(l); applyLoss(tour.current, l) } return }
      if (m.type === 'bat') { const info = m.data as BattleInfo; if (info && typeof info.host === 'string') batInfo.current.set(m.from, { info, until: Date.now() + 9000 }); return }
      if (m.type === 'bat-end') { batInfo.current.delete(m.from); if (watching.current === m.from && battleRef.current?.spectate) stopSpectate(); return }
      if (m.type === 'spec-join') { if ((!royale || (outPlayers.current.has(m.from) ? RULES.watchEliminated > 0 : RULES.watchAlive > 0)) && battleRef.current && !battleRef.current.spectate && myBat.current) { spectators.current.add(m.from); busySender.current?.duel({ to: m.from, type: 'bhist', data: { events: snapshotOf(battleLog.current), info: myBat.current } }) } return }
      if (m.type === 'spec-leave') { spectators.current.delete(m.from); return }
      if (m.type === 'bhist') { if (watching.current === m.from && !battleRef.current) { const d = m.data as { events: BattleEvent[]; info: BattleInfo }; beginSpectate(m.from, d.info, d.events) } return }
      if (m.type === 'bev') { if (watching.current === m.from && Array.isArray(m.data)) { const evs = m.data as BattleEvent[]; specBuf.current.push(...evs); for (const cb of specListeners.current) cb(evs) } return }
      if (m.type === 'tbracket') { gotBracket(m.data as BracketMsg); return }
      if (m.type === 'tdone') { const c = (m.data as { champion?: string } | undefined)?.champion; if (typeof c === 'string') { setChampion(c); showAnnRef.current({ k: 'champ', a: c }) } return }
      if (m.type === 'react') { const idx = (m.data as { idx?: number } | undefined)?.idx; if (typeof idx === 'number') handleRef.current?.showEmote(m.from, idx); return }
      if (m.type === 'trade-req') { if (!battleRef.current && !tradeRef.current && !tradeAskRef.current) setTradeAsk(m.from); else busySender.current?.duel({ to: m.from, type: 'trade-no' }); return }
      if (m.type === 'trade-ok') { if (tradeRef.current?.partner === m.from || !tradeRef.current) setTrade({ partner: m.from, mine: null, theirs: null, myAccept: false, theirAccept: false }); return }
      if (m.type === 'trade-no') { say(`${m.from} no quiere intercambiar ahora.`); return }
      if (m.type === 'trade-cancel') { if (tradeRef.current?.partner === m.from) { setTrade(null); say(`${m.from} canceló el intercambio.`) } return }
      if (m.type === 'trade-offer') { const t = tradeRef.current; if (t && t.partner === m.from) setTrade({ ...t, theirs: m.data as Mon, myAccept: false, theirAccept: false }); return }
      if (m.type === 'trade-accept') { const t = tradeRef.current; if (t && t.partner === m.from) { const nt = { ...t, theirAccept: true }; setTrade(nt); finishTrade(nt) } return }
      if (m.type === 'pvp') { const d = m.data as { t: string; d: unknown }; for (const cb of pvpListeners.current) cb(d.t, d.d); return }
      if (m.type === 'challenge') { // a player touched me at the peak: the duel starts at once
        const ring = (() => { const q = handleRef.current?.getPos(); return q ? ringAt(q.x, q.y) : 0 })()
        const tourOk = tour.current.round > 0 ? opponentOf(tour.current, username ?? '') === m.from : ring === 4
        if (battleRef.current || busy.current || eliminatedRef.current || !tourOk || !trainerRef.current.team.length || duelPending.current) { busySender.current?.duel({ to: m.from, type: 'decline' }); return }
        duelPending.current = m.from
        busySender.current?.duel({ to: m.from, type: 'accept', data: restoreForDuel() })
        startDuelRef.current('guest', m.from, m.data as Mon[])
      } else if (m.type === 'accept') {
        if (duelPending.current === m.from) { restoreForDuel(); startDuelRef.current('host', m.from, m.data as Mon[]) }
      } else if (m.type === 'decline') { if (duelPending.current === m.from) duelPending.current = null }
    },
  } : undefined, busySender)
  const fakePlayers = useRef<ReturnType<typeof players>>([]) // developer hook: pretend players, to look at their names and fights without a second account
  if (import.meta.env.DEV) (globalThis as { __pqFakePlayers?: unknown; __pqFakeBusy?: unknown }).__pqFakePlayers = fakePlayers
  const playersVisible = () => [...players().filter((o) => !outPlayers.current.has(o.id)), ...fakePlayers.current]
  // an eliminated player watches the others: the camera follows one of them (arrows to change); only where they are and whether they fight (the spinning ball) can be seen
  const [watch, setWatch] = useState<string | null>(null)
  const watchRef = useRef<string | null>(null)
  const spectatePos = () => {
    const list = playersVisible()
    let t = list.find((o) => o.id === watchRef.current)
    if (!t) { t = list[0]; const id = t?.id ?? null; if (id !== watchRef.current) { watchRef.current = id; setWatch(id) } }
    return t ? { x: t.x, y: t.y } : null
  }
  const stepWatch = (d: 1 | -1) => {
    const names = playersVisible().map((o) => o.id).sort()
    if (!names.length) return
    const i = Math.max(0, names.indexOf(watchRef.current ?? ''))
    const n = names[(i + d + names.length) % names.length]
    watchRef.current = n; setWatch(n)
  }
  const fightingNow = () => { const set = new Set<string>(); const now = Date.now(); for (const [k, v] of batInfo.current) if (v.until > now) set.add(k); return set }
  const busyMapFn = () => { const m = new Map<string, string>(); const now = Date.now(); if (import.meta.env.DEV) { const fb = (globalThis as { __pqFakeBusyMap?: Map<string, string> }).__pqFakeBusyMap; if (fb) for (const [k, v] of fb) m.set(k, v) }; for (const [k, v] of busyNpcs.current) { if (v.until < now) busyNpcs.current.delete(k); else m.set(k, v.by) } return m }
  // while I fight a trainer, the others see it as busy (repeated, so that late arrivals know too)
  useEffect(() => {
    const id = battle?.npcId
    if (!id) return
    busySender.current?.send(id, true)
    const t = window.setInterval(() => busySender.current?.send(id, true), 3000)
    return () => { window.clearInterval(t); busySender.current?.send(id, false) }
  }, [battle?.npcId])

  // the real songs of the game: route music by ring, battle music by kind of battle
  // the music is random: ONE route song for the whole match (picked from the match's shared seed, so every player hears the same one; in practice from its own seed),
  // and a random battle song for every battle (of the kind: wild / trainer / gym leader)
  const FIELD_SONGS = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6', 'field7', 'field8', 'field9', 'field10']
  const fieldSong = FIELD_SONGS[(Math.imul((world.seed | 0) ^ 0x9e3779b9, 2654435761) >>> 0) % FIELD_SONGS.length]
  const battleSong = useMemo(() => {
    if (!battle) return ''
    const pool = battle.kind === 'gym' ? ['gymLeader', 'gym2', 'gym3', 'gym4', 'gym5', 'gym6'] : battle.kind === 'trainer' ? ['trainer', 'trainer2', 'trainer3'] : ['wild', 'wildStrong', 'wild2']
    return pool[Math.floor(Math.random() * pool.length)]
  }, [battle?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const song = battle ? battleSong : fieldSong
  useEffect(() => { music.setVolume(settings.musicVolume) }, [settings.musicVolume])
  useEffect(() => { music.setSfxVolume(settings.sfxVolume) }, [settings.sfxVolume])
  useEffect(() => { void music.play(song) }, [song])
  useEffect(() => () => music.stop(), [])

  useEffect(() => {
    if (collapseOn && !royale) startRef.current = Date.now()
  }, [collapseOn])

  useEffect(() => {
    const id = setInterval(() => {
      const pos = handleRef.current?.getPos()
      if (pos) setRing(ringAt(pos.x, pos.y))
      const el = (Date.now() - startRef.current) / 1000
      if (royale && Date.now() >= t0Ref.current) for (let k = 1; k <= 3; k++) if (el >= k * RULES.ringSeconds + Math.max(1, RULES.fallSeconds) && !goneRings.current.has(k)) { goneRings.current.add(k); showAnnRef.current({ k: 'gone', n: k }) }
      if (pos && royale && !eliminatedRef.current) { // walking into a ring nearer the peak (higher number): announced (being pushed there by the storm is announced on its own)
        const rr = ringAt(pos.x, pos.y)
        if (prevRing.current && rr && rr > prevRing.current && Date.now() - pushedAt.current > 3000 && Date.now() >= t0Ref.current) announceRef.current({ k: 'ring', a: username ?? '', n: rr })
        if (rr) prevRing.current = rr
      }
      setClock(collapseInfo(el))
      setRadius(collapseRadius(el))
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(id)
  }, [toast])

  const nextRingSpot = (x: number, y: number, fromRing: number) => {
    const base = RING_INNER[fromRing - 1] - 4
    for (let r = base; r > 0; r--) {
      for (const off of [0, 1, -1, 2, -2, 3, -3]) {
        const rr = r + off
        const { x: px, y: py } = squareTile(x, y, rr)
        if (isWalkable(world, px, py) && world.tiles[py * SIZE + px] !== T.GymDoor) return { x: px, y: py }
      }
    }
    return { x: C, y: C }
  }

  const [, setElimWhy] = useState<'duel' | 'wipe'>('duel')
  /** You are out of the match (everybody else is told). */
  const eliminateMe = (why: 'duel' | 'wipe') => {
    eliminatedRef.current = true; setElimWhy(why); setEliminated(true)
    applyLoss(tour.current, username ?? '')
    busySender.current?.duel({ type: 'eliminated' })
    if (why === 'wipe') announceRef.current({ k: 'elim', a: username ?? '' }) // (a lost duel is announced by the winner, with the score)
  }
  /** Your whole team fainted: you wake up, healed, at the Pokémon Center of the ring you are in (in the peak, where there is none, right where you are). */
  const blackOut = () => {
    const t = trainerRef.current
    setTrainer({ ...t, team: t.team.map(healedCopy) })
    const pos = handleRef.current?.getPos()
    const ring = pos ? ringAt(pos.x, pos.y) : 0
    let target: { x: number; y: number } | null = null
    const center = world.gyms.find((g) => g.center && g.ring === ring)
    if (center) target = { x: center.doorX, y: center.doorY + 1 }
    else if (world.triggers) { // (a world of the editor: its healing tiles are the centers)
      for (const [key, v] of world.triggers) { if (v.type !== 6) continue; const hx = key % SIZE, hy = Math.floor(key / SIZE); if (ringAt(hx, hy) === ring) { target = { x: hx, y: hy + 1 }; break } }
    }
    if (target) { handleRef.current?.teleport(target.x, target.y); say(`You blacked out! You woke up at the Pokémon Center of ring ${ring}.`) }
    else say('You blacked out! Your Pokémon were healed.')
  }

  if (import.meta.env.DEV) { (globalThis as { __pqElim?: unknown }).__pqElim = () => { eliminatedRef.current = true; setElimWhy('wipe'); setEliminated(true) }; (globalThis as { __pqAnn?: unknown }).__pqAnn = (a: Announcement) => showAnnRef.current(a) } // developer hooks
  if (import.meta.env.DEV) (globalThis as { __pqBlackOut?: unknown }).__pqBlackOut = blackOut // developer hook

  /** A Pokémon with all its HP and PP back. */
  const healedCopy = (m: Mon): Mon => { const { pp: _pp, ...rest } = m; void _pp; return JSON.parse(JSON.stringify({ ...rest, hp: maxHp(m) })) as Mon }
  /** Before two players fight each other, every Pokémon of both teams gets all its HP and PP back (items already used stay used): it is announced, and the healed team is returned. */
  const restoreForDuel = (): Mon[] => {
    const t = trainerRef.current
    const team = t.team.map(healedCopy)
    setTrainer({ ...t, team })
    say('Before the fight your Pokémon were fully restored (HP and PP). Items you already used stay used.')
    return team
  }

  const startBattle = (b: ActiveBattle) => {
    if (busy.current || battleRef.current) return
    if (!trainerRef.current.team.some((m) => m.hp > 0)) {
      say('All your Pokémon have fainted! Use a Revive from your bag (or find one).')
      return
    }
    busy.current = true
    battleLog.current = []
    spectators.current.clear()
    handleRef.current?.setNpcFreeze(b.npcId ?? null)
    setBattle({ ...b, id: ++battleCounter })
  }
  if (import.meta.env.DEV) (globalThis as { __pqWild?: unknown }).__pqWild = (ring = 1, species?: string, level = 3) => void (species ? createMon(species, level) : wildEncounter(ring)).then((mon) => startBattle({ kind: 'wild', foe: [mon] })) // developer hook

  /** Two players meet at the peak: the one whose name comes first runs the battle (host), the other follows (guest). */
  const startDuel = (role: 'host' | 'guest', opp: string, team: Mon[]) => {
    const link: PvpLink = {
      role, hostName: role === 'host' ? username ?? 'You' : opp, guestName: role === 'host' ? opp : username ?? 'You',
      send: (type, data) => busySender.current?.duel({ to: opp, type: 'pvp', data: { t: type, d: data } }),
      listen: (cb) => { pvpListeners.current.add(cb); return () => { pvpListeners.current.delete(cb) } },
    }
    if (role === 'host') announceRef.current({ k: 'duel', a: username ?? '', b: opp })
    startBattle({ kind: 'trainer', foe: team, name: opp, pvp: link })
  }
  startDuelRef.current = startDuel

  const endBattle = (outcome: BattleOutcome, t: Trainer) => {
    const sp = battleRef.current?.spectate
    if (sp) { // I was only watching: nothing changes for me
      busySender.current?.duel({ to: sp.who, type: 'spec-leave' })
      watching.current = null; specBuf.current = []; specListeners.current.clear()
      setBattle(null); busy.current = false
      return
    }
    const before = trainerRef.current
    setTrainer(t)
    const b = battleRef.current
    setBattle(null)
    busy.current = false
    handleRef.current?.setNpcFreeze(null)
    if (outcome === 'win' && b) {
      if (b.npcId) { defeatedNpcs.current.add(b.npcId); handleRef.current?.defeatNpc(b.npcId); say(`${b.name ?? 'Trainer'}: “${lossLine(b.npcId)}”`) }
      b.onWin?.()
    }
    if (outcome === 'caught') {
      capturedCount.current += 1
      announceRef.current({ k: 'catch', a: username ?? '', first: capturedCount.current === 1 })
      say('Gotcha! The Pokémon joined you (see Team or PC).')
      const had = new Set([...before.team, ...before.pc].map((m) => m.uid))
      const c = [...t.team, ...t.pc].find((m) => !had.has(m.uid))
      if (c) setCaughtMon(c) // its summary window, like the game after a catch
    }
    if (b?.pvp) { // a duel against another player: the loser is out of the match
      duelPending.current = null
      if (outcome === 'lose') eliminateMe('duel')
      else if (outcome === 'win') { outPlayers.current.add(b.name ?? ''); applyLoss(tour.current, b.name ?? ''); announceRef.current({ k: 'beat', a: username ?? '', b: b.name ?? '', s: t.team.filter((m) => m.hp > 0).length }); say(`You beat ${b.name}! They are out of the match.`) }
      return
    }
    if (outcome === 'lose') blackOut()
  }

  // two players that touch each other at the peak fight at once (the one whose name comes first asks)
  useEffect(() => {
    if (!royale || !username) return
    const id = window.setInterval(() => {
      if (battleRef.current || busy.current || eliminatedRef.current || duelPending.current || Date.now() < t0Ref.current || tour.current.round > 0) return
      const me = handleRef.current?.getPos()
      if (!me || ringAt(me.x, me.y) !== 4) return
      const team = trainerRef.current.team.map(healedCopy)
      if (!team.length) return
      for (const o of players()) {
        if (outPlayers.current.has(o.id) || !(username < o.id)) continue
        if (ringAt(Math.round(o.x), Math.round(o.y)) !== 4) continue
        if (Math.abs(o.x - me.x) <= 1.2 && Math.abs(o.y - me.y) <= 1.2) {
          duelPending.current = o.id
          void music.playSfx('fld:07') // touching another player at the peak: the same sound as a trainer spotting you
          busySender.current?.duel({ to: o.id, type: 'challenge', data: team })
          window.setTimeout(() => { if (duelPending.current === o.id && !battleRef.current) duelPending.current = null }, 4000)
          break
        }
      }
    }, 400)
    return () => window.clearInterval(id)
  }, [royale, username])

  // ---- watching another player's battle
  const streamEvents = (evs: BattleEvent[]) => {
    battleLog.current.push(...evs)
    if (spectators.current.size) busySender.current?.duel({ type: 'bev', data: evs })
  }
  const startSpectate = (name: string) => {
    const info = batInfo.current.get(name)?.info
    if (!info || busy.current || battleRef.current || talking.current) return
    watching.current = info.host
    specBuf.current = []
    busySender.current?.duel({ to: info.host, type: 'spec-join' })
    window.setTimeout(() => { if (watching.current === info.host && !battleRef.current) { watching.current = null; say(`You cannot watch ${name}'s battle right now.`) } }, 4000)
  }
  const beginSpectate = (host: string, info: BattleInfo, events: BattleEvent[]) => {
    busy.current = true
    specBuf.current = [...events, ...specBuf.current]
    const girl = players().find((o) => o.id === host)?.look.sprite === 10
    const listen = (cb: (evs: BattleEvent[]) => void) => { cb(specBuf.current.slice()); specListeners.current.add(cb); return () => { specListeners.current.delete(cb) } }
    setBattle({ id: ++battleCounter, kind: info.kind, foe: info.foe.map(fakeMon), name: info.foeName, foeSeed: info.foeSeed, foeClass: info.foeClass, spectate: { who: host, girl, mine: info.mine.map(fakeMon), listen } })
  }
  const stopSpectate = () => { const b = battleRef.current; if (b?.spectate) endBattle('ran', trainerRef.current) }
  // developer hook: watch a made-up battle (Oshawott vs Lillipup) to see the spectator screen; __pqSpecEv(events) sends more events to it
  if (import.meta.env.DEV) {
    const g = globalThis as { __pqSpec?: unknown; __pqSpecEv?: unknown }
    g.__pqSpec = () => {
      const info: BattleInfo = { kind: 'trainer', foeName: 'Trainer Test', foeSeed: 'test', host: 'Friend', mine: [{ species: 'Oshawott', level: 8, shiny: false }], foe: [{ species: 'Lillipup', level: 7, shiny: false }] }
      beginSpectate('Friend', info, [
        { kind: 'switch', side: 'p1', uid: 'spec0', species: 'Oshawott', level: 8, hp: 20, maxHp: 25, shiny: false },
        { kind: 'switch', side: 'p2', uid: 'spec0', species: 'Lillipup', level: 7, hp: 24, maxHp: 24, shiny: false },
      ])
    }
    g.__pqSpecEv = (evs: BattleEvent[]) => { specBuf.current.push(...evs); for (const cb of specListeners.current) cb(evs) }
  }
  // while I fight, the others can see that (and ask to watch)
  useEffect(() => {
    const b = battle
    if (!b || b.spectate || !username || !royale) return
    const guest = b.pvp?.role === 'guest'
    const mine = trainerRef.current.team.filter((m) => m.hp > 0)
    const info: BattleInfo = {
      kind: b.kind, foeName: guest ? username : b.name ?? '', foeSeed: b.npcId ?? b.name ?? '', foeClass: b.foeClass, host: guest ? b.pvp!.hostName : username,
      mine: summarize(guest ? b.foe : mine), foe: summarize(guest ? mine : b.foe),
    }
    if (!guest) myBat.current = info
    const send = () => busySender.current?.duel({ type: 'bat', data: info })
    send()
    const t = window.setInterval(send, 3000)
    return () => { window.clearInterval(t); busySender.current?.duel({ type: 'bat-end' }); myBat.current = null; spectators.current.clear() }
  }, [battle?.id])

  // ---- the tournament: starts when the 5 minutes at the peak are over
  const gotBracket = (m: BracketMsg) => {
    if (!m || !Array.isArray(m.pairs) || !applyBracket(tour.current, m)) return
    setTourRound(m.round)
    showAnnRef.current({ k: 'round', n: m.round })
    const me = username ?? ''
    const pair = m.pairs.find(([a, b]) => a === me || b === me)
    if (m.bye === me) say(`Tournament · round ${m.round}: you have no opponent this round, wait for the next one.`)
    else if (pair && !eliminatedRef.current) say(`Tournament · round ${m.round}: you fight ${pair[0] === me ? pair[1] : pair[0]}!`)
    else say(`Tournament · round ${m.round} begins.`)
  }
  useEffect(() => {
    if (!royale || !username) return
    const me = username
    const id = window.setInterval(() => {
      const T = tour.current, now = Date.now()
      if (now < t0Ref.current || now < startRef.current + 4 * RULES.ringSeconds * 1000 || T.champion) return
      const seen = new Set(players().map((o) => o.id)); seen.add(me)
      const everyone = royale.players.filter((n) => (n === me ? !eliminatedRef.current : !outPlayers.current.has(n)) && !T.losers.has(n))
      const present = everyone.filter((n) => seen.has(n))
      const iAmBoss = present.length > 0 && [...present].sort()[0] === me
      const announce = (m: BracketMsg) => { busySender.current?.duel({ type: 'tbracket', data: m }); gotBracket(m) }
      const finish = (c: string) => { T.champion = c; busySender.current?.duel({ type: 'tdone', data: { champion: c } }); setChampion(c); showAnnRef.current({ k: 'champ', a: c }) }
      if (iAmBoss) {
        if (T.round === 0) { if (present.length >= 2) announce(makeBracket(1, present, T.hadBye)); else finish(present[0]) }
        else if (roundDone(T)) {
          const w = winnersOf(T).filter((n) => !T.losers.has(n))
          if (w.length <= 1) finish(w[0] ?? present[0])
          else announce(makeBracket(T.round + 1, w, T.hadBye))
        } else if (now - T.roundAt > 25_000) { // a player that left in the middle of a round loses it
          for (const [a, b] of T.pairs) {
            if (T.resolved.has(a) || T.resolved.has(b)) continue
            for (const n of [a, b]) if (!seen.has(n)) { busySender.current?.duel({ type: 'telim', data: { loser: n } }); outPlayers.current.add(n); applyLoss(T, n) }
          }
        }
      }
      // my own fight: the one whose name comes first asks (again every second until the other one is ready)
      const opp = opponentOf(T, me)
      if (opp && isPaired(T, me) && !eliminatedRef.current && me < opp && !battleRef.current && !busy.current && !duelPending.current && seen.has(opp)) {
        const team = trainerRef.current.team.map(healedCopy)
        if (!team.length) return
        duelPending.current = opp
        void music.playSfx('fld:07')
        busySender.current?.duel({ to: opp, type: 'challenge', data: team })
        window.setTimeout(() => { if (duelPending.current === opp && !battleRef.current) duelPending.current = null }, 4000)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [royale, username])

  /** when both players accepted: my offered Pokémon leaves, the other player's comes (a new copy with its own number) */
  const finishTrade = (t: TradeState) => {
    if (!t.mine || !t.theirs || !t.myAccept || !t.theirAccept) return
    const got: Mon = { ...JSON.parse(JSON.stringify(t.theirs)), uid: newUid() }
    const rest = trainerRef.current.team.filter((m) => m.uid !== t.mine!.uid)
    if (rest.length === trainerRef.current.team.length) { setTrade(null); return }
    setTrainer({ ...trainerRef.current, team: [...rest, got] })
    say(`¡Intercambio hecho! Recibes a ${got.species} (Nv${got.level}).`)
    setTrade(null)
  }
  const sendTo = (to: string, type: string, data?: unknown) => busySender.current?.duel({ to, type, data })
  /** the trainer talks, then the battle starts (its own words / group when it was made in the editor) */
  const npcFight = (npc: (typeof world.npcs)[number], npcId: string) => {
    const line = npc.custom ? npc.custom.lines[Math.floor(Math.random() * npc.custom.lines.length)] : preBattleLine(npc.id)
    const grp = npc.custom?.group ? world.groups?.get(npc.custom.group) : undefined
    nextAt.current = { npc: npcId }
    speakThen(`Trainer ${npc.name}`, line, () => void (grp && grp.entries.length ? groupTeam(grp) : trainerTeam(npc.ring)).then((team) => startBattle({ kind: 'trainer', foe: team, name: `Trainer ${npc.name}`, npcId, foeClass: OW_TO_CLASS[randomLook(npc.look, true).sprite ?? -1] })))
  }
  if (import.meta.env.DEV) (globalThis as { __pqTalk?: unknown }).__pqTalk = (id: string) => { const n = world.npcs.find((q) => q.id === id); if (n) npcFight(n, id) } // developer hook
  const events: GameEvents = useMemo(
    () => ({
      onMenuKey: () => setMenuOpen((o) => !o),
      onMoveStart: () => setMenuOpen(false), // walking closes the menu again
      onStep: (sx, sy, tile) => {
        if (tile === T.Tall) void music.playSfx('fld:12') // walking in tall grass
        else if (tile === T.Water) void music.playSfx('fld:13') // walking in water
        // tiles made in the editor that do something when you step on them
        const trig = world.triggers?.get(Math.round(sy) * SIZE + Math.round(sx))
        if (trig) {
          if (trig.type === 6) { void music.heal(); setTrainer({ ...trainerRef.current, team: trainerRef.current.team.map((m) => ({ ...m, hp: maxHp(m) })) }); say('Tu equipo se ha curado.') }
          else if (trig.type === 7 && trig.tx !== undefined && trig.ty !== undefined) { void music.playSfx('fld:KAIDAN'); handleRef.current?.teleport(trig.tx, trig.ty) }
          else if (trig.type === 8 && trig.text) say(trig.text)
        }
        if (tile === T.Tall && Math.random() < ENCOUNTER_RATE && trainerRef.current.team.length > 0) {
          const pos = handleRef.current?.getPos()
          const r = pos ? ringAt(pos.x, pos.y) : 1
          const gid = pos ? world.encGroup?.[Math.round(pos.y) * SIZE + Math.round(pos.x)] ?? 0 : 0
          const grp = gid ? world.groups?.get(gid) : undefined
          if (grp && grp.entries.length) void groupMon(grp).then((mon) => startBattle({ kind: 'wild', foe: [mon] }))
          else void wildEncounter(r).then((mon) => startBattle({ kind: 'wild', foe: [mon] }))
        }
      },
      onGym: (id) => {
        if (eliminatedRef.current) return
        const g = world.gyms.find((q) => q.id === id)
        if (!g) return
        if (g.center) { // a Pokémon Center: the whole team is healed
          void music.heal()
          setTrainer({ ...trainerRef.current, team: trainerRef.current.team.map(healedCopy) })
          say('Nurse Joy: Your Pokémon are fully healed!')
          return
        }
        void music.playSfx('fld:KAIDAN') // going into a building
        if (beatenGyms.current.has(id)) { say(`${g.leader} nods: you already beat this gym.`); return }
        const cgrp = g.custom?.group ? world.groups?.get(g.custom.group) : undefined
        const gline = g.custom ? g.custom.lines[Math.floor(Math.random() * g.custom.lines.length)] : leaderLine(g.id)
        nextAt.current = { x: g.doorX, y: g.doorY }
        speakThen(`Gym Leader ${g.leader}`, gline, () => void (cgrp && cgrp.entries.length ? groupTeam(cgrp) : gymTeam(g.type, g.ring)).then((team) =>
          startBattle({
            kind: 'gym', foe: team, name: `Gym Leader ${g.leader}`,
            onWin: () => {
              beatenGyms.current.add(id)
              if (g.custom) { // a gym of the editor: taken where the editor says (or nowhere)
                say(`¡Has vencido a ${g.leader}!`)
                if (g.custom.tx >= 0 && g.custom.ty >= 0) { void music.playSfx('fld:22'); handleRef.current?.teleport(g.custom.tx, g.custom.ty) }
                return
              }
              const pos = handleRef.current!.getPos()
              const spot = nextRingSpot(pos.x, pos.y, g.ring)
              void music.playSfx('fld:22') // the lift up to the next ring
              handleRef.current?.teleport(spot.x, spot.y)
              say(`You beat ${g.leader}! You were taken to ring ${g.ring + 1}.`)
            },
          }),
        ))
      },
      onPickup: (id) => {
        if (eliminatedRef.current) return
        void music.itemGet() // the game's "item found" jingle
        const pos = handleRef.current?.getPos()
        const r = pos ? ringAt(pos.x, pos.y) : 1
        const items = rollPickup(r, Math.random)
        handleRef.current?.removePickup(id)
        setTrainer({ ...trainerRef.current, bag: addItems(trainerRef.current.bag, items) })
        setToastItems(items); setToast('You found:' + Date.now()) // (the text is drawn from the items; the stamp makes every pick-up a new message)
      },
      onPlayerClick: (name, x, y) => { if (!battleRef.current && !talking.current && !eliminatedRef.current) setPmenu({ name, x, y }) },
      onPushed: (_x, _y, r) => { pushedAt.current = Date.now(); announceRef.current({ k: 'pushed', a: username ?? '', n: r }); say(`The ground crumbled — you were pushed to ring ${r}!`) },
      onAlert: () => { void music.playSfx('fld:07') }, // a trainer noticed you
      onBump: () => { void music.playSfx('fld:WALL_HIT') },
      onNpcSpotted: (npcId) => {
        if (eliminatedRef.current) return
        if (defeatedNpcs.current.has(npcId) || busy.current || talking.current || busyNpcs.current.has(npcId)) return
        const npc = world.npcs.find((n) => n.id === npcId)
        if (!npc || npc.custom?.fights === false) return
        npcFight(npc, npcId)
      },
      onNpcTalk: (npcId) => {
        if (eliminatedRef.current) return
        if (busy.current || talking.current) return
        const npc = world.npcs.find((n) => n.id === npcId)
        if (!npc) return
        const who = npc.custom && !npc.custom.fights ? npc.name : `Trainer ${npc.name}`
        nextAt.current = { npc: npcId }
        if (npc.custom && !npc.custom.fights) { speakThen(who, npc.custom.lines[Math.floor(Math.random() * npc.custom.lines.length)], () => {}); return } // a person: only talks
        if (busyNpcs.current.has(npcId)) { speakThen(who, busyLine(), () => {}); return } // somebody else is fighting it
        if (defeatedNpcs.current.has(npcId)) { speakThen(who, npc.custom ? npc.custom.after[Math.floor(Math.random() * npc.custom.after.length)] : lossLine(npcId), () => {}); return }
        npcFight(npc, npcId)
      },
    }),
    [world],
  )

  // developer shortcuts (only on the local test server): ?starter=Name auto-picks, ?testbattle starts a wild battle
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const q = new URLSearchParams(location.search)
    const s = q.get('starter')
    if (s && trainerRef.current.team.length === 0) void makeStarter(s).then((m) => setTrainer({ ...trainerRef.current, team: [m] }))
  }, [])
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('testbattle')) return
    if (trainer.team.length === 0 || battleRef.current) return
    const asTrainer = new URLSearchParams(location.search).get('testbattle') === 'trainer'
    const id = setTimeout(() => void (asTrainer
      ? trainerTeam(1).then((team) => startBattle({ kind: 'trainer', foe: team, name: 'Trainer Test' }))
      : wildEncounter(1).then((mon) => startBattle({ kind: 'wild', foe: [mon] }))), 800)
    return () => clearTimeout(id)
  }, [trainer.team.length])

  const pickStarter = async (species: string) => {
    const mon = await makeStarter(species)
    setTrainer({ ...trainerRef.current, team: [mon] })
  }

  if (trainer.team.length === 0 && trainer.pc.length === 0 && !battle) {
    return <StarterPick until={royale ? royale.startsAt + 30_000 - 1000 : undefined} onPick={pickStarter} />
  }

  const alive = trainer.team.filter((m) => m.hp > 0).length
  return (
    <div className={`fullscreen ${settings.showDpad ? (settings.dpadSide === 'left' ? 'dpad-l' : 'dpad-r') : ''}`}>
      <GameView3D
        world={world}
        built={built}
        look={look}
        settings={settings}
        startTile={spawn}
        elapsed={() => (collapseRef.current && Date.now() >= (royale ? t0 : 0) ? Date.now() - startRef.current : null)}
        others={playersVisible}
        busy={busyMapFn}
        events={events}
        handleRef={handleRef}
        paused={panel !== null || battle !== null || waiting || speech !== null || eliminated}
        spectate={eliminated && !champion ? spectatePos : undefined}
        fighting={fightingNow}
        nameColor={colorOf}
        canBattle={trainer.team.some((m) => m.hp > 0)}
        follower={!eliminated && trainer.team[0] && trainer.team[0].hp > 0 ? { species: trainer.team[0].species, shiny: !!trainer.team[0].shiny } : null}
      />

      <div className="hud-top-left panel" style={hudFrame ?? undefined}>
        <strong>Ring {ring}</strong>
        <span>
          {waiting ? 'Island falls when the match starts' : collapseOn ? (clock.ring >= 4 ? (tourRound > 0 ? `Tournament · round ${tourRound}` : clock.seconds > 0 ? `Only the peak is left · the tournament starts in ${fmtClock(clock.seconds)}` : 'The tournament is about to begin…') : clock.falling ? `Ring ${clock.ring} is crumbling!` : `Ring ${clock.ring} falls in ${fmtClock(clock.seconds)}`) : 'Island collapse is off'}
        </span>
        <span>Team {alive}/{trainer.team.length} fit · {trainer.bag['Poke Ball'] ?? 0} Poké Balls</span>
        {!royale && (
          <label className="mini">
            <input type="checkbox" checked={collapseOn} onChange={(e) => setCollapseOn(e.target.checked)} /> Test collapse
          </label>
        )}
      </div>

      <div className="hud-top-right">
        <MenuButton icon={9} label="Menu" badge={menuOpen || chatOpen ? 0 : chat.unread} onClick={() => setMenuOpen((o) => !o)} />
        {menuOpen && (
          <>
            <MenuButton icon={12} label="Team" onClick={() => { setTeamSel(null); setPanel('team'); setMenuOpen(false) }} />
            <MenuButton icon={7} label="Bag" onClick={() => { setPanel('bag'); setMenuOpen(false) }} />
            <MenuButton icon={6} label="PC" onClick={() => { setPanel('pc'); setMenuOpen(false) }} />
            <MenuButton icon={5} label="Chat" badge={chat.unread} onClick={() => { setChatOpen((o) => !o); setMenuOpen(false) }} />
            <MenuButton icon={13} label="Settings" onClick={() => { setPanel('settings'); setMenuOpen(false) }} />
            <MenuButton icon={11} label="Exit" onClick={onExit} />
          </>
        )}
      </div>

      <PartyBar hidden={menuOpen} team={trainer.team} onOpen={(slot) => { setTeamSel(slot ?? null); setPanel('team') }} onReorder={(a, b) => { const team = [...trainerRef.current.team]; if (a === b || !team[a] || !team[b]) return; [team[a], team[b]] = [team[b], team[a]]; setTrainer({ ...trainerRef.current, team }) }} />

      {waiting && <div className="match-wait panel" style={hudFrame ?? undefined}><strong>Get ready!</strong><span>The match begins in {Math.max(0, Math.ceil((t0 - now) / 1000))} seconds. Everybody is picking a starter…</span></div>}

      {!battle && !royale && (
        <div className="hud-practice panel" style={hudFrame ?? undefined}>
          <small>Practice tools</small>
          <button onClick={() => { void music.heal(); setTrainer({ ...trainer, team: trainer.team.map((m) => ({ ...m, hp: maxHp(m) })) }) }}>Heal team</button>
        </div>
      )}

      {speech && (
        <div
          data-nonav className={`npc-speech ${bubble ? 'bubble' : 'panel'}`}
          style={bubble ? { left: Math.min(Math.max(bubble.x, 150), window.innerWidth - 150), top: Math.max(bubble.y, 90) } : hudFrame2 ?? undefined}
          onClick={advanceSpeech}
        >
          <b>{speech.who}</b>
          <span><TypedText text={speech.line} ms={CHAR_MS[settings.textSpeed ?? 'normal']} skip={speechSkip} /></span>
        </div>
      )}
      {toast && (
        <div key={toast} className="toast panel" style={toastFrame ?? undefined}>
          {toastItems ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span>You found:</span>
              {Object.entries(toastItems).map(([k, n]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ItemIcon name={k} size={24} /><span>{ITEMS[k]?.name ?? k} x{n}</span></span>
              ))}
            </span>
          ) : toast}
        </div>
      )}
      {!battle && <MiniMap world={world} getMe={() => handleRef.current?.getPos() ?? null} others={playersVisible} radius={radius} collapseOn={collapseOn} mobile={mobile} />}
      {!battle && <ChatDock chat={chat} canChat={!!chatUser} open={chatOpen} setOpen={setChatOpen} colorOf={royale ? colorOf : undefined} />}
      {panel === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setPanel(null)} onCustomize={onCustomize} />}
      {panel === 'team' && <TeamPanel initial={teamSel} trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {panel === 'bag' && <BagPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {caughtMon && <CaughtPanel mon={caughtMon} onClose={() => setCaughtMon(null)} />}
      {panel === 'pc' && <PcPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}

      {pmenu && pmenu.name !== null && (
        <PlayerPopup
          name={pmenu.name} x={pmenu.x} y={pmenu.y} isFriend={chat.friends.some((f) => f.toLowerCase() === pmenu.name!.toLowerCase())}
          onClose={() => setPmenu(null)}
          onWatch={(() => { const b = batInfo.current.get(pmenu.name!); return (!royale || RULES.watchAlive > 0) && b && b.until > Date.now() ? () => { const n = pmenu.name!; setPmenu(null); startSpectate(n) } : undefined })()}
          onFriend={(add) => { const n = pmenu.name!; setPmenu(null); if (!chatUser) { say('Inicia sesión para tener amigos.'); return } void chat.friendAction(n, add).then((ok) => say(ok ? (add ? `${n} ahora es tu amigo.` : `${n} ya no es tu amigo.`) : 'No se pudo hacer eso.')) }}
          onWhisper={() => { const n = pmenu.name!; setPmenu(null); if (!chatUser) { say('Inicia sesión para chatear.'); return } chat.openWhisper(n); setChatOpen(true) }}
          onTrade={() => { const n = pmenu.name!; setPmenu(null); if (!royale) { say('Solo se puede intercambiar en una partida con otros jugadores.'); return } sendTo(n, 'trade-req'); say(`Petición de intercambio enviada a ${n}…`) }}
        />
      )}
      {pmenu && pmenu.name === null && (
        <ReactionPopup x={pmenu.x} y={pmenu.y} onClose={() => setPmenu(null)} onPick={(idx) => { setPmenu(null); handleRef.current?.showEmote(null, idx); busySender.current?.duel({ type: 'react', data: { idx } }) }} />
      )}
      {tradeAsk && (
        <div className="modal-backdrop" style={{ zIndex: 75 }}>
          <div className="panel modal">
            <h2>Intercambio</h2>
            <p className="sub">{tradeAsk} quiere intercambiar Pokémon contigo.</p>
            <button className="primary" onClick={() => { const n = tradeAsk; setTradeAsk(null); sendTo(n, 'trade-ok'); setTrade({ partner: n, mine: null, theirs: null, myAccept: false, theirAccept: false }) }}>Aceptar</button>
            <button onClick={() => { sendTo(tradeAsk, 'trade-no'); setTradeAsk(null) }}>Rechazar</button>
          </div>
        </div>
      )}
      {trade && (
        <TradePanel
          trade={trade} team={trainer.team}
          onOffer={(m) => { const nt = { ...trade, mine: m, myAccept: false, theirAccept: false }; setTrade(nt); sendTo(trade.partner, 'trade-offer', JSON.parse(JSON.stringify(m))) }}
          onAccept={() => { const nt = { ...trade, myAccept: true }; setTrade(nt); sendTo(trade.partner, 'trade-accept'); finishTrade(nt) }}
          onCancel={() => { sendTo(trade.partner, 'trade-cancel'); setTrade(null) }}
        />
      )}

      {champion && (
        <div className="modal-backdrop" style={{ zIndex: 85 }}>
          <div className="panel modal">
            <h2>{champion === username ? 'You won the match!' : `${champion} won the match!`}</h2>
            <p className="sub">{champion === username ? 'You are the last trainer standing. Congratulations!' : 'The tournament is over. Thanks for playing!'}</p>
            <button className="primary" onClick={onExit}>Back to the menu</button>
          </div>
        </div>
      )}
      {eliminated && !champion && !battle && (
        <div className="hud-out panel">
          <b>{langRef.current === 'es' ? 'Has sido eliminado' : 'You were eliminated'}</b>
          <span className="hud-watch">
            <button onClick={() => stepWatch(-1)} aria-label="Previous player">◀</button>
            <span>{watch ? <b style={{ color: colorOf(watch) }}>{watch}</b> : (langRef.current === 'es' ? 'Nadie a quien mirar' : 'Nobody to watch')}</span>
            <button onClick={() => stepWatch(1)} aria-label="Next player">▶</button>
          </span>
          {RULES.watchEliminated > 0 && watch && (batInfo.current.get(watch)?.until ?? 0) > Date.now() && <button onClick={() => startSpectate(watch)}>{langRef.current === 'es' ? 'Ver combate' : 'Watch battle'}</button>}
          <button className="primary" onClick={onExit}>{langRef.current === 'es' ? 'Salir de la partida' : 'Leave the game'}</button>
        </div>
      )}
      {battle && (
        <BattleScreen
          key={battle.id}
          trainer={battle.spectate ? { ...trainer, team: battle.spectate.mine } : trainer}
          foeTeam={battle.foe}
          kind={battle.kind}
          foeName={battle.name}
          foeSeed={battle.foeSeed ?? battle.npcId ?? battle.name}
          foeClass={battle.foeClass}
          pvp={battle.pvp}
          spectate={battle.spectate ? { who: battle.spectate.who, listen: battle.spectate.listen } : undefined}
          stream={streamEvents}
          playerGirl={battle.spectate ? battle.spectate.girl : look.sprite === 10}
          textSpeed={settings.textSpeed}
          onEnd={endBattle}
        />
      )}
    </div>
  )
}

export type { Dir }

/** 4:05 */
const fmtClock = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

export default function PlayScreen(props: Props) {
  const [loaded, setLoaded] = useState<{ world: World; built: BuiltWorld } | 'missing' | null>(null)
  const [prog, setProg] = useState<Progress>({ text: 'Reading the map pieces from your game file…', frac: 0, step: 1, steps: 5 })
  useEffect(() => {
    let live = true
    const pause = () => new Promise<void>((r) => setTimeout(r, 30)) // lets the page draw the bar before the next heavy step
    void (async () => {
      await pause()
      const data = await loadWorldData()
      if (!live) return
      if (!data) { setLoaded('missing'); return }
      const n = data.chunks.length
      setProg({ text: 'Reading the map pieces from your game file…', frac: 0.2, step: 1, steps: 5, done: n, total: n, unit: 'map pieces' })
      await pause()
      setProg({ text: 'Building the map pieces…', frac: 0.25, step: 2, steps: 5, done: 0, total: n, unit: 'map pieces' })
      await pause()
      const built = buildChunkWorld(data)
      setProg({ text: 'Building the map pieces…', frac: 0.6, step: 2, steps: 5, done: n, total: n, unit: 'map pieces' })
      await pause()
      const seed = props.royale ? props.royale.seed : Math.floor(Math.random() * 1e9)
      setProg({ text: 'Making the meadow, paths and forests…', frac: 0.65, step: 3, steps: 5, done: 0, total: 1, unit: 'step' })
      await pause()
      // the world the owner published (everybody plays the same one) unless a world is being tested from the editor
      const custom = props.custom ?? (await fetchPublishedWorld())
      if (!live) return
      applyRules(custom?.rules) // the rules of that world (ring timing, legendary limit, items per battle)
      let world: World
      if (custom) { // a world from the editor: its own ground, heights and models replace the real map
        setProg({ text: 'Drawing your world…', frac: 0.8, step: 4, steps: 5, done: 0, total: 1, unit: 'step' })
        await pause()
        built.group.clear()
        built.uniforms.uHide.value = 9999
        const vis = buildCustomVisuals(custom, built)
        world = generateWorld(seed, built.ground, { barriers: custom.barriers })
        applyCustomEvents(world, custom)
        built.group.add(vis.group)
      } else {
        prepareMeadow(built, seed) // ring 1 = a meadow (lots of tall grass, a ring road and paths, a beach)
        setProg({ text: 'Placing gyms, trainers and items…', frac: 0.8, step: 4, steps: 5, done: 0, total: 1, unit: 'step' })
        await pause()
        world = generateWorld(seed, built.ground)
        const extra = addExtraGrass(world, built, seed) // and more tall grass in the inner rings
        setProg({ text: 'Drawing the island…', frac: 0.9, step: 5, steps: 5, done: 0, total: 1, unit: 'step' })
        await pause()
        built.group.add(buildMeadowVisuals(world, built, extra))
      }
      if (import.meta.env.DEV) (globalThis as { __pqWorld?: unknown }).__pqWorld = { world, built } // developer hook
      if (!live) return
      setProg({ text: 'Ready!', frac: 1, step: 5, steps: 5, done: 1, total: 1, unit: 'step' })
      setLoaded({ built, world })
    })()
    return () => { live = false }
  }, [])
  if (loaded === null) return <div className="fullscreen center menu-bg"><div className="panel card"><p className="sub">Building the island from your game file…</p><ProgressBar p={prog} /></div></div>
  if (loaded === 'missing') return <div className="fullscreen center menu-bg"><div className="panel card"><p>The map pieces are missing. Please import your game file again (clear this site's data, then reload).</p><button onClick={props.onExit}>Back</button></div></div>
  return <PlayInner {...props} world={loaded.world} built={loaded.built} />
}
