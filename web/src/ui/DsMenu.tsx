import { useEffect, useRef, useState, type ReactNode } from 'react'
import { snap } from './pixel'
import { Dex } from '@pkmn/sim'
import { nameOf, useLang } from '../i18n'
import FontText from './FontText'
import { moveFacts, moveGameText } from '../data/moveText'
import { TYPE_COLOR, type PType } from '../game/world'
import { useUiUrl } from './CmdButton'
import TypePlate from './TypePlate'
import { music } from '../audio/music'
import { ModernCommand, ModernIdle, ModernMoves } from './ModernBattle'
import { useTheme } from './theme'
const decide = () => { void music.playSfx('se:decide') }
const cancel = () => { void music.playSfx('se:cancel') }

/** The size of the "bottom screen" of the DS in screen pixels (the game's pictures are 256 x 192). */
export function dsScale(): number {
  // wide windows: a little smaller than twice the DS size where the screen allows it (otherwise 2); phones: as wide as fits; always whole device pixels per picture pixel
  const byWidth = window.innerWidth >= 2500 ? 3 : window.innerWidth >= 1800 ? 2.5 : window.innerWidth >= 1000 ? 2 : (window.innerWidth - 16) / 256
  const byHeight = (window.innerHeight * 0.55 - 6) / 220 // the lower screen never takes more than about half of the window's height (the battle needs the room above it)
  return snap(Math.max(1, Math.min(byWidth, byHeight)))
}

/** Wide windows (desktop): the lower screen and the message log sit in the bottom right corner and the battle picture uses the rest of the window. */
export function sideLayout(): boolean { return window.innerWidth >= 1000 && window.innerWidth / window.innerHeight >= 1.3 }
/** The width of the lower screen in screen pixels. */
export function lowerWidth(): number { return 256 * dsScale() + 6 }

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

/**
 * The red corner marks around the move that is selected (measured on a picture of the real game: they sit on the four corners of a 129 x 50 frame
 * around the button; each is a 3 pixel line, pale outline with a crimson middle, with a diagonal corner). 14 x 13 pixels.
 */
