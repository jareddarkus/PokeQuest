// The lower battle screen in the modern look: command buttons, move cards and the move info (light slanted cards, Unbounded Black titles, Lexend text).
import { useState, type CSSProperties } from 'react'
import { Dex } from '@pkmn/sim'
import { CATEGORY, nameOf, useLang } from '../i18n'
import { moveFacts, moveGameText } from '../data/moveText'
import { TYPE_COLOR, type PType } from '../game/world'
import { music } from '../audio/music'
import TypePlate from './TypePlate'
import type { MoveView } from './DsMenu'
import { useUiUrl } from './CmdButton'

/** Small line icons for the Modern battle buttons (drawn here, one colour: they take the colour of the button's text). */
const Svg = ({ children }: { children: React.ReactNode }) => <svg className="mxb-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
const FightIcon = () => <Svg><path d="M5 19 L18 6 M12 6 H18 V12" /><path d="M19 19 L6 6 M12 6 H6 V12" /></Svg>
const RunIcon = () => <Svg><path d="M13 4 L9 11 L14 13 L12 20" /><circle cx="16" cy="5" r="1.6" /><path d="M9 11 L4 12" /><path d="M14 13 L18 11" /></Svg>
const BackIcon = () => <Svg><path d="M10 6 L4 12 L10 18" /><path d="M4 12 H20" /></Svg>
/** a picture from the game's own menu icons (Bag, Poké Ball ...) */
function GameIcon({ n }: { n: number }) {
  const u = useUiUrl(`menu:icon${n}`)
  return u ? <img className="mxb-gico" src={u} alt="" draggable={false} /> : <span className="mxb-gico" />
}

const decide = () => { void music.playSfx('se:decide') }
const cancel = () => { void music.playSfx('se:cancel') }

type Dot = 'ok' | 'fnt' | 'none'

/** The little balls: your six places (a healthy Pokémon, a fainted one, empty) and, in a trainer battle, the foe's. */
function Dots({ party, foeCount }: { party?: Dot[]; foeCount?: number }) {
  return (
    <div className="mxb-dots">
      {foeCount ? <span className="mxb-dotrow foe">{Array.from({ length: 6 }, (_, i) => <i key={i} className={i >= 6 - foeCount ? 'ok' : 'none'} />)}</span> : <span />}
      <span className="mxb-dotrow">{(party ?? []).slice(0, 6).map((st, i) => <i key={i} className={st} />)}</span>
    </div>
  )
}

function Box({ S, children, className = '', h = 176 }: { S: number; children: React.ReactNode; className?: string; h?: number }) {
  return <div className={`mxb ${className}`} style={{ width: 256 * S + 6, height: h * S + 3, ['--s' as string]: `${S}px` } as CSSProperties}>{children}</div>
}

/** Nothing can be chosen right now (the foe is acting): the same card, quiet. */
export function ModernIdle({ S }: { S: number }) {
  return <Box S={S} className="idle" h={124}><span className="mxb-idle"><i /><i /><i /></span></Box>
}

export function ModernCommand({ S, onFight, onBag, onPokemon, onRun, party, foeCount }: {
  S: number; onFight: () => void; onBag: () => void; onPokemon: () => void; onRun: () => void; party?: Dot[]; foeCount?: number
}) {
  useLang()
  return (
    <Box S={S} h={124}>
      <div className="mxb-head"><span className="mxb-title"><GameIcon n={9} />{useLang() === 'es' ? 'Combate' : 'Battle'}</span><Dots party={party} foeCount={foeCount} /></div>
      <button className="mxb-fight" onClick={() => { decide(); onFight() }}><span className="mxb-ico"><FightIcon /><span>Fight</span></span></button>
      <div className="mxb-three">
        <button onClick={() => { decide(); onBag() }}><span className="mxb-ico"><GameIcon n={7} /><span>Bag</span></span></button>
        <button onClick={() => { decide(); onPokemon() }}><span className="mxb-ico"><GameIcon n={12} /><span>Pokémon</span></span></button>
        <button onClick={() => { decide(); onRun() }}><span className="mxb-ico"><RunIcon /><span>Run</span></span></button>
      </div>
    </Box>
  )
}

function MoveInfo({ mv }: { mv: MoveView }) {
  const lang = useLang()
  const es = lang === 'es'
  const m = Dex.moves.get(mv.id)
  const facts = moveFacts(mv.name, lang), game = moveGameText(mv.name, lang)
  return (
    <div className="mxb-info">
      <div className="mxb-info-top"><b>{nameOf(mv.name)}</b><TypePlate type={mv.type} scale={1} /></div>
      <div className="mxb-info-grid">
        <span><small>{es ? 'Categoría' : 'Category'}</small>{es ? CATEGORY[m.category] ?? m.category : m.category}</span>
        <span><small>{es ? 'Potencia' : 'Power'}</small>{m.basePower || '—'}</span>
        <span><small>{es ? 'Precisión' : 'Accuracy'}</small>{m.accuracy === true ? '—' : `${m.accuracy}%`}</span>
        <span><small>PP</small>{mv.pp}/{mv.maxpp}</span>
      </div>
      {facts && <p>{facts}</p>}
      {game && <p className="soft">{game}</p>}
    </div>
  )
}

export function ModernMoves({ S, moves, party, onMove, onBack }: { S: number; moves: MoveView[]; party?: Dot[]; onMove: (i: number) => void; onBack: () => void }) {
  const lang = useLang()
  const [info, setInfo] = useState<MoveView | null>(null)
  return (
    <div style={{ position: 'relative' }}>
      {info && <div className="mxb-info-wrap" style={{ width: 256 * S + 6 }}><MoveInfo mv={info} /></div>}
      <Box S={S} className="moves" h={160}>
        <div className="mxb-head"><span className="mxb-title"><FightIcon />{lang === 'es' ? 'Movimientos' : 'Moves'}</span><Dots party={party} /></div>
        <div className="mxb-moves">
          {moves.slice(0, 4).map((mv, i) => {
            const color = TYPE_COLOR[mv.type as PType] ?? '#777'
            const power = Dex.moves.get(mv.id).basePower
            return (
              <button key={mv.id} className="mxb-move" disabled={mv.disabled} style={{ ['--c' as string]: color } as CSSProperties}
                onMouseEnter={() => setInfo(mv)} onMouseLeave={() => setInfo(null)} onFocus={() => setInfo(mv)} onBlur={() => setInfo(null)}
                onClick={() => { decide(); onMove(i) }}>
                <span className="mxb-move-in">
                  <span className="mxb-move-name"><TypePlate type={Dex.moves.get(mv.id).category} scale={0.75} /><b>{nameOf(mv.name)}</b></span>
                  <span className="mxb-move-meta">{lang === 'es' ? 'POT' : 'PWR'}: {power || '—'}   |   PP: {mv.pp}/{mv.maxpp}</span>
                </span>
              </button>
            )
          })}
        </div>
        <button className="mxb-back" onClick={() => { cancel(); onBack() }}><span className="mxb-ico"><BackIcon /><span>Back</span></span></button>
      </Box>
    </div>
  )
}
