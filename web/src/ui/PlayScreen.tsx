import { useEffect, useMemo, useRef, useState } from 'react'
import { type GameEvents, type GameHandle } from '../game/GameView'
import GameView3D from '../game/GameView3D'
import { buildChunkWorld, type BuiltWorld } from '../rom/chunkWorld'
import { loadWorldData } from '../rom/store'
import type { Look } from '../game/character'
import type { Settings } from '../game/settings'
import { ENCOUNTER_RATE, gymTeam, trainerTeam, wildEncounter } from '../game/encounters'
import { addItems, emptyTrainer, makeStarter, type Trainer } from '../game/state'
import { ITEMS, STARTING_BAG, rollPickup } from '../data/items'
import { maxHp, type Mon } from '../data/dex'
import {
  C, COLLAPSE_SECONDS, squareTile, RADIUS, RING_INNER, SIZE, T, collapseRadius, generateWorld, isWalkable, ringAt, type Dir, type World,
} from '../game/world'
import BattleScreen, { CHAR_MS, TypedText, type BattleKind, type BattleOutcome, type PvpLink } from './BattleScreen'
import { addExtraGrass, buildMeadowVisuals, prepareMeadow } from '../game/meadow'
import { busyLine, leaderLine, lossLine, preBattleLine } from '../data/npcLines'
import { BagPanel, PcPanel, TeamPanel } from './MenuPanels'
import SettingsPanel from './SettingsPanel'
import StarterPick from './StarterPick'
import MenuButton from './MenuButton'
import PartyBar from './PartyBar'
import { useFrameStyle } from './DsFrame'
import ChatPanel from './ChatPanel'
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
}

