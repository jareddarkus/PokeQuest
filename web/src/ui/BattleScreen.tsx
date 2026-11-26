import { SplFx } from '../rom/splFx'
import { runEffScript, FIRST_EFFECT, type EffHost, type Side as MonSide } from '../rom/effVm'
import { useEffect, useMemo, useRef, useState } from 'react'
import { snap } from './pixel'
import { BattleSession, type BattleEvent, type Request } from '../battle/engine'
import { PvpGuestSession } from '../battle/pvp'
import { allSpecies, dexNum, maxHp, statsOf, type Mon } from '../data/dex'
import { ITEMS } from '../data/items'
import {
  addEvs, catchChance, evYield, evolve, expGain, gainExp, healMon, levelEvolution, rollCatch, useItemFromBag, type Trainer,
} from '../game/state'
import { useUiUrl } from './CmdButton'
import StatusIcon from './StatusIcon'
import BattleBackdrop from './BattleBackdrop'
import BattleTransition from './BattleTransition'
import type { BattleBackdrop3D } from '../rom/battleScene'
import type { BattleLayout } from '../rom/battleScene'
import MonSprite, { preloadPixel } from './MonSprite'
import { CommandScreen, IdleBall, MoveScreen, dsScale, sideLayout, lowerWidth } from './DsMenu'
import PartyScreen from './PartyScreen'
import BagScreen from './BagScreen'
import { Dex } from '@pkmn/sim'
import { music } from '../audio/music'
import { warmAnim } from './AnimSprite'
import { trainerBackPic, trainerFrontPic } from '../rom/trainerPics'
import { hardEdges, type AnimatedSprite } from '../rom/anim'
import { playerBackClass, trainerClassFor } from '../data/trainerClasses'
import { MoveFx, FX_NAMES } from './moveFx'
import { trText, useLang } from '../i18n'
import FontText from './FontText'
import { useTheme } from './theme'
import { RULES } from '../game/rules'
import { nameOf } from '../i18n'

export type BattleKind = 'wild' | 'trainer' | 'gym'
/** An online duel (two players at the peak): who runs the battle, and how messages go to / come from the other player. */
export interface PvpLink {
  role: 'host' | 'guest'
  hostName: string
  guestName: string
  send: (type: string, data: unknown) => void
  listen: (cb: (type: string, data: unknown) => void) => () => void
}
export type BattleOutcome = 'win' | 'lose' | 'caught' | 'ran'

interface Props {
  trainer: Trainer
  foeTeam: Mon[]
  kind: BattleKind
  foeName?: string
  /** identifies the trainer (its picture is chosen from it) */
  foeSeed?: string
  /** set for a duel against another player */
  pvp?: PvpLink
  /** the player's character is the girl */
  playerGirl?: boolean
  /** how fast the message text is typed */
  textSpeed?: 'slow' | 'normal' | 'fast' | 'instant'
  onEnd: (outcome: BattleOutcome, trainer: Trainer) => void
}

export interface Side { uid: string; species: string; level: number; hp: number; maxHp: number; shiny: boolean; fainted: boolean; status?: string }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
let sendKey = 0

/** Milliseconds per typed letter (a tap on the message box finishes the sentence at once). */
export const CHAR_MS = { slow: 55, normal: 30, fast: 13, instant: 0 }

/** The battle message, typed letter by letter. The sentence is translated first, so the page never types English and then flips to Spanish. */
export function TypedText({ text, ms, skip }: { text: string; ms: number; skip: number }) {
  useLang()
  const full = trText(text)
  const [n, setN] = useState(ms ? 0 : full.length)
  useEffect(() => {
    if (!ms) { setN(full.length); return }
    setN(0)
    let i = 0
    const id = window.setInterval(() => { i++; setN(i); if (i >= full.length) window.clearInterval(id) }, ms)
    return () => window.clearInterval(id)
  }, [full, ms])
  useEffect(() => { if (skip) setN(full.length) }, [skip])
  // the log box is as wide as the lower screen, so its text is as big as the lower screen's pixels (the game's own font: white with a light grey shadow)
  const S = dsScale()
  useDsK() // (re-draw when the window changes size)
  if (useTheme() === 'modern') return <span className="mxb-text" style={{ fontSize: 8.4 * S }}>{full.slice(0, n)}</span>
  return <FontText text={full} reveal={n} k={S} font={0} color="#f8f8f8" shadow="#a4b0b0" maxWidth={Math.floor(256 - 16)} style={{ textAlign: 'left' }} />
}

/** The nearest whole number of device pixels per picture pixel (the player's back picture is about 0.57 of the platform's width in the game: platform 136 DS pixels, picture 77). */
function snapNear(k: number): number {
  const dpr = window.devicePixelRatio || 1
  return Math.max(1 / dpr, Math.round(k * dpr) / dpr)
}

/** A trainer standing on a platform: the foe's still picture, or the player's back picture that throws the ball. Slides away when `out`. */
function TrainerFigure({ still, sprite, k, side, out, play, sil }: { still?: HTMLCanvasElement | null; sprite?: AnimatedSprite | null; k: number; side: 'foe' | 'me'; out: boolean; play: number; sil?: 0 | 1 }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = still ? 80 : sprite?.size ?? 128
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    if (still) { ctx.drawImage(still, 0, 0); return }
    if (!sprite) return
    if (!play) { sprite.draw(ctx, 0); hardEdges(ctx, size, size); return }
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) * 60
      ctx.clearRect(0, 0, size, size)
      sprite.draw(ctx, Math.min(t, sprite.loopLength - 1))
      hardEdges(ctx, size, size)
      if (t < sprite.loopLength) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [still, sprite, play, size])
  return <canvas ref={ref} width={size} height={size} className={`tr-fig ${side} ${out ? 'out' : sil === undefined ? '' : `sil${sil}`}`} style={{ width: size * k, height: size * k }} />
}

/**
 * The row of six small Poké Balls of a team (measured on the reference video, in DS pixels): a black bar slides in from the screen edge (foe: from the left
 * at y 49, yours: from the right at y 124), the six balls sit above it 15 pixels apart (foe y 40, yours y 114), the places with a Pokémon nearest the middle
 * of the screen; the balls pop in one after another (the outermost first, then from the middle outwards), each turning into view.
 */
function TeamBalls({ side, count, alive, K }: { side: 'foe' | 'me'; count: number; alive: boolean[]; K: number }) {
  const ball = useUiUrl('bt:ball'), fnt = useUiUrl('bt:ballfnt'), none = useUiUrl('bt:ballno')
  const foe = side === 'foe'
  const order = [1, 2, 3, 4, 5, 0] // pop order of the places counted from the middle (j = 5 outermost first)
  return (
    <div className="tbs" style={{ ['--k' as string]: `${K}px` }}>
      <span className={`tbs-bar ${foe ? 'foe' : 'me'}`} style={{ top: (foe ? 48.8 : 122.4) * K, height: 3.6 * K, width: (foe ? 137 : 133.5) * K }} />
      {Array.from({ length: 6 }, (_, j) => {
        const x = foe ? 15.2 + 15 * (5 - j) : 256 - (15.2 + 15 * (5 - j))
        const src = j < count ? (alive[j] ? ball : fnt) : none
        return src ? <img key={j} className="tbs-ball" src={src} alt="" draggable={false} style={{ left: foe ? (x - 8) * K : undefined, right: foe ? undefined : (256 - x - 8) * K, top: ((foe ? 40 : 114.2) - 8) * K, width: 16 * K, height: 16 * K, animationDelay: `${0.12 + order[j] * 0.1}s` }} /> : null
      })}
    </div>
  )
}

