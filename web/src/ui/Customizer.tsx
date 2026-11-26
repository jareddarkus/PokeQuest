import { useEffect, useRef, useState } from 'react'
import {
  BOTTOM_STYLE_NAMES, CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLE_NAMES, HAT_NAMES, SKIN_TONES, TOP_STYLE_NAMES,
  drawCharacter, lookSprite, randomLook, type Look,
} from '../game/character'
import { owFrame, owList, owPeople } from '../game/ow'
import type { Dir } from '../game/world'
import { fetchDisabledSkins, saveDisabledSkins } from '../net/skins'
import { isWorldAdmin } from '../world/publish'

interface Props {
  look: Look
  onChange: (look: Look) => void
  onDone: () => void
}

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button key={c} className={`swatch ${c === value ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  )
}

function Choices({ names, value, onPick }: { names: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="seg wrap">
      {names.map((n, i) => (
        <button key={n} className={i === value ? 'on' : ''} onClick={() => onPick(i)}>{n}</button>
      ))}
    </div>
  )
}

function Thumb({ idx, dir = 0, size = 64, frame = 0, run = false }: { idx: number; dir?: number; size?: number; frame?: number; run?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    const f = owFrame(idx, dir, frame, run)
    if (f) ctx.drawImage(f, 0, 0, c.width, c.height)
  }, [idx, dir, frame, run])
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

/** All the walking and running pictures of one character, animated (what the owner sees when pointing at a skin). */
function SkinPreview({ idx }: { idx: number }) {
  const [t, setT] = useState(0)
  useEffect(() => { const id = window.setInterval(() => setT((n) => n + 1), 180); return () => window.clearInterval(id) }, [])
  const step = [0, 1, 0, 2][t % 4]
  const cell = (dir: number, run: boolean, label: string) => (
    <div key={`${dir}${run}`} style={{ textAlign: 'center', fontSize: 11 }}>
      <Thumb idx={idx} dir={dir} size={64} frame={step} run={run} />
      <div>{label}</div>
    </div>
  )
  return (
    <div className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: 8 }}>
      <b style={{ gridColumn: '1 / -1' }}>Caminar · #{idx}</b>
      {cell(0, false, 'abajo')}{cell(1, false, 'izq.')}{cell(2, false, 'der.')}{cell(3, false, 'arriba')}
      <b style={{ gridColumn: '1 / -1' }}>Correr</b>
      {cell(0, true, 'abajo')}{cell(1, true, 'izq.')}{cell(2, true, 'der.')}{cell(3, true, 'arriba')}
    </div>
  )
}

/** Choose one of the real characters of the game (the owner can also switch characters off for everybody). */
function RealCustomizer({ look, onChange, onDone }: Props) {
  const [dir, setDir] = useState<Dir>(0)
  const current = lookSprite(look) ?? owList[0]
  const [disabled, setDisabled] = useState<number[]>([])
  const [admin, setAdmin] = useState(false)
  const [adminMode, setAdminMode] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { void fetchDisabledSkins().then(setDisabled); void isWorldAdmin().then((a) => setAdmin(a || (import.meta.env.DEV && new URLSearchParams(location.search).has('devadmin')))) }, [])
  const off = new Set(disabled)
  const shown = owPeople().filter((i) => adminMode || !off.has(i) || i === current)
  const toggle = (i: number) => setDisabled((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))
  return (
    <div className="fullscreen scroll">
      <div className="customizer">
        <div className="panel preview">
          <h2>Your trainer</h2>
          <Thumb idx={current} dir={dir} size={192} />
          <div className="seg">
            <button onClick={() => setDir(1)}>◀</button>
            <button onClick={() => setDir(0)}>Front</button>
            <button onClick={() => setDir(3)}>Back</button>
            <button onClick={() => setDir(2)}>▶</button>
          </div>
          <button onClick={() => { const ok = owPeople().filter((i) => !off.has(i)); const pool = ok.length ? ok : owPeople(); onChange({ ...look, sprite: pool[Math.floor(Math.random() * pool.length)] }) }}>Randomize</button>
          <button className="primary" onClick={onDone}>Done</button>
          {admin && (
            <>
              <label className="mini"><input type="checkbox" checked={adminMode} onChange={(e) => setAdminMode(e.target.checked)} /> Modo propietario (elegir qué personajes hay)</label>
              {adminMode && <button onClick={async () => { setMsg('Guardando…'); const err = await saveDisabledSkins(disabled); setMsg(err ?? 'Guardado ✓ (los jugadores ya solo ven los activados)') }}>Guardar personajes</button>}
              {msg && <small>{msg}</small>}
            </>
          )}
          {adminMode && hover !== null && <SkinPreview idx={hover} />}
        </div>
        <div className="panel options">
          <h3>Pick your character</h3>
          {adminMode && <p className="sub">Pulsa un personaje para activarlo o desactivarlo (los desactivados salen tachados). Pasa el ratón para ver cómo anda y corre.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {shown.map((i) => (
              <button
                key={i}
                title={`#${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => (adminMode ? toggle(i) : onChange({ ...look, sprite: i }))}
                style={{ position: 'relative', padding: 2, background: i === current ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)', border: i === current ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, opacity: off.has(i) ? 0.35 : 1 }}
              >
                <Thumb idx={i} />
                {off.has(i) && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5a5a', fontSize: 34, fontWeight: 900 }}>✗</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Customizer(props: Props) {
  return owList.length > 0 ? <RealCustomizer {...props} /> : <DrawnCustomizer {...props} />
}

function DrawnCustomizer({ look, onChange, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dir, setDir] = useState<Dir>(0)
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch })

  useEffect(() => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    const g = ctx.createRadialGradient(c.width / 2, c.height * 0.7, 10, c.width / 2, c.height * 0.7, c.width * 0.6)
    g.addColorStop(0, '#4b7a4f')
    g.addColorStop(1, '#233a28')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, c.width, c.height)
    drawCharacter(ctx, c.width / 2, c.height - 30, 9, look, dir, 0)
  }, [look, dir])

  return (
    <div className="fullscreen scroll">
      <div className="customizer">
        <div className="panel preview">
          <h2>Your trainer</h2>
          <canvas ref={canvasRef} width={240} height={300} />
          <div className="seg">
            <button onClick={() => setDir(1)}>◀</button>
            <button onClick={() => setDir(0)}>Front</button>
            <button onClick={() => setDir(3)}>Back</button>
            <button onClick={() => setDir(2)}>▶</button>
          </div>
          <button onClick={() => onChange(randomLook(Math.floor(Math.random() * 1e9)))}>Randomize</button>
          <button className="primary" onClick={onDone}>Done</button>
        </div>

        <div className="panel options">
          <h3>Skin</h3>
          <Swatches colors={SKIN_TONES} value={look.skin} onPick={(c) => set({ skin: c })} />
          <h3>Hair</h3>
          <Choices names={HAIR_STYLE_NAMES} value={look.hairStyle} onPick={(i) => set({ hairStyle: i })} />
          <Swatches colors={HAIR_COLORS} value={look.hair} onPick={(c) => set({ hair: c })} />
          <h3>Eyes</h3>
          <Swatches colors={EYE_COLORS} value={look.eyes} onPick={(c) => set({ eyes: c })} />
          <h3>Top</h3>
          <Choices names={TOP_STYLE_NAMES} value={look.topStyle} onPick={(i) => set({ topStyle: i })} />
          <Swatches colors={CLOTH_COLORS} value={look.top} onPick={(c) => set({ top: c })} />
          <h3>Bottom</h3>
          <Choices names={BOTTOM_STYLE_NAMES} value={look.bottomStyle} onPick={(i) => set({ bottomStyle: i })} />
          <Swatches colors={CLOTH_COLORS} value={look.bottom} onPick={(c) => set({ bottom: c })} />
          <h3>Shoes</h3>
          <Swatches colors={CLOTH_COLORS} value={look.shoes} onPick={(c) => set({ shoes: c })} />
          <h3>Hat</h3>
          <Choices names={HAT_NAMES} value={look.hat} onPick={(i) => set({ hat: i })} />
          {look.hat > 0 && <Swatches colors={CLOTH_COLORS} value={look.hatColor} onPick={(c) => set({ hatColor: c })} />}
        </div>
      </div>
    </div>
  )
}
