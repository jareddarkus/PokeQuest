// The rules of a match. Every number that changes how a Battle Royale plays lives HERE (one list), so the owner can change all of them
// from Settings → Admin without touching the code. The owner's saved values are stored online (see world/gameConfig.ts) and every match
// reads them when it starts: what is saved now is used from the NEXT match on.
export interface Rules {
  // ---- the falling rings (seconds counted from the start of the match)
  /** the time at which ring 1 starts to crumble into the sea */
  ring1Seconds: number
  /** the time at which ring 2 starts to crumble */
  ring2Seconds: number
  /** the time at which ring 3 starts to crumble */
  ring3Seconds: number
  /** how long ring 1 / 2 / 3 take to crumble once their time is up */
  fall1Seconds: number
  fall2Seconds: number
  fall3Seconds: number
  /** how many seconds before a ring falls the ground starts to shake and redden */
  warnSeconds: number
  /** 1 = the island collapses; 0 = it never does */
  collapseOn: number
  /** how long the players fight alone at the peak (touch-duels) before the tournament starts, counted from the start of ring 3's fall */
  peakSeconds: number
  /** 1 = a tournament decides the winner after the peak; 0 = the duels at the peak just go on */
  tournamentOn: number
  // ---- battles
  /** most legendary Pokémon allowed in a team */
  maxLegendary: number
  /** most items (potions, balls ...) a player can use in one battle */
  itemsPerBattle: number
  /** experience of a won battle is multiplied by this (default 10) */
  expMultiplier: number
  /** extra multiplier of the experience of a trainer battle, in percent (150 = x1.5) */
  trainerExpPercent: number
  /** 1 = both teams are fully restored before a duel / tournament fight; 0 = they fight with what they have */
  duelHeal: number
  // ---- watching
  /** 1 = players that are still alive may watch a battle of another player (click the player); 0 = they may not */
  watchAlive: number
  /** 1 = eliminated players may watch the battles of the player they follow; 0 = they only see the spinning ball */
  watchEliminated: number
  // ---- what everybody starts with
  startPokeBalls: number
  startGreatBalls: number
  startUltraBalls: number
  startPotions: number
  startSuperPotions: number
  startRevives: number
  // ---- Pokémon Centers and fainting
  /** 1 = a Pokémon Center in each ring (heals the team when you step in); 0 = no centers */
  centersOn: number
  /** 1 = a player whose whole team fainted wakes up (healed) at a Pokémon Center; 0 = he is eliminated */
  respawnOnWipe: number
  // ---- wild Pokémon and trainers
  /** 1 = wild Pokémon appear in the tall grass of the peak; 0 = the peak is empty: only the players are there, waiting for each other */
  peakWildOn: number
  /** 1 = trainers / people stand at the peak; 0 = there are none (normal island; things placed in a custom world stay) */
  peakNpcsOn: number
  /** chance (percent) of a wild Pokémon on every step in tall grass */
  encounterPercent: number
  /** chance (percent) that a wild Pokémon of ring 3 is a legendary (there are none anywhere else) */
  legendary3Percent: number
  /** the levels of the wild Pokémon and the trainers of every ring (lowest and highest) */
  lvl1Min: number
  lvl1Max: number
  lvl2Min: number
  lvl2Max: number
  lvl3Min: number
  lvl3Max: number
  lvl4Min: number
  lvl4Max: number
  // ---- items on the ground
  /** one item every N × N tiles (a smaller number = more items) */
  pickupCell: number
  // ---- the lobby
  /** the least players needed to start a match (1 lets you test alone) */
  minPlayers: number
  /** seconds of countdown between "everybody ready" and the start of the match */
  lobbySeconds: number
  /** seconds the players wait at the start of the match before the clock begins (the island is still whole) */
  startDelaySeconds: number
}

