// Which usernames are allowed: 3-16 letters, numbers or _ (no spaces or odd characters), and no insults / bad words (English, Spanish, German).
// The same check runs on the server (the signup function), this copy gives the player an answer at once.
const BAD = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'nigg', 'fag', 'retard', 'rape', 'rapist', 'nazi', 'hitler', 'kkk', 'porn', 'sex', 'penis', 'vagina', 'anal', 'cum', 'tits', 'boob', 'twat', 'wank',
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'pendejo', 'coño', 'cono', 'joder', 'gilipollas', 'follar', 'polla', 'verga', 'culo', 'maricon', 'marica', 'zorra', 'chingar', 'chinga', 'mamada', 'pinche', 'hijueputa', 'malparido', 'violar', 'pene', 'concha',
  'scheisse', 'scheiße', 'arschloch', 'fotze', 'hure', 'schwuchtel', 'wichser', 'fick', 'hurensohn', 'nutte',
]
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '$': 's', '@': 'a', '_': '' }

export function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split('').map((c) => (c in LEET ? LEET[c] : c)).join('').replace(/(.)\1+/g, '$1')
}

/** null = fine, otherwise the problem (Spanish, shown to the player). */
export function usernameProblem(name: string): string | null {
  if (name !== name.trim() || /\s/.test(name)) return 'El nombre no puede llevar espacios.'
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'Solo letras, números y _ (sin tildes, espacios ni símbolos raros).'
  if (name.length < 3 || name.length > 16) return 'El nombre debe tener entre 3 y 16 caracteres.'
  const n = normalizeName(name)
  for (const w of BAD) { const nw = normalizeName(w); if (nw.length >= 3 && n.includes(nw)) return 'Ese nombre no está permitido.' }
  return null
}
