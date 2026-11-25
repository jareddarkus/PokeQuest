import { useEffect, useRef, useState } from 'react'
import { Dex } from '@pkmn/sim'
import { CATEGORY, useLang } from '../i18n'
import { moveFacts, moveGameText } from '../data/moveText'
import { TYPE_COLOR, type PType } from '../game/world'
import { useUiUrl } from './CmdButton'
import TypePlate from './TypePlate'
import { music } from '../audio/music'
const decide = () => { void music.playSfx('se:decide') }
const cancel = () => { void music.playSfx('se:cancel') }

/** The size of the "bottom screen" of the DS in screen pixels (the game's pictures are 256 x 192). */
export function dsScale(): number {
  return Math.max(1, Math.min(1.5, (window.innerWidth - 16) / 256))
}

const recolored = new Map<string, string>()

/** The game's grey move button with its outline painted in the colour of a move type. */
function useTypedFrame(type: string): string | null {
  const grey = useUiUrl('move:grey')
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!grey) return
    const key = `${grey}|${type}`
    const hit = recolored.get(key)
    if (hit) { setUrl(hit); return }
    const col = TYPE_COLOR[type as PType]
    if (!col) { setUrl(grey); return }
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const x = c.getContext('2d')!
      x.drawImage(img, 0, 0)
      const d = x.getImageData(0, 0, c.width, c.height)
      const n = parseInt(col.slice(1), 16)
      const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255
      for (let i = 0; i < d.data.length; i += 4) {
        if (!d.data[i + 3]) continue
        const lum = Math.max(d.data[i], d.data[i + 1], d.data[i + 2])
        if (lum > 120) { // the light outline pixels
          const f = 0.5 + 0.5 * (lum / 255)
          d.data[i] = R * f; d.data[i + 1] = G * f; d.data[i + 2] = B * f
        }
      }
      x.putImageData(d, 0, 0)
      const out = c.toDataURL()
      recolored.set(key, out)
      setUrl(out)
    }
    img.src = grey
  }, [grey, type])
  return url
}

export interface MoveView { id: string; name: string; type: string; pp: number; maxpp: number; disabled?: boolean }

function MoveButton({ mv, x, y, S, onClick, onInfo }: { mv: MoveView; x: number; y: number; S: number; onClick: () => void; onInfo: (m: MoveView | null) => void }) {
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const frame = useTypedFrame(mv.type)
  const off = mv.disabled || mv.pp === 0
  return (
    <button
      className="ds-move"
      disabled={off}
      onClick={() => { if (longPressed.current) { longPressed.current = false; return } decide(); onClick() }}
      onMouseEnter={() => onInfo(mv)}
      onMouseLeave={() => onInfo(null)}
      // on a phone: press and hold to read what the move does
      onPointerDown={(e) => { if (e.pointerType === 'touch') { longPressed.current = false; timer.current = window.setTimeout(() => { longPressed.current = true; onInfo(mv) }, 350) } }}
      onPointerUp={(e) => { if (e.pointerType === 'touch') { if (timer.current) window.clearTimeout(timer.current); if (longPressed.current) window.setTimeout(() => onInfo(null), 2500) } }}
      onPointerCancel={() => { if (timer.current) window.clearTimeout(timer.current) }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: x * S, top: y * S, width: 127 * S, height: 46 * S, background: frame ? `url(${frame}) center / 100% 100% no-repeat` : '#222', opacity: off ? 0.45 : 1 }}
    >
      <span className="ds-move-name" style={{ fontSize: 8.5 * S }}>{mv.name}</span>
      <span className="ds-move-meta" style={{ fontSize: 7 * S }}>
        <TypePlate type={mv.type} scale={S * 1.15} />
        <b>PP {mv.pp}/{mv.maxpp}</b>
      </span>
    </button>
  )
}

