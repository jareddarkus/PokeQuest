// The Pokémon summary window: header (number, name, types, tabs), the picture panel, the stat bars and the four move cards.
// Every text is drawn in the game's own font (from the player's game file).
import { useEffect, useState, type ReactNode } from 'react'
import { Dex } from '@pkmn/sim'
import './summary.css'
import { STAT_IDS, STAT_NAMES, calcStat, dexNum, evolutionsOf, learnableMoves, moveInfo, natureMods, speciesTypes, type Mon, type StatId } from '../data/dex'
import { ITEMS } from '../data/items'
import { TYPE_COLOR, type PType } from '../game/world'
import { abilityDesc, itemDesc, shortDesc, trText, useLang } from '../i18n'
import { moveFacts, moveGameText } from '../data/moveText'
import ItemIcon from './ItemIcon'
import MonSprite, { MonIcon } from './MonSprite'
import TypePlate from './TypePlate'

const INK = '#1c2333', MUTED = '#6b7690'

/** Text of the window: Unbounded Black for titles (font 0), Lexend Regular for everything else. `k` is the size step (1 small ... 4 big). */
function GT({ t, k = 2, color = INK, maxWidth, align, font = 1 }: { t: string; k?: number; color?: string; maxWidth?: number; align?: 'left' | 'right' | 'center'; font?: 0 | 1 | 2 | 3 }) {
  const title = font === 0
  const size = title ? [0, 12, 16, 22, 28][k] ?? 16 : [0, 11, 14, 18, 22][k] ?? 14
  return (
    <span style={{ fontFamily: title ? "'Unbounded', 'Lexend', sans-serif" : "'Lexend', sans-serif", fontWeight: title ? 900 : 400, fontSize: size, lineHeight: 1.3, color, textAlign: align, display: 'inline-block', whiteSpace: 'pre-wrap', maxWidth: maxWidth ? maxWidth * k : undefined, letterSpacing: title ? '0.01em' : undefined }}>{trText(t)}</span>
  )
}

/** A small pop-up on hover (or on a tap) over its child. */
function Tip({ tip, children, className, right, style }: { tip: ReactNode; children: ReactNode; className?: string; right?: boolean; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={`sx-tipwrap ${className ?? ''}`} style={style} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>
      {children}
      {open && <span className={`sx-tip ${right ? 'right' : ''}`}>{tip}</span>}
    </span>
  )
}

const STAT_COLOR: Record<StatId, string> = { hp: '#19c37d', atk: '#ff6b4a', def: '#19a7e0', spa: '#ff3d9a', spd: '#5b4be8', spe: '#f2b705' }

/** The biggest value a stat can reach at a level (base 255, best IV and EV, helpful nature): the full width of a bar. */
function barCap(stat: StatId, level: number): number {
  if (stat === 'hp') return Math.floor(((2 * 255 + 31 + 63) * level) / 100) + level + 10
  return Math.floor((Math.floor(((2 * 255 + 31 + 63) * level) / 100) + 5) * 1.1)
}

/** What a held item does to a stat (the common ones that change a stat in battle). */
function itemMult(item: string, stat: StatId, species: string): number {
  const sp = Dex.species.get(species)
  switch (item) {
    case 'Choice Band': return stat === 'atk' ? 1.5 : 1
    case 'Choice Specs': return stat === 'spa' ? 1.5 : 1
    case 'Choice Scarf': return stat === 'spe' ? 1.5 : 1
    case 'Assault Vest': return stat === 'spd' ? 1.5 : 1
    case 'Eviolite': return sp.nfe && (stat === 'def' || stat === 'spd') ? 1.5 : 1
    case 'Light Ball': return species === 'Pikachu' && (stat === 'atk' || stat === 'spa') ? 2 : 1
    case 'Thick Club': return (species === 'Cubone' || species === 'Marowak') && stat === 'atk' ? 2 : 1
    case 'Deep Sea Tooth': return species === 'Clamperl' && stat === 'spa' ? 2 : 1
    case 'Deep Sea Scale': return species === 'Clamperl' && stat === 'spd' ? 2 : 1
    case 'Metal Powder': return species === 'Ditto' && stat === 'def' ? 1.5 : 1
    case 'Quick Powder': return species === 'Ditto' && stat === 'spe' ? 2 : 1
    case 'Soul Dew': return (species === 'Latios' || species === 'Latias') && (stat === 'spa' || stat === 'spd') ? 1.5 : 1
    case 'Iron Ball': case 'Macho Brace': case 'Power Weight': case 'Power Bracer': case 'Power Belt': case 'Power Lens': case 'Power Band': case 'Power Anklet': return stat === 'spe' ? 0.5 : 1
    default: return 1
  }
}

