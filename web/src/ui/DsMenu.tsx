import { useEffect, useRef, useState } from 'react'
import { Dex } from '@pkmn/sim'
import { CATEGORY, nameOf, useLang } from '../i18n'
import FontText from './FontText'
import ItemIcon from './ItemIcon'
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

/** The game's move button picture comes with a few stray specks around it (pieces of the neighbouring pictures): keep only the biggest piece and trim the edges. */
function cleanedFrame(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const x = c.getContext('2d')!
  x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, c.width, c.height)
  const W = c.width, H = c.height
  const label = new Int32Array(W * H).fill(-1)
  const sizes: number[] = []
  for (let s = 0; s < W * H; s++) {
    if (label[s] >= 0 || d.data[s * 4 + 3] === 0) continue
    const id = sizes.length
    let n = 0
    const stack = [s]
    label[s] = id
    while (stack.length) {
      const p = stack.pop()!
      n++
      const px = p % W, py = (p / W) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (label[q] >= 0 || d.data[q * 4 + 3] === 0) continue
        label[q] = id
        stack.push(q)
      }
    }
    sizes.push(n)
  }
  if (sizes.length < 2) return c
  const keep = sizes.indexOf(Math.max(...sizes))
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let i = 0; i < W * H; i++) {
    if (label[i] !== keep) { d.data[i * 4 + 3] = 0; continue }
    const px = i % W, py = (i / W) | 0
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
  }
  x.putImageData(d, 0, 0)
  if (x1 < 0) return c
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/** The game's grey move button (cleaned) with its outline painted in the colour of a move type. */
function useTypedFrame(type: string): string | null {
  const grey = useUiUrl('move:grey')
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!grey) return
    const key = `${grey}|${type}`
    const hit = recolored.get(key)
    if (hit) { setUrl(hit); return }
    const col = TYPE_COLOR[type as PType]
    const img = new Image()
    img.onload = () => {
      const c = cleanedFrame(img)
      if (col) {
        const x = c.getContext('2d')!
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
      }
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
      <span className="ds-move-name"><FontText text={nameOf(mv.name)} font={1} k={S} color="#ffffff" shadow="#202028" /></span>
      <span className="ds-move-meta">
        <TypePlate type={mv.type} scale={S * 1.0} />
        <FontText text={`PP ${mv.pp}/${mv.maxpp}`} font={1} k={S} color="#ffffff" shadow="#202028" />
      </span>
    </button>
  )
}

/**
 * The Poké Ball of the command screens opens (to show the moves) and closes (back to the commands): the closed ball is cut in two halves
 * that slide away / together. `open` = the halves slide away (moves screen starts), otherwise they slide together (back to the commands).
 */
function BallHalves({ S, open, onDone }: { S: number; open: boolean; onDone?: () => void }) {
  const closed = useUiUrl('menu:bg')
  if (!closed) return null
  const half = (top: boolean): React.CSSProperties => ({
    position: 'absolute', left: 0, width: 256 * S, height: 96 * S, top: top ? 0 : 96 * S, overflow: 'hidden', pointerEvents: 'none', zIndex: 6,
    backgroundImage: `url(${closed})`, backgroundSize: `${256 * S}px ${192 * S}px`, backgroundPosition: top ? '0 0' : `0 -${96 * S}px`, imageRendering: 'pixelated',
    animation: `${open ? (top ? 'pq-half-up' : 'pq-half-down') : (top ? 'pq-half-in-up' : 'pq-half-in-down')} .16s cubic-bezier(.5,0,.5,1) forwards`,
  })
  return (
    <>
      <div style={half(true)} onAnimationEnd={onDone} />
      <div style={half(false)} />
    </>
  )
}

