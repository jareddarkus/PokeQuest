// Which characters (skins) players may choose: the owner switches skins off; everybody reads the list.
import { supabase } from '../supabase'

/** The numbers of the characters the owner switched off (empty when none or when the page is offline). */
export async function fetchDisabledSkins(): Promise<number[]> {
  try {
    const q = supabase.from('skin_config').select('disabled').eq('id', 'main').maybeSingle()
    const res = await Promise.race([q, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
    const d = (res as { data?: { disabled?: number[] } | null } | null)?.data?.disabled
    return Array.isArray(d) ? d.map(Number) : []
  } catch { return [] }
}

export async function saveDisabledSkins(list: number[]): Promise<string | null> {
  const { error } = await supabase.from('skin_config').upsert({ id: 'main', disabled: list, updated_at: new Date().toISOString() })
  return error ? `No se pudo guardar: ${error.message}` : null
}
