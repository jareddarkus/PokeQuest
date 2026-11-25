import type { StatId } from './dex'

export type ItemKind = 'ball' | 'heal' | 'revive' | 'stone' | 'vitamin' | 'held' | 'candy' | 'passive' | 'pp'

export interface ItemDef {
  id: string
  name: string
  kind: ItemKind
  desc: string
  heal?: number // HP restored (999 = full)
  ballBonus?: number // catch multiplier (255 = always)
  stat?: StatId // vitamin
  holdId?: string // Showdown item name for held items
}

const stone = (name: string, desc = 'Makes certain Pokémon evolve.'): ItemDef => ({ id: name, name, kind: 'stone', desc })
const held = (name: string, desc: string): ItemDef => ({ id: name, name, kind: 'held', desc, holdId: name })

export const ITEM_LIST: ItemDef[] = [
  { id: 'Poke Ball', name: 'Poké Ball', kind: 'ball', desc: 'Catches wild Pokémon.', ballBonus: 1 },
  { id: 'Great Ball', name: 'Great Ball', kind: 'ball', desc: 'A better ball (x1.5).', ballBonus: 1.5 },
  { id: 'Ultra Ball', name: 'Ultra Ball', kind: 'ball', desc: 'A very good ball (x2).', ballBonus: 2 },
  { id: 'Master Ball', name: 'Master Ball', kind: 'ball', desc: 'Never fails.', ballBonus: 255 },
  { id: 'Potion', name: 'Potion', kind: 'heal', desc: 'Restores 20 HP.', heal: 20 },
  { id: 'Super Potion', name: 'Super Potion', kind: 'heal', desc: 'Restores 60 HP.', heal: 60 },
  { id: 'Hyper Potion', name: 'Hyper Potion', kind: 'heal', desc: 'Restores 120 HP.', heal: 120 },
  { id: 'Max Potion', name: 'Max Potion', kind: 'heal', desc: 'Restores all HP.', heal: 999 },
  { id: 'Revive', name: 'Revive', kind: 'revive', desc: 'Revives a fainted Pokémon with half its HP.', heal: 0.5 },
  { id: 'Max Revive', name: 'Max Revive', kind: 'revive', desc: 'Revives a fainted Pokémon with all its HP.', heal: 1 },
  { id: 'Elixir', name: 'Elixir', kind: 'pp', desc: 'Restores 10 PP to every move of a Pokémon.' },
  { id: 'Rare Candy', name: 'Rare Candy', kind: 'candy', desc: 'Raises a Pokémon by one level.' },
  { id: 'Exp Share', name: 'Exp. Share', kind: 'passive', desc: 'While in your bag, your whole team earns experience.' },
  { id: 'HP Up', name: 'HP Up', kind: 'vitamin', desc: 'Raises HP EVs by 10 (up to 100).', stat: 'hp' },
  { id: 'Protein', name: 'Protein', kind: 'vitamin', desc: 'Raises Attack EVs by 10 (up to 100).', stat: 'atk' },
  { id: 'Iron', name: 'Iron', kind: 'vitamin', desc: 'Raises Defense EVs by 10 (up to 100).', stat: 'def' },
  { id: 'Calcium', name: 'Calcium', kind: 'vitamin', desc: 'Raises Sp. Atk EVs by 10 (up to 100).', stat: 'spa' },
  { id: 'Zinc', name: 'Zinc', kind: 'vitamin', desc: 'Raises Sp. Def EVs by 10 (up to 100).', stat: 'spd' },
  { id: 'Carbos', name: 'Carbos', kind: 'vitamin', desc: 'Raises Speed EVs by 10 (up to 100).', stat: 'spe' },
  stone('Fire Stone'), stone('Water Stone'), stone('Thunder Stone'), stone('Leaf Stone'), stone('Moon Stone'),
  stone('Sun Stone'), stone('Shiny Stone'), stone('Dusk Stone'), stone('Dawn Stone'), stone('Ice Stone'),
  held('Charcoal', 'Held: boosts Fire moves.'), held('Mystic Water', 'Held: boosts Water moves.'),
  held('Magnet', 'Held: boosts Electric moves.'), held('Miracle Seed', 'Held: boosts Grass moves.'),
  held('Never-Melt Ice', 'Held: boosts Ice moves.'), held('Black Belt', 'Held: boosts Fighting moves.'),
  held('Poison Barb', 'Held: boosts Poison moves.'), held('Soft Sand', 'Held: boosts Ground moves.'),
  held('Sharp Beak', 'Held: boosts Flying moves.'), held('Twisted Spoon', 'Held: boosts Psychic moves.'),
  held('Silver Powder', 'Held: boosts Bug moves.'), held('Hard Stone', 'Held: boosts Rock moves.'),
  held('Spell Tag', 'Held: boosts Ghost moves.'), held('Dragon Fang', 'Held: boosts Dragon moves.'),
  held('Black Glasses', 'Held: boosts Dark moves.'), held('Metal Coat', 'Held: boosts Steel moves.'),
  held('Silk Scarf', 'Held: boosts Normal moves.'), held('Fairy Feather', 'Held: boosts Fairy moves.'),
  held('Leftovers', 'Held: restores a little HP every turn.'), held('Focus Sash', 'Held: survives one hit that would KO.'),
  held('Choice Scarf', 'Held: raises Speed, locks you into one move.'),
]

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]))

