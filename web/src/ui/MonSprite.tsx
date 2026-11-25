import { useEffect, useState } from 'react'
import { dexNum, spriteUrl } from '../data/dex'
import { MAX_ROM_DEX } from '../rom/sprites'
import { romIconUrl, romSpriteUrl } from '../rom/store'
import AnimSprite from './AnimSprite'
import pix from '../data/pixelSprites.json'

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
  useEffect(() => {
    let live = true
    if (inRom) void romSpriteUrl(dex, !!back, !!shiny).then((u) => live && setRomUrl(u))
    return () => { live = false }
  }, [dex, inRom, back, shiny])

  // Pokémon that are not in the game file: Pokémon Showdown's pixel pictures in the style of Black / White
  if (!inRom) return <PixelMon species={species} back={back} shiny={shiny} scale={platform ? scale : scale} className={className} />
  if (inRom && animated) return <AnimSprite species={species} back={back} shiny={shiny} scale={scale * 0.8} />
  if (inRom) {
    if (!romUrl) return <div className={`sprite-missing ${className ?? ''}`} />
    // the game's pictures are 96 x 96 pixels
    return (
      <img
        className={`mon-sprite rom ${className ?? ''}`}
        src={romUrl}
        alt={species}
        style={{ transform: `scale(${scale * 0.8})`, transformOrigin: 'bottom center', imageRendering: 'pixelated' }}
        draggable={false}
      />
    )
  }
  return <div className={`sprite-missing ${className ?? ''}`} />
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
  if (!inRom) return <PixelIcon species={species} shiny={shiny} size={size} />
  return <div style={box} />
}

interface PixInfo { s?: number[]; sb?: number[]; a?: number[]; ab?: number[] }
const PIX = pix as Record<string, PixInfo>

/** Starts loading a Pokémon's pixel picture ahead of time (so it shows up at once in a battle). */
export function preloadPixel(species: string, back: boolean, shiny: boolean) {
  const info = PIX[String(dexNum(species))]
  const animated = back ? info?.ab : info?.a
  const img = new Image()
  img.src = spriteUrl(species, { back, shiny }, animated ? 0 : 1)
}

/** A Pokémon without a picture in the game file: animated if Showdown has an animated pixel picture, else the still one (with a gentle idle movement). */
function PixelMon({ species, back, shiny, scale = 2, className }: { species: string; back?: boolean; shiny?: boolean; scale?: number; className?: string }) {
  const info = PIX[String(dexNum(species))]
  const anim = back ? info?.ab : info?.a
  const [stage, setStage] = useState(anim ? 0 : 1)
  useEffect(() => setStage(anim ? 0 : 1), [species, back, shiny, anim])
  const S = scale * 0.8 // one picture pixel, like the pictures from the game file
  if (stage === 0 && anim) {
    return <img className={`mon-sprite pix ${className ?? ''}`} src={spriteUrl(species, { back, shiny }, 0)} alt={species} draggable={false} onError={() => setStage(1)} style={{ width: anim[0] * S, height: anim[1] * S, imageRendering: 'pixelated' }} />
  }
  const box = (back ? info?.sb : info?.s) ?? info?.s ?? [0, 0, 95, 95]
  const w = (box[2] - box[0] + 1) * S, h = (box[3] - box[1] + 1) * S
  if (stage >= 2) return <div className={`sprite-missing ${className ?? ''}`}>{species}</div>
  return (
    <span
      className={`mon-sprite pix still ${className ?? ''}`}
      role="img"
      aria-label={species}
      style={{ display: 'block', width: w, height: h, backgroundImage: `url(${spriteUrl(species, { back, shiny }, 1)})`, backgroundSize: `${96 * S}px ${96 * S}px`, backgroundPosition: `${-box[0] * S}px ${-box[1] * S}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', transformOrigin: 'bottom center' }}
    />
  )
}

/** A small picture for lists: the still pixel picture, trimmed and fitted into a square. */
function PixelIcon({ species, shiny, size }: { species: string; shiny?: boolean; size: number }) {
  const info = PIX[String(dexNum(species))]
  const box = info?.s ?? [0, 0, 95, 95]
  const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1
  const S = Math.min(size / w, size / h)
  return (
    <span style={{ display: 'inline-block', width: size, height: size, flex: 'none', position: 'relative' }}>
      <span style={{ position: 'absolute', left: (size - w * S) / 2, top: (size - h * S) / 2, width: w * S, height: h * S, backgroundImage: `url(${spriteUrl(species, { shiny }, 1)})`, backgroundSize: `${96 * S}px ${96 * S}px`, backgroundPosition: `${-box[0] * S}px ${-box[1] * S}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' }} />
    </span>
  )
}

/** A plain page element (not React) showing a Pokémon's pixel picture at its own size, for things drawn outside React (the follower). */
export function pixelDom(species: string, shiny: boolean): { el: HTMLElement; w: number; h: number } {
  const info = PIX[String(dexNum(species))]
  const anim = info?.a
  const wrap = document.createElement('div')
  const still = () => {
    const box = info?.s ?? [0, 0, 95, 95]
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1
    wrap.replaceChildren()
    wrap.style.width = `${w}px`; wrap.style.height = `${h}px`
    wrap.style.backgroundImage = `url(${spriteUrl(species, { shiny }, 1)})`
    wrap.style.backgroundSize = '96px 96px'
    wrap.style.backgroundPosition = `${-box[0]}px ${-box[1]}px`
    wrap.style.backgroundRepeat = 'no-repeat'
    out.w = w; out.h = h
  }
  const out = { el: wrap, w: 0, h: 0 }
  wrap.style.imageRendering = 'pixelated'
  if (anim) {
    const img = document.createElement('img')
    img.src = spriteUrl(species, { shiny }, 0)
    img.draggable = false
    img.style.cssText = `width:${anim[0]}px;height:${anim[1]}px;image-rendering:pixelated;display:block`
    img.onerror = still
    wrap.style.width = `${anim[0]}px`; wrap.style.height = `${anim[1]}px`
    wrap.appendChild(img)
    out.w = anim[0]; out.h = anim[1]
  } else still()
  return out
}
