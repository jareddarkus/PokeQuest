import { useEffect, useState } from 'react'
import { romUiUrl } from '../rom/store'

/** The address of a picture taken from the player's own game file (null until it is loaded, or if it is missing). */
export function useUiUrl(name: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void romUiUrl(name).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [name])
  return url
}

/** A battle command button (FIGHT / BAG / POKÉMON / RUN) drawn with the game's own button picture. */
export default function CmdButton({ name, label, onClick, disabled, scale = 3 }: {
  name: 'fight' | 'bag' | 'pokemon' | 'run' | 'back'
  label: string
  onClick: () => void
  disabled?: boolean
  scale?: number
}) {
  const url = useUiUrl(`cmd:${name}`)
  const [size, setSize] = useState<[number, number] | null>(null)
  if (!url) return <button onClick={onClick} disabled={disabled}>{label}</button>
  return (
    <button
      className={`cmd-img ${name === 'fight' ? 'fight-wide' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{ background: 'none', border: 'none', padding: 0, boxShadow: 'none', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer', alignItems: 'center' }}
    >
      <img
        src={url}
        alt={label}
        draggable={false}
        onLoad={(e) => setSize([e.currentTarget.naturalWidth * scale, e.currentTarget.naturalHeight * scale])}
        style={{ imageRendering: 'pixelated', width: size?.[0], height: size?.[1] }}
      />
    </button>
  )
}