const STONES = ['Fire Stone', 'Water Stone', 'Thunder Stone', 'Leaf Stone', 'Moon Stone', 'Sun Stone', 'Shiny Stone', 'Dusk Stone', 'Dawn Stone', 'Ice Stone']
const BOOSTERS = ITEM_LIST.filter((i) => i.kind === 'held' && !['Leftovers', 'Focus Sash', 'Choice Scarf'].includes(i.id)).map((i) => i.id)
const VITAMINS = ['HP Up', 'Protein', 'Iron', 'Calcium', 'Zinc', 'Carbos']

type Pool = Array<[string, number]>
const spread = (ids: string[], total: number): Pool => ids.map((id) => [id, total / ids.length])

/** What can be lying around in each ring. Evolution stones appear everywhere. */
export function itemPool(ring: number): Pool {
  switch (ring) {
    case 1: return [['Poke Ball', 30], ['Potion', 25], ['Revive', 4], ['Exp Share', 1.5], ...spread(BOOSTERS, 9), ...spread(STONES, 11), ...spread(VITAMINS, 3)]
    case 2: return [['Poke Ball', 10], ['Great Ball', 24], ['Super Potion', 20], ['Revive', 8], ['Rare Candy', 4], ['Exp Share', 1], ...spread(BOOSTERS, 8), ...spread(STONES, 12), ...spread(VITAMINS, 8), ['Leftovers', 1.5]]
    case 3: return [['Great Ball', 10], ['Ultra Ball', 24], ['Hyper Potion', 20], ['Revive', 8], ['Max Revive', 5], ['Rare Candy', 6], ['Master Ball', 1], ...spread(STONES, 12), ...spread(VITAMINS, 10), ['Leftovers', 2], ['Focus Sash', 2], ['Choice Scarf', 1.5]]
    default: return [['Ultra Ball', 22], ['Max Potion', 16], ['Max Revive', 10], ['Rare Candy', 8], ['Master Ball', 3], ...spread(STONES, 10), ...spread(VITAMINS, 10), ['Leftovers', 3], ['Focus Sash', 3], ['Choice Scarf', 3]]
  }
}

/**
 * A crate (the Poké Ball lying on the ground) holds 5 DIFFERENT items, chosen for the ring you are in. The PP restorer (Elixir) is in
 * about 7 crates out of 10, never more than one per crate.
 */
export function rollPickup(ring: number, rng: () => number): Record<string, number> {
  const pool = itemPool(ring).filter(([id]) => id !== 'Elixir')
  const out: Record<string, number> = {}
  if (rng() < 0.7) out['Elixir'] = 1
  while (Object.keys(out).length < 5 && pool.length) {
    const total = pool.reduce((a, [, w]) => a + w, 0)
    let r = rng() * total
    let k = 0
    for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { k = i; break } }
    out[pool[k][0]] = 1
    pool.splice(k, 1) // each item only once in a crate
  }
  return out
}

/** What every player starts a match with. */
export const STARTING_BAG: Record<string, number> = { 'Poke Ball': 5, Potion: 3, Revive: 5 }