interface ActiveBattle { id?: number; kind: BattleKind; foe: Mon[]; name?: string; onWin?: () => void; npcId?: string; pvp?: PvpLink }
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
  const [collapseOn, setCollapseOn] = useState(!!royale)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!royale) return; const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id) }, [])
  const waiting = !!royale && now < t0 // everybody waits for the others until the match really begins
  const collapseRef = useRef(false)
  collapseRef.current = collapseOn
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<null | 'settings' | 'team' | 'bag' | 'pc' | 'chat'>(null)
  const [toast, setToast] = useState<string | null>(null)
  // a trainer (or gym leader) talks before the battle: { who, line, then }
  const [speech, setSpeech] = useState<null | { who: string; line: string; then: () => void }>(null)
  const [speechSkip, setSpeechSkip] = useState(0)
  const speechTyping = useRef(0) // until when (ms since 1970) the sentence is still being typed
  const talking = useRef(false)
  const speakThen = (who: string, line: string, then: () => void) => {
    if (talking.current) return
    talking.current = true
    speechTyping.current = Date.now() + line.length * CHAR_MS[settings.textSpeed ?? 'normal']
    setSpeechSkip(0)
    setSpeech({ who, line, then })
  }
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
  const toastFrame = useFrameStyle('white', 2)
  const hudFrame2 = useFrameStyle('dark', 2)
  const hudFrame = useFrameStyle('dark', 1) // the game's own dark message window for the info boxes
  const [ring, setRing] = useState(1)
  const [secs, setSecs] = useState(0)
  const [radius, setRadius] = useState(RADIUS)
  const [trainer, setTrainerState] = useState<Trainer>(() => ({ ...emptyTrainer(), bag: { ...STARTING_BAG } }))
  const trainerRef = useRef(trainer)
  const setTrainer = (t: Trainer) => { trainerRef.current = t; setTrainerState(t) }
  const [battle, setBattle] = useState<ActiveBattle | null>(null)
  const battleRef = useRef<ActiveBattle | null>(null)
  battleRef.current = battle
  const defeatedNpcs = useRef(new Set<string>())
  const beatenGyms = useRef(new Set<string>())
  const busy = useRef(false)

  const say = (t: string) => setToast(t)
  const chat = useChat(username, panel === 'chat')
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
  const outPlayers = useRef(new Set<string>()) // players that are out of the match
  const duelPending = useRef<string | null>(null)
  const pvpListeners = useRef(new Set<(type: string, data: unknown) => void>())
  const startDuelRef = useRef<(role: 'host' | 'guest', opp: string, team: Mon[]) => void>(() => {})
  const players = useMatchPlayers(royale?.id ?? null, username, look, () => handleRef.current?.getPos() ?? null, royale ? {
    pickedMe: trainer.team.length > 0 || trainer.pc.length > 0,
    expected: royale.players,
    started: Date.now() >= t0Ref.current,
    onAllPicked: () => { const nt = Date.now() + 1500; if (nt < t0Ref.current) { startRef.current = nt; t0Ref.current = nt; setT0(nt) } }, // everybody is ready: start right away
    onBusy: (npc, by, on) => { if (on) busyNpcs.current.set(npc, { by, until: Date.now() + 9000 }); else busyNpcs.current.delete(npc) },
    onDuel: (m) => {
      if (m.type === 'eliminated') { outPlayers.current.add(m.from); return }
      if (m.type === 'pvp') { const d = m.data as { t: string; d: unknown }; for (const cb of pvpListeners.current) cb(d.t, d.d); return }
      if (m.type === 'challenge') { // a player touched me at the peak: the duel starts at once
        const ring = (() => { const q = handleRef.current?.getPos(); return q ? ringAt(q.x, q.y) : 0 })()
        const team = trainerRef.current.team.filter((x) => x.hp > 0)
        if (battleRef.current || busy.current || eliminatedRef.current || ring !== 4 || !team.length || duelPending.current) { busySender.current?.duel({ to: m.from, type: 'decline' }); return }
        duelPending.current = m.from
        busySender.current?.duel({ to: m.from, type: 'accept', data: JSON.parse(JSON.stringify(team)) })
        startDuelRef.current('guest', m.from, m.data as Mon[])
      } else if (m.type === 'accept') {
        if (duelPending.current === m.from) startDuelRef.current('host', m.from, m.data as Mon[])
      } else if (m.type === 'decline') { if (duelPending.current === m.from) duelPending.current = null }
    },
  } : undefined, busySender)
  const playersVisible = () => players().filter((o) => !outPlayers.current.has(o.id))
  const busyMapFn = () => { const m = new Map<string, string>(); const now = Date.now(); for (const [k, v] of busyNpcs.current) { if (v.until < now) busyNpcs.current.delete(k); else m.set(k, v.by) } return m }
  // while I fight a trainer, the others see it as busy (repeated, so that late arrivals know too)
  useEffect(() => {
    const id = battle?.npcId
    if (!id) return
    busySender.current?.send(id, true)
    const t = window.setInterval(() => busySender.current?.send(id, true), 3000)
    return () => { window.clearInterval(t); busySender.current?.send(id, false) }
  }, [battle?.npcId])

  // the real songs of the game: route music by ring, battle music by kind of battle
  const song = battle ? (battle.kind === 'gym' ? 'gymLeader' : battle.kind === 'trainer' ? 'trainer' : 'wild') : ring <= 1 ? 'field1' : ring === 2 ? 'field2' : 'field3'
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
      setSecs(COLLAPSE_SECONDS - (el % COLLAPSE_SECONDS))
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

  const startBattle = (b: ActiveBattle) => {
    if (busy.current || battleRef.current) return
    if (!trainerRef.current.team.some((m) => m.hp > 0)) {
      say('All your Pokémon have fainted! Use a Revive from your bag (or find one).')
      return
    }
    busy.current = true
    handleRef.current?.setNpcFreeze(b.npcId ?? null)
    setBattle({ ...b, id: ++battleCounter })
  }

  /** Two players meet at the peak: the one whose name comes first runs the battle (host), the other follows (guest). */
  const startDuel = (role: 'host' | 'guest', opp: string, team: Mon[]) => {
    const link: PvpLink = {
      role, hostName: role === 'host' ? username ?? 'You' : opp, guestName: role === 'host' ? opp : username ?? 'You',
      send: (type, data) => busySender.current?.duel({ to: opp, type: 'pvp', data: { t: type, d: data } }),
      listen: (cb) => { pvpListeners.current.add(cb); return () => { pvpListeners.current.delete(cb) } },
    }
    startBattle({ kind: 'trainer', foe: team, name: opp, pvp: link })
  }
  startDuelRef.current = startDuel

  const endBattle = (outcome: BattleOutcome, t: Trainer) => {
    setTrainer(t)
    const b = battleRef.current
    setBattle(null)
    busy.current = false
    handleRef.current?.setNpcFreeze(null)
    if (outcome === 'win' && b) {
      if (b.npcId) { defeatedNpcs.current.add(b.npcId); handleRef.current?.defeatNpc(b.npcId); say(`${b.name ?? 'Trainer'}: “${lossLine(b.npcId)}”`) }
      b.onWin?.()
    }
    if (outcome === 'caught') say('Gotcha! The Pokémon joined you (see Team or PC).')
    if (b?.pvp) { // a duel against another player: the loser is out of the match
      duelPending.current = null
      if (outcome === 'lose') { eliminatedRef.current = true; setEliminated(true); busySender.current?.duel({ type: 'eliminated' }) }
      else if (outcome === 'win') { outPlayers.current.add(b.name ?? ''); say(`You beat ${b.name}! They are out of the match.`) }
      return
    }
    if (outcome === 'lose') say('You blacked out of the fight! Heal up with Revives and Potions.')
  }

  // two players that touch each other at the peak fight at once (the one whose name comes first asks)
  useEffect(() => {
    if (!royale || !username) return
    const id = window.setInterval(() => {
      if (battleRef.current || busy.current || eliminatedRef.current || duelPending.current || Date.now() < t0Ref.current) return
      const me = handleRef.current?.getPos()
      if (!me || ringAt(me.x, me.y) !== 4) return
      const team = trainerRef.current.team.filter((x) => x.hp > 0)
      if (!team.length) return
      for (const o of players()) {
        if (outPlayers.current.has(o.id) || !(username < o.id)) continue
        if (ringAt(Math.round(o.x), Math.round(o.y)) !== 4) continue
        if (Math.abs(o.x - me.x) <= 1.2 && Math.abs(o.y - me.y) <= 1.2) {
          duelPending.current = o.id
          void music.playSfx('fld:07') // touching another player at the peak: the same sound as a trainer spotting you
          busySender.current?.duel({ to: o.id, type: 'challenge', data: JSON.parse(JSON.stringify(team)) })
          window.setTimeout(() => { if (duelPending.current === o.id && !battleRef.current) duelPending.current = null }, 4000)
          break
        }
      }
    }, 400)
    return () => window.clearInterval(id)
  }, [royale, username])

  const events: GameEvents = useMemo(
    () => ({
      onMenuKey: () => setMenuOpen((o) => !o),
      onMoveStart: () => setMenuOpen(false), // walking closes the menu again
      onStep: (_x, _y, tile) => {
        if (tile === T.Tall) void music.playSfx('fld:12') // walking in tall grass
        else if (tile === T.Water) void music.playSfx('fld:13') // walking in water
        if (tile === T.Tall && Math.random() < ENCOUNTER_RATE && trainerRef.current.team.length > 0) {
          const pos = handleRef.current?.getPos()
          const r = pos ? ringAt(pos.x, pos.y) : 1
          void wildEncounter(r).then((mon) => startBattle({ kind: 'wild', foe: [mon] }))
        }
      },
      onGym: (id) => {
        const g = world.gyms.find((q) => q.id === id)
        if (!g) return
        void music.playSfx('fld:KAIDAN') // going into a building
        if (beatenGyms.current.has(id)) { say(`${g.leader} nods: you already beat this gym.`); return }
        speakThen(`Gym Leader ${g.leader}`, leaderLine(g.id), () => void gymTeam(g.type, g.ring).then((team) =>
          startBattle({
            kind: 'gym', foe: team, name: `Gym Leader ${g.leader}`,
            onWin: () => {
              beatenGyms.current.add(id)
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
        void music.playSfx('se:getting')
        const pos = handleRef.current?.getPos()
        const r = pos ? ringAt(pos.x, pos.y) : 1
        const items = rollPickup(r, Math.random)
        handleRef.current?.removePickup(id)
        setTrainer({ ...trainerRef.current, bag: addItems(trainerRef.current.bag, items) })
        say('You found: ' + Object.entries(items).map(([k, n]) => `${ITEMS[k]?.name ?? k} x${n}`).join(', '))
      },
      onPushed: (_x, _y, r) => say(`The ground crumbled — you were pushed to ring ${r}!`),
      onAlert: () => { void music.playSfx('fld:07') }, // a trainer noticed you
      onBump: () => { void music.playSfx('fld:WALL_HIT') },
      onNpcSpotted: (npcId) => {
        if (defeatedNpcs.current.has(npcId) || busy.current || talking.current || busyNpcs.current.has(npcId)) return
        const npc = world.npcs.find((n) => n.id === npcId)
        if (!npc) return
        speakThen(`Trainer ${npc.name}`, preBattleLine(npc.id), () => void trainerTeam(npc.ring).then((team) => startBattle({ kind: 'trainer', foe: team, name: `Trainer ${npc.name}`, npcId })))
      },
      onNpcTalk: (npcId) => {
        if (busy.current || talking.current) return
        const npc = world.npcs.find((n) => n.id === npcId)
        if (!npc) return
        if (busyNpcs.current.has(npcId)) { speakThen(`Trainer ${npc.name}`, busyLine(), () => {}); return } // somebody else is fighting it
        if (defeatedNpcs.current.has(npcId)) { speakThen(`Trainer ${npc.name}`, lossLine(npcId), () => {}); return }
        speakThen(`Trainer ${npc.name}`, preBattleLine(npc.id), () => void trainerTeam(npc.ring).then((team) => startBattle({ kind: 'trainer', foe: team, name: `Trainer ${npc.name}`, npcId })))
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
    <div className="fullscreen">
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
        paused={panel !== null || battle !== null || waiting || speech !== null}
        canBattle={trainer.team.some((m) => m.hp > 0)}
        follower={trainer.team[0] && trainer.team[0].hp > 0 ? { species: trainer.team[0].species, shiny: !!trainer.team[0].shiny } : null}
      />

      <div className="hud-top-left panel" style={hudFrame ?? undefined}>
        <strong>Ring {ring}</strong>
        <span>
          {waiting ? 'Island falls when the match starts' : collapseOn ? `Next band falls in ${Math.ceil(secs)}s · island radius ${Math.max(0, radius)}` : 'Island collapse is off'}
        </span>
        <span>Team {alive}/{trainer.team.length} fit · {trainer.bag['Poke Ball'] ?? 0} Poké Balls</span>
        {!royale && (
          <label className="mini">
            <input type="checkbox" checked={collapseOn} onChange={(e) => setCollapseOn(e.target.checked)} /> Test collapse
          </label>
        )}
      </div>

      <div className="hud-top-right">
        <MenuButton icon={9} label="Menu" badge={menuOpen ? 0 : chat.unread} onClick={() => setMenuOpen((o) => !o)} />
        {menuOpen && (
          <>
            <MenuButton icon={12} label="Team" onClick={() => { setPanel('team'); setMenuOpen(false) }} />
            <MenuButton icon={7} label="Bag" onClick={() => { setPanel('bag'); setMenuOpen(false) }} />
            <MenuButton icon={6} label="PC" onClick={() => { setPanel('pc'); setMenuOpen(false) }} />
            <MenuButton icon={5} label="Chat" badge={chat.unread} onClick={() => { setPanel('chat'); setMenuOpen(false) }} />
            <MenuButton icon={13} label="Settings" onClick={() => { setPanel('settings'); setMenuOpen(false) }} />
            <MenuButton icon={11} label="Exit" onClick={onExit} />
          </>
        )}
      </div>

      <PartyBar hidden={menuOpen} team={trainer.team} onOpen={() => setPanel('team')} onReorder={(a, b) => { const team = [...trainerRef.current.team]; if (a === b || !team[a] || !team[b]) return; [team[a], team[b]] = [team[b], team[a]]; setTrainer({ ...trainerRef.current, team }) }} />

      {waiting && <div className="match-wait panel" style={hudFrame ?? undefined}><strong>Get ready!</strong><span>The match begins in {Math.max(0, Math.ceil((t0 - now) / 1000))} seconds. Everybody is picking a starter…</span></div>}

      {!battle && !royale && (
        <div className="hud-practice panel" style={hudFrame ?? undefined}>
          <small>Practice tools</small>
          <button onClick={() => { void music.heal(); setTrainer({ ...trainer, team: trainer.team.map((m) => ({ ...m, hp: maxHp(m) })) }) }}>Heal team</button>
        </div>
      )}

      {speech && (
        <div className="npc-speech panel" style={hudFrame2 ?? undefined} onClick={() => { if (Date.now() < speechTyping.current) { speechTyping.current = 0; setSpeechSkip((k) => k + 1) } else closeSpeech() }}>
          <b>{speech.who}</b>
          <span><TypedText text={speech.line} ms={CHAR_MS[settings.textSpeed ?? 'normal']} skip={speechSkip} /></span>
        </div>
      )}
      {toast && <div key={toast} className="toast panel" style={toastFrame ?? undefined}>{toast}</div>}
      {panel === 'chat' && <ChatPanel messages={chat.messages} status={chat.status} send={chat.send} canChat={!!username} onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setPanel(null)} onCustomize={onCustomize} />}
      {panel === 'team' && <TeamPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {panel === 'bag' && <BagPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {panel === 'pc' && <PcPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}

      {eliminated && (
        <div className="modal-backdrop" style={{ zIndex: 80 }}>
          <div className="panel modal">
            <h2>You were eliminated</h2>
            <p className="sub">You lost a duel at the peak. Thanks for playing!</p>
            <button className="primary" onClick={onExit}>Back to the menu</button>
          </div>
        </div>
      )}
      {battle && (
        <BattleScreen
          key={battle.id}
          trainer={trainer}
          foeTeam={battle.foe}
          kind={battle.kind}
          foeName={battle.name}
          foeSeed={battle.npcId ?? battle.name}
          pvp={battle.pvp}
          playerGirl={look.sprite === 10}
          textSpeed={settings.textSpeed}
          onEnd={endBattle}
        />
      )}
    </div>
  )
}

export type { Dir }

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
      prepareMeadow(built, seed) // ring 1 = a meadow (lots of tall grass, a ring road and paths, a beach)
      setProg({ text: 'Placing gyms, trainers and items…', frac: 0.8, step: 4, steps: 5, done: 0, total: 1, unit: 'step' })
      await pause()
      const world = generateWorld(seed, built.ground)
      const extra = addExtraGrass(world, built, seed) // and more tall grass in the inner rings
      setProg({ text: 'Drawing the island…', frac: 0.9, step: 5, steps: 5, done: 0, total: 1, unit: 'step' })
      await pause()
      built.group.add(buildMeadowVisuals(world, built, extra))
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
