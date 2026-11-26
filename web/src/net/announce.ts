// Name colours and the announcements of a match (grey lines in the chat). An announcement travels as a small record (kind + names + numbers) and every player writes it
// in their own language (US English / Spain Spanish) - and never says which Pokémon was caught or evolved.

/** Basic colours for the names of the players (light enough to read on the dark chat). A colour may be shared by two players. */
export const NAME_COLORS = ['#ff5a6a', '#ff9f43', '#3ddc84', '#4da3ff', '#a77bff', '#c8915f'] as const

const hash = (s: string): number => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 }
/** The colour a player gets in this match (the same on every screen: it comes from the name and the match). */
export const nameColor = (name: string, matchId: string): string => NAME_COLORS[hash(`${matchId}|${name}`) % NAME_COLORS.length]

export type Announcement =
  | { k: 'elim'; a: string }                    // a was eliminated (no Pokémon left)
  | { k: 'beat'; a: string; b: string; s: number } // a eliminated b in a duel, with s Pokémon left (s-0)
  | { k: 'duel'; a: string; b: string }         // a and b started a battle
  | { k: 'catch'; a: string; first: boolean }
  | { k: 'evolve'; a: string }
  | { k: 'ring'; a: string; n: number }         // a advanced to ring n
  | { k: 'pushed'; a: string; n: number }       // a was pushed to ring n by the storm
  | { k: 'gone'; n: number }                    // ring n was consumed by the storm
  | { k: 'round'; n: number }                   // the tournament round n begins
  | { k: 'champ'; a: string }                   // a won the match

export function announcementText(x: Announcement, es: boolean): string {
  switch (x.k) {
    case 'elim': return es ? `${x.a} ha sido eliminado.` : `${x.a} was eliminated.`
    case 'beat': return es ? `${x.a} ha eliminado a ${x.b} (${x.s}-0).` : `${x.a} eliminated ${x.b} (${x.s}-0).`
    case 'duel': return es ? `${x.a} y ${x.b} han empezado un combate.` : `${x.a} and ${x.b} started a battle.`
    case 'catch': return x.first ? (es ? `¡${x.a} ha capturado su primer Pokémon!` : `${x.a} caught their first Pokémon!`) : (es ? `${x.a} ha capturado un Pokémon.` : `${x.a} caught a Pokémon.`)
    case 'evolve': return es ? `${x.a} ha evolucionado a uno de sus Pokémon.` : `${x.a} evolved one of their Pokémon.`
    case 'ring': return es ? `${x.a} ha avanzado al anillo ${x.n}.` : `${x.a} advanced to ring ${x.n}.`
    case 'pushed': return es ? `La tormenta ha empujado a ${x.a} al anillo ${x.n}.` : `${x.a} was pushed to ring ${x.n} by the storm.`
    case 'gone': return es ? `El anillo ${x.n} ha sido consumido por la tormenta.` : `Ring ${x.n} was consumed by the storm.`
    case 'round': return es ? `Empieza la ronda ${x.n} del torneo.` : `Round ${x.n} of the tournament begins.`
    case 'champ': return es ? `¡${x.a} ha ganado la partida!` : `${x.a} won the match!`
  }
}