export const DEFAULT_RULES: Rules = {
  ring1Seconds: 300, ring2Seconds: 600, ring3Seconds: 900,
  fall1Seconds: 30, fall2Seconds: 30, fall3Seconds: 30,
  warnSeconds: 20, collapseOn: 1, peakSeconds: 300, tournamentOn: 1,
  maxLegendary: 1, itemsPerBattle: 4, expMultiplier: 10, trainerExpPercent: 150, duelHeal: 1,
  watchAlive: 1, watchEliminated: 1,
  startPokeBalls: 5, startGreatBalls: 5, startUltraBalls: 0, startPotions: 3, startSuperPotions: 0, startRevives: 5,
  centersOn: 1, respawnOnWipe: 1, peakWildOn: 0, peakNpcsOn: 0,
  encounterPercent: 11, legendary3Percent: 3,
  lvl1Min: 2, lvl1Max: 10, lvl2Min: 15, lvl2Max: 20, lvl3Min: 25, lvl3Max: 35, lvl4Min: 35, lvl4Max: 45,
  pickupCell: 13,
  minPlayers: 2, lobbySeconds: 6, startDelaySeconds: 0,
}
/** The rules in force right now (one object, changed in place). */
export const RULES: Rules = { ...DEFAULT_RULES }

/**
 * Puts the rules in force. `r` can be a list of partial rule sets, from the weakest to the strongest (e.g. an old world's rules, then the owner's saved settings).
 * Unknown / broken values are ignored; the times are kept in a sensible order.
 */
export function applyRules(...sets: Array<Partial<Rules> | null | undefined>): void {
  Object.assign(RULES, DEFAULT_RULES)
  for (const r of sets) {
    if (!r) continue
    const old = (r as { ringSeconds?: number; fallSeconds?: number })
    // (worlds saved before the rings had their own times: one time between falls and one fall time)
    if (Number.isFinite(old.ringSeconds) && (old.ringSeconds as number) > 0) { const T = old.ringSeconds as number; RULES.ring1Seconds = T; RULES.ring2Seconds = 2 * T; RULES.ring3Seconds = 3 * T; RULES.peakSeconds = T }
    if (Number.isFinite(old.fallSeconds) && (old.fallSeconds as number) > 0) RULES.fall1Seconds = RULES.fall2Seconds = RULES.fall3Seconds = old.fallSeconds as number
    for (const k of Object.keys(DEFAULT_RULES) as Array<keyof Rules>) {
      const v = Number(r[k])
      if (r[k] !== undefined && r[k] !== null && Number.isFinite(v) && v >= 0) RULES[k] = v
    }
  }
  // sensible order and limits
  RULES.ring2Seconds = Math.max(RULES.ring2Seconds, RULES.ring1Seconds)
  RULES.ring3Seconds = Math.max(RULES.ring3Seconds, RULES.ring2Seconds)
  for (const k of ['fall1Seconds', 'fall2Seconds', 'fall3Seconds'] as const) RULES[k] = Math.max(1, RULES[k])
  RULES.minPlayers = Math.max(1, Math.round(RULES.minPlayers))
  RULES.pickupCell = Math.max(4, Math.round(RULES.pickupCell))
  for (let k = 1; k <= 4; k++) {
    const lo = `lvl${k}Min` as keyof Rules, hi = `lvl${k}Max` as keyof Rules
    RULES[lo] = Math.min(100, Math.max(1, Math.round(RULES[lo]))); RULES[hi] = Math.min(100, Math.max(RULES[lo], Math.round(RULES[hi])))
  }
}

/** The second at which the tournament starts (after the peak). */
export const tournamentStart = (): number => RULES.ring3Seconds + RULES.peakSeconds

// ---------------------------------------------------------------- what the Admin tab shows
export interface RuleDef {
  key: keyof Rules
  /** 'time' = seconds shown as m:ss, 'toggle' = on / off, 'num' = plain number */
  kind: 'time' | 'toggle' | 'num'
  min?: number
  max?: number
  en: string
  es: string
  helpEn: string
  helpEs: string
}
export interface RuleGroup { id: string; en: string; es: string; rules: RuleDef[] }

const t = (key: keyof Rules, en: string, es: string, helpEn: string, helpEs: string, min = 0, max = 7200): RuleDef => ({ key, kind: 'time', min, max, en, es, helpEn, helpEs })
const n = (key: keyof Rules, en: string, es: string, helpEn: string, helpEs: string, min = 0, max = 9999): RuleDef => ({ key, kind: 'num', min, max, en, es, helpEn, helpEs })
const b = (key: keyof Rules, en: string, es: string, helpEn: string, helpEs: string): RuleDef => ({ key, kind: 'toggle', en, es, helpEn, helpEs })

