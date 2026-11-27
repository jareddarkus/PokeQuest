// The three world slots of the owner. Each slot is a row of the online table `worlds` (`slot1`, `slot2`, `slot3`); the row `active` says which one the next
// Battle Royales are played on ('slot1' / 'slot2' / 'slot3', or 'default' = the normal island made from the game's real map).
import { supabase } from '../supabase'
import { decodeWorld, encodeWorld, type CustomWorld } from './customWorld'
import { currentUserId } from './publish'

export type Slot = 1 | 2 | 3
export const SLOTS: Slot[] = [1, 2, 3]
export type Active = Slot | 'default'

const rowOf = (n: Slot): string => `slot${n}`
const withTimeout = <T,>(p: PromiseLike<T>, ms = 6000): Promise<T | null> => Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), ms))])

/** Which world the next Battle Royales use. */
export async function getActive(): Promise<Active> {
  try {
    const res = await withTimeout(supabase.from('worlds').select('name').eq('id', 'active').maybeSingle())
    const v = (res as { data?: { name?: string } | null } | null)?.data?.name
    return v === 'slot1' ? 1 : v === 'slot2' ? 2 : v === 'slot3' ? 3 : 'default'
  } catch { return 'default' }
}

export async function setActive(a: Active): Promise<string | null> {
  const id = await currentUserId()
  if (!id) return 'Primero inicia sesión con la cuenta del propietario.'
  const { error } = await supabase.from('worlds').upsert({ id: 'active', name: a === 'default' ? 'default' : rowOf(a), data: '', updated_at: new Date().toISOString(), updated_by: id })
  return error ? `No se pudo cambiar: ${error.message}` : null
}

export interface SlotInfo { slot: Slot; name: string; at: string | null; empty: boolean }

/** Name and date of every slot (empty = nothing saved there yet). */
export async function slotInfos(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = SLOTS.map((slot) => ({ slot, name: '', at: null, empty: true }))
  try {
    const res = await withTimeout(supabase.from('worlds').select('id, name, updated_at').in('id', SLOTS.map(rowOf)))
    for (const r of ((res as { data?: Array<{ id: string; name: string; updated_at: string }> | null } | null)?.data ?? [])) {
      const o = out.find((x) => rowOf(x.slot) === r.id)
      if (o) { o.name = r.name; o.at = r.updated_at; o.empty = false }
    }
  } catch { /* offline: all look empty */ }
  return out
}

export async function fetchSlot(n: Slot): Promise<CustomWorld | null> {
  try {
    const res = await withTimeout(supabase.from('worlds').select('data').eq('id', rowOf(n)).maybeSingle())
    const text = (res as { data?: { data?: string } | null } | null)?.data?.data
    return text ? decodeWorld(text) : null
  } catch { return null }
}

export async function saveSlot(n: Slot, cw: CustomWorld): Promise<string | null> {
  const id = await currentUserId()
  if (!id) return 'Primero inicia sesión.'
  const { error } = await supabase.from('worlds').upsert({ id: rowOf(n), name: cw.name, data: encodeWorld(cw), updated_at: new Date().toISOString(), updated_by: id })
  return error ? `No se pudo guardar: ${error.message}` : null
}

export async function clearSlot(n: Slot): Promise<string | null> {
  const { error } = await supabase.from('worlds').delete().eq('id', rowOf(n))
  return error ? `No se pudo vaciar: ${error.message}` : null
}
