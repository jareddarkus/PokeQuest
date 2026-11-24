import { useEffect, useState } from 'react'
import { dexNum, spriteUrl } from '../data/dex'
import { MAX_ROM_DEX } from '../rom/sprites'
import { romIconUrl, romSpriteUrl } from '../rom/store'
import AnimSprite from './AnimSprite'
import { hdHeightFactor, loadHdSprite, type HdSprite } from './hdSprite'

interface Props {
  species: string
  back?: boolean
  shiny?: boolean
  scale?: number
  className?: string
  /** play the Pokémon's own animation (battle screen) instead of showing a still picture */
  animated?: boolean
  /** battle only: the width (in pixels) of the platform the Pokémon stands on; newer Pokémon are drawn relative to it */
  platform?: number
}

/**
 * A Pokémon picture. Pokémon #1-#649 always come from the player's own Pokémon White 2 file (stored only in their browser).
 * Newer Pokémon (#650 and up) are not in that game, so they come from Pokémon Showdown's sprite server while playing.
 */
export default function MonSprite({ species, back, shiny, scale = 2, className, animated, platform }: Props) {
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

  const [hd, setHd] = useState<HdSprite | null>(null)
  useEffect(() => {
    let live = true
    setHd(null)
    if (!inRom && platform && dex > 0) void loadHdSprite(dex).then((h) => live && setHd(h))
    return () => { live = false }
  }, [dex, inRom, platform])
  // newer Pokémon in battle: a sharp 3D picture sized to its platform (the player's Pokémon is turned to look the same way as ours)
  if (!inRom && platform && hd) {
    const h = platform * hdHeightFactor(species)
    return <img className={`mon-sprite hd ${className ?? ''}`} src={hd.url} alt={species} draggable={false} style={{ height: h, width: (hd.w / hd.h) * h, transform: back ? 'scaleX(-1)' : undefined }} />
  }
  if (!inRom && platform && !hd) return <div style={{ width: platform * 0.5, height: platform * 0.5 }} />
  if (inRom && animated) return <AnimSprite species={species} back={back} shiny={shiny} scale={scale * 0.8} />
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
export function MonIcon({ species, shiny, size = 48 }: { species: string; shiny?: boolean; size?: number }) {
  const dex = dexNum(species)
  const inRom = dex > 0 && dex <= MAX_ROM_DEX
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (inRom) void romIconUrl(dex).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [dex, inRom])
  // the game's own menu icon (32 x 32): all the same size. Newer Pokémon (no icon in the game file) are shown in a box of the same size.
  const box = { width: size, height: size, flex: 'none' as const }
  if (inRom && url) return <img src={url} alt={species} draggable={false} style={{ ...box, imageRendering: 'pixelated' }} />
  if (!inRom) return <img src={spriteUrl(species, { shiny })} alt={species} draggable={false} style={{ ...box, objectFit: 'contain' }} />
  return <div style={box} />
}
