// The two descriptions of a move:
//   moveFacts    = what the move really does, with the numbers (30% chance, lowers Attack by 1 stage ...), from the Showdown / Smogon move data
//   moveGameText = what the game itself says about it (the games' own short text; Pokémon Black 2 / White 2's wording when it existed there)
import { Dex } from '@pkmn/sim'
import text from './move_text.json'
import { SHORT_ES } from './moveFactsEs'

type Lang = 'es' | 'en'
const TEXT = text as { en: Record<string, string>; es: Record<string, string> }
const idOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/** What the game says about the move (flavour text). */
export function moveGameText(name: string, lang: Lang): string {
  const id = idOf(name)
  return TEXT[lang][id] ?? TEXT[lang === 'es' ? 'en' : 'es'][id] ?? ''
}

const STAT: Record<string, [string, string]> = {
  atk: ['el Ataque', 'Attack'], def: ['la Defensa', 'Defense'], spa: ['el Ataque Especial', 'Sp. Atk'], spd: ['la Defensa Especial', 'Sp. Def'],
  spe: ['la Velocidad', 'Speed'], accuracy: ['la Precisión', 'accuracy'], evasion: ['la Evasión', 'evasiveness'],
}
const STATUS_VERB: Record<string, string> = { brn: 'quemar', par: 'paralizar', slp: 'dormir', psn: 'envenenar', tox: 'envenenar gravemente', frz: 'congelar' }
const STATUS_SENT: Record<string, string> = { brn: 'Quema al objetivo.', par: 'Paraliza al objetivo.', slp: 'Duerme al objetivo.', psn: 'Envenena al objetivo.', tox: 'Envenena gravemente al objetivo.', frz: 'Congela al objetivo.' }
const VOLATILE_VERB: Record<string, string> = { flinch: 'hacer retroceder', confusion: 'confundir', attract: 'enamorar' }
const VOLATILE_SENT: Record<string, string> = {
  confusion: 'Confunde al objetivo.', flinch: 'Hace retroceder al objetivo.', leechseed: 'Planta una semilla: el objetivo pierde PS cada turno y el usuario los recupera.',
  taunt: 'El objetivo solo puede usar movimientos de ataque durante unos turnos.', encore: 'Obliga al objetivo a repetir su último movimiento durante unos turnos.',
  attract: 'Enamora al objetivo (puede quedarse sin atacar).', yawn: 'El objetivo se dormirá al final del siguiente turno.', curse: 'Maldición.', substitute: 'El usuario crea un sustituto con una cuarta parte de sus PS.',
  focusenergy: 'Aumenta la probabilidad de golpe crítico del usuario.', protect: 'Protege al usuario de los ataques de este turno.', destinybond: 'Si el usuario es debilitado, el atacante también.',
  aquaring: 'El usuario recupera PS cada turno.', ingrain: 'El usuario echa raíces y recupera PS cada turno, pero no puede huir.', nightmare: 'Daña al objetivo dormido cada turno.',
  mustrecharge: 'El usuario debe descansar el turno siguiente.', torment: 'El objetivo no puede usar el mismo movimiento dos veces seguidas.', disable: 'Anula el último movimiento del objetivo durante unos turnos.',
}
const WEATHER: Record<string, string> = { sunnyday: 'sol intenso', raindance: 'lluvia', sandstorm: 'una tormenta de arena', hail: 'granizo', snowscape: 'nieve' }
const TERRAIN: Record<string, string> = { electricterrain: 'Campo Eléctrico', grassyterrain: 'Campo de Hierba', mistyterrain: 'Campo de Niebla', psychicterrain: 'Campo Psíquico' }
const SIDE: Record<string, string> = {
  stealthrock: 'Esparce rocas puntiagudas en el lado rival: dañan a los Pokémon que entren.', spikes: 'Esparce púas en el lado rival: dañan a los Pokémon que entren.',
  toxicspikes: 'Esparce púas venenosas en el lado rival: envenenan a los Pokémon que entren.', stickyweb: 'Esparce una red que baja la Velocidad de los Pokémon rivales que entren.',
  reflect: 'Reduce el daño físico recibido por el equipo durante 5 turnos.', lightscreen: 'Reduce el daño especial recibido por el equipo durante 5 turnos.',
  auroraveil: 'Reduce el daño recibido por el equipo durante 5 turnos (solo con granizo / nieve).', tailwind: 'Duplica la Velocidad del equipo durante 4 turnos.',
  safeguard: 'Protege al equipo de los problemas de estado durante 5 turnos.', mist: 'Protege al equipo de las bajadas de estadísticas durante 5 turnos.',
}

const pct = (n: number, d: number) => Math.round((100 * n) / d)
const lvls = (n: number) => `${n} ${n === 1 ? 'nivel' : 'niveles'}`

