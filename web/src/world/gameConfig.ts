// The owner's saved game settings (Settings → Admin): one row in the online table `worlds` (id 'config') that everybody can read and only the owner can change.
// A match reads them when it starts, so what is saved now is used from the NEXT match on (a match that is already playing keeps the rules it started with).
import { supabase } from '../supabase'
import { applyRules, DEFAULT_RULES, type Rules } from '../game/rules'
import { currentUserId } from './publish'

const ID = 'config'

/** The saved settings (only the numbers that make sense), or null when the owner never saved any (or the page is offline). Never waits longer than a few seconds. */
export async function fetchGameConfig(): Promise<Partial<Rules> | null> {
  try {
    const q = supabase.from('worlds').select('data').eq('id', ID).maybeSingle()
    const res = await Promise.race([q, new Promise<null>((r) => setTimeout(() => r(null), 5000))])
    const text = (res as { data?: { data?: string } | null } | null)?.data?.data
    if (!text) return null
    const raw = JSON.parse(text) as Record<string, unknown>
    const out: Partial<Rules> = {}
    for (const k of Object.keys(DEFAULT_RULES) as Array<keyof Rules>) { const v = Number(raw[k]); if (raw[k] !== undefined && Number.isFinite(v) && v >= 0) out[k] = v }
    return out
  } catch { return null }
}

/** When the settings were last saved (null: never). */
export async function gameConfigInfo(): Promise<{ at: string } | null> {
  try {
    const { data } = await supabase.from('worlds').select('updated_at').eq('id', ID).maybeSingle()
    return data ? { at: data.updated_at as string } : null
  } catch { return null }
}

/** Saves the settings for every player (owner only). Returns an error text, or null when it worked. */
export async function saveGameConfig(r: Rules): Promise<string | null> {
  const id = await currentUserId()
  if (!id) return 'Sign in first.'
  const { error } = await supabase.from('worlds').upsert({ id: ID, name: 'config', data: JSON.stringify(r), updated_at: new Date().toISOString(), updated_by: id })
  return error ? error.message : null
}

/** Reads the saved settings and puts them in force (menus and the lobby use this). Returns what was read. */
export async function refreshRules(): Promise<Partial<Rules> | null> {
  const c = await fetchGameConfig()
  applyRules(c)
  return c
}
