import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import '@fontsource/unbounded/900.css' // titles (free, SIL Open Font License, served from our own site, not Google)
import '@fontsource/lexend/400.css' // normal text (same license)
import { supabase, signIn, signUp } from './supabase'
import { useLook, useSettings } from './game/settings'
import MainMenu from './ui/MainMenu'
import Customizer from './ui/Customizer'
import SettingsPanel from './ui/SettingsPanel'
import PlayScreen from './ui/PlayScreen'
import './App.css'

type Screen = 'menu' | 'customize' | 'practice'

function Login({ onGuest }: { onGuest: () => void }) {
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
    <div className="fullscreen center menu-bg">
      <form className="panel card" onSubmit={submit}>
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
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        </button>
        <button type="button" className="link" onClick={onGuest}>Play the practice island without an account</button>
      </form>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const devJump = import.meta.env.DEV && new URLSearchParams(location.search).has('play') // developer shortcut: ?play
  const [guest, setGuest] = useState(devJump)
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>(devJump ? 'practice' : 'menu')
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useSettings()
  const [look, setLook] = useLook()
  const [lookDone, setLookDone] = useState(() => {
    try { return localStorage.getItem('pokequest.look.done') === '1' } catch { return false }
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setUsername(null); return }
    supabase.from('profiles').select('username').eq('id', session.user.id).single().then(({ data }) => setUsername(data?.username ?? null))
  }, [session])

  const finishLook = () => {
    try { localStorage.setItem('pokequest.look.done', '1') } catch { /* ignore */ }
    setLookDone(true)
    setScreen('menu')
  }
  const startMode = (mode: Screen) => setScreen(lookDone ? mode : 'customize')

  if (!ready) return null
  if (!session && !guest) return <Login onGuest={() => setGuest(true)} />

  const logout = async () => {
    setScreen('menu')
    if (session) await supabase.auth.signOut()
    setGuest(false)
  }

  if (screen === 'customize') return <Customizer look={look} onChange={setLook} onDone={finishLook} />
  if (screen === 'practice') {
    return (
      <PlayScreen
        look={look}
        settings={settings}
        onSettings={setSettings}
        onExit={() => setScreen('menu')}
        onCustomize={() => setScreen('customize')}
      />
    )
  }
  return (
    <>
      <MainMenu
        username={username}
        onBattleRoyale={() => alert('The online lobby arrives in a later step. Try the Practice Island for now!')}
        onPractice={() => startMode('practice')}
        onCustomize={() => setScreen('customize')}
        onSettings={() => setShowSettings(true)}
        onLogout={logout}
      />
      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    </>
  )
}