/** The bar at the top of the lower screen of the real game: the time, and the (switched off) IR / ONLINE / WIRELESS lights. */
function ScreenBar({ S }: { S: number }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(id) }, [])
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0')
  const k = Math.max(1, S)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 256 * S, height: 12 * S, background: '#16181e', pointerEvents: 'none', zIndex: 4 }}>
      <div style={{ position: 'absolute', left: 8 * S, top: 1 * S }}><FontText text={`${hh}:${mm}`} font={1} k={k} color="#d8dae4" shadow={null} /></div>
      <div style={{ position: 'absolute', left: 72 * S, top: 1 * S, opacity: 0.45 }}><FontText text="•IR  •ONLINE  •WIRELESS" font={1} k={k} color="#8a8c98" shadow={null} /></div>
      <div style={{ position: 'absolute', right: 8 * S, top: 3 * S, width: 7 * S, height: 6 * S, border: `${Math.max(1, S)}px solid #d8dae4`, borderRadius: 1 }} />
    </div>
  )
}

/** The little balls on the Poké Ball: the trainer's Pokémon (small, top) and yours (big when healthy, small when the place is empty, dark when fainted). */
function PartyDots({ S, party, foeCount }: { S: number; party?: Array<'ok' | 'fnt' | 'none'>; foeCount?: number }) {
  const dot = (x: number, y: number, d: number, key: string, kind: 'ok' | 'fnt' | 'none') => (
    <span key={key} style={{ position: 'absolute', left: (x - d / 2) * S, top: (y - d / 2) * S, width: d * S, height: d * S, boxSizing: 'border-box', borderRadius: '50%', background: kind === 'fnt' ? '#3a3a44' : kind === 'ok' ? '#fff' : 'transparent', border: `${Math.max(1, S)}px solid ${kind === 'none' ? '#b8b8c4' : '#ffffff'}`, opacity: kind === 'fnt' ? 0.7 : 1 }}>
      {kind === 'ok' && <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: '#e83030', borderRadius: '99px 99px 0 0' }} />}
    </span>
  )
  const list = party ?? []
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      {foeCount ? Array.from({ length: 6 }, (_, i) => dot(100 + i * 9, 33, 6, `f${i}`, i < foeCount ? 'ok' : 'none')) : null}
      {list.length ? list.slice(0, 6).map((st, i) => st === 'none' ? dot(98 + i * 15, 121, 6, `m${i}`, 'none') : (
        <span key={`m${i}`} style={{ position: 'absolute', left: (91 + i * 15 - 11) * S, top: (121 - 11) * S, opacity: st === 'fnt' ? 0.45 : 1 }}><ItemIcon name="Poke Ball" size={22 * S} /></span>
      )) : null}
    </div>
  )
}

/**
 * The lower screen while nothing can be chosen (reference video): the Poké Ball closed and dim (the command picture seen from further away, dark), the ring around it.
 * When the commands come the ball zooms in and lights up (see .cmd-in), when a command was chosen it zooms out and dims again (this).
 */
export function IdleBall({ S }: { S: number }) {
  const bg = useUiUrl('menu:bg')
  return (
    <div className="ds-screen idle-ball" style={{ width: 256 * S, height: 192 * S, overflow: 'hidden', background: '#101216' }}>
      <ScreenBar S={S} />
      <div className="idle-ball-pic" style={{ position: 'absolute', inset: 0, backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '100% 100%', imageRendering: 'pixelated' }} />
      <div style={{ position: 'absolute', left: '50%', top: '53%', width: 118 * S, height: 118 * S, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `${Math.max(1, S)}px solid rgba(255,255,255,.1)`, boxShadow: '0 0 0 ' + 6 * S + 'px rgba(255,255,255,.05)' }} />
    </div>
  )
}

