// The Pokémon summary window: header (number, name, types, tabs), the picture panel, the stat bars and the four move cards.
// Every text is drawn in the game's own font (from the player's game file).
import { useEffect, useRef, useState, type ReactNode } from 'react'
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


interface StatMath { base: number; final: number; end: number; cap: number; lines: Array<{ label: string; v: number }>; net: number }

/** A stat split into the species part and the rest (IV + EV + nature + held item), with every number of the sum. */
function statMath(mon: Mon, s: StatId, lang: 'es' | 'en'): StatMath {
  const B = Dex.species.get(mon.species).baseStats[s], L = mon.level, IV = mon.ivs[s], EVq = Math.floor(mon.evs[s] / 4)
  const final = calcStat(mon.species, s, L, IV, mon.evs[s], mon.nature)
  const flat = s === 'hp' ? L + 10 : 5
  const rawF = ((2 * B + IV + EVq) * L) / 100 + flat
  const rawI = Math.floor(rawF)
  let ivP = (IV * L) / 100, evP = (EVq * L) / 100
  let base = rawI - ivP - evP
  let nat = final - rawI
  if (mon.species === 'Shedinja' && s === 'hp') { base = 1; ivP = 0; evP = 0; nat = 0 }
  const im = mon.item ? itemMult(mon.item, s, mon.species) : 1
  const item = im !== 1 ? Math.floor(final * im) - final : 0
  const nm = natureMods(mon.nature)
  const es = lang === 'es'
  const f1 = (x: number) => Number(x.toFixed(1))
  const lines: StatMath['lines'] = []
  lines.push({ label: es ? `Especie (base ${B})` : `Species (base ${B})`, v: 0 })
  if (ivP > 0.04) lines.push({ label: `IV ${IV}`, v: f1(ivP) })
  if (evP > 0.04) lines.push({ label: `EV ${mon.evs[s]}`, v: f1(evP) })
  if (nat !== 0) lines.push({ label: `${trText(mon.nature)} (${nm.plus === s ? '+10%' : '-10%'})`, v: nat })
  if (item !== 0) lines.push({ label: trText(mon.item), v: item })
  const net = f1(ivP + evP + nat + item)
  return { base, final, end: final + item, cap: barCap(s, L), lines, net }
}

/** What the single chunk tells (also why it is red: a hindering nature takes away part of the IV / EV / species points). */
function ChunkTip({ m, lang }: { m: StatMath; lang: 'es' | 'en' }) {
  const es = lang === 'es'
  const sign = (v: number) => (v > 0 ? '+' : '') + v
  const col = (v: number) => (v > 0 ? '#4dff7c' : v < 0 ? '#ff5a6a' : '#ffffff')
  const rows = m.lines.filter((l) => l.v !== 0)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 170 }}>
      {rows.map((l, i) => <span key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><GT t={l.label} k={2} color={col(l.v)} /><GT t={sign(l.v)} k={2} color={col(l.v)} /></span>)}
      {rows.length === 0 && <GT t={es ? 'Solo la parte de la especie.' : 'Only the species part.'} k={2} color="#ffffff" />}
      {rows.length > 1 && (<span style={{ display: 'flex', justifyContent: 'space-between', gap: 14, borderTop: '1px solid rgba(255,255,255,.35)', paddingTop: 3 }}><GT t={es ? 'Total extra' : 'Extra total'} k={2} color={col(m.net)} /><GT t={sign(m.net)} k={2} color={col(m.net)} /></span>)}
    </span>
  )
}

