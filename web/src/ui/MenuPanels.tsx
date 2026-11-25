import { useEffect, useMemo, useState } from 'react'
import {
  NATURES, STAT_IDS, STAT_NAMES, allSpecies, dexNum, learnableMoves, maxHp, moveInfo, natureMods, speciesTypes, statsOf, type Mon,
} from '../data/dex'
import { ITEMS } from '../data/items'
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
import PartyScreen from './PartyScreen'
import { abilityDesc, moveDesc, useLang, CATEGORY } from '../i18n'
import BagScreen from './BagScreen'
import { useUiUrl } from './CmdButton'

interface PanelProps {
  trainer: Trainer
  setTrainer: (t: Trainer) => void
  onClose: () => void
  onMessage: (text: string) => void
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
        <DsText x={12} y={113} K={K} color="#181820" size={7}>{natureText(mon.nature)}</DsText>
        <DsText x={12} y={125} K={K}>{mon.ability}</DsText>
        <DsText x={164} y={156} K={K} color="#181820" size={6.5}>Exp {mon.exp}</DsText>
        <DsText x={164} y={167} K={K} color="#181820" size={6.5}>Next lv. {Math.max(0, hi - mon.exp)}</DsText>
        <span style={{ position: 'absolute', left: 55 * K, top: 168 * K, width: 95 * K * Math.max(0, Math.min(1, (mon.exp - lo) / Math.max(1, hi - lo))), height: 2 * K, background: '#38b6f5' }} />
      </DsScreen>
    </div>
  )
}

/** "Relaxed (+Defense, −Speed)": what the nature does to the Pokémon. */
function natureText(nature: string): string {
  const nm = natureMods(nature)
  return nm.plus ? `${nature} (+${STAT_NAMES[nm.plus]}, −${STAT_NAMES[nm.minus!]})` : `${nature} (neutral)`
}

/** The top screen of the summary: the Pokémon, its name, types, HP, ability and item (on the game's dark summary panel). */
function TopScreen({ mon }: { mon: Mon }) {
  const K = dsK(2)
  useLang()
  const mx = maxHp(mon)
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <DsScreen bg="sum:top" K={K}>
        <span style={{ position: 'absolute', left: 6 * K, top: 38 * K, width: 80 * K, height: 80 * K, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><MonSprite species={mon.species} shiny={mon.shiny} scale={K * 0.9} animated /></span>
        <DsText x={92} y={12} K={K} size={11}>{mon.species}{mon.shiny ? ' ★' : ''}</DsText>
        <DsText x={92} y={28} K={K} size={8}>Lv{mon.level}  {mon.gender === 'M' ? '♂' : mon.gender === 'F' ? '♀' : ''}</DsText>
        <span style={{ position: 'absolute', left: 92 * K, top: 42 * K, display: 'flex', gap: 3 * K }}>{speciesTypes(mon.species).map((t) => <TypePlate key={t} type={t} scale={K * 0.7} />)}</span>
        <span style={{ position: 'absolute', left: 92 * K, top: 58 * K }}><HpBar hp={mon.hp} max={mx} scale={K} /></span>
        <DsText x={92} y={70} w={120} K={K} size={7.5} align="right">{mon.hp}/{mx}</DsText>
        <DsText x={92} y={86} K={K} size={7.5} color="#ffd84a">{mon.ability}</DsText>
        <div style={{ position: 'absolute', left: 92 * K, top: 96 * K, width: 156 * K, color: '#fff', fontSize: 6.5 * K, lineHeight: 1.3, fontWeight: 600 }}>{abilityDesc(mon.ability)}</div>
        <DsText x={92} y={150} K={K} size={7.5}>{mon.item ? mon.item : '—'}</DsText>
        {mon.item && <span style={{ position: 'absolute', left: 78 * K, top: 146 * K }}><ItemIcon name={mon.item} size={12 * K} /></span>}
      </DsScreen>
    </div>
  )
}

/** The info page on the game's own summary background: a dark band with the name, then a white panel with rows. */
function InfoScreen({ mon }: { mon: Mon }) {
  const K = dsK(2)
  const hi = (mon.level + 1) ** 3
  const rows: Array<[string, string]> = [
    ['Dex No.', `#${dexNum(mon.species)}`],
    ['Type', speciesTypes(mon.species).join(' / ')],
    ['Nature', natureText(mon.nature)],
    ['Ability', mon.ability],
    ['Held item', mon.item || 'none'],
    ['Exp. points', String(mon.exp)],
    ['To next level', String(Math.max(0, hi - mon.exp))],
  ]
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <DsScreen bg="sum:info" K={K}>
        <DsText x={10} y={14} K={K} size={10}>{mon.species}{mon.shiny ? ' ★' : ''}  Lv{mon.level}  {mon.gender === 'M' ? '♂' : mon.gender === 'F' ? '♀' : ''}</DsText>
        {rows.map(([k, v], i) => (
          <div key={k}>
            <DsText x={8} y={44 + i * 16} K={K} color="#505868" size={7.5}>{k}</DsText>
            <DsText x={96} y={44 + i * 16} K={K} color="#181820" size={7.5}>{v}</DsText>
          </div>
        ))}
      </DsScreen>
    </div>
  )
}