/** The battle command screen drawn like the original: Poké Ball backdrop, FIGHT in the middle, BAG / POKÉMON / RUN below. */
export function CommandScreen({ S, onFight, onBag, onPokemon, onRun, pokemonOff, runOff, closing, party, foeCount }: {
  S: number; onFight: () => void; onBag: () => void; onPokemon: () => void; onRun: () => void; pokemonOff: boolean; runOff: boolean; closing?: boolean
  /** your six places: a healthy Pokémon, a fainted one, or empty */
  party?: Array<'ok' | 'fnt' | 'none'>
  /** how many Pokémon the trainer has (0 = a wild battle: no row) */
  foeCount?: number
}) {
  const [closingNow, setClosingNow] = useState(!!closing)
  const movesBg = useUiUrl('moves:bg')
  const bg = useUiUrl('menu:bg')
  const fight = useUiUrl('cmd:fight')
  const bag = useUiUrl('cmd:bag'), poke = useUiUrl('cmd:pokemon'), run = useUiUrl('cmd:run')
  const Btn = ({ img, x, y, w, h, label, onClick, off }: { img: string | null; x: number; y: number; w: number; h: number; label: string; onClick: () => void; off?: boolean }) => (
    <button className="ds-btn" aria-label={label} disabled={off} onClick={() => { decide(); onClick() }} style={{ left: x * S, top: y * S, width: w * S, height: h * S, opacity: off ? 0.4 : 1 }}>
      {img ? <img src={img} alt={label} draggable={false} style={{ width: '100%', height: '100%' }} /> : label}
    </button>
  )
  return (
 <div style={{ width: 256 * S, height: 192 * S, overflow: 'hidden', background: '#101216', position: 'relative' }}>
 <div className="ds-screen cmd-in" style={{ width: 256 * S, height: 192 * S, backgroundImage: closingNow && movesBg ? `url(${movesBg})` : bg ? `url(${bg})` : undefined }}>
      {closingNow && <BallHalves S={S} open={false} onDone={() => setClosingNow(false)} />}
      <ScreenBar S={S} />
      {!closingNow && <PartyDots S={S} party={party} foeCount={foeCount} />}
      <button className="ds-btn" aria-label="Fight" onClick={() => { decide(); onFight() }} style={{ left: 84 * S, top: 86 * S, width: 89 * S, height: 21 * S }}>
        {fight ? <img className="ds-fight-label" src={fight} alt="Fight" draggable={false} style={{ width: '100%', height: '100%' }} /> : null}
      </button>
      <Btn img={bag} x={6} y={142} w={93} h={46} label="Bag" onClick={onBag} />
      <Btn img={run} x={96} y={150} w={64} h={37} label="Run" onClick={onRun} off={runOff} />
      <Btn img={poke} x={157} y={142} w={93} h={46} label="Pokémon" onClick={onPokemon} off={pokemonOff} />
    </div>
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
      <BallHalves S={S} open />
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
  const facts = moveFacts(mv.name, lang)
  const game = moveGameText(mv.name, lang)
  const W = Math.floor((256 * S - 14 * S) / S)
  return (
    <div style={{ position: 'absolute', left: 0, bottom: '100%', marginBottom: 6, width: 256 * S, padding: `${4 * S}px ${6 * S}px`, boxSizing: 'border-box', maxHeight: 170 * S, overflow: 'hidden', background: 'rgba(16,18,26,.94)', border: '2px solid rgba(255,255,255,.7)', borderRadius: 6, color: '#fff', zIndex: 40, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 * S, marginBottom: 2 * S }}>
        <FontText text={nameOf(mv.name)} font={0} k={S} />
        <TypePlate type={mv.type} scale={S * 1.05} />
        <FontText text={lang === 'es' ? CATEGORY[m.category] ?? m.category : m.category} font={1} k={S} />
        <span style={{ marginLeft: 'auto' }}><FontText text={`${lang === 'es' ? 'Potencia' : 'Power'} ${m.basePower || '—'} · ${lang === 'es' ? 'Precisión' : 'Accuracy'} ${m.accuracy === true ? '—' : m.accuracy}`} font={1} k={S} align="right" /></span>
      </div>
      <FontText text={facts} font={1} k={S} maxWidth={W} color="#ffffff" />
      {game && <div style={{ marginTop: 3 * S, borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 3 * S }}><FontText text={game} font={1} k={S} maxWidth={W} color="#b8b8c8" shadow="#40404c" /></div>}
    </div>
  )
}