function StatBar({ mon, s, lang, i }: { mon: Mon; s: StatId; lang: 'es' | 'en'; i: number }) {
  const m = statMath(mon, s, lang)
  const c = STAT_COLOR[s]
  const pct = (v: number) => Math.max(0, Math.min(100, (v / m.cap) * 100))
  const delta = m.end - m.base // what the chunk is: IV + EV + nature + item together
  const pos = delta >= 0
  const baseW = pos ? pct(m.base) : pct(m.end)
  const chunkW = Math.max(Math.abs(delta) > 0.04 ? pct(Math.abs(delta)) : 0, Math.abs(delta) > 0.04 ? 1.8 : 0)
  const chunkL = pos ? baseW : baseW // (a loss: the red part sits where the lost points were, right after what is left)
  const style = { ['--i' as string]: i } as React.CSSProperties
  return (
    <div className="sx-bar" style={style}>
      <Tip tip={<GT t={m.lines[0].label + ': ' + Number(m.base.toFixed(1))} k={2} color="#ffffff" />} style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${baseW}% - 2px)` }}>
        <span className="sx-seg grow" style={{ background: c }} />
      </Tip>
      {chunkW > 0 && (
        <Tip tip={<ChunkTip m={m} lang={lang} />} style={{ position: 'absolute', top: 3, bottom: 3, left: `calc(${chunkL}% + 1px)`, width: `calc(${Math.min(chunkW, 100 - chunkL)}% - 2px)` }}>
          <span className="sx-seg grow late" style={{ background: pos ? c : c + '4d' }} />
        </Tip>
      )}
    </div>
  )
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
  const [tab, setTab] = useState<'stats' | 'ev' | 'moves' | 'evo'>('stats')
  const [sel, setSel] = useState(0)
  const [pickFor, setPickFor] = useState<number | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [vw, setVw] = useState(window.innerWidth)
  // the picture is centred by what you SEE of it (the game's 96 x 96 picture has empty rows around the Pokémon)
  const spriteBox = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState(0)
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    let tries = 0
    setPlaced(false)
    const t = window.setInterval(() => {
      const box = spriteBox.current, cv = box?.querySelector('canvas'), img = box?.querySelector('img')
      const src = cv ?? img
      if (!box || !src) { if (++tries > 100) { clearInterval(t); setPlaced(true) } return }
      try {
        const w = cv ? cv.width : (img as HTMLImageElement).naturalWidth, h = cv ? cv.height : (img as HTMLImageElement).naturalHeight
        if (!w || !h) return
        const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
        const ctx = tmp.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(src as CanvasImageSource, 0, 0)
        const px = ctx.getImageData(0, 0, w, h).data
        let top = -1, bot = -1
        for (let y = 0; y < h; y++) { let any = false; for (let x = 0; x < w && !any; x++) any = px[(y * w + x) * 4 + 3] > 40; if (any) { if (top < 0) top = y; bot = y } }
        if (top < 0) return
        const r = src.getBoundingClientRect(), b = (box.parentElement as HTMLElement).getBoundingClientRect()
        const k = r.height / h
        const want = b.top + b.height / 2
        const visibleMid = r.top + ((top + bot + 1) / 2) * k // (r already includes the current lift)
        setLift((cur) => Math.round(cur + want - visibleMid))
        setPlaced(true) // (it is shown only now, already in its place: it never moves in front of the player)
        clearInterval(t)
      } catch { clearInterval(t); setPlaced(true) }
    }, 60)
    return () => clearInterval(t)
  }, [mon.species, vw, tab])
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  useEffect(() => { void learnableMoves(mon.species, mon.level).then(setOptions) }, [mon.species, mon.level])
  const small = vw <= 860
  const sp = Dex.species.get(mon.species)
  const types = speciesTypes(mon.species)
  const st = Object.fromEntries(STAT_IDS.map((s) => [s, calcStat(mon.species, s, mon.level, mon.ivs[s], mon.evs[s], mon.nature)])) as Record<StatId, number>
  const mx = st.hp
  const total = STAT_IDS.reduce((a, s) => a + st[s], 0)
  const frac = mx > 0 ? Math.max(0, Math.min(1, mon.hp / mx)) : 0
  const expLo = mon.level ** 3, expHi = (mon.level + 1) ** 3
  const expNow = Math.max(0, mon.exp - expLo), expNeed = expHi - expLo
  const expFrac = mon.level >= 100 ? 1 : Math.max(0, Math.min(1, expNow / expNeed))
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
          {(['stats', 'ev', 'moves', 'evo'] as const).map((tb) => (
            <button key={tb} className={`sx-tab ${tab === tb ? 'on' : ''}`} onClick={() => { setTab(tb); setPickFor(null) }}>
              <span><GT t={tb === 'stats' ? (es ? 'ESTADÍSTICAS' : 'STATS') : tb === 'ev' ? 'EVs & IVs' : tb === 'moves' ? (es ? 'MOVIMIENTOS' : 'MOVES') : es ? 'EVOLUCIÓN' : 'EVOLUTION'} k={2} color={tab === tb ? INK : MUTED} /></span>
            </button>
          ))}
          <button className="sx-tab sx-x" onClick={onClose ?? onBack} aria-label="Close" title="Close"><span><svg viewBox="0 0 14 14" width="14" height="14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" /></svg></span></button>
        </div>
      </div>

      {/* the picture panel */}
      <div className="sx-art"><div className="sx-layer">
        <div className="sx-row top">
          <Chip><GT t={`${genderGlyph} ${genderLabel}`.trim()} k={2} color={mon.gender === 'M' ? '#2a7de1' : mon.gender === 'F' ? '#e0467c' : INK} /></Chip>
          <Chip><GT t={`${es ? 'ALT' : 'HT'}:`} k={2} color={MUTED} /><GT t={`${sp.heightm} m`} k={2} /></Chip>
          <Chip><GT t={`${es ? 'PESO' : 'WT'}:`} k={2} color={MUTED} /><GT t={`${sp.weightkg} kg`} k={2} /></Chip>
        </div>
        <div className="sx-sprite"><div ref={spriteBox} style={{ transform: `translateY(${lift}px)`, opacity: placed ? 1 : 0, transition: placed ? 'opacity .45s ease-out' : 'none' }}><div className="sx-spr"><MonSprite species={mon.species} shiny={mon.shiny} scale={small ? 3 : 4} animated /></div></div></div>
        <div className="sx-row bottom">
          <div className="sx-col">
            <span className="sx-hp"><span className="sx-un">
              <span style={{ display: 'flex', gap: 6 }}><GT t={`${es ? 'PS' : 'HP'}:`} k={2} color={MUTED} /><GT t={`${mon.hp} / ${mx}`} k={2} /></span>
              <span className="sx-bar sx-bar-s"><span className="sx-seg" style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${frac * 100}% - 2px)`, background: frac > 0.5 ? STAT_COLOR.hp : frac > 0.2 ? '#f0a800' : '#e03a4c' }} /></span>
            </span></span>
            <span className="sx-hp"><span className="sx-un">
              <span style={{ display: 'flex', gap: 6 }}><GT t="LV." k={2} color={MUTED} /><GT t={String(mon.level)} k={2} /><span style={{ width: 8 }} /><GT t="EXP:" k={2} color={MUTED} /><GT t={mon.level >= 100 ? 'MAX' : `${expNow} / ${expNeed}`} k={2} /></span>
              <span className="sx-bar sx-bar-s"><span className="sx-seg" style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${expFrac * 100}% - 2px)`, background: '#2a9df4' }} /></span>
            </span></span>
          </div>
          <div className="sx-col r">
            <Chip tip={<GT t={natureTip} k={2} color="#ffffff" maxWidth={150} />} right><GT t={`${es ? 'NATURALEZA' : 'NATURE'}:`} k={1} color={MUTED} /><GT t={trText(mon.nature).toUpperCase()} k={1} /></Chip>
            <Chip tip={<GT t={abilityDesc(mon.ability) || '—'} k={2} color="#ffffff" maxWidth={150} />} right><GT t={`${es ? 'HABILIDAD' : 'ABILITY'}:`} k={1} color={MUTED} /><GT t={trText(mon.ability).toUpperCase()} k={1} /></Chip>
            <Chip tip={<GT t={mon.item ? itemText : es ? 'No lleva ningún objeto.' : 'Not holding an item.'} k={2} color="#ffffff" maxWidth={150} />} right>
              <GT t={`${es ? 'OBJETO' : 'ITEM'}:`} k={1} color={MUTED} />
              {mon.item && <ItemIcon name={mon.item} size={20} />}
              <GT t={mon.item ? trText(mon.item).toUpperCase() : es ? 'NINGUNO' : 'NONE'} k={1} />
            </Chip>
          </div>
        </div>
      </div></div>

      {/* the right side: stats / move details / evolution */}
      {tab === 'stats' && (
        <div className="sx-stats">
          <div className="sx-title"><i /><GT t={es ? 'ESTADÍSTICAS' : 'STATS'} k={2} font={0} /></div>
          {STAT_IDS.map((s) => (
            <div className="sx-stat" key={s}>
              <GT t={STAT_NAMES[s]} k={2} color={nm.plus === s ? '#12a150' : nm.minus === s ? '#e03a4c' : INK} />
              <StatBar mon={mon} s={s} lang={lang} i={STAT_IDS.indexOf(s)} />
              <span className="v"><GT t={String(st[s])} k={3} font={0} /></span>
            </div>
          ))}
          <div className="sx-legend">
            <span><i><b><GT t="1" k={1} color="#ffffff" /></b></i><GT t={es ? 'Especie' : 'Species'} k={1} color={MUTED} /></span>
            <span><i><b><GT t="2" k={1} color="#ffffff" /></b></i><GT t={es ? 'IV + EV + Naturaleza + Objeto' : 'IV + EV + Nature + Item'} k={1} color={MUTED} /></span>
          </div>
          <span className="sx-chip sx-total"><span className="sx-un"><GT t={`${es ? 'TOTAL' : 'STAT TOTAL'}:`} k={2} color={MUTED} /><GT t={String(total)} k={2} /></span></span>
        </div>
      )}
      {tab === 'ev' && (
        <div className="sx-stats">
          <div className="sx-eviv">
            <div className="sx-evcol">
              <div className="sx-title"><i /><GT t="EVs" k={2} font={0} /><GT t={`${STAT_IDS.reduce((a, x) => a + mon.evs[x], 0)} / 510`} k={2} color={MUTED} /></div>
              {STAT_IDS.map((x, i) => (
                <div className="sx-stat small" key={x} style={{ ['--i' as string]: i } as React.CSSProperties}>
                  <GT t={STAT_NAMES[x]} k={2} />
                  <div className="sx-bar"><span className="sx-seg grow" style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${Math.min(100, (mon.evs[x] / 252) * 100)}% - 2px)`, background: STAT_COLOR[x] }} /></div>
                  <span className="v"><GT t={String(mon.evs[x])} k={2} font={0} /></span>
                </div>
              ))}
              <GT t={es ? 'Máximo 252 por estadística' : 'At most 252 per stat'} k={1} color={MUTED} />
            </div>
            <div className="sx-evcol">
              <div className="sx-title"><i /><GT t="IVs" k={2} font={0} /></div>
              {STAT_IDS.map((x, i) => (
                <div className="sx-stat small" key={x} style={{ ['--i' as string]: i } as React.CSSProperties}>
                  <GT t={STAT_NAMES[x]} k={2} />
                  <div className="sx-bar"><span className="sx-seg grow" style={{ position: 'absolute', top: 3, bottom: 3, left: 1, width: `calc(${Math.min(100, (mon.ivs[x] / 31) * 100)}% - 2px)`, background: STAT_COLOR[x] }} /></div>
                  <span className="v"><GT t={String(mon.ivs[x])} k={2} font={0} /></span>
                </div>
              ))}
              <GT t={es ? 'Máximo 31 por estadística' : 'At most 31 per stat'} k={1} color={MUTED} />
            </div>
          </div>
        </div>
      )}
      {tab === 'moves' && (
        <div className="sx-stats">
          <div className="sx-title"><i /><GT t={es ? 'MOVIMIENTOS' : 'MOVES'} k={2} font={0} /></div>
          {mv && mi ? (
            <div className="sx-detail"><div className="sx-dun">
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <TypePlate type={mi.category} scale={1} /><GT t={mv} k={3} font={0} /><TypeChip type={mi.type} k={1} />
                <GT t={`${es ? 'POT' : 'PWR'}: ${mi.power || '—'}   |   ${es ? 'PRE' : 'ACC'}: ${mi.accuracy === true ? '—' : mi.accuracy + '%'}`} k={1} color={MUTED} />
              </span>
              <GT t={moveFacts(mv, lang)} k={kText} maxWidth={textW} />
              <GT t={moveGameText(mv, lang)} k={kText} maxWidth={textW} color={MUTED} />
              {onChange && <button className="sx-btn rh" onClick={() => setPickFor(pickFor === sel ? null : sel)}><span><GT t={es ? 'Cambiar movimiento' : 'Replace move'} k={kText} color="#ffffff" /></span></button>}
            </div></div>
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