/** The battle command screen drawn like the original: Poké Ball backdrop, FIGHT in the middle, BAG / POKÉMON / RUN below. */
export function CommandScreen({ S, onFight, onBag, onPokemon, onRun, pokemonOff, runOff }: {
  S: number; onFight: () => void; onBag: () => void; onPokemon: () => void; onRun: () => void; pokemonOff: boolean; runOff: boolean
}) {
  const bg = useUiUrl('menu:bg')
  const fight = useUiUrl('cmd:fight')
  const bag = useUiUrl('cmd:bag'), poke = useUiUrl('cmd:pokemon'), run = useUiUrl('cmd:run')
  const Btn = ({ img, x, y, w, h, label, onClick, off }: { img: string | null; x: number; y: number; w: number; h: number; label: string; onClick: () => void; off?: boolean }) => (
    <button className="ds-btn" aria-label={label} disabled={off} onClick={() => { decide(); onClick() }} style={{ left: x * S, top: y * S, width: w * S, height: h * S, opacity: off ? 0.4 : 1 }}>
      {img ? <img src={img} alt={label} draggable={false} style={{ width: '100%', height: '100%' }} /> : label}
    </button>
  )
  return (
    <div className="ds-screen" style={{ width: 256 * S, height: 192 * S, backgroundImage: bg ? `url(${bg})` : undefined }}>
      <button className="ds-btn" aria-label="Fight" onClick={() => { decide(); onFight() }} style={{ left: 84 * S, top: 86 * S, width: 89 * S, height: 21 * S }}>
        {fight ? <img className="ds-fight-label" src={fight} alt="Fight" draggable={false} style={{ width: '100%', height: '100%' }} /> : null}
      </button>
      <Btn img={bag} x={6} y={142} w={93} h={46} label="Bag" onClick={onBag} />
      <Btn img={run} x={96} y={150} w={64} h={37} label="Run" onClick={onRun} off={runOff} />
      <Btn img={poke} x={157} y={142} w={93} h={46} label="Pokémon" onClick={onPokemon} off={pokemonOff} />
    </div>
  )
}

/** The move screen: four coloured move buttons and the back arrow. */
export function MoveScreen({ S, moves, onMove, onBack }: { S: number; moves: MoveView[]; onMove: (i: number) => void; onBack: () => void }) {
  const bg = useUiUrl('moves:bg')
  const back = useUiUrl('cmd:back')
  const pos: Array<[number, number]> = [[0, 26], [129, 26], [0, 76], [129, 76]]
  const [info, setInfo] = useState<MoveView | null>(null)
  return (
    <div className="ds-screen" style={{ width: 256 * S, height: 192 * S, backgroundImage: bg ? `url(${bg})` : undefined }}>
      {moves.slice(0, 4).map((mv, i) => <MoveButton key={mv.id} mv={mv} x={pos[i][0]} y={pos[i][1]} S={S} onClick={() => onMove(i)} onInfo={setInfo} />)}
      {info && <MoveInfoCard mv={info} S={S} />}
      <button className="ds-btn" aria-label="Back" onClick={() => { cancel(); onBack() }} style={{ left: 88 * S, top: 136 * S, width: 80 * S, height: 44 * S }}>
        {back ? <img src={back} alt="Back" draggable={false} style={{ width: '100%', height: '100%' }} /> : 'Back'}
      </button>
    </div>
  )
}

/** What a move does: type, kind, power, accuracy, PP and its description (shown while the mouse is over it, or after a long press). */
function MoveInfoCard({ mv, S }: { mv: MoveView; S: number }) {
  const lang = useLang()
  const m = Dex.moves.get(mv.id)
  return (
    <div style={{ position: 'absolute', left: 0, bottom: '100%', marginBottom: 6, width: 256 * S, padding: `${4 * S}px ${6 * S}px`, boxSizing: 'border-box', maxHeight: 150 * S, overflow: 'hidden', background: 'rgba(16,18,26,.94)', border: '2px solid rgba(255,255,255,.7)', borderRadius: 6, color: '#fff', fontSize: 7.5 * S, lineHeight: 1.3, zIndex: 40, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 * S, marginBottom: 2 * S }}>
        <strong style={{ fontSize: 9 * S }}>{mv.name}</strong>
        <TypePlate type={mv.type} scale={S * 1.25} />
        <span>{lang === 'es' ? CATEGORY[m.category] ?? m.category : m.category}</span>
        <span style={{ marginLeft: 'auto' }}>{lang === 'es' ? 'Potencia' : 'Power'} {m.basePower || '—'} · {lang === 'es' ? 'Precisión' : 'Accuracy'} {m.accuracy === true ? '—' : m.accuracy}</span>
      </div>
      <div style={{ fontWeight: 600 }}>{moveFacts(mv.name, lang)}</div>
      {moveGameText(mv.name, lang) && <div style={{ opacity: 0.72, fontStyle: 'italic', marginTop: 3 * S, borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 3 * S }}>{moveGameText(mv.name, lang)}</div>}
    </div>
  )
}
