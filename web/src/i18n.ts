// The game's language. Spanish is the default for now; the Settings panel switches between Spanish and English.
// Names of Pokémon, moves, abilities, items, types, natures and stats come from the official name tables of PokeAPI (data/es.json,
// only the names that differ from English). The sentences are translated by the dictionary and the patterns below; the page's visible
// text is translated as it appears (a small observer), so every screen is covered without touching each component.
import es from './data/es.json'
import esDesc from './data/es_desc.json'
import { Dex } from '@pkmn/sim'
import { useSyncExternalStore } from 'react'

export type Lang = 'es' | 'en'
let lang: Lang = 'es'
const listeners = new Set<() => void>()
export const getLang = () => lang
/** A battle message in the language of the page (the typewriter needs the whole sentence translated before it starts typing). */
export const trText = (s: string): string => (lang === 'es' ? trSentence(s) : s)
export function setLang(l: Lang) { if (l === lang) return; lang = l; retranslateAll(); listeners.forEach((f) => f()) }

// ---------------------------------------------------------------- names
const NAMES = new Map<string, string>()
for (const table of [es.species, es.moves, es.abilities, es.items, es.types, es.natures, es.stats] as Array<Record<string, string>>) {
  for (const [en, sp] of Object.entries(table)) if (en.length > 2 && !NAMES.has(en)) NAMES.set(en, sp)
}
// a few names that the game writes in its own way
const EXTRA_NAMES: Record<string, string> = { 'Poke Ball': 'Poké Ball', 'Exp. Share': 'Repartir Exp.', 'Exp Share': 'Repartir Exp.', 'Never-Melt Ice': 'Antiderretir', 'Poke Balls': 'Poké Balls' }
for (const [en, sp] of Object.entries(EXTRA_NAMES)) NAMES.set(en, sp)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const nameRe = new RegExp(`(?<![A-Za-zÀ-ÿ])(${[...NAMES.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![A-Za-zÀ-ÿ])`, 'g')
const translateNames = (s: string) => s.replace(nameRe, (m) => NAMES.get(m) ?? m)

/** The Spanish (or English) name of a thing, for code that builds its own text. */
export const nameOf = (en: string) => (lang === 'es' ? NAMES.get(en) ?? en : en)

