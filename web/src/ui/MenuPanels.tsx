import { useEffect, useMemo, useState } from 'react'
import {
  NATURES, STAT_IDS, STAT_NAMES, allSpecies, learnableMoves, maxHp, moveInfo, natureMods, speciesTypes, type Mon,
} from '../data/dex'
import { ITEMS, ITEM_LIST } from '../data/items'
import {
  evolve, healMon, rareCandy, reviveMon, stoneEvolution, useItemFromBag, useVitamin, type Trainer,
} from '../game/state'
import { TYPE_COLOR, type PType } from '../game/world'
import ItemIcon from './ItemIcon'
import MonSprite from './MonSprite'
import StatBars from './StatBars'

interface PanelProps {
  trainer: Trainer
  setTrainer: (t: Trainer) => void
  onClose: () => void
  onMessage: (text: string) => void
}

function HpLine({ m }: { m: Mon }) {
  const mx = maxHp(m)
  const frac = Math.max(0, m.hp / mx)
  return (
    <div className="hpline">
      <div className="hpbar small"><div style={{ width: `${frac * 100}%`, background: frac > 0.5 ? '#4cd964' : frac > 0.2 ? '#ffcc00' : '#ff3b30' }} /></div>
      <span>{m.hp}/{mx}</span>
    </div>
  )
}

