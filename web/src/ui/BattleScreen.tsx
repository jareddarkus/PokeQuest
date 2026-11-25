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
import { CommandScreen, IdleBall, MoveScreen, dsScale } from './DsMenu'
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
  return <FontText text={full} reveal={n} k={S} font={0} color="#f8f8f8" shadow="#a4b0b0" maxWidth={Math.floor(256 - 16)} style={{ textAlign: 'left' }} />
}

/**
 * A Pokémon being sent out, like in the real game: a small Poké Ball hangs high above the platform, opens, a golden burst of light with a beam and
 * flying sparks shines, and the Pokémon appears as a white shape and drops onto the platform (see .so-* in the stylesheet).
 */
function SendOut({ fromLeft }: { fromLeft: boolean }) {
  void fromLeft
  return (
    <div className="so" aria-hidden>
      <span className="so-glow" />
      <span className="so-beam b0" />
      <span className="so-beam b1" />
      <span className="so-beam b2" />
      {Array.from({ length: 12 }, (_, i) => <span key={i} className="so-ring" style={{ ['--a' as string]: `${i * 30 + (i % 2) * 11}deg`, ['--d' as string]: `${46 + (i % 3) * 26}px`, animationDelay: `${(i % 4) * 0.05}s` }} />)}
    </div>
  )
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
  const W = window.innerWidth, H = window.innerHeight - bottomHeight()
  return snap(Math.max(1.2, Math.min(W / 256, H / 192)))
}
/** The height of the log box + the lower screen (screen pixels). */
export function bottomHeight(): number { return 220 * dsScale() + 6 }

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
export function HpBox({ side, mine, exp, gender, k, nameFont = 2 }: { side: Side; mine: boolean; exp?: number; gender?: 'M' | 'F' | 'N'; k?: number; nameFont?: 0 | 1 | 2 }) {
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
  const trSent = useRef({ foe: false, me: false })
  const [hpOn, setHpOn] = useState({ foe: false, me: false }) // the HP boxes show once the Pokémon stand on their platform
  const [showScene, setShowScene] = useState(false) // the battle picture is hidden while the way in (flash, bars) plays over the map
  const [introOn, setIntroOn] = useState(false) // the opening shot has begun
  const [transDone, setTransDone] = useState(false)
  const sceneRef = useRef<BattleBackdrop3D | null>(null)
  const introResolve = useRef<() => void>(() => {})
  const [send, setSend] = useState<null | { side: 'me' | 'foe'; key: number }>(null) // a Pokémon being sent out of its ball
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
  const Kd = useDsK()
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
  const ranRef = useRef(false)
  const [shake, setShake] = useState<'me' | 'foe' | null>(null)
  const [lunge, setLunge] = useState<'me' | 'foe' | null>(null)
  const shadowFor = (species: string) => Math.max(0.6, Math.min(1.25, 0.55 + 0.25 * Math.sqrt(Dex.species.get(species).heightm || 1)))
  const [layout, setLayoutState] = useState<BattleLayout | null>(null)
  const layoutRef = useRef<BattleLayout | null>(null)
  const setLayout = (l: BattleLayout) => { layoutRef.current = l; setLayoutState(l) }
  const fxCanvas = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<MoveFx | null>(null)
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
          const s: Side = { uid: ev.uid, species: ev.species, level: ev.level, hp: ev.hp, maxHp: ev.maxHp, shiny: ev.shiny, fainted: false }
          const ballOut = who === 'me' || kind !== 'wild' // trainers' Pokémon (and yours) come out of a Poké Ball; a wild Pokémon just appears
          setHpOn((o) => ({ ...o, [who]: false }))
          if (who === 'me' && !trSent.current.me) { // your row of balls is shown while "Go!" is read, then your trainer throws the ball and fades away
            trSent.current.me = true
            await sleep(300); setRows(null)
            setThrowKey((k) => k + 1)
            window.setTimeout(() => setTrOut((o) => ({ ...o, me: true })), 750)
            window.setTimeout(() => setTrGone((o) => ({ ...o, me: true })), 1300)
            await sleep(450)
          } else if (who === 'foe' && kind !== 'wild' && !trSent.current.foe) { // the foe trainer fades away, then the ball comes
            trSent.current.foe = true
            setTrOut((o) => ({ ...o, foe: true }))
            window.setTimeout(() => setTrGone((o) => ({ ...o, foe: true })), 450)
            await sleep(450)
          }
          if (ballOut) { // the small Poké Ball spins in the air (the game's own 3D ball), then the Pokémon bursts out of its light
            void music.playSfx('se:throw')
            sceneRef.current?.showBall(who, 520)
            await sleep(520)
            setSend({ side: who, key: ++sendKey })
          }
          if (who === 'me') setMe(s); else setFoe(s)
          hpOf.current[ev.uid] = ev.hp
          void music.cry(dexNum(ev.species))
          await sleep(ballOut ? 1700 : 1100)
          setSend(null)
          setHpOn((o) => ({ ...o, [who]: true })) // the HP box pops up once the Pokémon stands there
          break
        }
        case 'hp': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, hp: ev.hp, maxHp: ev.hp === 0 ? s.maxHp : ev.maxHp, status: ev.status ?? s.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          if (ev.uid in hpOf.current && ev.hp < hpOf.current[ev.uid]) { void music.playSfx(pendingHit.current ?? 'se:hit'); pendingHit.current = null }
          else if (ev.uid in hpOf.current && ev.hp > hpOf.current[ev.uid]) void music.playSfx('se:heal')
          const before = hpOf.current[ev.uid] ?? ev.hp
          hpOf.current[ev.uid] = ev.hp
          await sleep(Math.max(700, (Math.abs(ev.hp - before) / Math.max(1, ev.maxHp)) * 48 / 30 * 1000 + 350)) // the gauge drains at the game's speed
          break
        }
        case 'status': {
          const upd = (s: Side | null): Side | null => (s && s.uid === ev.uid ? { ...s, status: ev.status } : s)
          if (ev.side === 'p1') setMe(upd); else setFoe(upd)
          break
        }
        case 'move': {
          const num = Dex.moves.get(ev.move).num
          if (num) void music.playSfx(`mv:${num}`)
          const mv = Dex.moves.get(ev.move)
          const L = layoutRef.current, fx = fxRef.current
          const contact = mv.category === 'Physical' && !!mv.flags.contact
          const selfT = mv.target === 'self' || mv.target === 'allySide' || mv.target === 'allies' || mv.target === 'adjacentAllyOrSelf'
          const hitSide = ev.side === 'p1' ? 'foe' : 'me'
          if (contact) { setLunge(ev.side === 'p1' ? 'me' : 'foe'); await sleep(250) }
          if (fx?.ready && L) {
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
          // (the game's own stat-change effect is not decoded yet: nothing is invented here, the message says what happened)
          await sleep(350)
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
      if (t.team.length < 6 && !(isLeg && legends >= 2)) t = { ...t, team: [...t.team, c] }
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
      void music.playSfx('se:run')
      ranRef.current = true
      endedRef.current = true
      void (async () => { await say('Got away safely!', 500); s().syncBack(); onEnd('ran', { ...trainer, bag: bagRef.current, team: trainer.team.map((m) => teamRef.current.find((p) => p.uid === m.uid) ?? m) }) })()
    } else {
      void say("You couldn't get away!", 500).then(() => s().passTurn())
    }
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
      void music.playSfx('se:throw')
      setBall({ shakes: 0 })
      await say(`You threw a ${def.name}!`, 500)
      for (let i = 0; i < res.shakes; i++) {
        setBall({ shakes: i + 1 })
        void music.playSfx('se:shake')
        setText('.'.repeat(i + 1))
        await sleep(800)
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
        const toPc = t.team.length >= 6 || (legendaryNames.has(c.species) && legends >= 2)
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
    <div className={`fullscreen battle ${showScene ? '' : 'pre'}`} style={{ ["--menu-h" as string]: `${236 * S}px`, ["--bottom-h" as string]: `${bottomHeight()}px`, ["--k" as string]: `${Kd}px`, ["--s" as string]: `${S}px` }}>
      <div className={`stage-cam ${mode === 'fight' ? 'zoom' : ''}`}>
      <BattleBackdrop env={environment} onLayout={setLayout} sceneRef={sceneRef} />
      <canvas ref={fxCanvas} className="fx-canvas" />


      {layout && foePic && !trGone.foe && (
        <div className="stage-sprite" style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.1, width: layout.foe.w }}>
          <TrainerFigure still={foePic} k={snap((layout.foe.w * 1.05) / 76.8)} side="foe" out={trOut.foe} play={0} sil={introOn ? 1 : 0} />
        </div>
      )}
      {layout && myPic && !trGone.me && (
        <div className="stage-sprite trainer-me" style={{ left: layout.me.x, width: layout.me.w }}>
          <TrainerFigure sprite={myPic} k={snap((layout.me.w * 0.46) / 76.8)} side="me" out={trOut.me} play={throwKey} />
        </div>
      )}
      {layout && foe && (
        <>
          <div className="stage-shadow" style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.03, width: layout.foe.w * 0.78 * shadowFor(foe.species) }} />
          <div className={`stage-sprite ${shake === 'foe' ? 'hit' : ''} ${foe.fainted ? 'fainted' : ''} ${lunge === 'foe' ? 'lunge-foe' : ''}`} style={{ left: layout.foe.x, top: layout.foe.y + layout.foe.w * 0.1, width: layout.foe.w, ['--hv' as string]: `${Math.round(layout.foe.w * 0.9)}px` }}>
            {!ball && <div className={send?.side === 'foe' ? 'so-mon' : undefined} key={send?.side === 'foe' ? send.key : 'foe'}><MonSprite species={foe.species} shiny={foe.shiny} scale={snap((layout.foe.w * 1.05) / 76.8 * 0.8) / 0.8} platform={layout.foe.w} animated /></div>}
            {send?.side === 'foe' && <SendOut fromLeft={false} />}
            {ball && <div className={`ball shake-${ball.shakes}`} />}
          </div>
        </>
      )}
      {layout && me && (
        <>
          <div className="stage-shadow" style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.03, width: layout.me.w * 0.78 * shadowFor(me.species) }} />
          <div className={`stage-sprite ${shake === 'me' ? 'hit' : ''} ${me.fainted ? 'fainted' : ''} ${lunge === 'me' ? 'lunge-me' : ''}`} style={{ left: layout.me.x, top: layout.me.y + layout.me.w * 0.1, width: layout.me.w, ['--hv' as string]: `${Math.round(layout.me.w * 0.75)}px` }}>
            <div className={send?.side === 'me' ? 'so-mon' : undefined} key={send?.side === 'me' ? send.key : 'me'}><MonSprite species={me.species} back shiny={me.shiny} scale={snap((layout.me.w * 0.92) / 76.8 * 0.8) / 0.8} platform={layout.me.w} animated /></div>
            {send?.side === 'me' && <SendOut fromLeft />}
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
          <MoveScreen S={S} moves={req.moves} onMove={doMove} onBack={() => { fromFight.current = true; setMode('menu') }} />
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
            onUse={(id) => { setMode('wait'); if (ITEMS[id].kind === 'ball') throwBall(id); else usePotion(id) }}
            onClose={() => setMode('menu')}
            describe={(d) => (d.kind === 'ball' && foeCopies[0] && s().foeActive ? `Catch chance about ${Math.round(catchChance({ ...foeCopies[0], hp: s().foeActive!.hp }, d.ballBonus ?? 1, legendaryNames.has(foeCopies[0].species)) * 100)}%.` : null)}
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
