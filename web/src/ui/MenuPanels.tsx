import { useMemo, useState } from 'react'
import {
  NATURES, STAT_NAMES, allSpecies, maxHp, moveInfo, type Mon,
} from '../data/dex'
import { ITEMS } from '../data/items'
import {
  evolve, healMon, rareCandy, reviveMon, stoneEvolution, useItemFromBag, useVitamin, type Trainer,
} from '../game/state'
import { MonIcon } from './MonSprite'
import { DsScreen, DsText, dsK } from './DsScreen'
import PartyScreen from './PartyScreen'
import SummaryCard from './SummaryCard'
import BagScreen from './BagScreen'
import { useUiUrl } from './CmdButton'
import { music } from '../audio/music'

interface PanelProps {
  trainer: Trainer
  setTrainer: (t: Trainer) => void
  onClose: () => void
  onMessage: (text: string) => void
}

// ---------------------------------------------------------------- summary (stats, moves, evolution)
export function Summary({ mon, onChange, onBack, onClose, footer }: { mon: Mon; onChange?: (m: Mon) => void; onBack: () => void; onClose?: () => void; footer?: React.ReactNode }) {
  return <SummaryCard mon={mon} onChange={onChange} onBack={onBack} onClose={onClose} footer={footer} />
}

/** Right after a catch: the new Pokémon's summary. */
export function CaughtPanel({ mon, onClose }: { mon: Mon; onClose: () => void }) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="sx-modal" onClick={(e) => e.stopPropagation()}>
        <Summary mon={mon} onBack={onClose} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- team
