// The published world: one row in the online table `worlds` that everybody can read and only the owner (a row in `world_admins`) can change.
import { supabase } from '../supabase'
import type { CustomWorld } from './customWorld'
import { fetchSlot, getActive } from './slots'

/** The world the next matches are played on (the slot the owner chose as active), or null = the normal island. Never waits longer than a few seconds. */
export async function fetchPublishedWorld(): Promise<CustomWorld | null> {
  try {
    const a = await getActive()
    return a === 'default' ? null : await fetchSlot(a)
  } catch { return null }
}

export async function publishedInfo(): Promise<{ name: string; at: string } | null> {
  try {
    const a = await getActive()
    if (a === 'default') return null
    const { data } = await supabase.from('worlds').select('name, updated_at').eq('id', `slot${a}`).maybeSingle()
    return data ? { name: data.name as string, at: data.updated_at as string } : null
  } catch { return null }
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function isWorldAdmin(): Promise<boolean> {
  const id = await currentUserId()
  if (!id) return false
  const { data } = await supabase.from('world_admins').select('user_id').eq('user_id', id).maybeSingle()
  return !!data
}

export async function claimWorldAdmin(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_world_admin', { p_code: code.trim().toUpperCase() })
  return !error && data === true
}
