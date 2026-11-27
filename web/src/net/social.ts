// Friends and private messages (whispers). Friends live in the table `friends` (changed only through functions); a whisper goes to the private
// channel "whisper:<the receiver's account number>" that only the receiver can listen to.
import { supabase } from '../supabase'

export async function myUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function listFriends(): Promise<string[]> {
  const { data } = await supabase.rpc('my_friends')
  return Array.isArray(data) ? (data as Array<{ username: string }>).map((r) => r.username) : []
}
export async function addFriend(name: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('add_friend', { p_username: name })
  return !error && data === true
}
export async function removeFriend(name: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_friend', { p_username: name })
  return !error && data === true
}

export interface Whisper { from: string; text: string; at: number }

const outgoing = new Map<string, ReturnType<typeof supabase.channel>>()
/** Sends a private message to a player (by username). Returns false when the player does not exist or the message could not be sent. */
export async function sendWhisper(from: string, to: string, text: string): Promise<boolean> {
  const { data: uid } = await supabase.rpc('user_id_of', { p_username: to })
  if (typeof uid !== 'string') return false
  let ch = outgoing.get(uid)
  if (!ch) {
    ch = supabase.channel(`whisper:${uid}`, { config: { private: true, broadcast: { self: false } } })
    outgoing.set(uid, ch)
    await new Promise<void>((res) => { ch!.subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res() }) })
  }
  const r = await ch.send({ type: 'broadcast', event: 'w', payload: { from, text: text.slice(0, 140), at: Date.now() } })
  return r === 'ok'
}

/** Listens for whispers sent to me. Returns the function that stops listening. */
export function listenWhispers(uid: string, onMsg: (w: Whisper) => void): () => void {
  const ch = supabase.channel(`whisper:${uid}`, { config: { private: true, broadcast: { self: false } } })
  ch.on('broadcast', { event: 'w' }, ({ payload }) => {
    const p = payload as Partial<Whisper> | null
    if (p && typeof p.from === 'string' && typeof p.text === 'string') onMsg({ from: p.from.slice(0, 24), text: p.text.slice(0, 200), at: typeof p.at === 'number' ? p.at : Date.now() })
  })
  ch.subscribe()
  return () => { void supabase.removeChannel(ch) }
}

// ---------------------------------------------------------------- trainer cards (what a player has done; only battles against other PLAYERS count)
export interface TrainerCardData { username: string; since: string; number: string; pvp_wins: number; match_wins: number; matches_played: number }
export async function trainerCard(name: string): Promise<TrainerCardData | null> {
  const { data, error } = await supabase.rpc('trainer_card', { p_username: name })
  return !error && data && typeof data === 'object' ? (data as TrainerCardData) : null
}
/** I beat another player in a duel or a tournament fight (the server ignores more than one every 10 seconds and wins against myself) */
export async function recordPvpWin(loser: string): Promise<void> { try { await supabase.rpc('record_pvp_win', { p_loser: loser }) } catch { /* the card is only a bonus */ } }
/** A match I played is over (won or not) */
export async function recordMatchEnd(won: boolean): Promise<void> { try { await supabase.rpc('record_match_end', { p_won: won }) } catch { /* the card is only a bonus */ } }
