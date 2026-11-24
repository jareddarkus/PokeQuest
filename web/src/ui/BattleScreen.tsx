import { useEffect, useMemo, useRef, useState } from 'react'
import { BattleSession, type BattleEvent, type Request } from '../battle/engine'
import { allSpecies, maxHp, statsOf, type Mon } from '../data/dex'
import { ITEMS } from '../data/items'
import {
  addEvs, catchChance, evYield, evolve, expGain, gainExp, healMon, levelEvolution, rollCatch, useItemFromBag, type Trainer,
} from '../game/state'
import { TYPE_COLOR, type PType } from '../game/world'
import ItemIcon from './ItemIcon'
import MonSprite from './MonSprite'

export type BattleKind = 'wild' | 'trainer' | 'gym'
export type BattleOutcome = 'win' | 'lose' | 'caught' | 'ran'

interface Props {
  trainer: Trainer
  foeTeam: Mon[]
  kind: BattleKind
  foeName?: string
  onEnd: (outcome: BattleOutcome, trainer: Trainer) => void
}

interface Side { uid: string; species: string; level: number; hp: number; maxHp: number; shiny: boolean; fainted: boolean }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function hpColor(frac: number): string {
  return frac > 0.5 ? '#4cd964' : frac > 0.2 ? '#ffcc00' : '#ff3b30'
}

function HpBox({ side, mine }: { side: Side; mine: boolean }) {
  const frac = side.maxHp ? Math.max(0, side.hp / side.maxHp) : 0
  return (
    <div className={`hpbox panel ${mine ? 'mine' : 'foe'}`}>
      <div className="hpbox-top">
        <strong>{side.species}</strong>
        <span>Lv{side.level}</span>
      </div>
      <div className="hpbar"><div style={{ width: `${frac * 100}%`, background: hpColor(frac) }} /></div>
      {mine && <div className="hpnum">{Math.max(0, side.hp)} / {side.maxHp}</div>}
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
  const [ball, setBall] = useState<null | { shakes: number }>(null)
  const legendaryNames = useMemo(() => new Set(allSpecies().filter((s) => s.legendary).map((s) => s.name)), [])

  const teamRef = useRef(playerTeam)

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
        case 'text': setText(ev.text); await sleep(950); break
        case 'switch': {
          const s: Side = { uid: ev.uid, species: ev.species, level: ev.level, hp: ev.hp, maxHp: ev.maxHp, shiny: ev.shiny, fainted: false }
          if (ev.side === 'p1') setMe(s); else setFoe(s)
          await sleep(500)
          break
        }
        case 'hp': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, hp: ev.hp, maxHp: ev.hp === 0 ? s.maxHp : ev.maxHp } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          await sleep(550)
          break
        }
        case 'move': setShake(ev.side === 'p1' ? 'foe' : 'me'); await sleep(250); setShake(null); break
        case 'faint': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, fainted: true, hp: 0 } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
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

  // ---------------------------------------------------------------- start the battle
  useEffect(() => {
    // (React may run this effect twice while developing: start from a clean slate each time)
    endedRef.current = false
    queue.current = []
    pumping.current = false
    reqRef.current = null
    const s = new BattleSession(playerTeam, foeCopies)
    s.isTrainerBattle = kind !== 'wild'
    sessionRef.current = s
    s.onEvents((evs) => { queue.current.push(...evs); void pump() })
    s.onRequest((r) => {
      reqRef.current = r
      if (!pumping.current && queue.current.length === 0) showMenuIfReady()
    })
    if (kind !== 'wild') setText(`${foeName ?? 'A trainer'} wants to battle!`)
    s.start()
    return () => { endedRef.current = true; s.destroy() }
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
      setBall({ shakes: 0 })
      await sleep(900)
      for (let i = 0; i < res.shakes; i++) {
        setBall({ shakes: i + 1 })
        setText('.'.repeat(i + 1))
        await sleep(800)
      }
      if (res.caught) {
        setBall(null)
        setText(`Gotcha! ${foeMon.species} was caught!`)
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

  const bagList = Object.entries(bag).filter(([id]) => {
    const d = ITEMS[id]
    return d && ((d.kind === 'ball' && kind === 'wild') || d.kind === 'heal')
  })

  return (
    <div className="fullscreen battle">
      <div className="battle-sky" />
      <div className="battle-ground" />

      <div className="foe-zone">
        {foe && <HpBox side={foe} mine={false} />}
        <div className={`foe-sprite ${shake === 'foe' ? 'hit' : ''} ${foe?.fainted ? 'fainted' : ''}`}>
          {foe && !ball && <MonSprite species={foe.species} shiny={foe.shiny} scale={2.2} animated />}
          {ball && <div className={`ball shake-${ball.shakes}`} />}
        </div>
      </div>

      <div className="me-zone">
        <div className={`me-sprite ${shake === 'me' ? 'hit' : ''} ${me?.fainted ? 'fainted' : ''}`}>
          {me && <MonSprite species={me.species} back shiny={me.shiny} scale={2.6} animated />}
        </div>
        {me && <HpBox side={me} mine />}
      </div>

      <div className="battle-bottom">
        <div className="panel battle-text">{text}</div>

        {mode === 'menu' && req && (
          <div className="panel battle-menu">
            <button onClick={() => setMode('fight')}>Fight</button>
            <button onClick={() => setMode('bag')}>Bag</button>
            <button onClick={() => setMode('switch')} disabled={req.trapped || req.bench.filter((b) => !b.fainted && !b.active).length === 0}>Pokémon</button>
            <button onClick={doRun} disabled={kind !== 'wild'}>Run</button>
          </div>
        )}

        {mode === 'fight' && req && (
          <div className="panel battle-menu moves">
            {req.moves.map((mv, i) => (
              <button key={mv.id} disabled={mv.disabled || mv.pp === 0} onClick={() => doMove(i)}
                style={{ borderColor: TYPE_COLOR[mv.type as PType] ?? '#888', boxShadow: `inset 4px 0 0 ${TYPE_COLOR[mv.type as PType] ?? '#888'}` }}>
                <span>{mv.name}</span>
                <small>{mv.type} · {mv.pp}/{mv.maxpp}</small>
              </button>
            ))}
            <button className="back" onClick={() => setMode('menu')}>Back</button>
          </div>
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
          <div className="panel battle-menu list">
            {bagList.length === 0 && <span className="muted">Nothing useful here.</span>}
            {bagList.map(([id, n]) => (
              <button key={id} onClick={() => (ITEMS[id].kind === 'ball' ? throwBall(id) : usePotion(id))}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ItemIcon name={id} size={28} />{ITEMS[id].name} x{n}</span>
                <small>{ITEMS[id].kind === 'ball' && foeCopies[0] && s().foeActive ? `catch chance about ${Math.round(catchChance({ ...foeCopies[0], hp: s().foeActive!.hp }, ITEMS[id].ballBonus ?? 1, legendaryNames.has(foeCopies[0].species)) * 100)}%` : ITEMS[id].desc}</small>
              </button>
            ))}
            <button className="back" onClick={() => setMode('menu')}>Back</button>
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
