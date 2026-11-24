import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(url, key)

// Players log in with a username + password. Behind the scenes that is an account with a made-up email.
export const emailFor = (username: string) => `${username.trim().toLowerCase()}@players.pokequest.app`

export async function signUp(username: string, email: string, password: string): Promise<string | null> {
  const res = await fetch(`${url}/functions/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ username, email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return data.error ?? 'Could not create the account'
  return signIn(username, password)
}

export async function signIn(username: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password })
  return error ? 'Wrong username or password' : null
}
