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
  C, COLLAPSE_SECONDS, RADIUS, RING_INNER, SIZE, T, collapseRadius, generateWorld, isWalkable, ringAt, type Dir, type World,
} from '../game/world'
import BattleScreen, { type BattleKind, type BattleOutcome } from './BattleScreen'
import { BagPanel, PcPanel, TeamPanel } from './MenuPanels'
import SettingsPanel from './SettingsPanel'
import StarterPick from './StarterPick'
import MenuButton from './MenuButton'
import PartyBar from './PartyBar'
import ChatPanel from './ChatPanel'
import { useMatchPlayers } from '../net/useMatchPlayers'
import { useChat } from './useChat'
import { music } from '../audio/music'

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

interface ActiveBattle { id?: number; kind: BattleKind; foe: Mon[]; name?: string; onWin?: () => void; npcId?: string }
let battleCounter = 0

function PlayInner({ royale, username, look, settings, onSettings, onExit, onCustomize, world, built }: Props & { world: World; built: BuiltWorld }) {
  // in a match everybody starts at a different place of the outer ring, as far apart as possible
  const myIndex = royale && username ? Math.max(0, royale.players.indexOf(username)) : 0
  const spawn = royale ? world.spawns[Math.round((myIndex * world.spawns.length) / Math.max(1, royale.players.length)) % world.spawns.length] : world.spawns[0]
  const t0 = royale ? royale.startsAt + 60_000 : 0 // the match begins one minute after the start (time to pick a starter)
  const handleRef = useRef<GameHandle | null>(null)
  const startRef = useRef(royale ? t0 : Date.now())
  const [collapseOn, setCollapseOn] = useState(!!royale)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!royale) return; const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id) }, [])
  const waiting = !!royale && now < t0 // everybody waits for the others until the match really begins
  const collapseRef = useRef(false)
  collapseRef.current = collapseOn
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<null | 'settings' | 'team' | 'bag' | 'pc' | 'chat'>(null)
  const [toast, setToast] = useState<string | null>(null)
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
  const players = useMatchPlayers(royale?.id ?? null, username, look, () => handleRef.current?.getPos() ?? null)

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
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  const nextRingSpot = (x: number, y: number, fromRing: number) => {
    const a = Math.atan2(y + 0.5 - C, x + 0.5 - C)
    const base = RING_INNER[fromRing - 1] - 4
    for (let r = base; r > 0; r--) {
      for (const off of [0, 1, -1, 2, -2, 3, -3]) {
        const rr = r + off
        const px = Math.round(C + Math.cos(a) * rr - 0.5)
        const py = Math.round(C + Math.sin(a) * rr - 0.5)
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

  const endBattle = (outcome: BattleOutcome, t: Trainer) => {
    setTrainer(t)
    const b = battleRef.current
    setBattle(null)
    busy.current = false
    handleRef.current?.setNpcFreeze(null)
    if (outcome === 'win' && b) {
      if (b.npcId) { defeatedNpcs.current.add(b.npcId); handleRef.current?.defeatNpc(b.npcId) }
      b.onWin?.()
    }
    if (outcome === 'caught') say('Gotcha! The Pokémon joined you (see Team or PC).')
    if (outcome === 'lose') say('You blacked out of the fight! Heal up with Revives and Potions.')
  }

  const events: GameEvents = useMemo(
    () => ({
      onMenuKey: () => setMenuOpen((o) => !o),
      onMoveStart: () => setMenuOpen(false), // walking closes the menu again
      onStep: (_x, _y, tile) => {
        if (tile === T.Tall && Math.random() < ENCOUNTER_RATE && trainerRef.current.team.length > 0) {
          const pos = handleRef.current?.getPos()
          const r = pos ? ringAt(pos.x, pos.y) : 1
          void wildEncounter(r).then((mon) => startBattle({ kind: 'wild', foe: [mon] }))
        }
      },
      onGym: (id) => {
        const g = world.gyms.find((q) => q.id === id)
        if (!g) return
        if (beatenGyms.current.has(id)) { say(`${g.leader} nods: you already beat this gym.`); return }
        say(`Gym Leader ${g.leader} (${g.type} type) accepts your challenge!`)
        void gymTeam(g.type, g.ring).then((team) =>
          startBattle({
            kind: 'gym', foe: team, name: `Gym Leader ${g.leader}`,
            onWin: () => {
              beatenGyms.current.add(id)
              const pos = handleRef.current!.getPos()
              const spot = nextRingSpot(pos.x, pos.y, g.ring)
              handleRef.current?.teleport(spot.x, spot.y)
              say(`You beat ${g.leader}! You were taken to ring ${g.ring + 1}.`)
            },
          }),
        )
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
      onNpcSpotted: (npcId) => {
        if (defeatedNpcs.current.has(npcId) || busy.current) return
        const npc = world.npcs.find((n) => n.id === npcId)
        if (!npc) return
        void trainerTeam(npc.ring).then((team) => startBattle({ kind: 'trainer', foe: team, name: `Trainer ${npc.name}`, npcId }))
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
    const id = setTimeout(() => void wildEncounter(1).then((mon) => startBattle({ kind: 'wild', foe: [mon] })), 800)
    return () => clearTimeout(id)
  }, [trainer.team.length])

  const pickStarter = async (species: string) => {
    const mon = await makeStarter(species)
    setTrainer({ ...trainerRef.current, team: [mon] })
  }

  if (trainer.team.length === 0 && trainer.pc.length === 0 && !battle) {
    return <StarterPick until={royale ? royale.startsAt + 60_000 - 1000 : undefined} onPick={pickStarter} />
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
        others={players}
        events={events}
        handleRef={handleRef}
        paused={panel !== null || battle !== null || waiting}
      />

      <div className="hud-top-left panel">
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
        <MenuButton icon={9} label="Menu" badge={menuOpen ? 0 : chat.unread} onClick={() => setMenuOpen((o) => !o)} />
      </div>

      <PartyBar team={trainer.team} onOpen={() => setPanel('team')} />

      {waiting && <div className="match-wait panel"><strong>Get ready!</strong><span>The match begins in {Math.max(0, Math.ceil((t0 - now) / 1000))} seconds. Everybody is picking a starter…</span></div>}

      {!battle && !royale && (
        <div className="hud-practice panel">
          <small>Practice tools</small>
          <button onClick={() => setTrainer({ ...trainer, team: trainer.team.map((m) => ({ ...m, hp: maxHp(m) })) })}>Heal team</button>
        </div>
      )}

      {toast && <div className="toast panel">{toast}</div>}
      {panel === 'chat' && <ChatPanel messages={chat.messages} status={chat.status} send={chat.send} canChat={!!username} onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setPanel(null)} onCustomize={onCustomize} />}
      {panel === 'team' && <TeamPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {panel === 'bag' && <BagPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}
      {panel === 'pc' && <PcPanel trainer={trainer} setTrainer={setTrainer} onClose={() => setPanel(null)} onMessage={say} />}

      {battle && (
        <BattleScreen
          key={battle.id}
          trainer={trainer}
          foeTeam={battle.foe}
          kind={battle.kind}
          foeName={battle.name}
          onEnd={endBattle}
        />
      )}
    </div>
  )
}

export type { Dir }

export default function PlayScreen(props: Props) {
  const [loaded, setLoaded] = useState<{ world: World; built: BuiltWorld } | 'missing' | null>(null)
  useEffect(() => {
    let live = true
    void loadWorldData().then((data) => {
      if (!live) return
      if (!data) { setLoaded('missing'); return }
      const built = buildChunkWorld(data)
      setLoaded({ built, world: generateWorld(props.royale ? props.royale.seed : Math.floor(Math.random() * 1e9), built.ground) })
    })
    return () => { live = false }
  }, [])
  if (loaded === null) return <div className="fullscreen center menu-bg"><div className="panel card"><p className="sub">Building the island from your game file�</p></div></div>
  if (loaded === 'missing') return <div className="fullscreen center menu-bg"><div className="panel card"><p>The map pieces are missing. Please import your game file again (clear this site's data, then reload).</p><button onClick={props.onExit}>Back</button></div></div>
  return <PlayInner {...props} world={loaded.world} built={loaded.built} />
}