export const RULE_GROUPS: RuleGroup[] = [
  { id: 'rings', en: 'Falling rings and the peak', es: 'Anillos que caen y la cima', rules: [
    b('collapseOn', 'The island collapses', 'La isla se hunde', 'Off = the rings never fall (the match never ends by itself).', 'Apagado = los anillos nunca caen (la partida no acaba sola).'),
    t('ring1Seconds', 'Ring 1 starts to fall at', 'El anillo 1 empieza a caer en', 'Time since the start of the match.', 'Tiempo desde el inicio de la partida.'),
    t('fall1Seconds', 'Ring 1 takes to crumble', 'El anillo 1 tarda en hundirse', 'How long the fall of ring 1 lasts.', 'Lo que dura la caída del anillo 1.', 1, 600),
    t('ring2Seconds', 'Ring 2 starts to fall at', 'El anillo 2 empieza a caer en', 'Never earlier than ring 1.', 'Nunca antes que el anillo 1.'),
    t('fall2Seconds', 'Ring 2 takes to crumble', 'El anillo 2 tarda en hundirse', 'How long the fall of ring 2 lasts.', 'Lo que dura la caída del anillo 2.', 1, 600),
    t('ring3Seconds', 'Ring 3 starts to fall at', 'El anillo 3 empieza a caer en', 'Never earlier than ring 2.', 'Nunca antes que el anillo 2.'),
    t('fall3Seconds', 'Ring 3 takes to crumble', 'El anillo 3 tarda en hundirse', 'How long the fall of ring 3 lasts.', 'Lo que dura la caída del anillo 3.', 1, 600),
    t('warnSeconds', 'Warning before a ring falls', 'Aviso antes de que caiga un anillo', 'The ground shakes and reddens this long before.', 'El suelo tiembla y se pone rojo este tiempo antes.', 0, 300),
    t('peakSeconds', 'Peak duels last (until the tournament)', 'Duelos en la cima (hasta el torneo)', 'Counted from the moment ring 3 starts to fall.', 'Se cuenta desde que el anillo 3 empieza a caer.', 0, 3600),
    b('tournamentOn', 'Tournament after the peak', 'Torneo después de la cima', 'Off = the touch-duels at the peak just go on.', 'Apagado = los duelos por contacto de la cima siguen sin torneo.'),
  ] },
  { id: 'battle', en: 'Battles', es: 'Combates', rules: [
    n('maxLegendary', 'Legendary Pokémon per team', 'Legendarios por equipo', 'Most legendary Pokémon a team can carry.', 'Máximo de Pokémon legendarios en el equipo.', 0, 6),
    n('itemsPerBattle', 'Items per battle', 'Objetos por combate', 'How many items a player can use in one battle.', 'Cuántos objetos puede usar un jugador en un combate.', 0, 99),
    n('expMultiplier', 'Experience multiplier', 'Multiplicador de experiencia', 'The experience of every won battle is multiplied by this.', 'La experiencia de cada combate ganado se multiplica por esto.', 1, 1000),
    n('trainerExpPercent', 'Trainer experience bonus (%)', 'Bonus de experiencia de entrenadores (%)', '150 = one and a half times the experience.', '150 = una vez y media la experiencia.', 0, 1000),
    b('duelHeal', 'Heal both teams before a duel', 'Curar los dos equipos antes de un duelo', 'Duels and tournament fights start with full teams.', 'Los duelos y combates del torneo empiezan con equipos completos.'),
    b('watchAlive', 'Living players can watch battles', 'Los vivos pueden ver combates', 'Click a fighting player to watch.', 'Pulsa a un jugador que combate para verlo.'),
    b('watchEliminated', 'Eliminated players can watch battles', 'Los eliminados pueden ver combates', 'They watch the battles of the player they follow.', 'Ven los combates del jugador al que siguen.'),
  ] },
  { id: 'start', en: 'What everybody starts with', es: 'Con qué empieza cada jugador', rules: [
    n('startPokeBalls', 'Poké Balls', 'Poké Balls', '', '', 0, 99),
    n('startGreatBalls', 'Great Balls', 'Super Balls', '', '', 0, 99),
    n('startUltraBalls', 'Ultra Balls', 'Ultra Balls', '', '', 0, 99),
    n('startPotions', 'Potions', 'Pociones', '', '', 0, 99),
    n('startSuperPotions', 'Super Potions', 'Superpociones', '', '', 0, 99),
    n('startRevives', 'Revives', 'Revivir', '', '', 0, 99),
  ] },
  { id: 'centers', en: 'Pokémon Centers and fainting', es: 'Centros Pokémon y debilitarse', rules: [
    b('centersOn', 'Pokémon Centers in the rings', 'Centros Pokémon en los anillos', 'Stepping into the door heals the team. Applies to the normal island.', 'Entrar por la puerta cura al equipo. Vale para la isla normal.'),
    b('respawnOnWipe', 'Wake up at a Center when the team faints', 'Despertar en un Centro al caer el equipo', 'Off = a player whose whole team fainted is eliminated.', 'Apagado = quien pierde a todo su equipo queda eliminado.'),
  ] },
  { id: 'wild', en: 'Wild Pokémon and trainers', es: 'Pokémon salvajes y entrenadores', rules: [
    b('peakWildOn', 'Wild Pokémon at the peak', 'Pokémon salvajes en la cima', 'Off = no tall grass and nothing wild at the peak: only the players, waiting for each other.', 'Apagado = sin hierba alta ni nada salvaje en la cima: solo los jugadores, esperándose.'),
    b('peakNpcsOn', 'Trainers and people at the peak', 'Entrenadores y gente en la cima', 'Off = nobody stands at the peak (normal island).', 'Apagado = nadie está en la cima (isla normal).'),
    n('encounterPercent', 'Wild Pokémon chance per step in grass (%)', 'Probabilidad de salvaje por paso en hierba (%)', 'The chance on every step in tall grass.', 'La probabilidad en cada paso en hierba alta.', 0, 100),
    n('legendary3Percent', 'Legendary chance in ring 3 (%)', 'Probabilidad de legendario en el anillo 3 (%)', '', '', 0, 100),
    n('lvl1Min', 'Ring 1 · lowest level', 'Anillo 1 · nivel mínimo', 'Levels of wild Pokémon and trainers of this ring.', 'Niveles de salvajes y entrenadores de este anillo.', 1, 100),
    n('lvl1Max', 'Ring 1 · highest level', 'Anillo 1 · nivel máximo', '', '', 1, 100),
    n('lvl2Min', 'Ring 2 · lowest level', 'Anillo 2 · nivel mínimo', '', '', 1, 100),
    n('lvl2Max', 'Ring 2 · highest level', 'Anillo 2 · nivel máximo', '', '', 1, 100),
    n('lvl3Min', 'Ring 3 · lowest level', 'Anillo 3 · nivel mínimo', '', '', 1, 100),
    n('lvl3Max', 'Ring 3 · highest level', 'Anillo 3 · nivel máximo', '', '', 1, 100),
    n('lvl4Min', 'Peak · lowest level', 'Cima · nivel mínimo', '', '', 1, 100),
    n('lvl4Max', 'Peak · highest level', 'Cima · nivel máximo', '', '', 1, 100),
  ] },
  { id: 'items', en: 'Items on the ground', es: 'Objetos por el suelo', rules: [
    n('pickupCell', 'One item every N × N tiles', 'Un objeto cada N × N casillas', 'A smaller number = more items on the island (13 by default).', 'Un número menor = más objetos en la isla (13 por defecto).', 4, 60),
  ] },
  { id: 'lobby', en: 'Lobby and start', es: 'Sala de espera e inicio', rules: [
    n('minPlayers', 'Least players to start', 'Mínimo de jugadores para empezar', '1 lets you test a match alone.', '1 permite probar una partida a solas.', 1, 20),
    t('lobbySeconds', 'Countdown in the lobby', 'Cuenta atrás en la sala', 'Between "everybody ready" and the start.', 'Entre "todos listos" y el inicio.', 1, 60),
    t('startDelaySeconds', 'Quiet time before the clock starts', 'Tiempo tranquilo antes de que corra el reloj', 'The island stays whole during this time.', 'La isla se mantiene entera durante este tiempo.', 0, 600),
  ] },
]
