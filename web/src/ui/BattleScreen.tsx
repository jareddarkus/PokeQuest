import { useEffect, useMemo, useRef, useState } from 'react'
import { BattleSession, type BattleEvent, type Request } from '../battle/engine'
import { allSpecies, dexNum, maxHp, statsOf, type Mon } from '../data/dex'
import { ITEMS } from '../data/items'
import {
  addEvs, catchChance, evYield, evolve, expGain, gainExp, healMon, levelEvolution, rollCatch, useItemFromBag, type Trainer,
} from '../game/state'
import { useUiUrl } from './CmdButton'
import { useFrameStyle } from './DsFrame'
import StatusIcon from './StatusIcon'
import BattleBackdrop from './BattleBackdrop'
import type { BattleLayout } from '../rom/battleScene'
import MonSprite, { preloadPixel } from './MonSprite'
import { CommandScreen, MoveScreen, dsScale } from './DsMenu'
import BagScreen from './BagScreen'
import { Dex } from '@pkmn/sim'
import { music } from '../audio/music'
import { warmAnim } from './AnimSprite'
import { MoveFx, FX_NAMES } from './moveFx'

export type BattleKind = 'wild' | 'trainer' | 'gym'
export type BattleOutcome = 'win' | 'lose' | 'caught' | 'ran'

interface Props {
  trainer: Trainer
  foeTeam: Mon[]
  kind: BattleKind
  foeName?: string
  onEnd: (outcome: BattleOutcome, trainer: Trainer) => void
}

interface Side { uid: string; species: string; level: number; hp: number; maxHp: number; shiny: boolean; fainted: boolean; status?: string }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** The HP box of Pokémon Black 2 / White 2 made from the game's own pieces: a name bar, an HP strip (and an EXP strip for yours) with the gauge on it. */
function HpBox({ side, mine, exp }: { side: Side; mine: boolean; exp?: number }) {
  const nameBar = useUiUrl(mine ? 'hp:nameme' : 'hp:namefoe')
  const strip = useUiUrl(mine ? 'hp:stripme' : 'hp:stripfoe')
  // DS pixels -> screen pixels: the box must fit beside the command screen on wide windows, above it on narrow ones
  const room = window.innerWidth >= 1000 ? (window.innerWidth - 400) / 2 : window.innerWidth
  const K = Math.max(1.6, Math.min(3, Math.floor((room - 16) / 136)))
  const frac = side.maxHp > 0 ? Math.max(0, Math.min(1, side.hp / side.maxHp)) : 0
  const fill = frac > 0.5 ? ['#00ff4a', '#00bd21'] : frac > 0.2 ? ['#ffad00', '#a58429'] : ['#ff4273', '#a54a5a']
  const lo = side.level ** 3, hi = (side.level + 1) ** 3
  const expFrac = exp === undefined ? 0 : Math.max(0, Math.min(1, (exp - lo) / Math.max(1, hi - lo)))
  const u = (n: number) => n * K
  // positions in DS pixels: the name bar on top, the strip below it (yours starts further left)
  const stripX = mine ? 8 : 14, stripY = 12
  // the "HP" label of the strip ends at column 36 (yours: 48) of the strip picture: the gauge starts after it, the EXP bar after the "EXP" label (ends at column 33)
  const gx = stripX + (mine ? 50 : 38), gy = stripY + 2, gw = mine ? 66 : 64
  const text: React.CSSProperties = { position: 'absolute', color: '#101010', fontWeight: 700, lineHeight: 1, fontSize: u(8), whiteSpace: 'nowrap', textShadow: '0 1px 0 rgba(255,255,255,.35)' }
  return (
    <div className={`hp2 ${mine ? 'mine' : 'foe'}`} style={{ width: u(136), height: u(mine ? 40 : 26) }}>
      {nameBar && <img src={nameBar} alt="" draggable={false} style={{ position: 'absolute', left: 0, top: 0, width: u(136), height: u(14), imageRendering: 'pixelated' }} />}
      {strip && <img src={strip} alt="" draggable={false} style={{ position: 'absolute', left: u(stripX), top: u(stripY), width: u(mine ? 124 : 112), height: u(mine ? 16 : 12), imageRendering: 'pixelated' }} />}
      <span style={{ ...text, left: u(mine ? 12 : 6), top: u(3) }}>{side.species}</span>
      <span style={{ ...text, right: u(mine ? 6 : 14), top: u(3) }}>Lv{side.level}</span>
      {/* the HP gauge: a dark track with the fill on it */}
      <div style={{ position: 'absolute', left: u(gx), top: u(gy), width: u(gw), height: u(4), background: '#212121', boxShadow: '0 0 0 1px #000' }}>
        <div style={{ position: 'absolute', left: 0, top: u(1), height: u(1), width: `${frac * 100}%`, background: fill[0], transition: 'width .5s ease' }} />
        <div style={{ position: 'absolute', left: 0, top: u(2), height: u(1), width: `${frac * 100}%`, background: fill[1], transition: 'width .5s ease' }} />
      </div>
      {mine && (
        <div style={{ position: 'absolute', left: u(stripX + 36), top: u(stripY + 10), width: u(80), height: u(3), background: '#212121', boxShadow: '0 0 0 1px #000' }}>
          <div style={{ position: 'absolute', left: 0, top: u(1), height: u(1), width: `${expFrac * 100}%`, background: '#38b6f5', transition: 'width .5s ease' }} />
        </div>
      )}
      {mine && <span style={{ ...text, right: u(8), top: u(29), color: '#fff', textShadow: '1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000' }}>{Math.max(0, side.hp)}/{side.maxHp}</span>}
      <div style={{ position: 'absolute', right: u(mine ? 14 : 22), top: u(stripY) }}><StatusIcon status={side.fainted ? 'fnt' : side.status} scale={K / 1.5} /></div>
    </div>
  )
}

