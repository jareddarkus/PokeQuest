// Events of a custom world: things that happen on a tile (a trainer, a gym, a sign ...) and groups of Pokémon (for wild grass and for trainers' teams).
// In the editor every event has a NUMBER (the type), like the number maps of the original games: 0 = nothing, 1 = start point, 2 = trainer ...

export interface PokeEntry { species: string; min: number; max: number; weight: number }
export interface PokeGroup {
  id: number
  name: string
  entries: PokeEntry[]
  /** how many Pokémon a trainer takes from the group (at random, with their levels at random between min and max) */
  count: [number, number]
}

export const EV = { Start: 1, Trainer: 2, Person: 3, Gym: 4, Item: 5, Heal: 6, Teleport: 7, Sign: 8 } as const

export interface EventKind { type: number; name: string; color: string; help: string }
export const EVENT_KINDS: EventKind[] = [
  { type: EV.Start, name: 'Punto de salida', color: '#3aa0ff', help: 'Aquí aparecen los jugadores al empezar (pon varios).' },
  { type: EV.Trainer, name: 'Entrenador', color: '#e0443a', help: 'Te ve, te habla y lucha contra ti con un grupo de Pokémon.' },
  { type: EV.Person, name: 'Persona', color: '#7ad96a', help: 'Solo habla (no lucha).' },
  { type: EV.Gym, name: 'Gimnasio (puerta)', color: '#e8a030', help: 'Puerta de gimnasio: habla el líder y lucha. Si ganas puedes llevar al jugador a otro sitio.' },
  { type: EV.Item, name: 'Objeto en el suelo', color: '#f0e050', help: 'Una bola con un objeto al azar.' },
  { type: EV.Heal, name: 'Curar equipo', color: '#ff7ab8', help: 'Al pisarla se cura todo el equipo.' },
  { type: EV.Teleport, name: 'Teletransporte', color: '#b070ff', help: 'Al pisarla llevas al jugador a otra casilla.' },
  { type: EV.Sign, name: 'Cartel / mensaje', color: '#d8d8d8', help: 'Al pisarla sale un texto.' },
]
export const kindOf = (type: number): EventKind => EVENT_KINDS.find((k) => k.type === type) ?? EVENT_KINDS[0]

export interface GameEvent {
  id: number
  type: number
  x: number
  y: number
  name?: string
  /** 0 down, 1 left, 2 right, 3 up */
  dir?: number
  behavior?: 'stand' | 'look' | 'walk' | 'run'
  /** what it says before the battle / when you talk to it (one at random) */
  lines?: string[]
  /** what a trainer says after losing (one at random) */
  after?: string[]
  /** the group of Pokémon it fights with */
  group?: number
  /** gym: its type */
  gymType?: string
  /** teleport target (also: where you are taken after beating a gym; -1 = nowhere) */
  tx?: number
  ty?: number
  /** the text of a sign / message */
  text?: string
  /** colours of the character (a number) */
  look?: number
}

export function newEvent(id: number, type: number, x: number, y: number): GameEvent {
  const e: GameEvent = { id, type, x, y }
  if (type === EV.Trainer) Object.assign(e, { name: 'Entrenador', dir: 0, behavior: 'look', lines: ['¡Te reto a un combate!'], after: ['Has sido más fuerte que yo.'], group: 0, look: Math.floor(Math.random() * 1e9) })
  if (type === EV.Person) Object.assign(e, { name: 'Persona', dir: 0, behavior: 'stand', lines: ['¡Hola! Qué buen día.'], look: Math.floor(Math.random() * 1e9) })
  if (type === EV.Gym) Object.assign(e, { name: 'Líder', gymType: 'Normal', lines: ['Bienvenido a mi gimnasio. ¡Demuéstrame de qué eres capaz!'], group: 0, tx: -1, ty: -1 })
  if (type === EV.Teleport) Object.assign(e, { tx: x, ty: y })
  if (type === EV.Sign) Object.assign(e, { text: 'Escribe aquí tu mensaje.' })
  return e
}

export function newGroup(id: number): PokeGroup {
  return { id, name: `Grupo ${id}`, entries: [{ species: 'Pidgey', min: 3, max: 6, weight: 1 }, { species: 'Rattata', min: 3, max: 6, weight: 1 }], count: [1, 2] }
}

/** Colours for the group numbers on the map. */
export const GROUP_COLORS = ['#ff5a5a', '#4aa8ff', '#ffd23a', '#5adc78', '#c070ff', '#ff9a3a', '#3adcd0', '#ff6ab4', '#9ac040', '#8a8aff']
export const groupColor = (id: number): string => GROUP_COLORS[(id - 1 + GROUP_COLORS.length * 4) % GROUP_COLORS.length]
