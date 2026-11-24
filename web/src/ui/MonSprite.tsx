import { useEffect, useState } from 'react'
import { dexNum, spriteUrl } from '../data/dex'
import { MAX_ROM_DEX } from '../rom/sprites'
import { romSpriteUrl } from '../rom/store'

interface Props {
  species: string
  back?: boolean
  shiny?: boolean
  scale?: number
  className?: string
}

/**
 * A Pokémon picture. Pokémon #1-#649 always come from the player's own Pokémon White 2 file (stored only in their browser).
 * Newer Pokémon (#650 and up) are not in that game, so they come from Pokémon Showdown's sprite server while playing.
 */
export default function MonSprite({ species, back, shiny, scale = 2, className }: Props) {
  const dex = dexNum(species)
  const inRom = dex > 0 && dex <= MAX_ROM_DEX
  const [romUrl, setRomUrl] = useState<string | null>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    let live = true
    setStage(0)
    if (inRom) void romSpriteUrl(dex, !!back, !!shiny).then((u) => live && setRomUrl(u))
    return () => { live = false }
  }, [dex, inRom, back, shiny])

  if (inRom) {
    if (!romUrl) return <div className={`sprite-missing ${className ?? ''}`} />
    // the game's pictures are 96 x 96 pixels
    return (
      <img
        className={`mon-sprite rom ${className ?? ''}`}
        src={romUrl}
        alt={species}
        style={{ transform: `scale(${scale * 0.8})`, transformOrigin: 'bottom center' }}
        draggable={false}
      />
    )
  }
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

/** A small still picture for lists. */
export function MonIcon({ species, shiny }: { species: string; shiny?: boolean }) {
  return <MonSprite species={species} shiny={shiny} scale={0.9} className="mon-icon" />
}
