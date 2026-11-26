import { useEffect, useState } from 'react'
import { romItemUrl } from '../rom/store'

/** the game file's own picture of the items (only used when PokéAPI's picture cannot be loaded) */
const ICON_FILE: Record<string, number> = {
  'Master Ball': 2, 'Ultra Ball': 4, 'Great Ball': 6, 'Poke Ball': 8, Potion: 24, 'Super Potion': 24037, 'Hyper Potion': 24036, 'Max Potion': 33035,
  Revive: 40, Elixir: 58061, 'Max Revive': 41, 'Rare Candy': 90, 'Exp Share': 256,
  'HP Up': 83, Protein: 85, Iron: 85087, Calcium: 85089, Zinc: 85094, Carbos: 85088,
  'Fire Stone': 119, 'Water Stone': 123, 'Thunder Stone': 121, 'Leaf Stone': 125, 'Moon Stone': 117, 'Sun Stone': 115, 'Shiny Stone': 480, 'Dusk Stone': 482, 'Dawn Stone': 484,
  Charcoal: 320, 'Mystic Water': 308, Magnet: 306, 'Miracle Seed': 301, 'Never-Melt Ice': 314, 'Black Belt': 305, 'Poison Barb': 312, 'Soft Sand': 297, 'Sharp Beak': 310,
  'Twisted Spoon': 318, 'Silver Powder': 267, 'Hard Stone': 299, 'Spell Tag': 316, 'Dragon Fang': 322, 'Black Glasses': 303, 'Metal Coat': 289, 'Silk Scarf': 324,
  Leftovers: 291, 'Focus Sash': 659, 'Choice Scarf': 512,
}

/** The picture of any item from PokéAPI's sprite collection (every item has one; the address is made from the item's name only). */
const apiUrl = (name: string) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name.toLowerCase().replace(/['’.]/g, '').replace(/\s+/g, '-')}.png`

/** An item picture: from PokéAPI's sprites (all items); if that cannot be loaded (no connection) the game file's own picture is used when it has one. */
export default function ItemIcon({ name, size = 30 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { setFailed(false); setUrl(null) }, [name])
  useEffect(() => {
    if (!failed) return
    let live = true
    const file = ICON_FILE[name]
    if (file !== undefined) void romItemUrl(file).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [failed, name])
  const style = { width: size, height: size, imageRendering: 'pixelated' as const, flex: 'none' as const }
  if (!failed) return <img src={apiUrl(name)} alt="" draggable={false} style={style} onError={() => setFailed(true)} />
  if (!url) return <span style={{ display: 'inline-block', width: size, height: size, flex: 'none' }} />
  return <img src={url} alt="" draggable={false} style={style} />
}
