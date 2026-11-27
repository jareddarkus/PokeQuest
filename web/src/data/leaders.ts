// The gym leaders of the island: real characters of the Unova games (Black / White and Black 2 / White 2). Which ones are in which gym is random in every match (the same for all
// the players of the match); the Pokémon of every leader grow with the ring: the first list is for ring 1, the second for ring 2, the third for ring 3.
import type { PType } from '../game/world'
export interface LeaderDef { name: string; type: PType; teams: [string[], string[], string[]] }

export const LEADERS: LeaderDef[] = [
  { name: 'Cheren', type: 'Normal', teams: [['Lillipup', 'Patrat', 'Pidove'], ['Herdier', 'Watchog', 'Tranquill'], ['Stoutland', 'Watchog', 'Unfezant']] },
  { name: 'Roxie', type: 'Poison', teams: [['Koffing', 'Venipede', 'Foongus'], ['Whirlipede', 'Koffing', 'Foongus'], ['Scolipede', 'Weezing', 'Amoonguss']] },
  { name: 'Burgh', type: 'Bug', teams: [['Sewaddle', 'Dwebble', 'Karrablast'], ['Swadloon', 'Dwebble', 'Shelmet'], ['Leavanny', 'Crustle', 'Escavalier']] },
  { name: 'Elesa', type: 'Electric', teams: [['Blitzle', 'Emolga', 'Joltik'], ['Emolga', 'Joltik', 'Blitzle'], ['Zebstrika', 'Emolga', 'Galvantula']] },
  { name: 'Clay', type: 'Ground', teams: [['Sandile', 'Drilbur', 'Tympole'], ['Krokorok', 'Drilbur', 'Palpitoad'], ['Krookodile', 'Excadrill', 'Seismitoad']] },
  { name: 'Skyla', type: 'Flying', teams: [['Pidove', 'Ducklett', 'Rufflet'], ['Tranquill', 'Ducklett', 'Rufflet'], ['Unfezant', 'Swanna', 'Braviary']] },
  { name: 'Brycen', type: 'Ice', teams: [['Vanillite', 'Cubchoo', 'Snover'], ['Vanillish', 'Cubchoo', 'Snover'], ['Vanilluxe', 'Beartic', 'Cryogonal']] },
  { name: 'Drayden', type: 'Dragon', teams: [['Axew', 'Deino', 'Sandile'], ['Fraxure', 'Deino', 'Druddigon'], ['Haxorus', 'Druddigon', 'Hydreigon']] },
  { name: 'Marlon', type: 'Water', teams: [['Tympole', 'Frillish', 'Basculin'], ['Palpitoad', 'Frillish', 'Tirtouga'], ['Jellicent', 'Carracosta', 'Seismitoad']] },
  { name: 'Cilan', type: 'Grass', teams: [['Pansage', 'Petilil', 'Snivy'], ['Servine', 'Petilil', 'Cottonee'], ['Simisage', 'Lilligant', 'Whimsicott']] },
  { name: 'Chili', type: 'Fire', teams: [['Pansear', 'Darumaka', 'Tepig'], ['Pansear', 'Pignite', 'Darumaka'], ['Simisear', 'Emboar', 'Darmanitan']] },
  { name: 'Cress', type: 'Water', teams: [['Panpour', 'Oshawott', 'Basculin'], ['Panpour', 'Dewott', 'Basculin'], ['Simipour', 'Samurott', 'Basculin']] },
  { name: 'Lenora', type: 'Normal', teams: [['Patrat', 'Minccino', 'Lillipup'], ['Watchog', 'Minccino', 'Herdier'], ['Watchog', 'Cinccino', 'Stoutland']] },
  { name: 'Shauntal', type: 'Ghost', teams: [['Litwick', 'Yamask', 'Golett'], ['Lampent', 'Yamask', 'Golett'], ['Chandelure', 'Cofagrigus', 'Golurk']] },
  { name: 'Grimsley', type: 'Dark', teams: [['Scraggy', 'Sandile', 'Purrloin'], ['Scrafty', 'Krokorok', 'Liepard'], ['Scrafty', 'Krookodile', 'Liepard']] },
  { name: 'Caitlin', type: 'Psychic', teams: [['Munna', 'Gothita', 'Solosis'], ['Gothorita', 'Duosion', 'Munna'], ['Gothitelle', 'Reuniclus', 'Musharna']] },
  { name: 'Marshal', type: 'Fighting', teams: [['Throh', 'Sawk', 'Mienfoo'], ['Throh', 'Sawk', 'Mienfoo'], ['Throh', 'Sawk', 'Mienshao']] },
  { name: 'N', type: 'Dark', teams: [['Zorua', 'Joltik', 'Klink'], ['Zorua', 'Klang', 'Sigilyph'], ['Zoroark', 'Klinklang', 'Archeops']] },
  { name: 'Ghetsis', type: 'Dark', teams: [['Purrloin', 'Pawniard', 'Tympole'], ['Liepard', 'Pawniard', 'Palpitoad'], ['Bisharp', 'Seismitoad', 'Hydreigon']] },
  { name: 'Zinzolin', type: 'Ice', teams: [['Cubchoo', 'Snover', 'Vanillite'], ['Cubchoo', 'Vanillish', 'Snover'], ['Beartic', 'Weavile', 'Cryogonal']] },
  { name: 'Colress', type: 'Steel', teams: [['Klink', 'Magnemite', 'Ferroseed'], ['Klang', 'Magneton', 'Ferroseed'], ['Klinklang', 'Magnezone', 'Ferrothorn']] },
  { name: 'Alder', type: 'Bug', teams: [['Larvesta', 'Karrablast', 'Tepig'], ['Larvesta', 'Shelmet', 'Pignite'], ['Volcarona', 'Accelgor', 'Escavalier']] },
]
export const leaderDef = (name: string): LeaderDef | undefined => LEADERS.find((l) => l.name === name)
