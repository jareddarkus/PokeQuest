// Builds web/src/data/move_text.json: what the games say about every move (PokeAPI flavour text), English and Spanish.
// Pokémon Black 2 / White 2's own text is preferred; for moves that did not exist then, the newest game's text is used.
// Run once from the repo root:  node scripts/build-move-text.mjs
import { writeFileSync } from 'node:fs'

const API = 'https://pokeapi.co/api/v2'
const list = (await (await fetch(`${API}/move?limit=3000`)).json()).results
const out = { en: {}, es: {} }
// version groups from oldest to newest (the later one wins when the preferred game has no text)
const ORDER = ['red-blue', 'gold-silver', 'ruby-sapphire', 'diamond-pearl', 'platinum', 'heartgold-soulsilver', 'black-white', 'black-2-white-2', 'x-y', 'omega-ruby-alpha-sapphire', 'sun-moon', 'ultra-sun-ultra-moon', 'sword-shield', 'scarlet-violet']
const clean = (s) => s.replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim()
let done = 0
async function one(m) {
  for (let tries = 0; tries < 4; tries++) {
    try {
      const d = await (await fetch(m.url)).json()
      for (const lang of ['en', 'es']) {
        const entries = d.flavor_text_entries.filter((e) => e.language.name === lang)
        let pick = entries.find((e) => e.version_group.name === 'black-2-white-2')
        if (!pick) pick = entries.sort((a, b) => ORDER.indexOf(a.version_group.name) - ORDER.indexOf(b.version_group.name)).pop()
        if (pick) out[lang][m.name.replace(/-/g, '')] = clean(pick.flavor_text)
      }
      return
    } catch { await new Promise((r) => setTimeout(r, 500)) }
  }
}
const queue = [...list]
await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) { await one(queue.shift()); if (++done % 100 === 0) console.log(done, '/', list.length) } }))
writeFileSync(new URL('../web/src/data/move_text.json', import.meta.url), JSON.stringify(out))
console.log('en', Object.keys(out.en).length, 'es', Object.keys(out.es).length)
