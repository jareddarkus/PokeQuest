// The published world: one row in the online table `worlds` that everybody can read and only the owner (a row in `world_admins`) can change.
import { supabase } from '../supabase'
import { decodeWorld, encodeWorld, type CustomWorld } from './customWorld'

const ID = 'main'

/** The published world, or null when there is none (or the page is offline). Never waits longer than a few seconds. */
export async function fetchPublishedWorld(): Promise<CustomWorld | null> {
  try {
    const q = supabase.from('worlds').select('data').eq('id', ID).maybeSingle()
    const res = await Promise.race([q, new Promise<null>((r) => setTimeout(() => r(null), 5000))])
    const text = (res as { data?: { data?: string } | null } | null)?.data?.data
    return text ? decodeWorld(text) : null
  } catch { return null }
}

export async function publishedInfo(): Promise<{ name: string; at: string } | null> {
  try {
    const { data } = await supabase.from('worlds').select('name, updated_at').eq('id', ID).maybeSingle()
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

export async function publishWorld(cw: CustomWorld): Promise<string | null> {
  const id = await currentUserId()
  if (!id) return 'Primero inicia sesión.'
  const { error } = await supabase.from('worlds').upsert({ id: ID, name: cw.name, data: encodeWorld(cw), updated_at: new Date().toISOString(), updated_by: id })
  return error ? `No se pudo publicar: ${error.message}` : null
}

export async function unpublishWorld(): Promise<string | null> {
  const { error } = await supabase.from('worlds').delete().eq('id', ID)
  return error ? `No se pudo quitar: ${error.message}` : null
}