// ---------------------------------------------------------------- sentences
const STAT_ES: Record<string, string> = { Attack: 'Ataque', Defense: 'Defensa', 'Sp. Atk': 'Ataque Especial', 'Sp. Def': 'Defensa Especial', Speed: 'Velocidad', accuracy: 'Precisión', evasiveness: 'Evasión' }
const STAT_WORDS: Record<string, string> = { atk: 'Ataque', def: 'Defensa', spa: 'Ataque Especial', spd: 'Defensa Especial', spe: 'Velocidad', accuracy: 'Precisión', evasion: 'Evasión' }
const DICT: Record<string, string> = {
  'HP': 'PS', 'Lv': 'Nv', 'Lv.': 'Nv.', 'Exp': 'Exp.',
  // accounts
  'Create account': 'Crear cuenta', 'Create your trainer': 'Crea a tu entrenador', 'Log in': 'Iniciar sesión', 'Log in to your trainer': 'Inicia sesión con tu entrenador',
  'Email': 'Correo electrónico', 'Password': 'Contraseña', 'Username': 'Usuario', 'New here? Create an account': '¿Primera vez? Crea una cuenta', 'Already have an account? Log in': '¿Ya tienes cuenta? Inicia sesión',
  'Play the practice island without an account': 'Jugar en la isla de práctica sin cuenta',
  'Please fill in all three fields: username, email and password.': 'Rellena los tres campos: usuario, correo y contraseña.',
  'That email address does not look right.': 'Ese correo electrónico no parece correcto.',
  'Could not create the account': 'No se pudo crear la cuenta', 'Wrong username or password': 'Usuario o contraseña incorrectos',
  // main menu
  'Pokémon Battle Royale': 'Pokémon Battle Royale', 'Last trainer standing wins': 'Gana el último entrenador en pie', 'Practice Island': 'Isla de práctica',
  'Explore alone, no account needed': 'Explora solo, sin necesidad de cuenta', 'Customize': 'Personalizar', 'Settings': 'Ajustes', 'Log out': 'Cerrar sesión',
  'Competitive': 'Competitivo', 'Coming later': 'Próximamente', 'Play for points and climb the ranking (coming later)': 'Juega por puntos y sube en la clasificación (próximamente)',
  'Playing without an account': 'Jugando sin cuenta', 'Pokémon White 2 Together': 'Pokémon Blanco 2 en compañía', 'Shared world with your friends (coming later)': 'Mundo compartido con tus amigos (próximamente)',
  'Log in with your account to play the Battle Royale with your friends. (The Practice Island works without an account.)': 'Inicia sesión con tu cuenta para jugar al Battle Royale con tus amigos. (La isla de práctica funciona sin cuenta.)',
  // game file
  'Choose my Pokémon White 2 file': 'Elegir mi archivo de Pokémon Blanco 2', 'Could not read that file.': 'No se pudo leer ese archivo.',
  'You only need to do this once per browser.': 'Solo tienes que hacerlo una vez por navegador.', 'Done!': '¡Listo!',
  'This game contains no Pokémon pictures. Choose': 'Este juego no contiene imágenes de Pokémon. Elige', 'your own Pokémon White 2': 'tu propio Pokémon Blanco 2',
  '— nothing is uploaded — and keeps the pictures in this browser.': '— no se sube nada — y guarda las imágenes en este navegador.', 'your computer only': 'tu ordenador solamente',
  'file (a .nds file). The game reads it on': 'archivo (un .nds). El juego lo lee en', 
  'Opening the game file…': 'Abriendo el archivo del juego…', 'Reading the Pokémon pictures…': 'Leyendo las imágenes de los Pokémon…', 'Reading the battle scenery…': 'Leyendo los escenarios de combate…',
  'Reading the island map…': 'Leyendo el mapa de la isla…', 'Reading the item icons…': 'Leyendo los iconos de objetos…', 'Reading the menu icons…': 'Leyendo los iconos del menú…',
  'Reading the move effects…': 'Leyendo los efectos de movimientos…', 'Reading the music…': 'Leyendo la música…', 'Reading the trainer colours…': 'Leyendo los colores de los entrenadores…',
  'Reading the walking characters…': 'Leyendo los personajes…',
  'Sp. Atk': 'At. Esp.', 'Sp. Def': 'Def. Esp.', 'Speed': 'Velocidad', 'Attack': 'Ataque', 'Defense': 'Defensa', 'Next lv.': 'Sig. nv.',
  'Dex No.': 'Nº Pokédex', 'IV / EV': 'IV / EV', 'Any Pokémon from any generation. It starts at level 5.': 'Cualquier Pokémon de cualquier generación. Empieza en el nivel 5.',
  'Pick a Pokémon': 'Elige un Pokémon', 'Restores 10 PP to every move of a Pokémon.': 'Restaura 10 PP de todos los movimientos de un Pokémon.',
  'Heal': 'Curar', 'Yes': 'Sí', 'No': 'No', 'OK': 'Aceptar',
  // menus
  'Menu': 'Menú', 'Team': 'Equipo', 'Bag': 'Mochila', 'PC': 'PC', 'Chat': 'Chat', 'Exit': 'Salir', 'Close': 'Cerrar', 'Back': 'Atrás', 'Use': 'Usar', 'Send': 'Enviar',
  'Items': 'Objetos', 'Medicine': 'Medicinas', 'Poké Balls': 'Poké Balls', 'Your team': 'Tu equipo', 'Pick a Pokémon to see its summary': 'Elige un Pokémon para ver su resumen',
  'Info': 'Datos', 'Stats': 'Estadísticas', 'Moves': 'Movimientos', 'Nature': 'Naturaleza', 'Ability': 'Habilidad', 'Held item': 'Objeto', 'Type': 'Tipo', 'Level': 'Nivel',
  'Exp. points': 'Puntos de Exp.', 'To next level': 'Para el siguiente nivel', 'none': 'ninguno', 'Move up': 'Subir', 'Move down': 'Bajar',
  'Choose a Pokémon.': 'Elige un Pokémon.', 'Nothing in this pocket.': 'No hay nada en este bolsillo.',
  'Your bag is empty. Look for Poké Balls on the ground!': 'Tu mochila está vacía. ¡Busca Poké Balls por el suelo!',
  'Tap a Pokémon to swap it between the team and the box.': 'Toca un Pokémon para cambiarlo entre el equipo y la caja.',
  'Your team is full.': 'Tu equipo está completo.', 'You cannot carry more than 2 legendary Pokémon.': 'No puedes llevar más de 2 Pokémon legendarios.',
  'You need at least one Pokémon on your team.': 'Necesitas al menos un Pokémon en tu equipo.', 'It would have no effect.': 'No tendría ningún efecto.',
  'No Pokémon yet.': 'Todavía no hay Pokémon.', 'Total EVs': 'EVs totales',
  // items
  'Catches wild Pokémon.': 'Atrapa Pokémon salvajes.', 'A better ball (x1.5).': 'Una bola mejor (x1,5).', 'A very good ball (x2).': 'Una bola muy buena (x2).', 'Never fails.': 'Nunca falla.',
  'Restores 20 HP.': 'Restaura 20 PS.', 'Restores 60 HP.': 'Restaura 60 PS.', 'Restores 120 HP.': 'Restaura 120 PS.', 'Restores all HP.': 'Restaura todos los PS.',
  'Revives a fainted Pokémon with half its HP.': 'Revive a un Pokémon debilitado con la mitad de sus PS.', 'Revives a fainted Pokémon with all its HP.': 'Revive a un Pokémon debilitado con todos sus PS.',
  'Raises a Pokémon by one level.': 'Sube un nivel a un Pokémon.', 'Makes certain Pokémon evolve.': 'Hace evolucionar a ciertos Pokémon.',
  'While in your bag, your whole team earns experience.': 'Mientras esté en tu mochila, todo el equipo gana experiencia.',
  'Raises HP EVs by 10 (up to 100).': 'Sube 10 EV de PS (hasta 100).', 'Raises Attack EVs by 10 (up to 100).': 'Sube 10 EV de Ataque (hasta 100).', 'Raises Defense EVs by 10 (up to 100).': 'Sube 10 EV de Defensa (hasta 100).',
  'Raises Sp. Atk EVs by 10 (up to 100).': 'Sube 10 EV de At. Esp. (hasta 100).', 'Raises Sp. Def EVs by 10 (up to 100).': 'Sube 10 EV de Def. Esp. (hasta 100).', 'Raises Speed EVs by 10 (up to 100).': 'Sube 10 EV de Velocidad (hasta 100).',
  'Held: restores a little HP every turn.': 'Llevado: restaura algunos PS cada turno.', 'Held: survives one hit that would KO.': 'Llevado: sobrevive a un golpe que lo debilitaría.', 'Held: raises Speed, locks you into one move.': 'Llevado: sube la Velocidad, pero solo puedes usar un movimiento.',
  // battle
  'Fight': 'Lucha', 'Run': 'Huir', 'Pokémon': 'Pokémon', 'FIGHT': 'LUCHA', 'RUN': 'HUIR', 'BAG': 'MOCHILA', 'POKÉMON': 'POKÉMON',
  'Nothing useful here.': 'Aquí no hay nada útil.', 'Choose your next Pokémon.': 'Elige a tu siguiente Pokémon.', 'But it already knows 4 moves. Forget one?': 'Pero ya sabe 4 movimientos. ¿Olvidar uno?',
  'Got away safely!': '¡Escapaste sin problemas!', "You couldn't get away!": '¡No has podido escapar!', 'You won!': '¡Has ganado!', 'A trainer': 'Un entrenador',
  'You have no Pokémon left that can fight...': 'No te quedan Pokémon que puedan luchar...', "It's super effective!": '¡Es muy eficaz!', "It's not very effective...": 'No es muy eficaz...',
  'A critical hit!': '¡Un golpe crítico!', 'But it failed!': '¡Pero ha fallado!',
  // play screen
  'Island collapse is off': 'El derrumbe de la isla está desactivado', 'Island falls when the match starts': 'La isla se derrumba cuando empieza la partida', 'Test collapse': 'Probar derrumbe',
  'Practice tools': 'Herramientas de práctica', 'Heal team': 'Curar equipo', 'Get ready!': '¡Prepárate!', 'Building the island from your game file…': 'Construyendo la isla con tu archivo del juego…',
  'All your Pokémon have fainted! Use a Revive from your bag (or find one).': '¡Todos tus Pokémon están debilitados! Usa un Revivir de tu mochila (o encuentra uno).',
  'You blacked out of the fight! Heal up with Revives and Potions.': '¡Te has quedado sin fuerzas! Cúrate con Revivires y Pociones.',
  "The map pieces are missing. Please import your game file again (clear this site's data, then reload).": 'Faltan las piezas del mapa. Importa de nuevo tu archivo del juego (borra los datos de este sitio y recarga).',
  // lobby, chat
  'Waiting room': 'Sala de espera', 'Leave': 'Salir', 'Ready': 'Listo', 'Not ready': 'No listo', 'No messages yet.': 'Aún no hay mensajes.', 'No messages yet. Say hello!': 'Aún no hay mensajes. ¡Saluda!',
  'Nobody here yet…': 'Todavía no hay nadie…', 'Could not connect. Go back and try again.': 'No se pudo conectar. Vuelve atrás e inténtalo de nuevo.',
  'Press Ready. The match starts when everybody is ready.': 'Pulsa Listo. La partida empieza cuando todos estén listos.',
  'Log in with your account to chat with your friends. (Chat is off when you play without an account.)': 'Inicia sesión para chatear con tus amigos. (El chat está desactivado si juegas sin cuenta.)',
  // settings, customizer, starter
  'Zoom (left = see more of the map)': 'Zoom (izquierda = ver más mapa)', 'Music volume': 'Volumen de la música', 'Text speed': 'Velocidad del texto', 'Slow': 'Lenta', 'Fast': 'Rápida', 'Instant': 'Instantánea', 'Sound effects volume': 'Volumen de los efectos', 'On-screen D-pad (for phones)': 'Cruceta en pantalla (para móviles)',
  'D-pad side': 'Lado de la cruceta', 'Left': 'Izquierda', 'Right': 'Derecha', 'Customize character': 'Personalizar personaje', 'Language': 'Idioma',
  'Pick your character': 'Elige tu personaje', 'Your trainer': 'Tu entrenador', 'Randomize': 'Al azar', 'Done': 'Hecho', 'Skin': 'Piel', 'Hair': 'Pelo', 'Eyes': 'Ojos', 'Top': 'Parte de arriba', 'Bottom': 'Parte de abajo', 'Shoes': 'Zapatos', 'Hat': 'Gorro', 'Front': 'Frente',
  'Choose your starter': 'Elige a tu inicial', 'Search by name or number': 'Buscar por nombre o número', 'Type a message…': 'Escribe un mensaje…',
}
const PATTERNS: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  [/^Go! (.+)!$/, '¡Adelante, $1!'], [/^The foe sent out (.+)!$/, '¡El rival envió a $1!'], [/^A wild (.+) appeared!$/, '¡Ha aparecido un $1 salvaje!'],
  [/^(.+) used (.+)!$/, '¡$1 usó $2!'], [/^(.+) sent out (.+)!$/, '¡$1 sacó a $2!'], [/^You are challenged by (.+)!$/, '¡$1 te desafía!'], [/^(.+) fainted!$/, '¡$1 se ha debilitado!'], [/^(.+)'s attack missed!$/, '¡$1 ha fallado el ataque!'],
  [/^It doesn't affect (.+)\.\.\.$/, 'No afecta a $1...'], [/^(.+) can't move!$/, '¡$1 no se puede mover!'],
  [/^(.+) was burned!$/, '¡$1 se ha quemado!'], [/^(.+) is paralyzed!$/, '¡$1 está paralizado!'], [/^(.+) fell asleep!$/, '¡$1 se ha dormido!'],
  [/^(.+) was poisoned!$/, '¡$1 ha sido envenenado!'], [/^(.+) was badly poisoned!$/, '¡$1 ha sido gravemente envenenado!'], [/^(.+) was frozen solid!$/, '¡$1 ha sido congelado!'],
  [/^(.+) has a status!$/, '¡$1 tiene un estado alterado!'],
  [/^(.+)'s (\w+) rose!$/, (_m, a, b) => `¡${STAT_WORDS[b] ?? b} de ${a} ha subido!`], [/^(.+)'s (\w+) fell!$/, (_m, a, b) => `¡${STAT_WORDS[b] ?? b} de ${a} ha bajado!`],
  [/^(.+)'s (Attack|Defense|Sp\. Atk|Sp\. Def|Speed|accuracy|evasiveness) (rose|fell)( sharply| drastically| harshly| severely)?!$/, (_m, a, b, c, d) => `¡${STAT_ES[b] ?? b} de ${a} ${c === 'rose' ? 'ha subido' : 'ha bajado'}${d ? (/drastically|severely/.test(d) ? ' muchísimo' : ' mucho') : ''}!`], [/^(.+)'s stats were already (.+)!$/, '¡Las estadísticas de $1 ya no pueden cambiar más!'],
  [/^What will (.+) do\?$/, '¿Qué hará $1?'], [/^You threw a (.+)!$/, '¡Has lanzado una $1!'], [/^You used a (.+)!$/, '¡Has usado $1!'],
  [/^Gotcha! (.+) was caught!$/, '¡Ya está! ¡$1 ha sido atrapado!'], [/^You defeated (.+)!$/, '¡Has derrotado a $1!'],
  [/^(.+) gained (\d+) Exp\. Points!$/, '¡$1 ha ganado $2 puntos de experiencia!'], [/^(.+) grew to Lv\. (\d+)!$/, '¡$1 ha subido al nivel $2!'], [/^(.+) grew to level (\d+)!$/, '¡$1 ha subido al nivel $2!'],
  [/^(.+) learned (.+)!$/, '¡$1 ha aprendido $2!'], [/^What\? (.+) is evolving!$/, '¿Qué? ¡$1 está evolucionando!'], [/^(.+) evolved into (.+)!$/, '¡$1 ha evolucionado a $2!'],
  [/^(.+) wants to learn (.+)$/, '$1 quiere aprender $2'], [/^Forget (.+)$/, 'Olvidar $1'], [/^Don't learn (.+)$/, 'No aprender $1'], [/^Replace (.+) with…$/, 'Reemplazar $1 por…'],
  [/^(.+) was healed\.$/, '$1 ha sido curado.'], [/^(.+) was revived!$/, '¡$1 ha revivido!'], [/^(.+) is now holding (.+)\.$/, '$1 lleva ahora $2.'],
  [/^(.+)'s (.+) EVs went up!$/, '¡Los EV de $2 de $1 han subido!'],
  [/^(.+)'s moves got their PP back!$/, '¡Los movimientos de $1 han recuperado PP!'], [/^(\d+)s left!$/, '¡Quedan $1 s!'], [/^Converting Pokémon (\d+) of (\d+)…$/, 'Convirtiendo Pokémon $1 de $2…'], [/^Ring (\d+)$/, 'Anillo $1'], [/^Next band falls in (\d+)s · island radius (\d+)$/, 'La siguiente franja cae en $1 s · radio de la isla $2'],
  [/^Team (\d+)\/(\d+) fit · (\d+) Poké Balls?$/, 'Equipo $1/$2 en forma · $3 Poké Balls'], [/^The match begins in (\d+) seconds\. Everybody is picking a starter…$/, 'La partida empieza en $1 segundos. Todos están eligiendo un inicial…'],
  [/^Gym Leader (.+)$/, 'Líder de gimnasio $1'], [/^Trainer (.+)$/, 'Entrenador $1'], [/^(.+) nods: you already beat this gym\.$/, '$1 asiente: ya has vencido este gimnasio.'],
  [/^You beat (.+)! You were taken to ring (\d+)\.$/, '¡Has vencido a $1! Has sido llevado al anillo $2.'], [/^Choose (.+)$/, 'Elegir a $1'], [/^Use (.+) on…$/, 'Usar $1 en…'],
  [/^Catch chance about (\d+)%\.$/, 'Probabilidad de captura: aprox. $1%.'], [/^(\d+) players?$/, '$1 jugadores'], [/^Exp (\d+)$/, 'Exp. $1'], [/^Next lv\. (\d+)$/, 'Sig. nv. $1'], [/^Lv ?(\d+)$/, 'Nv$1'], [/^Lv\. ?(\d+)$/, 'Nv. $1'], [/^Lv (\d+) · /, 'Nv $1 · '], [/^Exp (\d+)  next (\d+)$/, 'Exp $1  siguiente $2'], [/^EXP (\d+)  next (\d+)$/, 'EXP $1  siguiente $2'],
  [/^(.+) nature$/, 'Naturaleza $1'], [/^Power (\d+)$/, 'Potencia $1'], [/^Pow (\d+|—)$/, 'Pot. $1'], [/^no power$/, 'sin potencia'],
  [/^Trainer (\S+)$/, 'Entrenador $1'], [/^Team \((\d+)\/6\)$/, 'Equipo ($1/6)'], [/^Your team \((\d+)\/6\)$/, 'Tu equipo ($1/6)'], [/^BOX (\d+)$/, 'CAJA $1'],
]
const trSentence = (raw: string): string => {
  const lead = raw.match(/^\s*/)![0], trail = raw.match(/\s*$/)![0], s = raw.trim().replace(/\s+/g, ' ')
  if (!s || !/[A-Za-z]/.test(s)) return raw
  let out: string | null = DICT[s] ?? null
  if (out === null) {
    for (const [re, rep] of PATTERNS) {
      if (re.test(s)) { out = s.replace(re, rep as string); break }
    }
  }
  if (out === null) {
    // several sentences in one text: translate each one
    const parts = s.split(/(?<=[.!?…])\s+/)
    out = parts.length > 1 ? parts.map((x) => (DICT[x] ?? (PATTERNS.find(([re]) => re.test(x)) ? x.replace(PATTERNS.find(([re]) => re.test(x))![0], PATTERNS.find(([re]) => re.test(x))![1] as string) : x))).join(' ') : s
  }
  out = out.replace(/The wild ([A-Z][\w'.\-]*)/g, 'El $1 salvaje').replace(/The foe's ([A-Z][\w'.\-]*)/g, 'El $1 rival').replace(/^the foe's /, 'el rival ')
  out = out.replace(/\(neutral\)/g, '(neutra)')
  return lead + translateNames(out) + trail
}

// ---------------------------------------------------------------- the page
const original = new WeakMap<Node, string>()
const written = new WeakMap<Node, string>()
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const attrOriginal = new WeakMap<Element, Record<string, string>>()
const attrWritten = new WeakMap<Element, Record<string, string>>()

function single(n: Text, v: string) {
  original.set(n, v)
  const out = lang === 'es' ? trSentence(v) : v
  written.set(n, out)
  if (out !== v) n.nodeValue = out
}
/** Text that React split into several pieces (for example "Use ", "Potion", " on…") is translated as one sentence. */
function doText(n: Text) {
  const p = n.parentNode as Element | null
  if (p && p.nodeType === 1 && p.childNodes.length >= 2) {
    const kids = Array.from(p.childNodes)
    if (kids.every((k) => k.nodeType === 3)) {
      const texts = kids as Text[]
      if (texts.every((t) => written.get(t) === t.nodeValue)) return
      const orig = texts.map((t) => (written.get(t) === t.nodeValue ? original.get(t) ?? t.nodeValue ?? '' : t.nodeValue ?? ''))
      const full = orig.join('')
      const out = lang === 'es' ? trSentence(full) : full
      texts.forEach((t, i) => original.set(t, orig[i]))
      if (out === full) texts.forEach((t, i) => { written.set(t, orig[i]); if (t.nodeValue !== orig[i]) t.nodeValue = orig[i] })
      else texts.forEach((t, i) => { const v = i === 0 ? out : ''; written.set(t, v); if (t.nodeValue !== v) t.nodeValue = v })
      return
    }
  }
  const v = n.nodeValue ?? ''
  if (written.get(n) === v) return
  single(n, v)
}
function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v === null) continue
    if (attrWritten.get(el)?.[a] === v) continue
    ;(attrOriginal.get(el) ?? attrOriginal.set(el, {}).get(el)!)[a] = v
    const out = lang === 'es' ? trSentence(v) : v
    ;(attrWritten.get(el) ?? attrWritten.set(el, {}).get(el)!)[a] = out
    if (out !== v) el.setAttribute(a, out)
  }
}
function walk(root: Node) {
  if (root.nodeType === 3) { doText(root as Text); return }
  if (root.nodeType !== 1) return
  const el = root as Element
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS') return
  doAttrs(el)
  for (let c = el.firstChild; c; c = c.nextSibling) walk(c)
}
function retranslateAll() {
  if (typeof document === 'undefined') return
  const redo = (root: Node) => {
    if (root.nodeType !== 1) return
    const el = root as Element
    const ao = attrOriginal.get(el)
    if (ao) for (const [a, v] of Object.entries(ao)) { el.setAttribute(a, v); attrWritten.get(el)![a] = '' }
    doAttrs(el)
    let first: Text | null = null
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const o = original.get(c)
        if (o !== undefined) { written.delete(c); c.nodeValue = o }
        if (!first) first = c as Text
      } else redo(c)
    }
    if (first) { for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) written.delete(c); doText(first) }
  }
  redo(document.body)
}
let started = false
export function startTranslator() {
  if (started || typeof document === 'undefined') return
  started = true
  walk(document.body)
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text)
      else if (m.type === 'attributes') doAttrs(m.target as Element)
      else m.addedNodes.forEach((n) => walk(n))
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

/** Re-renders a component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => lang)
}
const D = esDesc as { moves: Record<string, string>; items: Record<string, string>; abilities: Record<string, string> }
/** What a move does: the official Spanish text, or the short English description. */
export const moveDesc = (move: string): string => (lang === 'es' ? D.moves[move] : undefined) ?? Dex.moves.get(move).shortDesc ?? ''
export const itemDesc = (item: string, fallback: string): string => (lang === 'es' ? D.items[item] : undefined) ?? fallback
export const abilityDesc = (ability: string): string => (lang === 'es' ? D.abilities[ability] : undefined) ?? Dex.abilities.get(ability).shortDesc ?? ''
export const CATEGORY: Record<string, string> = { Physical: 'Físico', Special: 'Especial', Status: 'Estado' }
