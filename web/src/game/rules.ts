// The rules of a round. The defaults are the ones of the Battle Royale; a world made in the editor can change them (Reglas), and every player that loads that world uses them.
export interface Rules {
  /** seconds between the falls of the rings: after this time ring 1 falls into the sea, then ring 2 ... (default 5 minutes) */
  ringSeconds: number
  /** how long a ring takes to crumble once its time is up */
  fallSeconds: number
  /** most legendary Pokémon allowed in a team */
  maxLegendary: number
  /** most items (potions, balls ...) a player can use in one battle */
  itemsPerBattle: number
}

export const DEFAULT_RULES: Rules = { ringSeconds: 300, fallSeconds: 30, maxLegendary: 1, itemsPerBattle: 4 }
/** The rules in force right now (one object, changed in place). */
export const RULES: Rules = { ...DEFAULT_RULES }

export function applyRules(r?: Partial<Rules> | null): void {
  Object.assign(RULES, DEFAULT_RULES)
  if (!r) return
  for (const k of Object.keys(DEFAULT_RULES) as Array<keyof Rules>) {
    const v = Number(r[k])
    if (Number.isFinite(v) && v >= 0) RULES[k] = v
  }
}
