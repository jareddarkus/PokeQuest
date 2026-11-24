import { useEffect, useState } from 'react'
import { Dex } from '@pkmn/sim'
import { romItemUrl } from '../rom/store'

const VERIFIED = new Set([1, 2, 3, 4])

/** An item picture taken from the player's own Pokémon White 2 file. */
export default function ItemIcon({ name, size = 30 }: { name: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const num = Dex.items.get(name).num
    // Only icons whose place in the game file I have verified are shown (the four Poké Balls so far); a wrong picture would be worse than none.
    if (VERIFIED.has(num)) void romItemUrl(num).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [name])
  if (!url) return <span style={{ display: 'inline-block', width: size, height: size, flex: 'none' }} />
  return <img src={url} alt="" draggable={false} style={{ width: size, height: size, imageRendering: 'pixelated', flex: 'none' }} />
}
