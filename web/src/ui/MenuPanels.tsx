import { useEffect, useMemo, useState } from 'react'
import {
  NATURES, STAT_IDS, STAT_NAMES, allSpecies, learnableMoves, maxHp, moveInfo, natureMods, speciesTypes, statsOf, type Mon,
} from '../data/dex'
import { ITEMS, ITEM_LIST } from '../data/items'
import {
  evolve, healMon, rareCandy, reviveMon, stoneEvolution, useItemFromBag, useVitamin, type Trainer,
} from '../game/state'
import { TYPE_COLOR, type PType } from '../game/world'
import HpBar from './HpBar'
import ItemIcon from './ItemIcon'
import MonSprite, { MonIcon } from './MonSprite'
import StatBars from './StatBars'
import TypePlate from './TypePlate'
import { DsScreen, DsText, dsK } from './DsScreen'

interface PanelProps {
  trainer: Trainer
  setTrainer: (t: Trainer) => void
  onClose: () => void
  onMessage: (text: string) => void
}

function HpLine({ m }: { m: Mon }) {
  const mx = maxHp(m)
  return (
    <div className="hpline">
      <HpBar hp={m.hp} max={mx} scale={2} />
      <span>{m.hp}/{mx}</span>
    </div>
  )
}
function TypeChips({ species }: { species: string }) {
  return (
    <span className="chips">
      {speciesTypes(species).map((t) => (
        <TypePlate key={t} type={t} scale={1.5} />
      ))}
    </span>
  )
}
/** The stats page drawn on the game's own summary background: labels on the black column (red = the nature raises it, blue = lowers it), numbers on the white panel. */
function StatsScreen({ mon }: { mon: Mon }) {
  const K = dsK(2)
  const st = statsOf(mon)
  const nm = natureMods(mon.nature)
  const lo = mon.level ** 3, hi = (mon.level + 1) ** 3
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <DsScreen bg="sum:stats" K={K}>
        {STAT_IDS.map((id, i) => (
          <div key={id}>
            <DsText x={14} y={9 + i * 14.6} K={K} color={nm.plus === id ? '#ff6a5a' : nm.minus === id ? '#6ab4ff' : '#fff'}>{STAT_NAMES[id]}</DsText>
            <DsText x={82} y={9 + i * 14.6} w={52} K={K} align="right" color="#181820">{id === 'hp' ? `${mon.hp}/${st.hp}` : st[id]}</DsText>
            <span style={{ position: 'absolute', left: 140 * K, top: (11 + i * 14.6) * K, width: Math.min(56, (st[id] / 400) * 56 + 4) * K, height: 3 * K, background: id === 'hp' ? '#2fdc5a' : '#4a90e0' }} />
          </div>
        ))}
        <DsText x={12} y={113} K={K} color="#181820">{mon.nature} nature</DsText>
        <DsText x={12} y={125} K={K}>{mon.ability}</DsText>
        <DsText x={60} y={158} w={100} K={K} color="#fff" size={7}>EXP {mon.exp}  next {Math.max(0, hi - mon.exp)}</DsText>
        <span style={{ position: 'absolute', left: 55 * K, top: 168 * K, width: 95 * K * Math.max(0, Math.min(1, (mon.exp - lo) / Math.max(1, hi - lo))), height: 2 * K, background: '#38b6f5' }} />
      </DsScreen>
    </div>
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

      <StatsScreen mon={mon} />
      <StatBars mon={mon} />
      <div className="muted">Total EVs {evTotal} / 510</div>

      <h3>Moves (tap one to swap it)</h3>
      <div className="moves-list">
        {mon.moves.map((mv, i) => {
          const info = moveInfo(mv)
          return (
            <button key={mv + i} onClick={() => setPickFor(pickFor === i ? null : i)} style={{ boxShadow: `inset 4px 0 0 ${TYPE_COLOR[info.type as PType] ?? '#888'}` }}>
              <span>{mv}</span>
              <small style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TypePlate type={info.type} scale={1.6} /><TypePlate type={info.category} scale={1.6} />{info.power || '—'} power · {info.pp} PP</small>
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
                  <span>{o}</span><small style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TypePlate type={info.type} scale={1.6} />{info.power || '—'}</small>
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
                  <MonIcon species={m.species} shiny={m.shiny} />
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

  // the Bag is drawn on the game's own Bag backgrounds, one colour per pocket
  const POCKETS = [
    { name: 'Items', bg: 'bag:dark', kinds: ['stone', 'held', 'passive'] },
    { name: 'Medicine', bg: 'bag:blue', kinds: ['heal', 'revive', 'vitamin', 'candy'] },
    { name: 'Poké Balls', bg: 'bag:red', kinds: ['ball'] },
  ]
  const [pocket, setPocket] = useState(2)
  const [sel, setSel] = useState<string | null>(null)
  const K = dsK(3)
  const list = entries.filter((d) => POCKETS[pocket].kinds.includes(d.kind))
  const shown = sel ?? list[0]?.id ?? null
  const rowH = 26

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bag-frame" onClick={(e) => e.stopPropagation()} style={{ background: '#0c0c10', padding: 8, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }}>
        <DsScreen bg={POCKETS[itemId ? 1 : pocket].bg} K={K}>
          {/* pocket tabs */}
          {!itemId && POCKETS.map((p, i) => (
            <button key={p.name} onClick={() => { setPocket(i); setSel(null) }} style={{ position: 'absolute', left: (6 + i * 78) * K, top: 3 * K, width: 74 * K, height: 15 * K, border: 'none', borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 8 * K, color: '#fff', background: i === pocket ? 'rgba(0,0,0,.75)' : 'rgba(0,0,0,.35)', outline: i === pocket ? '1px solid #fff' : 'none' }}>{p.name}</button>
          ))}
          {itemId && <DsText x={8} y={6} K={K}>Use {ITEMS[itemId].name} on…</DsText>}
          {!itemId ? (
            <div style={{ position: 'absolute', left: 6 * K, top: 22 * K, width: 234 * K, height: (rowH * 4 + 6) * K, overflowY: 'auto' }}>
              {list.length === 0 && <div style={{ color: '#fff', fontSize: 8 * K, padding: 6 * K, textShadow: '1px 1px 0 #000' }}>{entries.length === 0 ? 'Your bag is empty. Look for Poké Balls on the ground!' : 'Nothing in this pocket.'}</div>}
              {list.map((d) => (
                <button key={d.id} onClick={() => setSel(d.id)} onDoubleClick={() => needsTarget(d.id) && setItemId(d.id)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: rowH * K, marginBottom: 2 * K, padding: `0 ${6 * K}px`, border: 'none', borderRadius: 3 * K, cursor: 'pointer', background: shown === d.id ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.42)', color: '#fff', fontWeight: 700, fontSize: 8 * K, textAlign: 'left', gap: 6 * K }}>
                  <ItemIcon name={d.id} size={22 * K} /><span style={{ flex: 1 }}>{d.name}</span><span>x{trainer.bag[d.id]}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ position: 'absolute', left: 6 * K, top: 22 * K, width: 234 * K, height: (rowH * 4 + 6) * K, overflowY: 'auto' }}>
              {trainer.team.map((m, i) => (
                <button key={m.uid} onClick={() => apply(i)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: rowH * K, marginBottom: 2 * K, padding: `0 ${6 * K}px`, border: 'none', borderRadius: 3 * K, cursor: 'pointer', background: 'rgba(0,0,0,.42)', color: m.hp <= 0 ? '#aaa' : '#fff', fontWeight: 700, fontSize: 8 * K, textAlign: 'left', gap: 6 * K }}>
                  <MonIcon species={m.species} shiny={m.shiny} size={22 * K} /><span style={{ flex: 1 }}>{m.species} Lv{m.level}{m.item ? ` · ${m.item}` : ''}</span><span>{m.hp}/{maxHp(m)}</span>
                </button>
              ))}
            </div>
          )}
          {/* description */}
          <div style={{ position: 'absolute', left: 6 * K, top: 152 * K, width: 196 * K, height: 36 * K, background: 'rgba(0,0,0,.6)', borderRadius: 3 * K, padding: 4 * K, color: '#fff', fontSize: 7.5 * K, fontWeight: 600, lineHeight: 1.25 }}>
            {itemId ? 'Choose a Pokémon.' : shown ? ITEMS[shown].desc : ''}
          </div>
          {!itemId && shown && needsTarget(shown) && (
            <button onClick={() => setItemId(shown)} style={{ position: 'absolute', left: 206 * K, top: 152 * K, width: 44 * K, height: 17 * K, border: 'none', borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 8 * K, background: '#ffd84a', color: '#222' }}>Use</button>
          )}
          <button onClick={() => (itemId ? setItemId(null) : onClose())} style={{ position: 'absolute', left: 206 * K, top: (shown && needsTarget(shown) && !itemId ? 171 : 152) * K, width: 44 * K, height: 17 * K, border: 'none', borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 8 * K, background: 'rgba(255,255,255,.85)', color: '#222' }}>{itemId ? 'Back' : 'Close'}</button>
        </DsScreen>
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
              <MonIcon species={m.species} shiny={m.shiny} />
              <div><strong>{m.species}</strong> <span className="muted">Lv {m.level}</span></div>
            </button>
          ))}
        </div>
        <h3>PC ({trainer.pc.length}) — tap to add to your team</h3>
        <div className="mon-list">
          {trainer.pc.length === 0 && <span className="muted">Empty.</span>}
          {trainer.pc.map((m, i) => (
            <button key={m.uid} onClick={() => toTeam(i)}>
              <MonIcon species={m.species} shiny={m.shiny} />
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