function TypeChips({ species }: { species: string }) {
  return (
    <span className="chips">
      {speciesTypes(species).map((t) => (
        <span key={t} className="chip" style={{ background: TYPE_COLOR[t as PType] ?? '#777' }}>{t}</span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------- summary (stats, nature, ability, moves)
export function Summary({ mon, onChange, onBack }: { mon: Mon; onChange: (m: Mon) => void; onBack: () => void }) {
  const [pickFor, setPickFor] = useState<number | null>(null)
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    void learnableMoves(mon.species, mon.level).then(setOptions)
  }, [mon.species, mon.level])
  const nm = natureMods(mon.nature)
  const evTotal = STAT_IDS.reduce((a, s) => a + mon.evs[s], 0)

  return (
    <div className="summary">
      <div className="summary-head">
        <MonSprite species={mon.species} shiny={mon.shiny} scale={1.6} />
        <div>
          <h2>{mon.species}{mon.shiny ? ' ★' : ''}</h2>
          <div className="muted">Lv {mon.level} · {mon.gender === 'M' ? '♂' : mon.gender === 'F' ? '♀' : '—'} · Exp {mon.exp}</div>
          <TypeChips species={mon.species} />
          <HpLine m={mon} />
        </div>
      </div>

      <div className="summary-info">
        <div><span className="muted">Nature</span> <strong>{mon.nature}</strong>{nm.plus ? ` (+${STAT_NAMES[nm.plus]}, −${STAT_NAMES[nm.minus!]})` : ' (neutral)'}</div>
        <div><span className="muted">Ability</span> <strong>{mon.ability}</strong></div>
        <div><span className="muted">Held item</span> <strong>{mon.item || 'none'}</strong></div>
      </div>

      <StatBars mon={mon} />
      <div className="muted">Total EVs {evTotal} / 510</div>

      <h3>Moves (tap one to swap it)</h3>
      <div className="moves-list">
        {mon.moves.map((mv, i) => {
          const info = moveInfo(mv)
          return (
            <button key={mv + i} onClick={() => setPickFor(pickFor === i ? null : i)} style={{ boxShadow: `inset 4px 0 0 ${TYPE_COLOR[info.type as PType] ?? '#888'}` }}>
              <span>{mv}</span>
              <small>{info.type} · {info.category} · {info.power || '—'} power · {info.pp} PP</small>
            </button>
          )
        })}
      </div>
      {pickFor !== null && (
        <div className="pick-move">
          <h3>Replace {mon.moves[pickFor]} with…</h3>
          <div className="pick-grid">
            {options.filter((o) => !mon.moves.includes(o)).map((o) => {
              const info = moveInfo(o)
              return (
                <button
                  key={o}
                  onClick={() => { onChange({ ...mon, moves: mon.moves.map((x, k) => (k === pickFor ? o : x)) }); setPickFor(null) }}
                  style={{ boxShadow: `inset 4px 0 0 ${TYPE_COLOR[info.type as PType] ?? '#888'}` }}
                >
                  <span>{o}</span><small>{info.type} · {info.power || '—'}</small>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <button onClick={onBack}>Back</button>
    </div>
  )
}

// ---------------------------------------------------------------- team
export function TeamPanel({ trainer, setTrainer, onClose }: PanelProps) {
  const [sel, setSel] = useState<number | null>(null)
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
      <div className="panel modal wide" onClick={(e) => e.stopPropagation()}>
        {mon && sel !== null ? (
          <>
            <Summary mon={mon} onChange={(m) => setMon(sel, m)} onBack={() => setSel(null)} />
            <div className="btn-row">
              <button onClick={() => swap(sel, sel - 1)} disabled={sel === 0}>Move up</button>
              <button onClick={() => swap(sel, sel + 1)} disabled={sel >= trainer.team.length - 1}>Move down</button>
            </div>
          </>
        ) : (
          <>
            <h2>Your team</h2>
            <div className="mon-list">
              {trainer.team.map((m, i) => (
                <button key={m.uid} className={m.hp <= 0 ? 'fainted' : ''} onClick={() => setSel(i)}>
                  <MonSprite species={m.species} shiny={m.shiny} scale={0.9} className="mon-icon" />
                  <div>
                    <strong>{m.species}{m.shiny ? ' ★' : ''}</strong> <span className="muted">Lv {m.level}</span>
                    <HpLine m={m} />
                  </div>
                </button>
              ))}
              {trainer.team.length === 0 && <span className="muted">No Pokémon yet.</span>}
            </div>
            <button onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- bag
export function BagPanel({ trainer, setTrainer, onClose, onMessage }: PanelProps) {
  const [itemId, setItemId] = useState<string | null>(null)
  const entries = useMemo(
    () => ITEM_LIST.filter((i) => (trainer.bag[i.id] ?? 0) > 0),
    [trainer.bag],
  )

  const apply = (idx: number) => {
    if (!itemId) return
    const def = ITEMS[itemId]
    const m = trainer.team[idx]
    let upd: Mon | null = null
    let msg = ''
    if (def.kind === 'heal') {
      if (m.hp <= 0 || m.hp >= maxHp(m)) { onMessage('It would have no effect.'); return }
      upd = healMon(m, def.heal ?? 0); msg = `${m.species} was healed.`
    } else if (def.kind === 'revive') {
      if (m.hp > 0) { onMessage('It would have no effect.'); return }
      upd = reviveMon(m, def.heal ?? 0.5); msg = `${m.species} was revived!`
    } else if (def.kind === 'vitamin') {
      const r = useVitamin(m, def.stat!)
      if (!r) { onMessage('It would have no effect.'); return }
      upd = r; msg = `${m.species}'s ${STAT_NAMES[def.stat!]} EVs went up!`
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

  const needsTarget = (id: string) => ['heal', 'revive', 'vitamin', 'candy', 'stone', 'held'].includes(ITEMS[id].kind)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Bag</h2>
        {!itemId ? (
          <div className="item-list">
            {entries.length === 0 && <span className="muted">Your bag is empty. Look for Poké Balls on the ground!</span>}
            {entries.map((d) => (
              <button key={d.id} onClick={() => (needsTarget(d.id) ? setItemId(d.id) : onMessage(d.desc))}>
                <ItemIcon name={d.id} /><span>{d.name}</span><span className="muted">x{trainer.bag[d.id]}</span>
                <small>{d.desc}</small>
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="sub">Use {ITEMS[itemId].name} on…</p>
            <div className="mon-list">
              {trainer.team.map((m, i) => (
                <button key={m.uid} className={m.hp <= 0 ? 'fainted' : ''} onClick={() => apply(i)}>
                  <MonSprite species={m.species} shiny={m.shiny} scale={0.9} className="mon-icon" />
                  <div><strong>{m.species}</strong> <span className="muted">Lv {m.level}{m.item ? ` · ${m.item}` : ''}</span><HpLine m={m} /></div>
                </button>
              ))}
            </div>
            <button onClick={() => setItemId(null)}>Back</button>
          </>
        )}
        <button onClick={onClose}>Close</button>
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>PC</h2>
        <h3>Team ({trainer.team.length}/6) — tap to send to the PC</h3>
        <div className="mon-list">
          {trainer.team.map((m, i) => (
            <button key={m.uid} onClick={() => toPc(i)}>
              <MonSprite species={m.species} shiny={m.shiny} scale={0.9} className="mon-icon" />
              <div><strong>{m.species}</strong> <span className="muted">Lv {m.level}</span></div>
            </button>
          ))}
        </div>
        <h3>PC ({trainer.pc.length}) — tap to add to your team</h3>
        <div className="mon-list">
          {trainer.pc.length === 0 && <span className="muted">Empty.</span>}
          {trainer.pc.map((m, i) => (
            <button key={m.uid} onClick={() => toTeam(i)}>
              <MonSprite species={m.species} shiny={m.shiny} scale={0.9} className="mon-icon" />
              <div><strong>{m.species}</strong> <span className="muted">Lv {m.level}</span></div>
            </button>
          ))}
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export { NATURES }