export function TeamPanel({ trainer, setTrainer, onClose, initial }: PanelProps & { initial?: number | null }) {
  const [sel, setSel] = useState<number | null>(initial ?? null)
  const mon = sel !== null ? trainer.team[sel] : null
  const setMon = (i: number, m: Mon) => setTrainer({ ...trainer, team: trainer.team.map((x, k) => (k === i ? m : x)) })
  const swap = (a: number, b: number) => {
    if (b < 0 || b >= trainer.team.length) return
    const team = [...trainer.team]
    ;[team[a], team[b]] = [team[b], team[a]]
    setTrainer({ ...trainer, team })
    setSel(b)
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={mon && sel !== null ? 'sx-modal' : ''} style={mon && sel !== null ? undefined : { background: '#0c0c10', padding: 8, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }} onClick={(e) => e.stopPropagation()}>
        {mon && sel !== null ? (
          <>
            <Summary
              mon={mon} onChange={(m) => setMon(sel, m)} onBack={() => (initial != null ? onClose() : setSel(null))} onClose={onClose}
              footer={<>
                <button className="sx-btn ghost" onClick={() => swap(sel, sel - 1)} disabled={sel === 0}>↑</button>
                <button className="sx-btn ghost" onClick={() => swap(sel, sel + 1)} disabled={sel >= trainer.team.length - 1}>↓</button>
              </>}
            />
          </>
        ) : (
          <>
            <PartyScreen team={trainer.team} onPick={setSel} onClose={onClose} />
            {trainer.team.length === 0 && <span className="muted">No Pokémon yet.</span>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- bag
export function BagPanel({ trainer, setTrainer, onClose, onMessage }: PanelProps) {
  const [itemId, setItemId] = useState<string | null>(null)
  const apply = (idx: number) => {
    if (!itemId) return
    const def = ITEMS[itemId]
    const m = trainer.team[idx]
    let upd: Mon | null = null
    let msg = ''
    if (def.kind === 'heal') {
      if (m.hp <= 0 || m.hp >= maxHp(m)) { onMessage('It would have no effect.'); return }
      upd = healMon(m, def.heal ?? 0); msg = `${m.species} was healed.`; void music.heal()
    } else if (def.kind === 'revive') {
      if (m.hp > 0) { onMessage('It would have no effect.'); return }
      upd = reviveMon(m, def.heal ?? 0.5); msg = `${m.species} was revived!`; void music.heal()
    } else if (def.kind === 'vitamin') {
      const r = useVitamin(m, def.stat!)
      if (!r) { onMessage('It would have no effect.'); return }
      upd = r; msg = `${m.species}'s ${STAT_NAMES[def.stat!]} EVs went up!`
    } else if (def.kind === 'pp') {
      // Elixir: 10 PP back for every move (a move's most is its own PP, like in the games without PP Ups)
      const most = m.moves.map((mv) => moveInfo(mv).pp)
      const now = m.moves.map((_, i) => m.pp?.[i] ?? most[i])
      if (now.every((v, i) => v >= most[i])) { onMessage('It would have no effect.'); return }
      upd = { ...m, pp: now.map((v, i) => Math.min(most[i], v + 10)) }; msg = `${m.species}'s moves got their PP back!`
    } else if (def.kind === 'candy') {
      if (m.level >= 100) { onMessage('It would have no effect.'); return }
      upd = rareCandy(m); msg = `${m.species} grew to level ${upd.level}!`
    } else if (def.kind === 'stone') {
      const to = stoneEvolution(m, def.id)
      if (!to) { onMessage('It would have no effect.'); return }
      upd = evolve(m, to); msg = `${m.species} evolved into ${to}!`
    } else if (def.kind === 'held') {
      let bag = useItemFromBag(trainer.bag, itemId)
      if (m.item) bag = { ...bag, [m.item]: (bag[m.item] ?? 0) + 1 }
      const team = trainer.team.map((x, k) => (k === idx ? { ...x, item: def.id } : x))
      setTrainer({ ...trainer, team, bag })
      onMessage(`${m.species} is now holding ${def.name}.`)
      setItemId(null)
      return
    } else return
    setTrainer({ ...trainer, bag: useItemFromBag(trainer.bag, itemId), team: trainer.team.map((x, k) => (k === idx ? upd! : x)) })
    onMessage(msg)
    if (!(trainer.bag[itemId] > 1)) setItemId(null)
  }

  const needsTarget = (id: string) => ['heal', 'revive', 'vitamin', 'candy', 'stone', 'held', 'pp'].includes(ITEMS[id].kind)

  const K = dsK(3)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bag-frame" onClick={(e) => e.stopPropagation()} style={{ background: '#0c0c10', padding: 8, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }}>
        {!itemId ? (
          <BagScreen bag={trainer.bag} canUse={(d) => needsTarget(d.id)} onUse={(id) => setItemId(id)} onClose={onClose} />
        ) : (
          <DsScreen bg="bag:blue" K={K}>
            <DsText x={8} y={6} K={K}>Use {ITEMS[itemId].name} on…</DsText>
            <div style={{ position: 'absolute', left: 6 * K, top: 22 * K, width: 234 * K, height: 130 * K, overflowY: 'auto' }}>
              {trainer.team.map((m, i) => (
                <button key={m.uid} onClick={() => apply(i)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: 26 * K, marginBottom: 2 * K, padding: `0 ${6 * K}px`, border: 'none', borderRadius: 3 * K, cursor: 'pointer', background: 'rgba(0,0,0,.42)', color: m.hp <= 0 ? '#aaa' : '#fff', fontWeight: 700, fontSize: 8 * K, textAlign: 'left', gap: 6 * K }}>
                  <MonIcon species={m.species} shiny={m.shiny} size={22 * K} /><span style={{ flex: 1 }}>{m.species} Lv{m.level}{m.item ? ` · ${m.item}` : ''}</span><span>{m.hp}/{maxHp(m)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setItemId(null)} style={{ position: 'absolute', left: 206 * K, top: 172 * K, width: 44 * K, height: 15 * K, border: 'none', borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 8 * K, background: 'rgba(255,255,255,.88)', color: '#222' }}>Back</button>
          </DsScreen>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- PC
export function PcPanel({ trainer, setTrainer, onClose, onMessage }: PanelProps) {
  const legendaryNames = useMemo(() => new Set(allSpecies().filter((s) => s.legendary).map((s) => s.name)), [])
  const legends = trainer.team.filter((m) => legendaryNames.has(m.species)).length
  const toTeam = (i: number) => {
    const m = trainer.pc[i]
    if (trainer.team.length >= 6) { onMessage('Your team is full.'); return }
    if (legendaryNames.has(m.species) && legends >= 2) { onMessage('You cannot carry more than 2 legendary Pokémon.'); return }
    setTrainer({ ...trainer, team: [...trainer.team, m], pc: trainer.pc.filter((_, k) => k !== i) })
  }
  const toPc = (i: number) => {
    if (trainer.team.length <= 1) { onMessage('You need at least one Pokémon on your team.'); return }
    setTrainer({ ...trainer, pc: [...trainer.pc, trainer.team[i]], team: trainer.team.filter((_, k) => k !== i) })
  }
  const [box, setBox] = useState(0)
  const K = Math.max(1, Math.min(3, Math.floor((window.innerHeight - 120) / 160), Math.floor((window.innerWidth - 260) / 168)))
  const boxes = Math.max(1, Math.ceil((trainer.pc.length + 1) / 30))
  const wall = useUiUrl(`screen:pc:${box % 24}`)
  const first = box * 30
  const slots = Array.from({ length: 30 }, (_, i) => trainer.pc[first + i] ?? null)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0c0c10', padding: 10, borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '96vw' }}>
        {/* the box, on the game's own box wallpaper */}
        <div style={{ position: 'relative', width: 168 * K, height: 160 * K, background: wall ? `url(${wall}) 0 0 / 100% 100% no-repeat` : '#2a3a2a', imageRendering: 'pixelated', borderRadius: 4 }}>
          <button onClick={() => setBox((b) => (b + boxes - 1) % boxes)} style={{ position: 'absolute', left: 4 * K, top: 8 * K, width: 14 * K, height: 16 * K, border: 'none', background: 'rgba(0,0,0,.35)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 9 * K }}>‹</button>
          <button onClick={() => setBox((b) => (b + 1) % boxes)} style={{ position: 'absolute', left: 150 * K, top: 8 * K, width: 14 * K, height: 16 * K, border: 'none', background: 'rgba(0,0,0,.35)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 9 * K }}>›</button>
          <span style={{ position: 'absolute', left: 20 * K, top: 12 * K, width: 128 * K, textAlign: 'center', color: '#fff', fontWeight: 700, fontSize: 9 * K, lineHeight: 1, textShadow: '1px 1px 0 rgba(0,0,0,.7)' }}>BOX {box + 1}</span>
          {slots.map((m, i) => (
            <button key={i} disabled={!m} onClick={() => m && toTeam(first + i)} title={m ? `${m.species} Lv${m.level}` : ''} style={{ position: 'absolute', left: (8 + (i % 6) * 25) * K, top: (37 + Math.floor(i / 6) * 23) * K, width: 25 * K, height: 23 * K, border: 'none', background: 'transparent', padding: 0, cursor: m ? 'pointer' : 'default' }}>
              {m && <MonIcon species={m.species} shiny={m.shiny} size={26 * K} />}
            </button>
          ))}
        </div>
        {/* your team */}
        <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ color: '#fff' }}>Your team ({trainer.team.length}/6)</strong>
          <span className="muted" style={{ fontSize: 12 }}>Tap a Pokémon to swap it between the team and the box.</span>
          {trainer.team.map((m, i) => (
            <button key={m.uid} onClick={() => toPc(i)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4 }}>
              <MonIcon species={m.species} shiny={m.shiny} size={32} />
              <span style={{ fontSize: 13 }}><strong>{m.species}</strong><br /><small>Lv {m.level}</small></span>
            </button>
          ))}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export { NATURES }