/** The moves page on the game's own summary background (tap a move to replace it). */
function MovesScreen({ mon, pickFor, onPick }: { mon: Mon; pickFor: number | null; onPick: (i: number) => void }) {
  const K = dsK(2)
  const lang = useLang()
  const cur = moveInfo(mon.moves[pickFor ?? 0] ?? mon.moves[0])
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <DsScreen bg="sum:moves" K={K}>
        <DsText x={10} y={36} K={K} size={8}>Moves</DsText>
        {mon.moves.map((mv, i) => {
          const info = moveInfo(mv)
          return (
            <button key={mv + i} onClick={() => onPick(i)} style={{ position: 'absolute', left: 0, top: (57 + i * 16) * K, width: 256 * K, height: 15 * K, border: 'none', background: pickFor === i ? 'rgba(255,216,74,.28)' : 'transparent', cursor: 'pointer', padding: 0 }}>
              <DsText x={6} y={4} K={K} size={7.5}>{mv}</DsText>
              <DsText x={124} y={4} K={K} size={7.5} color="#181820">PP {info.pp}</DsText>
              <DsText x={172} y={4} K={K} size={7.5} color="#181820">Pow {info.power || '—'}</DsText>
              <span style={{ position: 'absolute', left: 212 * K, top: 2 * K }}><TypePlate type={info.type} scale={K * 0.75} /></span>
            </button>
          )
        })}
        <DsText x={42} y={150} K={K} size={7} color="#181820">{cur.type} · {lang === 'es' ? CATEGORY[cur.category] ?? cur.category : cur.category} · {cur.power ? `Power ${cur.power}` : 'no power'}</DsText>
        <div style={{ position: 'absolute', left: 42 * K, top: 160 * K, width: 160 * K, color: '#181820', fontSize: 6 * K, lineHeight: 1.25, fontWeight: 600, overflow: 'hidden', height: 30 * K }}>{moveDesc(mon.moves[pickFor ?? 0] ?? mon.moves[0])}</div>
      </DsScreen>
    </div>
  )
}

// ---------------------------------------------------------------- summary (stats, nature, ability, moves)
export function Summary({ mon, onChange, onBack }: { mon: Mon; onChange: (m: Mon) => void; onBack: () => void }) {
  const [pickFor, setPickFor] = useState<number | null>(null)
  const [page, setPage] = useState<'info' | 'stats' | 'moves'>('stats')
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    void learnableMoves(mon.species, mon.level).then(setOptions)
  }, [mon.species, mon.level])
  const evTotal = STAT_IDS.reduce((a, s) => a + mon.evs[s], 0)

  return (
    <div className="summary">
      <TopScreen mon={mon} />

      <div className="btn-row">
        {(['info', 'stats', 'moves'] as const).map((p) => (
          <button key={p} className={page === p ? 'primary' : ''} onClick={() => setPage(p)}>{p === 'info' ? 'Info' : p === 'stats' ? 'Stats' : 'Moves'}</button>
        ))}
      </div>
      {page === 'info' && <InfoScreen mon={mon} />}
      {page === 'stats' && (
        <>
          <StatsScreen mon={mon} />
          <details style={{ margin: '6px 0' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>IV / EV</summary>
            <StatBars mon={mon} />
            <div className="muted">Total EVs {evTotal} / 510</div>
          </details>
        </>
      )}
      {page === 'moves' && <MovesScreen mon={mon} pickFor={pickFor} onPick={(i) => setPickFor(pickFor === i ? null : i)} />}

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
      <div className={mon && sel !== null ? 'panel modal wide' : ''} style={mon && sel !== null ? undefined : { background: '#0c0c10', padding: 8, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.6)' }} onClick={(e) => e.stopPropagation()}>
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
      upd = healMon(m, def.heal ?? 0); msg = `${m.species} was healed.`
    } else if (def.kind === 'revive') {
      if (m.hp > 0) { onMessage('It would have no effect.'); return }
      upd = reviveMon(m, def.heal ?? 0.5); msg = `${m.species} was revived!`
    } else if (def.kind === 'vitamin') {
      const r = useVitamin(m, def.stat!)
      if (!r) { onMessage('It would have no effect.'); return }
      upd = r; msg = `${m.species}'s ${STAT_NAMES[def.stat!]} EVs went up!`
    } else if (def.kind === 'pp') {
      // Elixir: 10 PP back for every move (a move's most is its base PP x 8/5, like with three PP Ups)
      const most = m.moves.map((mv) => Math.floor((moveInfo(mv).pp * 8) / 5))
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