interface Seg { key: string; v: number; color: string; tip: string; neg?: boolean }

/** A stat split into what makes it: the species (base), the IV, the EV, the nature and the held item. All of it adds up to the stat. */
function statSegments(mon: Mon, s: StatId, lang: 'es' | 'en'): { segs: Seg[]; final: number; cap: number } {
  const B = Dex.species.get(mon.species).baseStats[s], L = mon.level, IV = mon.ivs[s], EVq = Math.floor(mon.evs[s] / 4)
  const final = calcStat(mon.species, s, L, IV, mon.evs[s], mon.nature)
  const flat = s === 'hp' ? L + 10 : 5
  // the stat = species part + IV part + EV part (+ nature); the parts are kept with their decimals so that even a small IV / EV shows as a chunk
  const rawF = ((2 * B + IV + EVq) * L) / 100 + flat
  const rawI = Math.floor(rawF)
  let ivP = (IV * L) / 100, evP = (EVq * L) / 100
  let base = rawI - ivP - evP
  let nat = final - rawI
  if (mon.species === 'Shedinja' && s === 'hp') { base = 1; ivP = 0; evP = 0; nat = 0 }
  const f1 = (x: number) => Number(x.toFixed(1))
  const c = STAT_COLOR[s]
  const es = lang === 'es'
  const nm = natureMods(mon.nature)
  const natLabel = nm.plus ? `${trText(mon.nature)} (${nm.plus === s ? '+10%' : nm.minus === s ? '-10%' : '0%'})` : trText(mon.nature)
  const segs: Seg[] = [
    { key: 'base', v: base, color: c, tip: es ? `Especie (base ${B}): ${f1(base)}` : `Species (base ${B}): ${f1(base)}` },
    { key: 'iv', v: ivP, color: c, tip: `IV ${IV}: +${f1(ivP)}` },
    { key: 'ev', v: evP, color: c, tip: `EV ${mon.evs[s]}: +${f1(evP)}` },
    { key: 'nat', v: Math.max(0, nat), color: c, tip: `${natLabel}: +${nat}`, neg: false },
  ]
  if (nat < 0) segs.push({ key: 'natneg', v: -nat, color: '#ffffff', tip: `${natLabel}: ${nat}`, neg: true })
  const im = mon.item ? itemMult(mon.item, s, mon.species) : 1
  if (im !== 1) {
    const d = Math.floor(final * im) - final
    if (d > 0) segs.push({ key: 'item', v: d, color: c, tip: `${trText(mon.item)}: +${d}` })
    else if (d < 0) segs.push({ key: 'itemneg', v: -d, color: '#ffffff', tip: `${trText(mon.item)}: ${d}`, neg: true })
  }
  return { segs, final, cap: barCap(s, L) }
}

function StatBar({ mon, s, lang }: { mon: Mon; s: StatId; lang: 'es' | 'en' }) {
  const { segs, cap } = statSegments(mon, s, lang)
  let at = 0
  const items: ReactNode[] = []
  for (const g of segs) {
    if (g.neg) { // a loss (a hindering nature or item): hatched, over the end of the bar
      const w = Math.min(100, (g.v / cap) * 100)
      items.push(
        <Tip key={g.key} tip={<GT t={g.tip} color="#ffffff" />} style={{ position: 'absolute', top: 3, bottom: 3, left: `${Math.max(0, at - w)}%`, width: `${w}%` }}>
          <span className="sx-seg neg" style={{ background: g.color }} />
        </Tip>,
      )
      continue
    }
    if (g.v < 0.05) continue // nothing from this part (no EVs, no nature effect on this stat ...): no chunk
    const w = (g.v / cap) * 100
    const width = Math.max(w, 1.8)
    items.push(
      <Tip key={g.key} tip={<GT t={g.tip} color="#ffffff" />} style={{ position: 'absolute', top: 3, bottom: 3, left: `calc(${at}% + 1px)`, width: `calc(${Math.min(width, 100 - at)}% - 2px)` }}>
        <span className="sx-seg" style={{ background: g.color }} />
      </Tip>,
    )
    at += w
  }
  return <div className="sx-bar">{items}</div>
}

function TypeChip({ type, k = 2 }: { type: string; k?: number }) {
  return <span className="sx-type" style={{ background: TYPE_COLOR[type as PType] ?? '#777' }}><span><GT t={type} k={k} color="#ffffff" /></span></span>
}

function Chip({ children, tip, right }: { children: ReactNode; tip?: ReactNode; right?: boolean }) {
  const body = <span className={`sx-chip ${tip ? 'tipped' : ''}`}><span className="sx-un">{children}</span></span>
  return tip ? <Tip tip={tip} right={right}>{body}</Tip> : body
}

