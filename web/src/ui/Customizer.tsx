import { useEffect, useRef, useState } from 'react'
import {
  BOTTOM_STYLE_NAMES, CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLE_NAMES, HAT_NAMES, SKIN_TONES, TOP_STYLE_NAMES,
  drawCharacter, randomLook, type Look,
} from '../game/character'
import type { Dir } from '../game/world'

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

export default function Customizer({ look, onChange, onDone }: Props) {
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
