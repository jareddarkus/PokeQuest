import { useEffect, useRef, useState } from 'react'
import { snap } from './pixel'
import { Dex } from '@pkmn/sim'
import { CATEGORY, nameOf, useLang } from '../i18n'
import FontText from './FontText'
import { moveFacts, moveGameText } from '../data/moveText'
import { TYPE_COLOR, type PType } from '../game/world'
import { useUiUrl } from './CmdButton'
import TypePlate from './TypePlate'
import { music } from '../audio/music'
const decide = () => { void music.playSfx('se:decide') }
const cancel = () => { void music.playSfx('se:cancel') }

/** The size of the "bottom screen" of the DS in screen pixels (the game's pictures are 256 x 192). */
export function dsScale(): number {
  // wide windows: a little smaller than twice the DS size where the screen allows it (otherwise 2); phones: as wide as fits; always whole device pixels per picture pixel
  const byWidth = window.innerWidth >= 2500 ? 3 : window.innerWidth >= 1800 ? 2.5 : window.innerWidth >= 1000 ? 2 : (window.innerWidth - 16) / 256
  const byHeight = (window.innerHeight * 0.55 - 6) / 220 // the lower screen never takes more than about half of the window's height (the battle needs the room above it)
  return snap(Math.max(1, Math.min(byWidth, byHeight)))
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

/** The lower battle screen without the black bar at the top of the DS screen (time / IR / ONLINE / WIRELESS): its top 16 pixels are cut away. */
function Lower({ S, children }: { S: number; children: React.ReactNode }) {
  return (
    <div style={{ width: 256 * S + 6, height: 176 * S + 3, overflow: 'hidden', flex: 'none' }}>
      <div style={{ marginTop: -16 * S }}>{children}</div>
    </div>
  )
}

/**
 * The little balls on the Poké Ball of the lower screen (the game's own pictures; positions measured on the reference video, in DS pixels).
 * Top row (the trainer's Pokémon, small, y 50, x 108 + 8.2 i): the places with a Pokémon are on the RIGHT, empty rings on the left.
 * Bottom row (yours, y 137, x 87 + 16.4 i): big balls first (left), small rings for the empty places. Fainted = the dark ball.
 */
function PartyDots({ S, party, foeCount }: { S: number; party?: Array<'ok' | 'fnt' | 'none'>; foeCount?: number }) {
  const big = useUiUrl('bt:ball'), bigFnt = useUiUrl('bt:ballfnt'), ring = useUiUrl('bt:sring'), small = useUiUrl('bt:sball')
  const pic = (src: string | null, x: number, y: number, d: number, key: string, fnt = false) => src ? (
    <img key={key} src={src} alt="" draggable={false} style={{ position: 'absolute', left: (x - d / 2) * S, top: (y - d / 2) * S, width: d * S, height: d * S, opacity: fnt ? 0.9 : 1, imageRendering: 'pixelated' }} />
  ) : null
  const list = party ?? []
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      {foeCount ? Array.from({ length: 6 }, (_, i) => { const has = i >= 6 - foeCount; return pic(has ? small : ring, 108.2 + 8.2 * i, 50, has ? 8 : 8, `f${i}`) }) : null}
      {list.length ? list.slice(0, 6).map((st, i) => st === 'none' ? pic(ring, 87 + 16.4 * i, 137, 8, `m${i}`) : st === 'fnt' ? pic(bigFnt, 87 + 16.4 * i, 137, 16, `m${i}`, true) : pic(big, 87 + 16.4 * i, 137, 16, `m${i}`)) : null}
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
    <Lower S={S}>
    <div className="ds-screen idle-ball" style={{ width: 256 * S, height: 192 * S, overflow: 'hidden', background: '#101216' }}>
      <div className="idle-ball-pic" style={{ position: 'absolute', inset: 0, backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '100% 100%', imageRendering: 'pixelated' }} />
      <div style={{ position: 'absolute', left: '50%', top: '53%', width: 118 * S, height: 118 * S, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `${Math.max(1, S)}px solid rgba(255,255,255,.1)`, boxShadow: '0 0 0 ' + 6 * S + 'px rgba(255,255,255,.05)' }} />
    </div>
    </Lower>
  )
}

/** The battle command screen drawn like the original: Poké Ball backdrop, FIGHT in the middle, BAG / POKÉMON / RUN below. */
export function CommandScreen({ S, onFight, onBag, onPokemon, onRun, closing, party, foeCount }: {
  S: number; onFight: () => void; onBag: () => void; onPokemon: () => void; onRun: () => void; closing?: boolean
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
<Lower S={S}>
 <div style={{ width: 256 * S, height: 192 * S, overflow: 'hidden', background: '#101216', position: 'relative' }}>
 <div className="ds-screen cmd-in" style={{ width: 256 * S, height: 192 * S, backgroundImage: closingNow && movesBg ? `url(${movesBg})` : bg ? `url(${bg})` : undefined }}>
      {closingNow && <BallHalves S={S} open={false} onDone={() => setClosingNow(false)} />}
      {!closingNow && <PartyDots S={S} party={party} foeCount={foeCount} />}
      <button className="ds-btn" aria-label="Fight" onClick={() => { decide(); onFight() }} style={{ left: 84 * S, top: 86 * S, width: 89 * S, height: 21 * S }}>
        {fight ? <img className="ds-fight-label" src={fight} alt="Fight" draggable={false} style={{ width: '100%', height: '100%' }} /> : null}
      </button>
      <Btn img={bag} x={0} y={147} w={79} h={46} label="Bag" onClick={onBag} />
      <Btn img={run} x={96} y={156} w={64} h={37} label="Run" onClick={onRun} />
      <Btn img={poke} x={177} y={147} w={79} h={46} label="Pokémon" onClick={onPokemon} />
    </div>
 </div>
</Lower>
  )
}

/** The move screen: four coloured move buttons and the back arrow. */
export function MoveScreen({ S, moves, onMove, onBack }: { S: number; moves: MoveView[]; onMove: (i: number) => void; onBack: () => void }) {
  const bg = useUiUrl('moves:bg')
  const back = useUiUrl('cmd:back')
  const pos: Array<[number, number]> = [[0, 26], [129, 26], [0, 76], [129, 76]]
  const [info, setInfo] = useState<MoveView | null>(null)
  return (
    <div style={{ position: 'relative' }}>
      <Lower S={S}>
        <div className="ds-screen" style={{ width: 256 * S, height: 192 * S, backgroundImage: bg ? `url(${bg})` : undefined }}>
          <BallHalves S={S} open />
          {moves.slice(0, 4).map((mv, i) => <MoveButton key={mv.id} mv={mv} x={pos[i][0]} y={pos[i][1]} S={S} onClick={() => onMove(i)} onInfo={setInfo} />)}
          <button className="ds-btn" aria-label="Back" onClick={() => { cancel(); onBack() }} style={{ left: 88 * S, top: 136 * S, width: 80 * S, height: 44 * S }}>
            {back ? <img src={back} alt="Back" draggable={false} style={{ width: '100%', height: '100%' }} /> : 'Back'}
          </button>
        </div>
      </Lower>
      {info && <MoveInfoCard mv={info} S={S} />}
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
