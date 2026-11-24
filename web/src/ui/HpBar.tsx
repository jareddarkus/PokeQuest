import { useEffect, useState } from 'react'
import { romUiUrl } from '../rom/store'

// The game's HP bar: the "HP" label and dark track are its own picture; the fill uses the colours from its interface palette.
const FILL = {
  green: ['#00ff4a', '#00bd21'],
  yellow: ['#ffad00', '#a58429'],
  red: ['#ff4273', '#a54a5a'],
}

export default function HpBar({ hp, max, scale = 3, label = true }: { hp: number; max: number; scale?: number; label?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void romUiUrl('hpbar').then((u) => live && setUrl(u))
    return () => { live = false }
  }, [])
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0
  const color = frac > 0.5 ? FILL.green : frac > 0.2 ? FILL.yellow : FILL.red
  // the fill is 48 px wide, starts 16 px from the left and sits in the 2 middle rows of the 8 px tall track
  const px = hp > 0 ? Math.max(1, Math.round(frac * 48)) : 0
  const sx = (n: number) => n * scale
  return (
    <div style={{ position: 'relative', width: sx(72), height: sx(8), flex: 'none' }}>
      {url && label && <img src={url} alt="HP" draggable={false} style={{ position: 'absolute', inset: 0, width: sx(72), height: sx(8), imageRendering: 'pixelated' }} />}
      {(!url || !label) && <div style={{ position: 'absolute', left: sx(16), top: sx(2), width: sx(48), height: sx(4), background: '#212121' }} />}
      <div style={{ position: 'absolute', left: sx(16), top: sx(3), width: sx(px), height: sx(1), background: color[0], transition: 'width .5s ease' }} />
      <div style={{ position: 'absolute', left: sx(16), top: sx(4), width: sx(px), height: sx(1), background: color[1], transition: 'width .5s ease' }} />
    </div>
  )
}