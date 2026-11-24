import { useEffect, useState } from 'react'
import { spriteUrl } from '../data/dex'

interface Props {
  species: string
  back?: boolean
  shiny?: boolean
  scale?: number
  className?: string
}

/** A Pokémon picture. It comes from Pokémon Showdown's sprite server while the game runs (not stored by us). */
export default function MonSprite({ species, back, shiny, scale = 2, className }: Props) {
  const [stage, setStage] = useState(0) // 0 = gen5 animated, 1 = newer animated, 2 = failed
  useEffect(() => setStage(0), [species, back, shiny])
  if (stage >= 2) return <div className={`sprite-missing ${className ?? ''}`}>{species}</div>
  return (
    <img
      className={`mon-sprite ${className ?? ''}`}
      src={spriteUrl(species, { back, shiny }, stage === 1)}
      alt={species}
      style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}
      draggable={false}
      onError={() => setStage((s) => s + 1)}
    />
  )
}

/** A small still picture for lists (Showdown's icon-size sprite). */
export function MonIcon({ species, shiny }: { species: string; shiny?: boolean }) {
  return <MonSprite species={species} shiny={shiny} scale={0.9} className="mon-icon" />
}