export default function BattleScreen({ trainer, foeTeam, kind, foeName, onEnd }: Props) {
  const playerTeam = useMemo(() => trainer.team.filter((m) => m.hp > 0).map((m) => ({ ...m, evs: { ...m.evs }, ivs: { ...m.ivs }, moves: [...m.moves] })), [])
  const foeCopies = useMemo(() => foeTeam.map((m) => ({ ...m, evs: { ...m.evs }, ivs: { ...m.ivs }, moves: [...m.moves] })), [])
  const [me, setMe] = useState<Side | null>(null)
  const [foe, setFoe] = useState<Side | null>(null)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'wait' | 'menu' | 'fight' | 'switch' | 'bag' | 'done'>('wait')
  const S = dsScale()
  const [req, setReq] = useState<Request | null>(null)
  const sessionRef = useRef<BattleSession | null>(null)
  const queue = useRef<BattleEvent[]>([])
  const pumping = useRef(false)
  const reqRef = useRef<Request | null>(null)
  const endedRef = useRef(false)
  const bagRef = useRef(trainer.bag)
  const [bag, setBagState] = useState(trainer.bag)
  const setBag = (b: Record<string, number>) => { bagRef.current = b; setBagState(b) }
  const caughtRef = useRef<Mon | null>(null)
  const ranRef = useRef(false)
  const [shake, setShake] = useState<'me' | 'foe' | null>(null)
  const [lunge, setLunge] = useState<'me' | 'foe' | null>(null)
  const shadowFor = (species: string) => Math.max(0.6, Math.min(1.25, 0.55 + 0.25 * Math.sqrt(Dex.species.get(species).heightm || 1)))
  const [layout, setLayoutState] = useState<BattleLayout | null>(null)
  const layoutRef = useRef<BattleLayout | null>(null)
  const setLayout = (l: BattleLayout) => { layoutRef.current = l; setLayoutState(l) }
  const fxCanvas = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<MoveFx | null>(null)
  const textFrame = useFrameStyle('dark', 2)
  const environment = 'grass'
  const [ball, setBall] = useState<null | { shakes: number }>(null)
  const legendaryNames = useMemo(() => new Set(allSpecies().filter((s) => s.legendary).map((s) => s.name)), [])

  const teamRef = useRef(playerTeam)
  const hpOf = useRef<Record<string, number>>({})

  const showMenuIfReady = () => {
    if (endedRef.current) return
    const r = reqRef.current
    if (r && !r.wait) {
      reqRef.current = null
      setReq(r)
      setMode(r.forceSwitch ? 'switch' : 'menu')
      setText(r.forceSwitch ? 'Choose your next Pokémon.' : `What will ${r.bench.find((b) => b.active)?.species ?? 'your Pokémon'} do?`)
    }
  }

  const pump = async () => {
    if (pumping.current) return
    pumping.current = true
    while (queue.current.length) {
      const ev = queue.current.shift()!
      switch (ev.kind) {
        case 'text':
          if (/super effective/i.test(ev.text)) void music.playSfx('se:hitStrong')
          else if (/not very effective/i.test(ev.text)) void music.playSfx('se:hitWeak')
          setText(ev.text); await sleep(950); break
        case 'switch': {
          const s: Side = { uid: ev.uid, species: ev.species, level: ev.level, hp: ev.hp, maxHp: ev.maxHp, shiny: ev.shiny, fainted: false }
          if (ev.side === 'p1') setMe(s); else setFoe(s)
          hpOf.current[ev.uid] = ev.hp
          void music.cry(dexNum(ev.species))
          await sleep(500)
          break
        }
        case 'hp': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, hp: ev.hp, maxHp: ev.hp === 0 ? s.maxHp : ev.maxHp, status: ev.status ?? s.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          if (ev.uid in hpOf.current && ev.hp < hpOf.current[ev.uid]) void music.playSfx('se:hit')
          else if (ev.uid in hpOf.current && ev.hp > hpOf.current[ev.uid]) void music.playSfx('se:heal')
          hpOf.current[ev.uid] = ev.hp
          await sleep(550)
          break
        }
        case 'status': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, status: ev.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          break
        }
        case 'move': {
          const num = Dex.moves.get(ev.move).num
          if (num) void music.playSfx(`mv:${num}`)
          const mv = Dex.moves.get(ev.move)
          const L = layoutRef.current, fx = fxRef.current
          const contact = mv.category === 'Physical' && !!mv.flags.contact
          const selfT = mv.target === 'self' || mv.target === 'allySide' || mv.target === 'allies' || mv.target === 'adjacentAllyOrSelf'
          const hitSide = ev.side === 'p1' ? 'foe' : 'me'
          if (contact) { setLunge(ev.side === 'p1' ? 'me' : 'foe'); await sleep(130) }
          if (fx?.ready && L) {
            const centre = (a: { x: number; y: number; w: number }) => ({ x: a.x, y: a.y + a.w * 0.1 - a.w * 0.38 })
            const from = ev.side === 'p1' ? L.me : L.foe, to = ev.side === 'p1' ? L.foe : L.me
            await fx.play({ type: mv.type, category: mv.category as 'Physical' | 'Special' | 'Status', contact, name: mv.name, selfTarget: selfT }, centre(from), centre(to), to.w * 0.85)
          } else if (!contact) await sleep(260)
          setLunge(null)
          if (mv.category !== 'Status') { setShake(hitSide); await sleep(280); setShake(null) } else await sleep(350)
          await sleep(fx?.ready ? 350 : 0)
          break
        }
        case 'faint': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, fainted: true, hp: 0 } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          void music.playSfx('se:faint')
          await sleep(700)
          break
        }
        case 'win': endedRef.current = true; await finish(ev.side); break
        default: break
      }
    }
    pumping.current = false
    showMenuIfReady()
  }

  // the move-effect player (pictures from the game file)
  useEffect(() => {
    const c = fxCanvas.current
    if (!c) return
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight }
    size()
    window.addEventListener('resize', size)
    const fx = new MoveFx(c)
    fxRef.current = fx
    if (import.meta.env.DEV) (window as unknown as { __fx?: MoveFx }).__fx = fx // developer hook for testing the effects
    void fx.load(FX_NAMES)
    return () => { window.removeEventListener('resize', size); fx.stop(); fxRef.current = null }
  }, [])

  // ---------------------------------------------------------------- start the battle
  useEffect(() => {
    // (React may run this effect twice while developing: start from a clean slate each time)
    endedRef.current = false
    queue.current = []
    pumping.current = false
    reqRef.current = null
    let cancelled = false
    let s: BattleSession | null = null
    // first get the pictures of the Pokémon ready (so they do not pop up late), but never wait longer than 3 seconds
    const prepare = async () => {
      const mine = playerTeam[0], theirs = foeCopies[0]
      const jobs: Array<Promise<unknown>> = []
      for (const [m, back] of [[mine, true], [theirs, false]] as const) {
        if (!m) continue
        const d = dexNum(m.species)
        jobs.push(d > 0 && d <= 649 ? warmAnim(m.species, back, !!m.shiny) : Promise.resolve(preloadPixel(m.species, back, !!m.shiny)))
      }
      for (const m of foeCopies.slice(1)) { const d = dexNum(m.species); if (d > 649) preloadPixel(m.species, false, !!m.shiny) }
      await Promise.race([Promise.all(jobs), sleep(3000)])
    }
    if (kind !== 'wild') setText(`${foeName ?? 'A trainer'} wants to battle!`)
    void prepare().then(() => {
      if (cancelled) return
      s = new BattleSession(playerTeam, foeCopies)
      s.isTrainerBattle = kind !== 'wild'
      sessionRef.current = s
      s.onEvents((evs) => { queue.current.push(...evs); void pump() })
      s.onRequest((r) => {
        reqRef.current = r
        if (!pumping.current && queue.current.length === 0) showMenuIfReady()
      })
      s.start()
    })
    return () => { cancelled = true; endedRef.current = true; s?.destroy() }
  }, [])

  // ---------------------------------------------------------------- after the battle
  const finish = async (winner: 'p1' | 'p2' | null) => {
    const s = sessionRef.current!
    s.syncBack()
    setMode('done')
    let t: Trainer = { ...trainer, bag: bagRef.current }
    const team = t.team.map((m) => playerTeam.find((p) => p.uid === m.uid) ?? m)
    let working = team.map((m) => ({ ...m }))
    const hasShare = (t.bag['Exp Share'] ?? 0) > 0

    if (winner === 'p1') {
      music.stop()
      void music.playSfx('win')
      for (const d of s.defeated) {
        const alive = working.filter((m) => m.hp > 0)
        for (let i = 0; i < working.length; i++) {
          const m = working[i]
          const took = d.by.includes(m.uid) && m.hp > 0
          if (!took && !(hasShare && m.hp > 0)) continue
          const share = took ? (hasShare || alive.length > 1 ? 1 : 1) : 0.5
          let upd = addEvs(m, evYield(d.foe.species))
          const amount = expGain(d.foe.species, d.foe.level, kind !== 'wild', share)
          const res = await gainExp(upd, amount)
          upd = res.mon
          setText(`${upd.species} gained ${amount} Exp. Points!`)
          await sleep(900)
          if (res.levelsGained > 0) {
            void music.playSfx('se:lvup')
            setText(`${upd.species} grew to Lv. ${upd.level}!`)
            await sleep(1100)
            for (const mv of res.newMoves) {
              if (upd.moves.length < 4) {
                upd = { ...upd, moves: [...upd.moves, mv] }
                setText(`${upd.species} learned ${mv}!`)
                await sleep(1000)
              } else {
                const forget = await askForget(upd, mv)
                if (forget !== null) upd = { ...upd, moves: upd.moves.map((x, k) => (k === forget ? mv : x)) }
              }
            }
            const to = levelEvolution(upd)
            if (to) {
              setText(`What? ${upd.species} is evolving!`)
              await sleep(1300)
              const from = upd.species
              upd = evolve(upd, to)
              setText(`${from} evolved into ${to}!`)
              await sleep(1500)
            }
          }
          working[i] = upd
        }
      }
    }
    t = { ...t, team: working }
    const outcome: BattleOutcome = caughtRef.current ? 'caught' : ranRef.current ? 'ran' : winner === 'p1' ? 'win' : 'lose'
    if (caughtRef.current) {
      const c = caughtRef.current
      const legends = t.team.filter((m) => legendaryNames.has(m.species)).length
      const isLeg = legendaryNames.has(c.species)
      if (t.team.length < 6 && !(isLeg && legends >= 2)) t = { ...t, team: [...t.team, c] }
      else t = { ...t, pc: [...t.pc, c] }
    }
    if (outcome === 'win') setText(kind === 'wild' ? 'You won!' : `You defeated ${foeName ?? 'the trainer'}!`)
    if (outcome === 'lose') setText('You have no Pokémon left that can fight...')
    await sleep(1200)
    onEnd(outcome, t)
  }

  // learning a move with a full set: ask the player
  const [learn, setLearn] = useState<null | { mon: Mon; move: string; resolve: (i: number | null) => void }>(null)
  const askForget = (mon: Mon, move: string) => new Promise<number | null>((resolve) => setLearn({ mon, move, resolve }))

  // ---------------------------------------------------------------- the player's actions
  const act = (fn: () => void) => { setMode('wait'); setReq(null); fn() }
  const s = () => sessionRef.current!
  const activeMon = me ? teamRef.current.find((m) => m.uid === me.uid) : undefined

  const doMove = (i: number) => act(() => s().chooseMove(i + 1))
  const doSwitch = (uid: string) => act(() => s().chooseSwitch(uid))

  const doRun = () => {
    if (kind !== 'wild') return
    const mine = activeMon ? statsOf(activeMon).spe : 10
    const theirs = foeCopies[0] ? statsOf(foeCopies[0]).spe : 10
    const ok = mine >= theirs || Math.random() < 0.55
    setMode('wait'); setReq(null)
    if (ok) {
      void music.playSfx('se:run')
      ranRef.current = true
      endedRef.current = true
      setText('Got away safely!')
      void (async () => { await sleep(900); s().syncBack(); onEnd('ran', { ...trainer, bag: bagRef.current, team: trainer.team.map((m) => teamRef.current.find((p) => p.uid === m.uid) ?? m) }) })()
    } else {
      setText("You couldn't get away!")
      void sleep(700).then(() => s().passTurn())
    }
  }

  const throwBall = (id: string) => {
    const def = ITEMS[id]
    const foeMon = foeCopies[0]
    const live = s().foeActive
    if (!foeMon || !live) return
    setBag(useItemFromBag(bagRef.current, id))
    setMode('wait'); setReq(null)
    const target = { ...foeMon, hp: live.hp }
    const isLeg = legendaryNames.has(foeMon.species)
    const res = rollCatch(target, def.ballBonus ?? 1, isLeg, Math.random)
    void (async () => {
      setText(`You threw a ${def.name}!`)
      void music.playSfx('se:throw')
      setBall({ shakes: 0 })
      await sleep(900)
      for (let i = 0; i < res.shakes; i++) {
        setBall({ shakes: i + 1 })
        void music.playSfx('se:shake')
        setText('.'.repeat(i + 1))
        await sleep(800)
      }
      if (res.caught) {
        setBall(null)
        setText(`Gotcha! ${foeMon.species} was caught!`)
        music.stop()
        void music.playSfx('caught')
        caughtRef.current = { ...foeMon, hp: Math.max(1, live.hp), uid: foeMon.uid }
        endedRef.current = true
        s().syncBack()
        await sleep(1300)
        const t: Trainer = { ...trainer, bag: bagRef.current, team: trainer.team.map((m) => teamRef.current.find((p) => p.uid === m.uid) ?? m) }
        // no experience for a catch in this version; the Pokémon joins your team
        const c = caughtRef.current
        const legends = t.team.filter((m) => legendaryNames.has(m.species)).length
        const toPc = t.team.length >= 6 || (legendaryNames.has(c.species) && legends >= 2)
        onEnd('caught', toPc ? { ...t, pc: [...t.pc, c] } : { ...t, team: [...t.team, c] })
      } else {
        setBall(null)
        setText(res.shakes === 0 ? 'Oh no! The Pokémon broke free!' : res.shakes === 1 ? 'Aww! It appeared to be caught!' : 'Argh! Almost had it!')
        await sleep(1000)
        s().passTurn()
      }
    })()
  }

  const usePotion = (id: string) => {
    const def = ITEMS[id]
    const healed = s().healActive(def.heal ?? 0)
    if (!healed) return
    setBag(useItemFromBag(bagRef.current, id))
    setMe((m) => (m ? { ...m, hp: healed.hp } : m))
    // keep our own record in step
    const rec = teamRef.current.find((p) => p.uid === healed.uid)
    if (rec) rec.hp = healed.hp
    setMode('wait'); setReq(null)
    setText(`You used a ${def.name}!`)
    void sleep(900).then(() => s().passTurn())
  }

  return (
    <div className="fullscreen battle" style={{ ["--menu-h" as string]: `${192 * S}px` }}>
      <div className={`stage-cam ${mode === 'fight' ? 'zoom' : ''}`}>
      <BattleBackdrop env={environment} onLayout={setLayout} />
      <canvas ref={fxCanvas} className="fx-canvas" />


      {layout && foe && (
        <>
          <div className="stage-shadow" style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.03, width: layout.foe.w * 0.78 * shadowFor(foe.species) }} />
          <div className={`stage-sprite ${shake === 'foe' ? 'hit' : ''} ${foe.fainted ? 'fainted' : ''} ${lunge === 'foe' ? 'lunge-foe' : ''}`} style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.1, width: layout.foe.w }}>
            {!ball && <MonSprite species={foe.species} shiny={foe.shiny} scale={(layout.foe.w * 1.05) / 76.8} platform={layout.foe.w} animated />}
            {ball && <div className={`ball shake-${ball.shakes}`} />}
          </div>
        </>
      )}
      {layout && me && (
        <>
          <div className="stage-shadow" style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.03, width: layout.me.w * 0.78 * shadowFor(me.species) }} />
          <div className={`stage-sprite ${shake === 'me' ? 'hit' : ''} ${me.fainted ? 'fainted' : ''} ${lunge === 'me' ? 'lunge-me' : ''}`} style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.1, width: layout.me.w }}>
            <MonSprite species={me.species} back shiny={me.shiny} scale={(layout.me.w * 0.92) / 76.8} platform={layout.me.w} animated />
          </div>
        </>
      )}
      </div>
      <div className="foe-zone">
        {foe && <HpBox side={foe} mine={false} />}
      </div>
      <div className="me-zone">
        {me && <HpBox side={me} mine exp={teamRef.current.find((m) => m.uid === me.uid)?.exp} />}
      </div>
      <div className="battle-bottom">
        <div className="panel battle-text" style={textFrame ?? undefined}>{text}</div>

        {mode === 'menu' && req && (
          <CommandScreen
            S={S}
            onFight={() => setMode('fight')}
            onBag={() => setMode('bag')}
            onPokemon={() => setMode('switch')}
            onRun={doRun}
            pokemonOff={req.trapped || req.bench.filter((b) => !b.fainted && !b.active).length === 0}
            runOff={kind !== 'wild'}
          />
        )}

        {mode === 'fight' && req && (
          <MoveScreen S={S} moves={req.moves} onMove={doMove} onBack={() => setMode('menu')} />
        )}

        {mode === 'switch' && req && (
          <div className="panel battle-menu list">
            {req.bench.map((b) => (
              <button key={b.uid} disabled={b.fainted || b.active} onClick={() => doSwitch(b.uid)}>
                <span>{b.species} Lv{b.level}</span>
                <small>{b.hp}/{b.maxHp}{b.fainted ? ' · fainted' : b.active ? ' · in battle' : ''}</small>
              </button>
            ))}
            {!req.forceSwitch && <button className="back" onClick={() => setMode('menu')}>Back</button>}
          </div>
        )}

        {mode === 'bag' && req && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }}>
            <div style={{ background: '#0c0c10', padding: 8, borderRadius: 10 }}>
              <BagScreen
                bag={bag}
                pockets={kind === 'wild' ? [1, 2] : [1]}
                only={(d) => (d.kind === 'ball' && kind === 'wild') || d.kind === 'heal'}
                canUse={(d) => (d.kind === 'ball' && kind === 'wild') || d.kind === 'heal'}
                onUse={(id) => { setMode('wait'); if (ITEMS[id].kind === 'ball') throwBall(id); else usePotion(id) }}
                onClose={() => setMode('menu')}
                describe={(d) => (d.kind === 'ball' && foeCopies[0] && s().foeActive ? `Catch chance about ${Math.round(catchChance({ ...foeCopies[0], hp: s().foeActive!.hp }, d.ballBonus ?? 1, legendaryNames.has(foeCopies[0].species)) * 100)}%.` : null)}
              />
            </div>
          </div>
        )}
      </div>

      {learn && (
        <div className="modal-backdrop">
          <div className="panel modal">
            <h2>{learn.mon.species} wants to learn {learn.move}</h2>
            <p className="sub">But it already knows 4 moves. Forget one?</p>
            {learn.mon.moves.map((m, i) => (
              <button key={m} onClick={() => { learn.resolve(i); setLearn(null) }}>Forget {m}</button>
            ))}
            <button className="primary" onClick={() => { learn.resolve(null); setLearn(null) }}>Don't learn {learn.move}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export { maxHp, healMon }
