import { useEffect, useState } from 'react'
import { romItemUrl } from '../rom/store'

/** the icon file (in the game's item icon archive) of every item whose picture I have checked against the game's own item pictures; the others show no picture rather than a wrong one */
const ICON_FILE: Record<string, number> = {
  'Master Ball': 2, 'Ultra Ball': 4, 'Great Ball': 6, 'Poke Ball': 8, Potion: 24, 'Super Potion': 24037, 'Hyper Potion': 24036, 'Max Potion': 33035,
  Revive: 40, 'Max Revive': 41, 'Rare Candy': 90, 'Exp Share': 256,
  'HP Up': 83, Protein: 85, Iron: 85087, Calcium: 85089, Zinc: 85094, Carbos: 85088,
  'Fire Stone': 119, 'Water Stone': 123, 'Thunder Stone': 121, 'Leaf Stone': 125, 'Moon Stone': 117, 'Sun Stone': 115, 'Shiny Stone': 480, 'Dusk Stone': 241, 'Dawn Stone': 484,
  Charcoal: 320, 'Mystic Water': 308, Magnet: 153, 'Miracle Seed': 301, 'Never-Melt Ice': 157, 'Black Belt': 305, 'Poison Barb': 312, 'Soft Sand': 297, 'Sharp Beak': 155,
  'Twisted Spoon': 159, 'Silver Powder': 267, 'Hard Stone': 299, 'Spell Tag': 316, 'Dragon Fang': 161, 'Black Glasses': 303, 'Metal Coat': 289, 'Silk Scarf': 324,
  Leftovers: 291, 'Focus Sash': 659, 'Choice Scarf': 512,
}

/** An item picture taken from the player's own Pokémon White 2 file. */
export default function ItemIcon({ name, size = 30 }: { name: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const file = ICON_FILE[name]
    if (file !== undefined) void romItemUrl(file).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [name])
  if (!url) return <span style={{ display: 'inline-block', width: size, height: size, flex: 'none' }} />
  return <img src={url} alt="" draggable={false} style={{ width: size, height: size, imageRendering: 'pixelated', flex: 'none' }} />
}
