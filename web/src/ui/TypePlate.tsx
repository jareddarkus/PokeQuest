import { useEffect, useState } from 'react'
import { TYPE_COLOR, type PType } from '../game/world'
import { romPlateUrl } from '../rom/store'

/** A move-type label from the player's own game file (Fairy did not exist in Pokémon White 2, so it falls back to a simple chip). */
export default function TypePlate({ type, scale = 2 }: { type: string; scale?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void romPlateUrl(type).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [type])
  if (url) return <img src={url} alt={type} draggable={false} style={{ width: 32 * scale, height: 16 * scale, imageRendering: 'pixelated' }} />
  return <span className="chip" style={{ background: TYPE_COLOR[type as PType] ?? '#777' }}>{type}</span>
}