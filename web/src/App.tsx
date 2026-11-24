import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, signIn, signUp } from './supabase'
import '@fontsource/unbounded/900.css' // titles (free, SIL Open Font License, served from our own site, not Google)
import '@fontsource/lexend/400.css' // normal text (same license)
import './App.css'

type Profile = { username: string; money: number }

function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const problem = mode === 'login' ? await signIn(username, password) : await signUp(username, password)
    setError(problem)
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>PokeQuest</h1>
      <p className="sub">{mode === 'login' ? 'Log in to your trainer' : 'Create your trainer'}</p>
      <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
      </button>
    </form>
  )
}

function Home({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('username, money')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session.user.id])

  return (
    <div className="card">
      <h1>PokeQuest</h1>
      <p className="sub" id="welcome">{profile ? `Welcome, ${profile.username}! Money: ${profile.money}` : 'Loading your trainer...'}</p>
      <p>Logged in. The map and battles come next.</p>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return session ? <Home session={session} /> : <Login />
}