function MoveCard({ mon, i, on, onClick, lang }: { mon: Mon; i: number; on: boolean; onClick: () => void; lang: 'es' | 'en' }) {
  const name = mon.moves[i]
  if (!name) return <div className="sx-mv empty"><span className="sx-un"><GT t="—" /></span></div>
  const info = moveInfo(name)
  const pp = mon.pp?.[i] ?? info.pp
  const color = TYPE_COLOR[info.type as PType] ?? '#777'
  return (
    <button className={`sx-mv ${on ? 'on' : ''}`} style={{ ['--c' as string]: color }} onClick={onClick}>
      <span className="sx-un">
        <span className="sx-mvname"><TypePlate type={info.category} scale={0.75} /><GT t={name} k={2} /></span>
        <span className="meta">
          <GT t={`${lang === 'es' ? 'POT' : 'PWR'}: ${info.power || '—'}   |   PP: ${pp}/${info.pp}`} k={1} color={MUTED} />
          <span className="tchip"><span><GT t={info.type} k={1} color="#ffffff" /></span></span>
        </span>
      </span>
    </button>
  )
}

function EvoNode({ name, cur, lang }: { name: string; cur: string; lang: 'es' | 'en' }) {
  const kids = evolutionsOf(name).filter((e) => !Dex.species.get(e.to).forme)
  const cond = (e: ReturnType<typeof evolutionsOf>[number]): string => {
    const es = lang === 'es'
    if (e.item && (e.type === 'useItem' || e.type === 'trade')) return e.type === 'trade' ? (es ? `Intercambio con ${trText(e.item)}` : `Trade holding ${e.item}`) : trText(e.item)
    if (e.type === 'trade') return es ? 'Intercambio' : 'Trade'
    if (e.type === 'useItem' && e.item) return trText(e.item)
    if (e.type === 'levelFriendship') return es ? 'Felicidad' : 'Friendship'
    if (e.level) return `Lv ${e.level}${e.cond ? ` (${e.cond})` : ''}`
    return e.cond ?? (e.type ? e.type : '—')
  }
  return (
    <div className="sx-evo-node">
      <div className={`sx-evo-card ${name === cur ? 'cur' : ''}`}>
        <MonIcon species={name} size={48} />
        <GT t={name} k={1} />
      </div>
      {kids.length > 0 && (
        <div className="sx-evo-kids">
          {kids.map((e) => (
            <div className="sx-evo-node" key={e.to}>
              <div className="sx-evo-arrow"><GT t="→" k={2} color={MUTED} /><GT t={cond(e)} k={1} color={MUTED} /></div>
              <EvoNode name={e.to} cur={cur} lang={lang} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SummaryCard({ mon, onChange, onBack, onClose, footer }: { mon: Mon; onChange?: (m: Mon) => void; onBack: () => void; onClose?: () => void; footer?: ReactNode }) {
  const lang = useLang()
  const es = lang === 'es'
  const [tab, setTab] = useState<'stats' | 'moves' | 'evo'>('stats')
  const [sel, setSel] = useState(0)
  const [pickFor, setPickFor] = useState<number | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  useEffect(() => { void learnableMoves(mon.species, mon.level).then(setOptions) }, [mon.species, mon.level])
  const small = vw <= 860
  const sp = Dex.species.get(mon.species)
  const types = speciesTypes(mon.species)
  const st = Object.fromEntries(STAT_IDS.map((s) => [s, calcStat(mon.species, s, mon.level, mon.ivs[s], mon.evs[s], mon.nature)])) as Record<StatId, number>
  const mx = st.hp
  const total = STAT_IDS.reduce((a, s) => a + st[s], 0)
  const frac = mx > 0 ? Math.max(0, Math.min(1, mon.hp / mx)) : 0
  const nm = natureMods(mon.nature)
  const natureTip = nm.plus && nm.minus ? `${trText(mon.nature)}: +${trText(STAT_NAMES[nm.plus])}, −${trText(STAT_NAMES[nm.minus])}` : `${trText(mon.nature)}: ${es ? 'neutral' : 'neutral'}`
  const itemDef = mon.item ? ITEMS[mon.item] : undefined
  const itemText = mon.item ? shortDesc(itemDesc(itemDef?.name ?? mon.item, itemDef?.desc ?? Dex.items.get(mon.item).shortDesc ?? ''), 120) : ''
  const genderLabel = mon.gender === 'M' ? (es ? 'MACHO' : 'MALE') : mon.gender === 'F' ? (es ? 'HEMBRA' : 'FEMALE') : es ? 'SIN SEXO' : 'GENDERLESS'
  const genderGlyph = mon.gender === 'M' ? '♂' : mon.gender === 'F' ? '♀' : ''
  const kText = small ? 2 : 2
  const textW = Math.max(120, Math.floor((Math.min(vw, 1120) - (small ? 90 : 560)) / kText))
  let root = mon.species
  for (let g = 0; g < 4; g++) { const p = Dex.species.get(root).prevo; if (!p) break; root = p }

  const mv = mon.moves[sel] ?? mon.moves[0]
  const mi = mv ? moveInfo(mv) : null
  const replace = (o: string) => { if (!onChange || pickFor === null) return; onChange({ ...mon, moves: mon.moves.map((x, k) => (k === pickFor ? o : x)) }); setPickFor(null) }

  return (
    <div className="sx">
      {/* header */}
      <div className="sx-head">
        <div className="sx-who">
          <span className="sx-card sx-id"><span className="sx-un"><GT t={`#${String(dexNum(mon.species)).padStart(4, '0')}`} k={2} font={0} color={MUTED} /></span></span>
          <div className="sx-name">
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <GT t={`${mon.species}${mon.shiny ? ' ★' : ''}`} k={3} font={0} />
              <GT t={`Lv ${mon.level}`} k={2} color={MUTED} />
            </span>
          </div>
          <div className="sx-types">{types.map((t) => <TypeChip key={t} type={t} k={2} />)}</div>
        </div>
        <div className="sx-tabs">
          {(['stats', 'moves', 'evo'] as const).map((tb) => (
            <button key={tb} className={`sx-tab ${tab === tb ? 'on' : ''}`} onClick={() => { setTab(tb); setPickFor(null) }}>
              <span><GT t={tb === 'stats' ? (es ? 'ESTADÍSTICAS' : 'STATS') : tb === 'moves' ? (es ? 'MOVIMIENTOS' : 'MOVES') : es ? 'EVOLUCIÓN' : 'EVOLUTION'} k={2} color={tab === tb ? INK : MUTED} /></span>
            </button>
          ))}
          <button className="sx-tab sx-x" onClick={onClose ?? onBack} aria-label="Close" title="Close"><span><svg viewBox="0 0 14 14" width="14" height="14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" /></svg></span></button>
        </div>
      </div>

      {/* the picture panel */}
      <div className="sx-art">
        <div className="sx-row">
          <div className="sx-col">
            <Chip><GT t={`LV. ${mon.level}`} k={2} /></Chip>
            <Chip><GT t={`${genderGlyph} ${genderLabel}`.trim()} k={2} color={mon.gender === 'M' ? '#2a7de1' : mon.gender === 'F' ? '#e0467c' : INK} /></Chip>
          </div>
          <div className="sx-col r">
            <Chip><GT t={`${es ? 'ALT' : 'HT'}: ${sp.heightm} m`} k={2} /></Chip>
            <Chip><GT t={`${es ? 'PESO' : 'WT'}: ${sp.weightkg} kg`} k={2} /></Chip>
          </div>
        </div>
        <div className="sx-sprite"><div><MonSprite species={mon.species} shiny={mon.shiny} scale={small ? 3 : 4} animated /></div></div>
        <div className="sx-row">
          <span className="sx-hp"><span className="sx-un">
            <GT t={`${es ? 'PS' : 'HP'}: ${mon.hp} / ${mx}`} k={2} />
            <span className="sx-bar sx-bar-s"><span className="sx-seg" style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${frac * 100}% - 2px)`, background: frac > 0.5 ? STAT_COLOR.hp : frac > 0.2 ? '#f0a800' : '#e03a4c' }} /></span>
          </span></span>
          <div className="sx-col r">
            <Chip tip={<GT t={natureTip} k={2} color="#ffffff" maxWidth={150} />} right><GT t={`${es ? 'NATURALEZA' : 'NATURE'}:`} k={2} color={MUTED} /><GT t={mon.nature.toUpperCase()} k={2} /></Chip>
            <Chip tip={<GT t={abilityDesc(mon.ability) || '—'} k={2} color="#ffffff" maxWidth={150} />} right><GT t={`${es ? 'HABILIDAD' : 'ABILITY'}:`} k={2} color={MUTED} /><GT t={mon.ability.toUpperCase()} k={2} /></Chip>
            <Chip tip={<GT t={mon.item ? itemText : es ? 'No lleva ningún objeto.' : 'Not holding an item.'} k={2} color="#ffffff" maxWidth={150} />} right>
              <GT t={`${es ? 'OBJETO' : 'ITEM'}:`} k={2} color={MUTED} />
              {mon.item && <ItemIcon name={mon.item} size={22} />}
              <GT t={mon.item ? mon.item.toUpperCase() : es ? 'NINGUNO' : 'NONE'} k={2} />
            </Chip>
          </div>
        </div>
      </div>

      {/* the right side: stats / move details / evolution */}
      {tab === 'stats' && (
        <div className="sx-stats">
          <div className="sx-title"><i /><GT t={es ? 'ESTADÍSTICAS' : 'STATS'} k={2} font={0} /></div>
          {STAT_IDS.map((s) => (
            <div className="sx-stat" key={s}>
              <GT t={STAT_NAMES[s]} k={2} color={nm.plus === s ? '#e0467c' : nm.minus === s ? '#2a7de1' : INK} />
              <StatBar mon={mon} s={s} lang={lang} />
              <span className="v"><GT t={String(st[s])} k={3} font={0} /></span>
            </div>
          ))}
          <div className="sx-legend">
            {[[es ? 'Especie' : 'Species'], ['IV'], ['EV'], [es ? 'Naturaleza' : 'Nature'], ...(mon.item ? [[es ? 'Objeto' : 'Item']] : [])].map(([name], i) => (
              <span key={name}><i><b><GT t={String(i + 1)} k={1} color="#ffffff" /></b></i><GT t={name} k={1} color={MUTED} /></span>
            ))}
          </div>
          <span className="sx-chip sx-total"><span className="sx-un"><GT t={`${es ? 'TOTAL' : 'STAT TOTAL'}: ${total}`} k={2} /></span></span>
        </div>
      )}
      {tab === 'moves' && (
        <div className="sx-stats">
          <div className="sx-title"><i /><GT t={es ? 'MOVIMIENTOS' : 'MOVES'} k={2} font={0} /></div>
          {mv && mi ? (
            <div className="sx-detail">
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <TypePlate type={mi.category} scale={1} /><GT t={mv} k={3} font={0} /><TypeChip type={mi.type} k={1} />
                <GT t={`${es ? ({ Physical: 'Físico', Special: 'Especial', Status: 'Estado' } as Record<string, string>)[mi.category] : mi.category}  ${mi.power ? (es ? 'Potencia' : 'Power') + ' ' + mi.power : es ? 'sin potencia' : 'no power'}  ${mi.accuracy === true ? '—' : mi.accuracy + '%'}`} k={1} color={MUTED} />
              </span>
              <GT t={moveFacts(mv, lang)} k={kText} maxWidth={textW} />
              <GT t={moveGameText(mv, lang)} k={kText} maxWidth={textW} color={MUTED} />
              {onChange && <button className="sx-btn rh" onClick={() => setPickFor(pickFor === sel ? null : sel)}><span><GT t={es ? 'Cambiar movimiento' : 'Replace move'} k={1} color="#ffffff" /></span></button>}
            </div>
          ) : <GT t="—" />}
          {pickFor !== null && options.filter((o) => !mon.moves.includes(o)).length === 0 && <GT t={es ? 'A este nivel no puede aprender más movimientos.' : 'It cannot learn any other move at this level.'} k={2} color={MUTED} />}
          {pickFor !== null && (
            <div className="sx-pick">
              {options.filter((o) => !mon.moves.includes(o)).map((o) => {
                const info = moveInfo(o)
                return <button key={o} style={{ ['--c' as string]: TYPE_COLOR[info.type as PType] ?? '#888' }} onClick={() => replace(o)}><GT t={o} k={1} /><br /><GT t={`${info.type}  ${info.power || '—'}`} k={1} color={MUTED} /></button>
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'evo' && (
        <div className="sx-stats">
          <div className="sx-title"><i /><GT t={es ? 'EVOLUCIÓN' : 'EVOLUTION'} k={2} font={0} /></div>
          <div className="sx-evo"><EvoNode name={root} cur={mon.species} lang={lang} /></div>
          {evolutionsOf(root).filter((e) => !Dex.species.get(e.to).forme).length === 0 && <GT t={es ? 'Este Pokémon no evoluciona.' : 'This Pokémon does not evolve.'} k={2} color={MUTED} />}
        </div>
      )}

      {/* the four moves */}
      <div className="sx-moves">
        {[0, 1, 2, 3].map((i) => <MoveCard key={i} mon={mon} i={i} lang={lang} on={tab === 'moves' && sel === i} onClick={() => { if (!mon.moves[i]) return; setSel(i); setTab('moves'); setPickFor(null) }} />)}
      </div>

      {footer && <div className="sx-foot">{footer}</div>}
    </div>
  )
}