/** Screen pixels per DS pixel for the battle UI: the 256 x 192 top screen fits into the picture area (so the boxes and the text are as big as in the game). */
export function useDsK(): number {
  const [k, setK] = useState(() => dsK())
  useEffect(() => { const f = () => setK(dsK()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return k
}
function dsK(): number {
  // the top screen is the picture above the log box and the lower screen
  const side = sideLayout()
  const W = window.innerWidth - (side ? lowerWidth() : 0), H = window.innerHeight - bottomHeight()
  return snap(Math.max(1.2, Math.min(W / 256, H / 192)))
}
/** The height of the log box + the lower screen (screen pixels). */
export function bottomHeight(): number { return sideLayout() ? 0 : 216 * dsScale() + 6 }

/** Where the game's 4:3 picture lies in the window (the HP boxes and the team balls are placed inside it). */
function zoneVars(layout: BattleLayout | null, Kd: number): Record<string, string> {
  const W = window.innerWidth, H = window.innerHeight
  if (layout) {
    const f = layout.frame
    return { '--zone-l': `${f.l}px`, '--zone-r': `${Math.max(0, W - f.l - f.w)}px`, '--zone-t': `${f.t}px`, '--zone-b': `${sideLayout() ? Math.max(0, H - f.t - f.h) : bottomHeight()}px` }
  }
  const l = Math.max(0, (W - 256 * Kd) / 2)
  return { '--zone-l': `${l}px`, '--zone-r': `${l}px`, '--zone-t': '0px', '--zone-b': `${bottomHeight()}px` }
}

/** one 8 x 8 picture (tile `t` of the glyph sheet: gauge pieces 0-26, ball 27, digits 41-50, "Lv" 52, slash 64 ...) at DS position x, y */
function Tile({ url, t, x, y, K }: { url: string; t: number; x: number; y: number; K: number }) {
  return <div style={{ position: 'absolute', left: x * K, top: y * K, width: 8 * K, height: 8 * K, backgroundImage: `url(${url})`, backgroundSize: `${128 * K}px ${40 * K}px`, backgroundPosition: `${-(t & 15) * 8 * K}px ${-(t >> 4) * 8 * K}px`, imageRendering: 'pixelated' }} />
}
/** a row of gauge tiles: `n` tiles of 8 pixels, `px` pixels filled; `base` = first tile of the colour (0 green, 9 yellow, 18 red; +0 empty ... +8 full) or the EXP set (32, blue) */
function Gauge({ url, K, x, y, n, px, base }: { url: string; K: number; x: number; y: number; n: number; px: number; base: number }) {
  return <>{Array.from({ length: n }, (_, i) => <Tile key={i} url={url} t={base + Math.max(0, Math.min(8, px - i * 8))} x={x + i * 8} y={y} K={K} />)}</>
}
const DIGIT = 41 // tile of the digit 0 in the sheet
const SLASH = 64
/** a number written with the game's digit pictures (8 pixels per digit), starting at x */
function Digits({ url, K, x, y, text }: { url: string; K: number; x: number; y: number; text: string }) {
  return <>{[...text].map((ch, i) => (ch === ' ' ? null : <Tile key={i} url={url} t={ch === '/' ? SLASH : DIGIT + Number(ch)} x={x + i * 8} y={y} K={K} />))}</>
}

/** The HP shown drains (or fills) smoothly towards the real value, 30 gauge pixels (of 48) per second like the game's bar. */
function useDrain(target: number, max: number): number {
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      if (cur.current !== target) {
        const step = ((30 * Math.max(1, max)) / 48) * dt
        cur.current = Math.abs(target - cur.current) <= step ? target : cur.current + Math.sign(target - cur.current) * step
        setV(cur.current)
      }
      if (cur.current !== target) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, max])
  return v
}

/**
 * The HP box of Pokémon Black 2 / White 2, built from the game's own pictures like the real one (measured on the reference video, in DS pixels):
 * the name in the game's font (white, black outline), the gender sign, "Lv" and the level in the game's digits, the grey plate with the HP label, the
 * 48-pixel HP gauge (yours also shows the HP numbers and the 80-pixel EXP gauge).
 */
function ClassicHpBox({ side, mine, exp, gender, k, nameFont = 2 }: { side: Side; mine: boolean; exp?: number; gender?: 'M' | 'F' | 'N'; k?: number; nameFont?: 0 | 1 | 2 }) {
  const strip = useUiUrl(mine ? 'hp:stripme' : 'hp:stripfoe')
  const sheet = useUiUrl('hp:glyphs')
  const K0 = useDsK()
  const K = k ?? K0
  const shownHp = useDrain(side.hp, side.maxHp)
  const frac = side.maxHp > 0 ? Math.max(0, Math.min(1, shownHp / side.maxHp)) : 0
  const fillPx = shownHp > 0 ? Math.max(1, Math.min(48, Math.floor(48 * frac))) : 0
  const gaugeBase = frac > 0.5 ? 0 : frac > 0.2 ? 9 : 18
  const lo = side.level ** 3, hi = (side.level + 1) ** 3
  const expPx = exp === undefined ? 0 : Math.max(0, Math.min(80, Math.floor((80 * (exp - lo)) / Math.max(1, hi - lo))))
  // positions (DS pixels, relative to the box): foe box origin = screen (6, 31), yours = screen (145, 112)
  const G = mine ? { strip: [0, 11], name: [9, 1.4], gender: [63.3, 2.3], lv: [70.2, 2.4], lvl: [79, 3.3], gauge: [46.8, 9.5], hp: [47.5, 16], exp: [23.2, 24.1], w: 124, h: 36 } : { strip: [0, 10.5], name: [13.7, 1.1], gender: [68, 1.8], lv: [76.1, 3.1], lvl: [84.1, 2.1], gauge: [37.3, 10.1], hp: [0, 0], exp: [0, 0], w: 112, h: 24 }
  const hpText = `${String(Math.max(0, Math.ceil(shownHp))).padStart(3, ' ')}/${side.maxHp}`
  return (
    <div className={`hp2 ${mine ? 'mine' : 'foe'}`} style={{ width: G.w * K, height: G.h * K, ['--k' as string]: `${K}px` }}>
      {strip && <img src={strip} alt="" draggable={false} style={{ position: 'absolute', left: G.strip[0] * K, top: G.strip[1] * K, width: (mine ? 124 : 112) * K, height: (mine ? 16 : 12) * K, imageRendering: 'pixelated' }} />}
      <div style={{ position: 'absolute', left: G.name[0] * K, top: G.name[1] * K }}><FontText text={nameOf(side.species)} font={nameFont} k={K} color="#f8f8f8" shadow="#101010" /></div>
      {sheet && (
        <>
          {gender && gender !== 'N' && <div style={{ position: 'absolute', left: (G.gender[0] - 1) * K, top: (G.gender[1] - 1) * K }}><FontText text={gender === 'M' ? '♂' : '♀'} font={3} k={K} color={gender === 'M' ? '#38a0f8' : '#e82838'} shadow="#101010" outline /></div>}
          <Tile url={sheet} t={52} x={G.lv[0]} y={G.lv[1]} K={K} />
          <div style={{ position: 'absolute', left: (G.lvl[0] - 1) * K, top: (G.lvl[1] - 1) * K }}><FontText text={String(side.level)} font={3} k={K} color="#f8f8f8" shadow="#101010" outline /></div>
          <Gauge url={sheet} K={K} x={G.gauge[0]} y={G.gauge[1]} n={6} px={fillPx} base={gaugeBase} />
          {/* the black end pieces of the gauges (a pixel at the start and at the end, like the game) */}
          <div style={{ position: 'absolute', left: (G.gauge[0] - 1) * K, top: (G.gauge[1] + 2) * K, width: K, height: 5 * K, background: '#101010' }} />
          <div style={{ position: 'absolute', left: (G.gauge[0] + 48) * K, top: (G.gauge[1] + 2) * K, width: K, height: 5 * K, background: '#101010' }} />
          {mine && <Digits url={sheet} K={K} x={G.hp[0]} y={G.hp[1]} text={hpText} />}
          {mine && <Gauge url={sheet} K={K} x={G.exp[0]} y={G.exp[1]} n={10} px={expPx} base={32} />}
          {mine && <div style={{ position: 'absolute', left: (G.exp[0] - 1) * K, top: (G.exp[1] + 1) * K, width: K, height: 4 * K, background: '#101010' }} />}
          {mine && <div style={{ position: 'absolute', left: (G.exp[0] + 80) * K, top: (G.exp[1] + 1) * K, width: K, height: 4 * K, background: '#101010' }} />}
        </>
      )}
      <div style={{ position: 'absolute', left: (mine ? 112 : 100) * K, top: (mine ? 14 : 12) * K }}><StatusIcon status={side.fainted ? 'fnt' : side.status} scale={K / 1.5} /></div>
    </div>
  )
}

/** The HP box in the modern look: a light slanted card with the name, level, the HP gauge (and the numbers and the EXP gauge for yours). */
function ModernHpBox({ side, mine, exp, gender, k }: { side: Side; mine: boolean; exp?: number; gender?: 'M' | 'F' | 'N'; k?: number }) {
  const K0 = useDsK()
  const K = k ?? K0
  const shownHp = useDrain(side.hp, side.maxHp)
  const frac = side.maxHp > 0 ? Math.max(0, Math.min(1, shownHp / side.maxHp)) : 0
  const lo = side.level ** 3, hi = (side.level + 1) ** 3
  const expFrac = exp === undefined ? 0 : Math.max(0, Math.min(1, (exp - lo) / Math.max(1, hi - lo)))
  const color = frac > 0.5 ? '#19c37d' : frac > 0.2 ? '#f0a800' : '#e03a4c'
  return (
    <div className={`hp2 mxh ${mine ? 'mine' : 'foe'}`} style={{ width: (mine ? 124 : 112) * K, height: (mine ? 40 : 30) * K, ['--k' as string]: `${K}px`, fontSize: 6.6 * K }}>
      <div className="mxh-card"><div className="mxh-in">
        <div className="mxh-top">
          <b className="mxh-name">{nameOf(side.species)}</b>
          {gender && gender !== 'N' && <span className="mxh-g" style={{ color: gender === 'M' ? '#2a7de1' : '#e0467c' }}>{gender === 'M' ? '♂' : '♀'}</span>}
          <span className="mxh-lv">Lv {side.level}</span>
          <span className="mxh-st"><StatusIcon status={side.fainted ? 'fnt' : side.status} scale={K / 1.5} /></span>
        </div>
        <div className="mxh-row"><span className="mxh-lab">PS</span><span className="mxh-bar"><i style={{ width: `${frac * 100}%`, background: color }} /></span></div>
        {mine && <div className="mxh-num">{Math.max(0, Math.ceil(shownHp))} / {side.maxHp}</div>}
        {mine && <div className="mxh-row"><span className="mxh-lab">EXP</span><span className="mxh-bar exp"><i style={{ width: `${expFrac * 100}%` }} /></span></div>}
      </div></div>
    </div>
  )
}

export function HpBox(props: Parameters<typeof ClassicHpBox>[0]) {
  return useTheme() === 'modern' ? <ModernHpBox side={props.side} mine={props.mine} exp={props.exp} gender={props.gender} k={props.k} /> : <ClassicHpBox {...props} />
}
export default function BattleScreen({ trainer, foeTeam, kind, foeName, foeSeed, pvp, playerGirl, textSpeed = 'normal', onEnd }: Props) {
  const playerTeam = useMemo(() => trainer.team.filter((m) => m.hp > 0).map((m) => ({ ...m, evs: { ...m.evs }, ivs: { ...m.ivs }, moves: [...m.moves] })), [])
  const foeCopies = useMemo(() => foeTeam.map((m) => ({ ...m, evs: { ...m.evs }, ivs: { ...m.ivs }, moves: [...m.moves] })), [])
  const [me, setMe] = useState<Side | null>(null)
  const [foe, setFoe] = useState<Side | null>(null)
  const [text, setText] = useState('')
  const [skip, setSkip] = useState(0)
  const [rows, setRows] = useState<null | 'foe' | 'me'>(null) // the row of six balls shown while a trainer is introduced
  const fromFight = useRef(false) // coming back from the move screen: the Poké Ball closes
  const [foePic, setFoePic] = useState<HTMLCanvasElement | null>(null) // the foe trainer's picture
  const [myPic, setMyPic] = useState<AnimatedSprite | null>(null) // your own trainer's back picture
  const [trOut, setTrOut] = useState({ foe: false, me: false }) // sliding away
  const [trGone, setTrGone] = useState({ foe: false, me: false }) // gone
  const [throwKey, setThrowKey] = useState(0)
  const catchRef = useRef<HTMLImageElement>(null)
  const trSent = useRef({ foe: false, me: false })
  const [hpOn, setHpOn] = useState({ foe: false, me: false }) // the HP boxes show once the Pokémon stand on their platform
  const [showScene, setShowScene] = useState(false) // the battle picture is hidden while the way in (flash, bars) plays over the map
  const [introOn, setIntroOn] = useState(false) // the opening shot has begun
  const [transDone, setTransDone] = useState(false)
  const sceneRef = useRef<BattleBackdrop3D | null>(null)
  const introResolve = useRef<() => void>(() => {})
  const [send, setSend] = useState<null | { side: 'me' | 'foe'; key: number; wild?: boolean }>(null) // a Pokémon being sent out of its ball
  const wake = useRef<(() => void) | null>(null)
  const msPer = CHAR_MS[textSpeed] ?? 30
  /** how long a sentence takes to type, in milliseconds */
  const typeMs = (t: string) => trText(t).length * msPer
  /** waits, but a tap on the message box ends the wait early */
  const wait = (ms: number) => new Promise<void>((res) => { const id = window.setTimeout(done, ms); function done() { window.clearTimeout(id); if (wake.current === done) wake.current = null; res() } wake.current = done })
  /** shows a sentence and waits until it has been typed and read */
  const say = async (t: string, hold = 800) => { setText(t); await wait(typeMs(t) + hold) }
  const [mode, setMode] = useState<'wait' | 'menu' | 'fight' | 'switch' | 'bag' | 'done'>('wait')
  const S = dsScale()
  const KdBase = useDsK()
  const [req, setReq] = useState<Request | null>(null)
  const sessionRef = useRef<BattleSession | null>(null)
  const queue = useRef<BattleEvent[]>([])
  const pumping = useRef(false)
  const reqRef = useRef<Request | null>(null)
  const endedRef = useRef(false)
  const bagRef = useRef(trainer.bag)
  const [bag, setBagState] = useState(trainer.bag)
  const setBag = (b: Record<string, number>) => { bagRef.current = b; setBagState(b) }
  const caughtRef = useRef<Mon | null>(null)
  const itemsUsed = useRef(0) // the items used in this battle (at most RULES.itemsPerBattle)
  const ranRef = useRef(false)
  const [shake, setShake] = useState<'me' | 'foe' | null>(null)
  const [lunge, setLunge] = useState<'me' | 'foe' | null>(null)
  const shadowFor = (species: string) => Math.max(0.6, Math.min(1.25, 0.55 + 0.25 * Math.sqrt(Dex.species.get(species).heightm || 1)))
  const [layout, setLayoutState] = useState<BattleLayout | null>(null)
  const layoutRef = useRef<BattleLayout | null>(null)
  const setLayout = (l: BattleLayout) => { layoutRef.current = l; setLayoutState(l) }
  const Kd = KdBase
  const fxCanvas = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<MoveFx | null>(null)
  const splRef = useRef<SplFx | null>(null) // the game's own particle effects
  const splCanvas = useRef<HTMLCanvasElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const species = useRef<{ me: string; foe: string }>({ me: '', foe: '' })
  const environment = 'grass'
  const [ball, setBall] = useState<null | { shakes: number }>(null)
  const legendaryNames = useMemo(() => new Set(allSpecies().filter((s) => s.legendary).map((s) => s.name)), [])

  const teamRef = useRef(playerTeam)
  const hpOf = useRef<Record<string, number>>({})
  const pendingHit = useRef<string | null>(null)

  const showMenuIfReady = () => {
    if (endedRef.current) return
    const r = reqRef.current
    if (r && !r.wait) {
      reqRef.current = null
      setReq(r)
      void sceneRef.current?.moveCamera(8, 24, 0, 10) // back to the usual camera
      setMode(r.forceSwitch ? 'switch' : 'menu')
      setText(r.forceSwitch ? 'Choose your next Pokémon.' : `What will ${r.bench.find((b) => b.active)?.species ?? 'your Pokémon'} do?`)
    }
  }

  const pump = async () => {
    if (pumping.current) return
    pumping.current = true
    while (queue.current.length) {
      const ev = queue.current.shift()!
      switch (ev.kind) {
        case 'text':
          // "It's super effective!" comes before the damage: the game plays ONE hit sound for the damage (strong / normal / weak), so the choice is kept for the HP change
          if (/super effective/i.test(ev.text)) pendingHit.current = 'se:hitStrong'
          else if (/not very effective/i.test(ev.text)) pendingHit.current = 'se:hitWeak'
          if (/ sent out /i.test(ev.text)) setRows(null)
          if (/^Go! /.test(ev.text) && !trSent.current.me) setRows('me')
          await say(ev.text, 750); break
        case 'switch': {
          const who = ev.side === 'p1' ? 'me' : 'foe'
          species.current[ev.side === 'p1' ? 'me' : 'foe'] = ev.species
          const s: Side = { uid: ev.uid, species: ev.species, level: ev.level, hp: ev.hp, maxHp: ev.maxHp, shiny: ev.shiny, fainted: false }
          const ballOut = who === 'me' || kind !== 'wild' // trainers' Pokémon (and yours) come out of a Poké Ball; a wild Pokémon just appears
          setHpOn((o) => ({ ...o, [who]: false }))
          let thrown = false // your trainer throws the ball (the first Pokémon of the battle)
          if (who === 'me' && !trSent.current.me) { // your row of balls is shown while "Go!" is read, then your trainer throws the ball and fades away
            trSent.current.me = true
            thrown = true
            await sleep(300); setRows(null)
            setThrowKey((k) => k + 1)
            window.setTimeout(() => setTrOut((o) => ({ ...o, me: true })), 1070) // (64 frames after the throw starts, as in the game's script)
            window.setTimeout(() => setTrGone((o) => ({ ...o, me: true })), 1500)
          } else if (who === 'foe' && kind !== 'wild' && !trSent.current.foe) { // the foe trainer shrinks away while its ball shows
            trSent.current.foe = true
            setTrOut((o) => ({ ...o, foe: true }))
            window.setTimeout(() => setTrGone((o) => ({ ...o, foe: true })), 450)
          }
          let playMs = 1100
          if (ballOut) playMs = await sendOutScene(who, thrown, s, () => { setSend({ side: who, key: ++sendKey }); if (who === 'me') setMe(s); else setFoe(s) })
          else { setSend({ side: 'foe', key: ++sendKey, wild: true }); setFoe(s); void music.cryOf(ev.species, dexNum(ev.species)); await sleep(30); wildAppear('foe') }
          hpOf.current[ev.uid] = ev.hp
          await sleep(playMs)
          setSend(null)
          setHpOn((o) => ({ ...o, [who]: true })) // the HP box pops up once the Pokémon stands there
          break
        }
        case 'hp': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, hp: ev.hp, maxHp: ev.hp === 0 ? s.maxHp : ev.maxHp, status: ev.status ?? s.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          if (ev.uid in hpOf.current && ev.hp < hpOf.current[ev.uid]) { void music.playSfx(pendingHit.current ?? 'se:hit'); pendingHit.current = null }
          else if (ev.uid in hpOf.current && ev.hp > hpOf.current[ev.uid]) {
            const sd: 'me' | 'foe' = ev.side === 'p1' ? 'me' : 'foe'
            void (async () => { if (!(await runScript('effect', 45, sd, sd))) { void music.heal(); return } await runScript('effect', 50, sd, sd) })() // the game's own healing scripts (sound + effect)
          }
          const before = hpOf.current[ev.uid] ?? ev.hp
          hpOf.current[ev.uid] = ev.hp
          await sleep(Math.max(700, (Math.abs(ev.hp - before) / Math.max(1, ev.maxHp)) * 48 / 30 * 1000 + 350)) // the gauge drains at the game's speed
          break
        }
        case 'volatile': {
          const sd: 'me' | 'foe' = ev.side === 'p1' ? 'me' : 'foe'
          await runScript('effect', ev.what === 'confusion' ? 42 : 43, sd, sd) // the game's own animation (birds circling the head / hearts)
          break
        }
        case 'status': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, status: ev.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          { // the game's own animation of a status condition (scripts 37 - 44 of the effect archive: found by what their effect files show)
            const idx: Record<string, number> = { slp: 37, psn: 38, tox: 38, brn: 39, frz: 40, par: 41 }
            const e = ev.status ? idx[ev.status] : undefined
            const sd: 'me' | 'foe' = ev.side === 'p1' ? 'me' : 'foe'
            if (e !== undefined) await runScript('effect', e, sd, sd)
          }
          break
        }
        case 'move': {
          const num = Dex.moves.get(ev.move).num
          { // the game's own animation script of this move (camera pauses, effects, sounds with their delays, the hit reaction of the Pokémon)
            const m0 = Dex.moves.get(ev.move)
            const self0 = m0.target === 'self' || m0.target === 'allySide' || m0.target === 'allies' || m0.target === 'adjacentAllyOrSelf'
            const user0: 'me' | 'foe' = ev.side === 'p1' ? 'me' : 'foe'
            if (num && layoutRef.current && (await runScript('move', num, user0, self0 ? user0 : user0 === 'me' ? 'foe' : 'me'))) { await sleep(250); break }
          }
          if (num) void music.playSfx(`mv:${num}`)
          const mv = Dex.moves.get(ev.move)
          const L = layoutRef.current, fx = fxRef.current
          const contact = mv.category === 'Physical' && !!mv.flags.contact
          const selfT = mv.target === 'self' || mv.target === 'allySide' || mv.target === 'allies' || mv.target === 'adjacentAllyOrSelf'
          const hitSide = ev.side === 'p1' ? 'foe' : 'me'
          if (contact) { setLunge(ev.side === 'p1' ? 'me' : 'foe'); await sleep(250) }
          const splIds = splRef.current?.ready && num ? splRef.current.moveEffects(num) : []
          const userSide = ev.side === 'p1' ? 'me' : 'foe', targetSide = selfT ? userSide : hitSide
          if (splIds.length && L) {
            await playSpl(splIds, userSide, targetSide, !selfT && !contact && mv.category === 'Special') // the effect files the game's own script of this move starts
          } else if (fx?.ready && L) {
            const centre = (a: { x: number; y: number; w: number }) => ({ x: a.x, y: a.y + a.w * 0.1 - a.w * 0.38 })
            const from = ev.side === 'p1' ? L.me : L.foe, to = ev.side === 'p1' ? L.foe : L.me
            await fx.play({ type: mv.type, category: mv.category as 'Physical' | 'Special' | 'Status', contact, name: mv.name, selfTarget: selfT }, centre(from), centre(to), to.w * 0.85)
          } else if (!contact) await sleep(500)
          setLunge(null)
          if (mv.category !== 'Status') { setShake(hitSide); await sleep(450); setShake(null) } else await sleep(600)
          await sleep(fx?.ready ? 800 : 300)
          break
        }
        case 'stat': {
          // the game's own sounds (the picture of the stat-change effect is not decoded yet, nothing is invented here)
          const sd: 'me' | 'foe' = ev.side === 'p1' ? 'me' : 'foe'
          if (!(await runScript('effect', ev.amount > 0 ? 48 : 49, sd, sd))) { void music.playSfx(ev.amount > 0 ? 'be:12' : 'be:13'); await sleep(700) } // (the script plays its own sound)
          break
        }
        case 'faint': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, fainted: true, hp: 0 } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          void music.playSfx('se:faint')
          await sleep(1400)
          break
        }
        case 'win': endedRef.current = true; await finish(ev.side); break
        default: break
      }
    }
    pumping.current = false
    showMenuIfReady()
  }

  // the move-effect player (pictures from the game file)
  useEffect(() => {
    const c = fxCanvas.current
    if (!c) return
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight }
    size()
    window.addEventListener('resize', size)
    const fx = new MoveFx(c)
    fxRef.current = fx
    if (import.meta.env.DEV) (window as unknown as { __fx?: MoveFx }).__fx = fx // developer hook for testing the effects
    void fx.load(FX_NAMES)
    return () => { window.removeEventListener('resize', size); fx.stop(); fxRef.current = null }
  }, [])

  // the game's particle effects are drawn at the resolution of the DS screen (one canvas pixel = one picture pixel of the game's 256 x 192 screen) and scaled up sharp
  const splScale = layout ? Math.max(1, layout.frame.w / 256) : 1
  useEffect(() => {
    const c = splCanvas.current
    if (!c) return
    c.width = Math.max(1, Math.ceil(c.parentElement!.clientWidth / splScale)); c.height = Math.max(1, Math.ceil(c.parentElement!.clientHeight / splScale))
    if (!splRef.current) { const f = new SplFx(); splRef.current = f; void f.load() }
    splRef.current.attach(c)
    if (import.meta.env.DEV) (window as unknown as { __spl?: SplFx }).__spl = splRef.current
  }, [splScale, layout?.frame.w, layout?.frame.h])
  /** Plays effect files on a Pokémon (or flying from one to the other). */
  const playSpl = async (ids: number[], from: 'me' | 'foe', to: 'me' | 'foe', travel = false, maxFrames = 150) => {
    const spl = splRef.current, L = layoutRef.current
    if (!spl?.ready || !L || !ids.length) return
    const splScale = Math.max(1, L.frame.w / 256) // (worked out now: this function may be a copy from before the picture had its size)
    // the middle of the Pokémon's body: its picture stands on the platform's centre (yours is bigger and taller)
    const centre = (a: { x: number; y: number; w: number }, mine: boolean) => ({ x: a.x / splScale, y: (a.y - a.w * (mine ? 0.17 : 0.1)) / splScale })
    const a = from === 'me' ? L.me : L.foe, b = to === 'me' ? L.me : L.foe
    await spl.play(ids, centre(a, from === 'me'), centre(b, to === 'me'), 16, { travel, maxFrames }) // (one unit of the effects = 16 picture pixels of the game's screen)
  }

  /** The player of the game's own animation scripts (moves, stat changes, healing): what a script may do on this screen. */
  const runScript = async (kind: 'move' | 'effect', index: number, attacker: MonSide, defender: MonSide): Promise<boolean> => {
    const spl = splRef.current, L = layoutRef.current
    if (!spl?.ready || !L) return false
    const splScale = Math.max(1, L.frame.w / 256) // (worked out now: this function may be a copy from before the picture had its size)
    const data = kind === 'move' ? spl.moveScript(index) : spl.effectScript(index)
    if (!data) return false
    // (read when needed: the camera moves while a script runs and the Pokémon move on the screen with it)
    const feet = (s: MonSide) => { const L2 = layoutRef.current ?? L; const k = Math.max(1, L2.frame.w / 256); const a = s === 'me' ? L2.me : L2.foe; return { x: a.x / k, y: (a.y + a.w * 0.1) / k } }
    const el = (s: MonSide) => document.querySelector<HTMLElement>(`.stage-sprite[data-mon="${s}"]`)
    const pxUnit = 16 * splScale // screen pixels of one unit of the effects
    const host: EffHost = {
      sideOf: (c) => (c === 9 || c === 10 || c === 14 || c === 15 ? attacker : c === 11 || c === 12 || c === 16 || c === 17 ? defender : c === 18 ? 'all' : c === 19 ? 'me' : c === 20 ? 'foe' : c >= 0 && c <= 13 ? ((c & 1) === 1 ? 'foe' : 'me') : defender),
      load: (id) => spl.preload(id),
      emitter: (id, em, from, to, offX, offY, o) => {
        const f = feet(from), t = to ? feet(to) : null
        const dir = from === 'me' ? 1 : -1
        const at = { x: f.x + offX * 16 * dir, y: f.y - offY * 16 }
        return spl.emit(id, em, at, t ? { x: t.x, y: t.y - offY * 16 } : null, 16, o)
      },
      sound: (seq, delay, _v) => { window.setTimeout(() => void music.playSeq(seq), (delay * 1000) / 60) },
      sprite: (side, kind, a, b, frames, times) => {
        const targets = side === 'all' ? [el('me'), el('foe')] : [el(side)]
        const ms = Math.max(50, (frames * 1000) / 60)
        const jobs = targets.map((e, i) => {
          if (!e) return Promise.resolve()
          const sd: MonSide = side === 'all' ? (i === 0 ? 'me' : 'foe') : side
          e.style.transformOrigin = '50% 100%'
          const dir = sd === 'me' ? 1 : -1
          let frames2: Keyframe[]
          if (kind === 'scale') frames2 = [{ transform: 'scale(1,1)' }, { transform: `scale(${Math.max(0.05, 1 + a)},${Math.max(0.05, 1 + b)})` }]
          else if (kind === 'move') frames2 = [{ transform: 'translate(0,0)' }, { transform: `translate(${a * pxUnit * dir}px,${-b * pxUnit}px)` }]
          else if (kind === 'shake') frames2 = [{ transform: `translate(${-a * pxUnit}px,0)` }, { transform: `translate(${a * pxUnit}px,0)` }]
          else if (kind === 'rotate') { // (a = the angle: 0x10000000 = a full turn in the game's numbers; b = the axis: 1 / 2 / 3 = x / y / z)
            const fn = b === 1 ? 'perspective(600px) rotateX' : b === 2 ? 'perspective(600px) rotateY' : 'rotate'
            frames2 = [{ transform: `${fn}(0deg)` }, { transform: `${fn}(${a}deg)` }]
          }
          else if (kind === 'alpha') frames2 = [{ opacity: 1 }, { opacity: a }]
          else frames2 = [{ opacity: 1 }, { opacity: 0.15 }]
          const anim = e.animate(frames2, { duration: ms, iterations: Math.max(2, times * 2), direction: 'alternate', easing: 'linear', composite: kind === 'alpha' || kind === 'blink' ? 'replace' : 'add' })
          return anim.finished.then(() => { e.style.transformOrigin = '' }, () => { e.style.transformOrigin = '' })
        })
        return Promise.all(jobs).then(() => undefined)
      },
      tint: (side, from, to, frames, color) => {
        const targets: MonSide[] = side === 'all' ? ['me', 'foe'] : [side]
        const cr = (color & 31) / 31, cg = ((color >> 5) & 31) / 31, cb = ((color >> 10) & 31) / 31
        return Promise.all(targets.map((sd) => new Promise<void>((res) => {
          const e = el(sd)
          if (!e) { res(); return }
          if (!document.getElementById('pq-tint-defs')) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            svg.id = 'pq-tint-defs'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'
            svg.innerHTML = ['me', 'foe'].map((n) => `<filter id="pq-tint-${n}" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix id="pq-tint-m-${n}" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>`).join('')
            document.body.appendChild(svg)
          }
          const m = document.getElementById(`pq-tint-m-${sd}`)!
          const set = (t: number) => m.setAttribute('values', `${1 - t} 0 0 0 ${t * cr}  0 ${1 - t} 0 0 ${t * cg}  0 0 ${1 - t} 0 ${t * cb}  0 0 0 1 0`)
          const ms = Math.max(16, (frames * 1000) / 60), t0 = performance.now()
          set(from)
          e.style.filter = `url(#pq-tint-${sd})`
          const step = (now: number) => {
            const k = Math.min(1, (now - t0) / ms)
            set(from + (to - from) * k)
            if (k < 1) requestAnimationFrame(step)
            else { if (to <= 0.001) e.style.filter = ''; res() }
          }
          requestAnimationFrame(step)
        }))).then(() => undefined)
      },
      dim: (from, to, frames) => {
        const d = dimRef.current
        if (!d) return Promise.resolve()
        const anim = d.animate([{ opacity: from }, { opacity: to }], { duration: (frames * 1000) / 60, fill: 'forwards' })
        return anim.finished.then(() => { d.style.opacity = String(to); anim.cancel() }, () => undefined)
      },
      cry: (s) => { if (s !== 'all' && species.current[s]) void music.cryOf(species.current[s], dexNum(species.current[s])) },
      camera: (type, preset, frames, wait, brake) => {
        // which of the game's cameras a preset number means in a single battle: 9 / 10 = the attacker's, 11 / 12 = the defender's, 8 = the usual one
        const view = (s: MonSide) => (s === 'me' ? 0 : 1)
        const id = preset === 9 || preset === 10 ? view(attacker) : preset === 11 || preset === 12 ? view(defender) : preset === 14 || preset === 19 || preset === 20 || preset === 21 ? 14 : preset === 0 || preset === 1 ? preset : preset === 15 || preset === 16 ? -1 : 8
        if (id < 0) return Promise.resolve()
        return sceneRef.current?.moveCamera(id, type === 0 ? 0 : Math.max(1, frames), wait, brake) ?? Promise.resolve()
      },
      shakeCamera: (amp, frames, count) => {
        const c = document.querySelector<HTMLElement>('.stage-cam')
        if (!c) return Promise.resolve()
        const anim = c.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${amp * pxUnit}px,${amp * pxUnit * 0.6}px)` }], { duration: Math.max(30, (frames * 1000) / 60), iterations: Math.max(2, count * 2), direction: 'alternate', composite: 'add' })
        return anim.finished.then(() => undefined, () => undefined)
      },
      call: (effect) => (effect >= FIRST_EFFECT ? spl.effectScript(effect - FIRST_EFFECT) : spl.moveScript(effect)),
    }
    try { await runEffScript(data, host) } finally { for (const sd of ['me', 'foe'] as const) { const e = el(sd); if (e && e.style.filter.startsWith('url(#pq-tint')) e.style.filter = '' } if (dimRef.current) { dimRef.current.getAnimations().forEach((x) => x.cancel()); dimRef.current.style.opacity = '0' } }
    return true
  }

  if (import.meta.env.DEV) (window as unknown as { __run?: unknown; __layout?: unknown }).__layout = () => layoutRef.current
  if (import.meta.env.DEV) (window as unknown as { __run?: unknown }).__run = runScript
  if (import.meta.env.DEV) (window as unknown as { __splTest?: unknown }).__splTest = (ids: number[], a: 'me' | 'foe', b: 'me' | 'foe', travel = false) => playSpl(ids, a, b, travel) // developer hook

  // ---------------------------------------------------------------- a Pokémon coming out of its Poké Ball (the game's own script, effect 0x234 for you / 0x239 for a trainer's Pokémon)
  /** the feet of a Pokémon in canvas pixels of the effects layer (one canvas pixel = one pixel of the game's 256 x 192 screen) */
  const feetPx = (side: 'me' | 'foe') => { const L = layoutRef.current!; const sc = Math.max(1, L.frame.w / 256); const a = side === 'me' ? L.me : L.foe; return { x: a.x / sc, y: (a.y + a.w * 0.1) / sc, sc } }
  const monEl = (side: 'me' | 'foe') => document.querySelector<HTMLElement>(`.stage-sprite[data-mon="${side}"] .so-mon`)
  /** the Pokémon's own animation: a white shape grows high above the platform, takes its colours and drops down (numbers from the game's script, 60 frames a second) */
  const playMon = (side: 'me' | 'foe', big: number, mid: number, sc: number) => {
    const el = monEl(side)
    if (!el) return 0
    const u = 16 * sc, F = 1000 / 60
    const A = 32 * F, B = 32 * F, Cd = 10 * F, W = side === 'me' ? 16 * F : 16 * F, D = side === 'me' ? 10 * F : 0
    const total = A + B + Cd + W + D
    const T = (t: number) => t / total
    const tf = (y: number, k: number) => `translateY(${-y * u}px) scale(${k})`
    const keys: Keyframe[] = [
      { offset: 0, transform: tf(4, 0.001), opacity: 1 },
      { offset: T(A), transform: tf(4, big), opacity: 1 },
      { offset: T(A + 16 * F), transform: tf(3, mid), opacity: 1 },
      { offset: T(A + B), transform: tf(3, mid), opacity: 1 },
      { offset: T(A + B + Cd), transform: tf(0, mid), opacity: 1 },
      { offset: T(A + B + Cd + W), transform: tf(0, mid), opacity: 1 },
      { offset: 1, transform: tf(0, side === 'me' ? 1 : mid), opacity: 1 },
    ]
    el.animate(keys, { duration: total, fill: 'both', easing: 'linear' })
    el.querySelector<HTMLElement>('.so-white')?.animate([{ opacity: 1 }, { opacity: 1, offset: T(A) }, { opacity: 0, offset: T(A + B) }, { opacity: 0 }], { duration: total, fill: 'both', easing: 'linear' })
    return total
  }
  /** a wild Pokémon appears: it fades in from a white shape while its cry plays */
  const wildAppear = (side: 'me' | 'foe') => {
    const el = monEl(side)
    if (!el) return
    el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 400, fill: 'both' })
    el.querySelector<HTMLElement>('.so-white')?.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 400, fill: 'both', easing: 'linear' })
  }
  /** the whole ball scene; returns how long the Pokémon needs to finish (ms) */
  const sendOutScene = async (side: 'me' | 'foe', thrown: boolean, s: Side, show: () => void): Promise<number> => {
    const L = layoutRef.current, spl = splRef.current
    const F = 1000 / 60
    if (!L || !spl?.ready) { await sleep(520); show(); void music.cryOf(s.species, dexNum(s.species)); return 1700 }
    const { sc } = feetPx(side)
    const topNow = () => { const f = feetPx(side); return { x: f.x, y: f.y - 4 * 16 } } // where the ball opens: 4 units above the platform (read when needed: the camera may still be moving)
    const ballId = 60 // the Poké Ball picture of the effect files (48 + 4 per ball kind, the Poké Ball is the third)
    spl.preload(ballId); spl.preload(6); spl.preload(325)
    if (thrown) { // the ball flies from the hand of your trainer: it leaves 34 frames after the throw starts and takes 30 frames
      await sleep(34 * F)
      void music.playSeq(1382)
      const cx = (L.frame.l + L.frame.w / 2) / sc, cy = (L.frame.t + L.frame.h / 2) / sc
      void spl.emit(ballId, 0, { x: cx - 2.5 * 16, y: cy - 1.9 * 16 }, topNow(), 16, { frames: 30, height: 3, maxFrames: 31 })
      await sleep(30 * F)
    } else { // a trainer's Pokémon (or one that comes later): the ball shows up where the Pokémon will be
      await sleep(6 * F)
      void music.playSeq(1382)
      void spl.emit(ballId, 0, topNow(), null, 16, { maxFrames: 25 })
      await sleep(25 * F)
    }
    void music.playSeq(1383)
    void spl.emit(6, null, topNow(), null, 16, side === 'me' ? { radius: 0.5, life: 1, size: 0.5 } : { radius: 1, life: 1, size: 1 })
    show()
    void music.cryOf(s.species, dexNum(s.species))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const total = playMon(side, side === 'me' ? 0.7 : 1.2, side === 'me' ? 0.5 : 1.0, sc)
    window.setTimeout(() => { void music.playSeq(1400); const f = feetPx(side); void spl.emit(325, 2, { x: f.x, y: f.y }, null, 16, { maxFrames: 60 }) }, 32 * F + 32 * F + 10 * F)
    return total + 100
  }

  // ---------------------------------------------------------------- start the battle
  useEffect(() => {
    // (React may run this effect twice while developing: start from a clean slate each time)
    endedRef.current = false
    queue.current = []
    pumping.current = false
    reqRef.current = null
    let cancelled = false
    let s: BattleSession | null = null
    // first get the pictures of the Pokémon ready (so they do not pop up late), but never wait longer than 3 seconds
    const prepare = async () => {
      const mine = playerTeam[0], theirs = foeCopies[0]
      const jobs: Array<Promise<unknown>> = []
      for (const [m, back] of [[mine, true], [theirs, false]] as const) {
        if (!m) continue
        const d = dexNum(m.species)
        jobs.push(d > 0 && d <= 649 ? warmAnim(m.species, back, !!m.shiny) : Promise.resolve(preloadPixel(m.species, back, !!m.shiny)))
      }
      for (const m of foeCopies.slice(1)) { const d = dexNum(m.species); if (d > 649) preloadPixel(m.species, false, !!m.shiny) }
      jobs.push(trainerBackPic(playerBackClass(!!playerGirl)).then(setMyPic))
      if (kind !== 'wild') jobs.push(trainerFrontPic(trainerClassFor(kind === 'gym' ? 'gym' : 'trainer', foeSeed ?? foeName ?? 'trainer'), [2, 3, 4, 5]).then((r) => setFoePic(r?.canvas ?? null)))
      await Promise.race([Promise.all(jobs), sleep(3000)])
    }
    // online duel: the other player's messages (the host waits until the guest is ready; the guest hands what it hears to its session)
    const guestSession = pvp?.role === 'guest' ? new PvpGuestSession(playerTeam, pvp.send) : null
    let guestReady: () => void = () => {}
    const guestIsReady = new Promise<void>((res) => { guestReady = res })
    let hostSession: BattleSession | null = null
    const unlisten = pvp ? pvp.listen((type, data) => {
      if (guestSession) guestSession.receive(type, data)
      else if (type === 'ready') guestReady()
      else if (type === 'choice') hostSession?.remoteChoice(data as { k: 'move'; i: number } | { k: 'switch'; uid: string })
    }) : null
    const introReady = new Promise<void>((res) => { introResolve.current = res })
    void prepare().then(() => introReady).then(async () => {
      if (cancelled) return
      if (kind !== 'wild') { // "You are challenged by ...!" with the foe's row of balls (1.45 s after the picture fades in, like the recording)
        const t = `You are challenged by ${foeName ?? 'a trainer'}!`
        setText(t); setRows('foe')
        await sleep(typeMs(t) + 2000)
        if (cancelled) return
        setRows(null)
      }
      if (pvp?.role === 'guest') s = guestSession as unknown as BattleSession
      else s = new BattleSession(playerTeam, foeCopies, pvp ? { send: pvp.send, hostName: pvp.hostName, guestName: pvp.guestName } : undefined)
      s.isTrainerBattle = kind !== 'wild'
      s.foeName = foeName ?? ''
      sessionRef.current = s
      hostSession = pvp?.role === 'host' ? s : null
      let opening = kind !== 'wild' // in a trainer battle the foe trainer sends out first, like in the game
      s.onEvents((evs0) => {
        // the sentence ("Go! X!", "Y sent out X!") is read first, then the Pokémon comes out
        let evs = [...evs0]
        for (let i = 0; i + 1 < evs.length; i++) {
          const a = evs[i], b = evs[i + 1]
          if (a.kind === 'switch' && b.kind === 'text' && /^Go! | sent out /.test(b.text)) { evs[i] = b; evs[i + 1] = a; i++ }
        }
        if (opening) {
          const a = evs.findIndex((e) => e.kind === 'switch' && e.side === 'p1'), b = evs.findIndex((e) => e.kind === 'switch' && e.side === 'p2')
          if (a >= 1 && b === a + 2) { opening = false; evs = [...evs.slice(0, a - 1), evs[b - 1], evs[b], evs[a - 1], evs[a], ...evs.slice(b + 1)] }
        }
        queue.current.push(...evs); void pump()
      })
      s.onRequest((r) => {
        reqRef.current = r
        if (!pumping.current && queue.current.length === 0) showMenuIfReady()
      })
      if (pvp?.role === 'host') void Promise.race([guestIsReady, sleep(20000)]).then(() => { if (!cancelled) s?.start() })
      else s.start()
    })
    return () => { cancelled = true; endedRef.current = true; s?.destroy(); unlisten?.() }
  }, [])

  // ---------------------------------------------------------------- after the battle
  const finish = async (winner: 'p1' | 'p2' | null) => {
    const s = sessionRef.current!
    s.syncBack()
    setMode('done')
    let t: Trainer = { ...trainer, bag: bagRef.current }
    const team = t.team.map((m) => playerTeam.find((p) => p.uid === m.uid) ?? m)
    let working = team.map((m) => ({ ...m }))
    const hasShare = (t.bag['Exp Share'] ?? 0) > 0

    if (winner === 'p1') {
      music.stop()
      void music.playSfx('win')
      for (const d of s.defeated) {
        const alive = working.filter((m) => m.hp > 0)
        for (let i = 0; i < working.length; i++) {
          const m = working[i]
          const took = d.by.includes(m.uid) && m.hp > 0
          if (!took && !(hasShare && m.hp > 0)) continue
          const share = took ? (hasShare || alive.length > 1 ? 1 : 1) : 0.5
          let upd = addEvs(m, evYield(d.foe.species))
          const amount = expGain(d.foe.species, d.foe.level, kind !== 'wild', share)
          const res = await gainExp(upd, amount)
          upd = res.mon
          await say(`${upd.species} gained ${amount} Exp. Points!`, 600)
          if (res.levelsGained > 0) {
            void music.playSfx('se:lvup')
            await say(`${upd.species} grew to Lv. ${upd.level}!`, 700)
            for (const mv of res.newMoves) {
              if (upd.moves.length < 4) {
                upd = { ...upd, moves: [...upd.moves, mv] }
                await say(`${upd.species} learned ${mv}!`, 700)
              } else {
                const forget = await askForget(upd, mv)
                if (forget !== null) upd = { ...upd, moves: upd.moves.map((x, k) => (k === forget ? mv : x)) }
              }
            }
            const to = levelEvolution(upd)
            if (to) {
              await say(`What? ${upd.species} is evolving!`, 900)
              const from = upd.species
              upd = evolve(upd, to)
              await say(`${from} evolved into ${to}!`, 1000)
            }
          }
          working[i] = upd
        }
      }
    }
    t = { ...t, team: working }
    const outcome: BattleOutcome = caughtRef.current ? 'caught' : ranRef.current ? 'ran' : winner === 'p1' ? 'win' : 'lose'
    if (caughtRef.current) {
      const c = caughtRef.current
      const legends = t.team.filter((m) => legendaryNames.has(m.species)).length
      const isLeg = legendaryNames.has(c.species)
      if (t.team.length < 6 && !(isLeg && legends >= RULES.maxLegendary)) t = { ...t, team: [...t.team, c] }
      else t = { ...t, pc: [...t.pc, c] }
    }
    if (outcome === 'win') await say(kind === 'wild' ? 'You won!' : `You defeated ${foeName ?? 'the trainer'}!`, 700)
    else if (outcome === 'lose') await say('You have no Pokémon left that can fight...', 900)
    else await sleep(600)
    onEnd(outcome, t)
  }

  // learning a move with a full set: ask the player
  const [learn, setLearn] = useState<null | { mon: Mon; move: string; resolve: (i: number | null) => void }>(null)
  const askForget = (mon: Mon, move: string) => new Promise<number | null>((resolve) => setLearn({ mon, move, resolve }))

  // ---------------------------------------------------------------- the player's actions
  const act = (fn: () => void) => { setMode('wait'); setReq(null); fn() }
  const s = () => sessionRef.current!
  const activeMon = me ? teamRef.current.find((m) => m.uid === me.uid) : undefined

  const doMove = (i: number) => act(() => s().chooseMove(i + 1))
  const doSwitch = (uid: string) => act(() => s().chooseSwitch(uid))

  const doRun = () => {
    if (kind !== 'wild') { void say("There's no running from a Trainer battle!", 600).then(() => setText(`What will ${activeMon?.species ?? 'your Pokémon'} do?`)); return }
    const mine = activeMon ? statsOf(activeMon).spe : 10
    const theirs = foeCopies[0] ? statsOf(foeCopies[0]).spe : 10
    const ok = mine >= theirs || Math.random() < 0.55
    setMode('wait'); setReq(null)
    if (ok) {
      void music.playSfx('be:41')
      ranRef.current = true
      endedRef.current = true
      void (async () => { await say('Got away safely!', 500); s().syncBack(); onEnd('ran', { ...trainer, bag: bagRef.current, team: trainer.team.map((m) => teamRef.current.find((p) => p.uid === m.uid) ?? m) }) })()
    } else {
      void say("You couldn't get away!", 500).then(() => s().passTurn())
    }
  }

  /**
   * Catching, like the game's own script (effect 0x23a): the ball flies in an arc (35 frames) to the Pokémon, opens, the Pokémon turns white and is pulled in,
   * the ball closes, falls and bounces (thud sounds 127 / 96 / 64), shakes once per shake with a pause of 65 / 70 / 75 frames, then clicks (caught) or opens again (broke free).
   * The ball pictures are the eight pictures of the ball's effect file. Returns false when the game file's pictures are not there (the old simple ball is used then).
   */
  const catchScene = async (ballId: number, shakes: number, caught: boolean, onShake: (i: number) => void): Promise<boolean> => {
    const L = layoutRef.current, spl = splRef.current, el = catchRef.current
    const frames = spl?.ready ? spl.ballFrames(ballId) : null
    if (!L || !spl || !el || !frames) return false
    const F = 1000 / 60
    const sc = Math.max(1, L.frame.w / 256)
    const wait = (n: number) => sleep(n * F)
    const tween = (n: number, fn: (k: number) => void) => new Promise<void>((res) => {
      const t0 = performance.now()
      const tick = (now: number) => { const k = Math.min(1, (now - t0) / (n * F)); fn(k); if (k < 1) requestAnimationFrame(tick); else res() }
      requestAnimationFrame(tick)
    })
    const feetNow = () => { const L2 = layoutRef.current ?? L; const k = Math.max(1, L2.frame.w / 256); return { x: L2.foe.x / k, y: (L2.foe.y + L2.foe.w * 0.1) / k } }
    const draw = (x: number, y: number, frame: number, rot = 0, dark = 1, size = 18) => {
      el.src = frames[frame]; el.style.display = 'block'
      el.style.width = `${size * sc}px`
      el.style.filter = dark < 1 ? `brightness(${dark})` : ''
      el.style.transformOrigin = '50% 92%' // (the ball rocks on its bottom: it swings from side to side, it does not spin in place)
      el.style.transform = `translate(${x * sc - (size * sc) / 2}px, ${y * sc - (size * sc) / 2}px) rotate(${rot}deg)`
    }
    const foeEl = document.querySelector<HTMLElement>('.stage-sprite[data-mon="foe"]')
    const f0 = feetNow()
    const top = { x: f0.x, y: f0.y - 2.4 * 16 } // where the ball meets the Pokémon
    const cx = (L.frame.l + L.frame.w / 2) / sc, cy = (L.frame.t + L.frame.h / 2) / sc
    // 1. the throw: 35 frames, an arc 5 units high, the ball turns
    void music.playSeq(1382)
    await tween(35, (k) => { const y = cy + 32 + (top.y - cy - 32) * k - Math.sin(k * Math.PI) * 5 * 16 * 0.55; draw(cx + (top.x - cx) * k, y, [0, 1, 2, 1][Math.floor(k * 35 / 4) % 4]) })
    // 2. it opens, the Pokémon turns white and is pulled in
    void music.playSeq(1383)
    void spl.emit(29, null, top, null, 16, { radius: 1, life: 1, size: 1 })
    draw(top.x, top.y, 3); await wait(3); draw(top.x, top.y, 4)
    if (foeEl) {
      foeEl.style.transformOrigin = '50% 50%'
      const a = foeEl.animate([{ transform: 'translate(0,0) scale(1)', filter: 'brightness(0) invert(1)', opacity: 1 }, { transform: `translate(0,${-2 * 16 * sc}px) scale(0.02)`, filter: 'brightness(0) invert(1)', opacity: 1 }], { duration: 20 * F, fill: 'forwards', easing: 'linear', composite: 'add' })
      void a.finished.catch(() => undefined)
    }
    await wait(20)
    foeEl?.style && (foeEl.style.visibility = 'hidden')
    draw(top.x, top.y, 3); await wait(3); draw(top.x, top.y, 0)
    await wait(8)
    // 3. it falls and bounces
    const ground = { x: f0.x, y: f0.y - 4 }
    await tween(20, (k) => draw(top.x, top.y + (ground.y - top.y) * k * k, 0))
    for (const [h, n, vol] of [[22, 16, 127], [8, 10, 96]] as Array<[number, number, number]>) {
      void music.playSeq(1387)
      void vol
      await tween(n, (k) => draw(ground.x, ground.y - Math.sin(k * Math.PI) * h, 0))
    }
    void music.playSeq(1387)
    draw(ground.x, ground.y, 0)
    await wait(40)
    // 4. the shakes
    for (let i = 0; i < shakes; i++) {
      onShake(i)
      void music.playSeq(1384)
      // one shake = it tips to the left, comes back, tips to the right, comes back (the game's own shake animation is in its program code, not in the effect files; the pauses after it are from the script)
      await tween(44, (k) => draw(ground.x, ground.y, 0, Math.sin(k * Math.PI * 2) * -32))
      await wait(i === 0 ? 31 : i === 1 ? 36 : 41)
    }
    if (caught) { // click: the ball darkens and stars fly out
      void music.playSeq(1396)
      draw(ground.x, ground.y, 0, 0, 0.55)
      void spl.emit(28, null, { x: ground.x, y: ground.y - 10 }, null, 16, { radius: 1, life: 1, size: 1 })
      await wait(70)
      el.style.display = 'none'
      return true
    }
    // it breaks free: the ball opens, the Pokémon comes out of the light
    void music.playSeq(1383)
    draw(ground.x, ground.y, 3); await wait(3); draw(ground.x, ground.y, 4)
    void spl.emit(6, null, { x: ground.x, y: ground.y - 10 }, null, 16, { radius: 0.5, life: 1, size: 0.5 })
    if (foeEl) {
      foeEl.getAnimations().forEach((x) => x.cancel())
      foeEl.style.visibility = ''
      const a = foeEl.animate([{ transform: 'scale(0.02)', filter: 'brightness(0) invert(1)' }, { transform: 'scale(1)', filter: 'brightness(0) invert(1)', offset: 0.6 }, { transform: 'scale(1)', filter: 'none' }], { duration: 24 * F, easing: 'linear', composite: 'add' })
      void a.finished.catch(() => undefined)
    }
    el.style.display = 'none'
    await wait(26)
    foeEl && (foeEl.style.transformOrigin = '')
    return true
  }

  const throwBall = (id: string) => {
    const def = ITEMS[id]
    const foeMon = foeCopies[0]
    const live = s().foeActive
    if (!foeMon || !live) return
    setBag(useItemFromBag(bagRef.current, id))
    setMode('wait'); setReq(null)
    const target = { ...foeMon, hp: live.hp }
    const isLeg = legendaryNames.has(foeMon.species)
    const res = rollCatch(target, def.ballBonus ?? 1, isLeg, Math.random)
    void (async () => {
      await say(`You threw a ${def.name}!`, 500)
      const ballFile = id === 'Master Ball' ? 48 : id === 'Ultra Ball' ? 52 : id === 'Great Ball' ? 56 : 60 // (the game's ball pictures: 48 + 4 for every kind)
      const played = await catchScene(ballFile, res.shakes, res.caught, (i) => setText('.'.repeat(i + 1)))
      if (!played) { // (without the game's pictures: the simple ball)
        void music.playSfx('se:throw')
        setBall({ shakes: 0 })
        for (let i = 0; i < res.shakes; i++) {
          setBall({ shakes: i + 1 })
          void music.playSfx('se:shake')
          setText('.'.repeat(i + 1))
          await sleep(800)
        }
      }
      if (res.caught) {
        setBall(null)
        music.stop()
        void music.playSfx('caught')
        caughtRef.current = { ...foeMon, hp: Math.max(1, live.hp), uid: foeMon.uid }
        endedRef.current = true
        s().syncBack()
        await say(`Gotcha! ${foeMon.species} was caught!`, 900)
        const t: Trainer = { ...trainer, bag: bagRef.current, team: trainer.team.map((m) => teamRef.current.find((p) => p.uid === m.uid) ?? m) }
        // no experience for a catch in this version; the Pokémon joins your team
        const c = caughtRef.current
        const legends = t.team.filter((m) => legendaryNames.has(m.species)).length
        const toPc = t.team.length >= 6 || (legendaryNames.has(c.species) && legends >= RULES.maxLegendary)
        onEnd('caught', toPc ? { ...t, pc: [...t.pc, c] } : { ...t, team: [...t.team, c] })
      } else {
        setBall(null)
        await say(res.shakes === 0 ? 'Oh no! The Pokémon broke free!' : res.shakes === 1 ? 'Aww! It appeared to be caught!' : 'Argh! Almost had it!', 600)
        s().passTurn()
      }
    })()
  }

  const usePotion = (id: string) => {
    const def = ITEMS[id]
    const healed = s().healActive(def.heal ?? 0)
    if (!healed) return
    setBag(useItemFromBag(bagRef.current, id))
    setMe((m) => (m ? { ...m, hp: healed.hp } : m))
    // keep our own record in step
    const rec = teamRef.current.find((p) => p.uid === healed.uid)
    if (rec) rec.hp = healed.hp
    setMode('wait'); setReq(null)
    void say(`You used a ${def.name}!`, 500).then(() => s().passTurn())
  }

  return (
    <div className={`fullscreen battle ${showScene ? '' : 'pre'} ${sideLayout() ? 'side' : ''}`} style={{ ["--menu-h" as string]: `${236 * S}px`, ["--bottom-h" as string]: `${bottomHeight()}px`, ["--k" as string]: `${Kd}px`, ["--s" as string]: `${S}px`, ...zoneVars(layout, Kd) }}>
      <div className={`stage-cam ${mode === 'fight' ? 'zoom' : ''}`}>
      <BattleBackdrop env={environment} onLayout={setLayout} sceneRef={sceneRef} />
      <canvas ref={fxCanvas} className="fx-canvas" />
      <canvas ref={splCanvas} className="spl-layer" />
      <div ref={dimRef} className="eff-dim" />
      <img ref={catchRef} className="catch-ball" alt="" draggable={false} />


      {layout && foePic && !trGone.foe && (
        <div className="stage-sprite" style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.1, width: layout.foe.w }}>
          <TrainerFigure still={foePic} k={snap((layout.foe.w * 1.05) / 76.8)} side="foe" out={trOut.foe} play={0} sil={introOn ? 1 : 0} />
        </div>
      )}
      {layout && myPic && !trGone.me && (
        <div className="stage-sprite trainer-me" style={{ left: layout.frame.l + layout.frame.w * 0.23, bottom: layout.frame.b + (13 * layout.frame.w) / 256, width: layout.me.w }}>
          <TrainerFigure sprite={myPic} k={snapNear(layout.frame.w / 256)} side="me" out={trOut.me} play={throwKey} />
        </div>
      )}
      {layout && foe && (
        <>
          <div className="stage-shadow" style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.13, width: layout.foe.w * 0.5 * shadowFor(foe.species) }} />
          <div data-mon="foe" className={`stage-sprite ${shake === 'foe' ? 'hit' : ''} ${foe.fainted ? 'fainted' : ''} ${lunge === 'foe' ? 'lunge-foe' : ''}`} style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.1, width: layout.foe.w, ['--hv' as string]: `${Math.round(layout.foe.w * 0.9)}px` }}>
            {!ball && <div className={send?.side === 'foe' ? 'so-mon' : undefined} key={send?.side === 'foe' ? send.key : 'foe'}><MonSprite species={foe.species} shiny={foe.shiny} scale={snap((layout.foe.w * 1.05) / 76.8 * 0.8) / 0.8} platform={layout.foe.w} animated />{send?.side === 'foe' && <div className="so-white" aria-hidden><MonSprite species={foe.species} shiny={foe.shiny} scale={snap((layout.foe.w * 1.05) / 76.8 * 0.8) / 0.8} platform={layout.foe.w} animated /></div>}</div>}
            {ball && <div className={`ball shake-${ball.shakes}`} />}
          </div>
        </>
      )}
      {layout && me && (
        <>
          <div className="stage-shadow" style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.09, width: layout.me.w * 0.32 * shadowFor(me.species) }} />
          <div data-mon="me" className={`stage-sprite ${shake === 'me' ? 'hit' : ''} ${me.fainted ? 'fainted' : ''} ${lunge === 'me' ? 'lunge-me' : ''}`} style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.1, width: layout.me.w, ['--hv' as string]: `${Math.round(layout.me.w * 0.75)}px` }}>
            <div className={send?.side === 'me' ? 'so-mon' : undefined} key={send?.side === 'me' ? send.key : 'me'}><MonSprite species={me.species} back shiny={me.shiny} scale={snap((layout.me.w * 0.92) / 76.8 * 0.8) / 0.8} platform={layout.me.w} animated />{send?.side === 'me' && <div className="so-white" aria-hidden><MonSprite species={me.species} back shiny={me.shiny} scale={snap((layout.me.w * 0.92) / 76.8 * 0.8) / 0.8} platform={layout.me.w} animated /></div>}</div>
          </div>
        </>
      )}
      </div>
      {!transDone && <BattleTransition onBlack={() => setShowScene(true)} onFade={() => { sceneRef.current?.startIntro(900); setIntroOn(true); window.setTimeout(() => introResolve.current(), 1450) }} onDone={() => setTransDone(true)} />}
      {rows && <TeamBalls key={rows} side={rows} count={rows === 'foe' ? foeTeam.length : playerTeam.length} alive={rows === 'foe' ? foeTeam.map((m) => m.hp > 0) : playerTeam.map((m) => m.hp > 0)} K={Kd} />}
      <div className="foe-zone">
        {foe && hpOn.foe && <HpBox side={foe} mine={false} gender={foeCopies.find((m) => m.uid === foe.uid)?.gender} />}
      </div>
      <div className="me-zone">
        {me && hpOn.me && <HpBox side={me} mine exp={teamRef.current.find((m) => m.uid === me.uid)?.exp} gender={teamRef.current.find((m) => m.uid === me.uid)?.gender} />}
      </div>
      <div className="battle-bottom">
        <div className="battle-band" style={{ cursor: 'pointer' }} onClick={() => { setSkip((k) => k + 1); wake.current?.() }}><TypedText text={text} ms={msPer} skip={skip} /></div>

        {mode === 'wait' && <IdleBall S={S} />}
        {mode === 'menu' && req && (
          <CommandScreen
            S={S}
            closing={fromFight.current}
            foeCount={kind !== 'wild' ? foeTeam.length : 0}
            party={Array.from({ length: 6 }, (_, i) => { const m = teamRef.current[i]; return m ? (m.hp > 0 ? 'ok' : 'fnt') : 'none' })}
            onFight={() => { fromFight.current = false; setMode('fight') }}
            onBag={() => setMode('bag')}
            onPokemon={() => { if (req.trapped) void say(`${activeMon?.species ?? 'Your Pokémon'} can't be switched out!`, 600).then(() => setText(`What will ${activeMon?.species ?? 'your Pokémon'} do?`)); else if (req.bench.filter((b) => !b.fainted && !b.active).length === 0) void say('There are no other Pokémon that can fight!', 600).then(() => setText(`What will ${activeMon?.species ?? 'your Pokémon'} do?`)); else setMode('switch') }}
            onRun={doRun}
          />
        )}

        {mode === 'fight' && req && (
          <MoveScreen S={S} moves={req.moves} party={Array.from({ length: 6 }, (_, i) => { const m = teamRef.current[i]; return m ? (m.hp > 0 ? 'ok' : 'fnt') : 'none' })} onMove={doMove} onBack={() => { fromFight.current = true; setMode('menu') }} />
        )}

        {mode === 'switch' && req && (
          <PartyScreen
            K={S}
            team={req.bench.map((b) => ({ ...(teamRef.current.find((m) => m.uid === b.uid) as Mon), hp: b.hp }))}
            active={req.bench.findIndex((b) => b.active)}
            hint={req.forceSwitch ? 'Choose the next Pokémon.' : 'Choose a Pokémon.'}
            closeLabel="Cancel"
            onClose={req.forceSwitch ? undefined : () => setMode('menu')}
            onPick={(i) => {
              const b = req.bench[i]
              if (b.fainted) void say(`${b.species} has no energy left to battle!`, 500).then(() => setText(req.forceSwitch ? 'Choose your next Pokémon.' : 'Choose a Pokémon.'))
              else if (b.active) void say(`${b.species} is already in battle!`, 500).then(() => setText(req.forceSwitch ? 'Choose your next Pokémon.' : 'Choose a Pokémon.'))
              else doSwitch(b.uid)
            }}
          />
        )}

        {mode === 'bag' && req && (
          <BagScreen
            K={S}
            bag={bag}
            pockets={kind === 'wild' ? [1, 2] : [1]}
            only={(d) => !pvp && ((d.kind === 'ball' && kind === 'wild') || d.kind === 'heal')}
            canUse={(d) => (d.kind === 'ball' && kind === 'wild') || d.kind === 'heal'}
            title={`Bag (${Math.max(0, RULES.itemsPerBattle - itemsUsed.current)}/${RULES.itemsPerBattle})`}
            onUse={(id) => {
              if (itemsUsed.current >= RULES.itemsPerBattle) { void say(`You can only use ${RULES.itemsPerBattle} items per battle.`, 600).then(() => setText('Choose an item.')); return }
              itemsUsed.current++
              setMode('wait'); if (ITEMS[id].kind === 'ball') throwBall(id); else usePotion(id)
            }}
            onClose={() => setMode('menu')}
            describe={(d) => (d.kind === 'ball' && foeCopies[0] && s().foeActive ? `Catch rate ${Math.round(catchChance({ ...foeCopies[0], hp: s().foeActive!.hp }, d.ballBonus ?? 1, legendaryNames.has(foeCopies[0].species)) * 100)}%` : null)}
          />
        )}
      </div>

      {learn && (
        <div className="modal-backdrop">
          <div className="panel modal">
            <h2>{learn.mon.species} wants to learn {learn.move}</h2>
            <p className="sub">But it already knows 4 moves. Forget one?</p>
            {learn.mon.moves.map((m, i) => (
              <button key={m} onClick={() => { learn.resolve(i); setLearn(null) }}>Forget {m}</button>
            ))}
            <button className="primary" onClick={() => { learn.resolve(null); setLearn(null) }}>Don't learn {learn.move}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export { maxHp, healMon }