const CORNER = [
  '.....WWWWWWWWW',
  '....WRRRRRRRRW',
  '...WRWWWWWWWWW',
  '..WRW.........',
  '.WRW..........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WRW...........',
  'WWW...........',
]
function Corner({ S, flipX, flipY, style }: { S: number; flipX?: boolean; flipY?: boolean; style: React.CSSProperties }) {
  return (
    <svg width={14 * S} height={13 * S} viewBox="0 0 14 13" shapeRendering="crispEdges" style={{ position: 'absolute', pointerEvents: 'none', transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`, ...style }}>
      {CORNER.flatMap((row, y) => Array.from(row).map((ch, x) => ch === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={ch === 'R' ? '#b02a48' : '#f8e4ec'} />))}
    </svg>
  )
}

/** the grey shadow the game puts under the letters of the move buttons */
const MOVE_SHADOW = '#787878'

function MoveButton({ mv, x, y, S, selected, onSelect, onClick, onInfo }: { mv: MoveView; x: number; y: number; S: number; selected: boolean; onSelect: () => void; onClick: () => void; onInfo: (m: MoveView | null) => void }) {
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const frame = useTypedFrame(mv.type)
  const off = mv.disabled || mv.pp === 0
  const pp = `${mv.pp}/${mv.maxpp}`
  return (
    <>
    <button
      className="ds-move"
      disabled={off}
      onClick={() => { if (longPressed.current) { longPressed.current = false; return } decide(); onClick() }}
      onMouseEnter={() => { onSelect(); onInfo(mv) }}
      onMouseLeave={() => onInfo(null)}
      // on a phone: press and hold to read what the move does
      onPointerDown={(e) => { onSelect(); if (e.pointerType === 'touch') { longPressed.current = false; timer.current = window.setTimeout(() => { longPressed.current = true; onInfo(mv) }, 350) } }}
      onPointerUp={(e) => { if (e.pointerType === 'touch') { if (timer.current) window.clearTimeout(timer.current); if (longPressed.current) window.setTimeout(() => onInfo(null), 2500) } }}
      onPointerCancel={() => { if (timer.current) window.clearTimeout(timer.current) }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: x * S, top: y * S, width: 127 * S, height: 44 * S, padding: 0, display: 'block', background: frame ? `url(${frame}) center / 100% 100% no-repeat` : '#222', opacity: off ? 0.45 : 1 }}
    >
      {/* the name in the middle (main font), below it: the type label, "PP" and the numbers on the right (positions measured on the real game) */}
      <span style={{ position: 'absolute', left: 0, right: 0, top: 5 * S, display: 'flex', justifyContent: 'center' }}>
        <FontText text={nameOf(mv.name)} font={0} k={S} color="#ffffff" shadow={MOVE_SHADOW} align="center" />
      </span>
      <span style={{ position: 'absolute', left: 17 * S, top: 20 * S, lineHeight: 0 }}><TypePlate type={mv.type} scale={S} /></span>
      <span style={{ position: 'absolute', left: 51 * S, top: 20 * S }}><FontText text="PP" font={0} k={S} color="#ffffff" shadow={MOVE_SHADOW} /></span>
      <span style={{ position: 'absolute', right: 22 * S, top: 20 * S }}><FontText text={pp} font={0} k={S} color="#ffffff" shadow={MOVE_SHADOW} align="right" /></span>
    </button>
    {selected && !off && (
      <>
        <Corner S={S} style={{ left: x * S, top: (y - 4) * S }} />
        <Corner S={S} flipX style={{ left: (x + 129 - 14) * S, top: (y - 4) * S }} />
        <Corner S={S} flipY style={{ left: x * S, top: (y + 46 - 13) * S }} />
        <Corner S={S} flipX flipY style={{ left: (x + 129 - 14) * S, top: (y + 46 - 13) * S }} />
      </>
    )}
    </>
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
function ClassicIdle({ S }: { S: number }) {
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
function ClassicCommand({ S, onFight, onBag, onPokemon, onRun, closing, party, foeCount }: {
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
  // (a plain function, not a component: a component made here would be a new one on every update, the buttons would be rebuilt while a finger is on them and the tap would be lost)
  const btn = ({ img, x, y, w, h, label, onClick, off }: { img: string | null; x: number; y: number; w: number; h: number; label: string; onClick: () => void; off?: boolean }) => (
    <button key={label} className="ds-btn" aria-label={label} disabled={off} onClick={() => { decide(); onClick() }} style={{ left: x * S, top: y * S, width: w * S, height: h * S, opacity: off ? 0.4 : 1 }}>
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
      {btn({ img: bag, x: 0, y: 147, w: 79, h: 46, label: 'Bag', onClick: onBag })}
      {btn({ img: run, x: 96, y: 156, w: 64, h: 37, label: 'Run', onClick: onRun })}
      {btn({ img: poke, x: 177, y: 147, w: 79, h: 46, label: 'Pokémon', onClick: onPokemon })}
    </div>
 </div>
</Lower>
  )
}

/** The move screen: four coloured move buttons with the red corners on the chosen one, the row of party balls and the back button (bottom right). */
let lastMoveSlot = 0
function ClassicMoves({ S, moves, party, onMove, onBack, foeTypes }: { S: number; moves: MoveView[]; party?: Array<'ok' | 'fnt' | 'none'>; onMove: (i: number) => void; onBack: () => void; foeTypes?: string[] }) {
  const bg = useUiUrl('moves:bg')
  const back = useUiUrl('cmd:back')
  const pos: Array<[number, number]> = [[0, 34], [129, 34], [0, 82], [129, 82]]
  const [info, setInfo] = useState<MoveView | null>(null)
  const [sel, setSel] = useState(Math.min(lastMoveSlot, Math.max(0, moves.length - 1)))
  return (
    <div style={{ position: 'relative' }}>
      <Lower S={S}>
        <div className="ds-screen" style={{ width: 256 * S, height: 192 * S, backgroundImage: bg ? `url(${bg})` : undefined }}>
          <BallHalves S={S} open />
          <PartyDots S={S} party={party} />
          {moves.slice(0, 4).map((mv, i) => <MoveButton key={mv.id} mv={mv} x={pos[i][0]} y={pos[i][1]} S={S} selected={sel === i} onSelect={() => { lastMoveSlot = i; setSel(i) }} onClick={() => onMove(i)} onInfo={setInfo} />)}
          <button className="ds-btn" aria-label="Back" onClick={() => { cancel(); onBack() }} style={{ left: 176 * S, top: 146 * S, width: 80 * S, height: 44 * S }}>
            {back ? <img src={back} alt="Back" draggable={false} style={{ width: '100%', height: '100%' }} /> : 'Back'}
          </button>
        </div>
      </Lower>
      {info && <MoveInfoCard mv={info} S={S} foeTypes={foeTypes} />}
    </div>
  )
}

/** What a move does, in a clean grid: name + type, then category / power / accuracy / PP, then what it does and what the game says about it. */
/** How a move fares against the foe's type(s): by the type chart only (the words of the game's own battle messages). */
function effectOf(moveType: string, m: { category: string; damage?: unknown }, foeTypes: string[]): 'none' | 'weak' | 'normal' | 'strong' | null {
  if (m.category === 'Status' || !foeTypes.length) return null
  if (!Dex.getImmunity(moveType, foeTypes)) return 'none'
  if (m.damage) return 'normal' // (a move of fixed damage ignores weaknesses)
  const e = foeTypes.reduce((sum, t) => sum + Dex.getEffectiveness(moveType, t), 0)
  return e > 0 ? 'strong' : e < 0 ? 'weak' : 'normal'
}
const EFFECT_LABEL = {
  en: { none: 'No effect', weak: 'Not very effective', normal: 'Effective', strong: 'Super effective' },
  es: { none: 'No afecta', weak: 'Poco eficaz', normal: 'Eficaz', strong: 'Muy eficaz' },
} as const
const EFFECT_COLOR = { none: '#b8b8c8', weak: '#ff9a7a', normal: '#ffffff', strong: '#7dff9a' } as const

function MoveInfoCard({ mv, S, foeTypes }: { mv: MoveView; S: number; foeTypes?: string[] }) {
  const lang = useLang()
  const es = lang === 'es'
  const m = Dex.moves.get(mv.id)
  const facts = moveFacts(mv.name, lang)
  const game = moveGameText(mv.name, lang)
  const W = Math.floor((256 * S - 16 * S) / S)
  const eff = effectOf(mv.type, m as never, foeTypes ?? [])
  const cells: Array<[string, string | ReactNode]> = [
    [es ? 'Categoría' : 'Category', <TypePlate type={m.category} scale={S} />], // (the icon of physical / special / status, not the word)
    [es ? 'Potencia' : 'Power', m.basePower ? String(m.basePower) : '—'],
    [es ? 'Precisión' : 'Accuracy', m.accuracy === true ? '—' : `${m.accuracy}%`],
    ['PP', `${mv.pp}/${mv.maxpp}`],
  ]
  const line = '1px solid rgba(255,255,255,.18)'
  return (
    <div style={{ position: 'absolute', left: 0, bottom: '100%', width: 256 * S + 6, boxSizing: 'border-box', background: 'rgba(14,16,24,.97)', border: '2px solid rgba(255,255,255,.55)', color: '#fff', zIndex: 40, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${4 * S}px ${6 * S}px`, borderBottom: line }}>
        <FontText text={nameOf(mv.name)} font={0} k={S} color="#ffffff" shadow={MOVE_SHADOW} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 * S }}>
          {eff && <FontText text={EFFECT_LABEL[es ? 'es' : 'en'][eff]} font={1} k={S} color={EFFECT_COLOR[eff]} shadow="#30343c" />}
          <TypePlate type={mv.type} scale={S} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: line }}>
        {cells.map(([label, value], i) => (
          <div key={label} style={{ padding: `${3 * S}px ${5 * S}px`, borderLeft: i ? line : 'none', display: 'flex', flexDirection: 'column', gap: S }}>
            <FontText text={label} font={1} k={S} color="#a8b0c8" shadow="#30343c" />
            {typeof value === 'string' ? <FontText text={value} font={0} k={S} color="#ffffff" shadow={MOVE_SHADOW} /> : value}
          </div>
        ))}
      </div>
      <div style={{ padding: `${4 * S}px ${6 * S}px`, display: 'flex', flexDirection: 'column', gap: 3 * S }}>
        {facts && <FontText text={facts} font={2} k={S} maxWidth={W} color="#ffffff" shadow={MOVE_SHADOW} />}
        {game && <div style={{ borderTop: line, paddingTop: 3 * S }}><FontText text={game} font={1} k={S} maxWidth={W} color="#b8b8c8" shadow="#40404c" /></div>}
      </div>
    </div>
  )
}

// The lower battle screen: the game's own pictures (classic look) or light slanted cards (modern look).
export function IdleBall({ S }: { S: number }) {
  return useTheme() === 'modern' ? <ModernIdle S={S} /> : <ClassicIdle S={S} />
}
type CommandProps = Parameters<typeof ClassicCommand>[0]
export function CommandScreen(props: CommandProps) {
  return useTheme() === 'modern' ? <ModernCommand S={props.S} onFight={props.onFight} onBag={props.onBag} onPokemon={props.onPokemon} onRun={props.onRun} party={props.party} foeCount={props.foeCount} /> : <ClassicCommand {...props} />
}
type MovesProps = Parameters<typeof ClassicMoves>[0]
export function MoveScreen(props: MovesProps) {
  return useTheme() === 'modern' ? <ModernMoves S={props.S} moves={props.moves} party={props.party} onMove={props.onMove} onBack={props.onBack} /> : <ClassicMoves {...props} />
}