const join = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`)
/** Stats that change by the same amount are said together: "Sube el Ataque y la Velocidad del usuario 1 nivel." */
function boostGroups(b: Record<string, number>): Array<{ n: number; stats: string[] }> {
  const by = new Map<number, string[]>()
  for (const [k, n] of Object.entries(b)) { if (STAT[k] && n) (by.get(n) ?? by.set(n, []).get(n)!).push(STAT[k][0]) }
  return [...by.entries()].map(([n, stats]) => ({ n, stats }))
}
function boostSentence(b: Record<string, number>, who: 'usuario' | 'objetivo'): string[] {
  return boostGroups(b).map(({ n, stats }) => `${n > 0 ? 'Sube' : 'Baja'} ${join(stats)} del ${who} ${lvls(Math.abs(n))}.`)
}
function boostClause(b: Record<string, number>, who: 'usuario' | 'objetivo'): string[] {
  return boostGroups(b).map(({ n, stats }) => `${n > 0 ? 'subir' : 'bajar'} ${join(stats)} del ${who} ${lvls(Math.abs(n))}`)
}

/** What the move really does, with the numbers. English: the Showdown description; Spanish: built from the move data (falls back to English when nothing could be said). */
export function moveFacts(name: string, lang: Lang): string {
  const m = Dex.moves.get(name)
  if (!m.exists) return ''
  if (lang === 'en') return m.shortDesc || ''
  const s: string[] = []
  if (m.priority > 0) s.push(`Prioridad +${m.priority}: ataca antes que los movimientos normales.`)
  else if (m.priority < 0) s.push(`Prioridad ${m.priority}: ataca después que los movimientos normales.`)
  if (m.accuracy === true && m.category !== 'Status') s.push('No falla nunca.')
  if (m.ohko) s.push('Debilita al objetivo de un golpe si acierta.')
  if (m.multihit) s.push(Array.isArray(m.multihit) ? `Golpea de ${m.multihit[0]} a ${m.multihit[1]} veces seguidas.` : `Golpea ${m.multihit} veces seguidas.`)
  if (m.willCrit) s.push('Siempre da golpe crítico.')
  else if ((m.critRatio ?? 1) > 1) s.push('Probabilidad alta de golpe crítico.')
  if (m.drain) s.push(`El usuario recupera el ${pct(m.drain[0], m.drain[1])}% del daño causado.`)
  if (m.recoil) s.push(`El usuario sufre un ${pct(m.recoil[0], m.recoil[1])}% del daño causado como daño por retroceso.`)
  if (m.heal) s.push(`Restaura el ${pct(m.heal[0], m.heal[1])}% de los PS máximos.`)
  if (m.flags?.charge) s.push('Se carga el primer turno y ataca el segundo.')
  if (m.flags?.recharge) s.push('El usuario debe descansar el turno siguiente.')
  // side effects with a chance
  const secs = (m as { secondaries?: Array<Record<string, unknown>> }).secondaries ?? (m.secondary ? [m.secondary as Record<string, unknown>] : [])
  for (const sec of secs as Array<{ chance?: number; status?: string; volatileStatus?: string; boosts?: Record<string, number>; self?: { boosts?: Record<string, number> } }>) {
    const c = sec.chance ?? 100
    const acts: string[] = []
    if (sec.status && STATUS_VERB[sec.status]) acts.push(`${STATUS_VERB[sec.status]} al objetivo`)
    if (sec.volatileStatus && VOLATILE_VERB[sec.volatileStatus]) acts.push(`${VOLATILE_VERB[sec.volatileStatus]} al objetivo`)
    if (sec.boosts) acts.push(...boostClause(sec.boosts, 'objetivo'))
    if (sec.self?.boosts) acts.push(...boostClause(sec.self.boosts, 'usuario'))
    if (acts.length) s.push(c >= 100 ? `Efecto seguro: ${acts.join(' y ')}.` : `${c}% de probabilidad de ${acts.join(' y ')}.`)
  }
  // primary effects of the move itself
  if (m.status && STATUS_SENT[m.status]) s.push(STATUS_SENT[m.status])
  if (m.volatileStatus && VOLATILE_SENT[m.volatileStatus]) s.push(VOLATILE_SENT[m.volatileStatus])
  if (m.boosts) s.push(...boostSentence(m.boosts, m.target === 'self' ? 'usuario' : 'objetivo'))
  if (m.self?.boosts) s.push(...boostSentence(m.self.boosts, 'usuario').map((t) => t.replace(/\.$/, ' tras atacar.')))
  if (m.weather && WEATHER[m.weather.toLowerCase()]) s.push(`Provoca ${WEATHER[m.weather.toLowerCase()]} durante 5 turnos.`)
  if (m.terrain && TERRAIN[m.terrain.toLowerCase()]) s.push(`Crea el ${TERRAIN[m.terrain.toLowerCase()]} durante 5 turnos.`)
  if (m.sideCondition && SIDE[m.sideCondition.toLowerCase()]) s.push(SIDE[m.sideCondition.toLowerCase()])
  if (m.forceSwitch) s.push('Obliga al objetivo a salir del combate y entra otro Pokémon.')
  if (m.selfSwitch) s.push('El usuario se retira tras atacar y entra otro Pokémon de su equipo.')
  if (m.target === 'allAdjacentFoes') s.push('Afecta a todos los rivales.')
  else if (m.target === 'allAdjacent') s.push('Afecta a todos los Pokémon de alrededor.')
  const fallback = m.shortDesc ? SHORT_ES[m.shortDesc] ?? m.shortDesc : ''
  return s.length ? s.join(' ') : fallback
}
