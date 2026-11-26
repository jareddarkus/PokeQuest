import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import '@fontsource/unbounded/900.css' // titles (free, SIL Open Font License, served from our own site, not Google)
import '@fontsource/lexend/400.css' // normal text (same license)
import { supabase, signIn, signUp } from './supabase'
import { usernameProblem } from './net/username'
import { useLook, useSettings } from './game/settings'
import MainMenu from './ui/MainMenu'
import Customizer from './ui/Customizer'
import SettingsPanel from './ui/SettingsPanel'
import { setTheme } from './ui/theme'
import PlayScreen from './ui/PlayScreen'
import RomGate from './ui/RomGate'
import { ProgressBar } from './ui/ProgressBar'
import { getRomMeta } from './rom/store'
import { music } from './audio/music'
import LobbyScreen from './ui/LobbyScreen'
import type { MatchInfo } from './net/useLobby'
import { setLang, startTranslator } from './i18n'
import TitleDragon from './ui/TitleDragon'
import WorldEditor from './ui/WorldEditor'
import type { CustomWorld } from './world/customWorld'
import './App.css'
import './modern.css'

type Screen = 'menu' | 'customize' | 'practice' | 'lobby' | 'match'

function Login({ onGuest }: { onGuest: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'signup' && (!username.trim() || !email.trim() || !password)) { setError('Please fill in all three fields: username, email and password.'); return }
    if (mode === 'signup' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('That email address does not look right.'); return }
    if (mode === 'signup') { const bad = usernameProblem(username.trim()); if (bad) { setError(bad); return } }
    setBusy(true)
    setError(null)
    const problem = mode === 'login' ? await signIn(username, password) : await signUp(username.trim(), email.trim(), password)
    setError(problem)
    setBusy(false)
  }

  return (
    <div className="fullscreen title-screen">
      <div className="title-side">
      <h1 className="title-logo">PokeQuest</h1>
      <form className="panel card" onSubmit={submit}>
        <p className="sub">{mode === 'login' ? 'Log in to your trainer' : 'Create your trainer'}</p>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        {mode === 'signup' && <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        </button>
        <button type="button" className="link" onClick={onGuest}>Play the practice island without an account</button>
      </form>
      </div>
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
  // the world editor (open the page with ?editor): the world you test is played like the practice island
  const [editing, setEditing] = useState(() => new URLSearchParams(location.search).has('editor'))
  const [testWorld, setTestWorld] = useState<CustomWorld | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [match, setMatch] = useState<MatchInfo | null>(null)
  const [rom, setRom] = useState<'checking' | 'missing' | 'ready'>('checking')
  useEffect(() => {
    void getRomMeta().then((m) => setRom(m ? 'ready' : 'missing'))
  }, [])
  const [settings, setSettings] = useSettings()
  const [look, setLook] = useLook()
  useEffect(() => { startTranslator() }, [])
  useEffect(() => { setLang(settings.language ?? 'es') }, [settings.language])
  useEffect(() => { setTheme(settings.theme ?? 'modern') }, [settings.theme])
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

  // the title music plays in the menus (the game takes over while you play)
  useEffect(() => {
    music.setVolume(settings.musicVolume)
    music.setSfxVolume(settings.sfxVolume)
    if (screen !== 'practice' && screen !== 'match') void music.play('title')
  }, [screen, settings.musicVolume, settings.sfxVolume, rom])

  const finishLook = () => {
    try { localStorage.setItem('pokequest.look.done', '1') } catch { /* ignore */ }
    setLookDone(true)
    setScreen('menu')
  }
  const startMode = (mode: Screen) => setScreen(lookDone ? mode : 'customize')

  if (!ready) return null
  if (editing) {
    if (rom === 'checking') return <div className="fullscreen center menu-bg"><div className="panel card"><p className="sub">Checking the game file saved in this browser…</p><ProgressBar indeterminate p={{ text: 'Checking…', frac: 0 }} /></div></div>
    if (rom === 'missing') return <RomGate onReady={() => setRom('ready')} />
    if (testWorld) {
      return <PlayScreen key={testWorld.nextId + testWorld.name} custom={testWorld} username={username} look={look} settings={settings} onSettings={setSettings} onExit={() => setTestWorld(null)} onCustomize={() => {}} />
    }
    return <WorldEditor onExit={() => { setEditing(false); history.replaceState(null, '', location.pathname) }} onPlay={setTestWorld} />
  }
  if (!session && !guest) return <><TitleDragon /><Login onGuest={() => setGuest(true)} /></>
  if (rom === 'checking') return <div className="fullscreen center menu-bg"><div className="panel card"><p className="sub">Checking the game file saved in this browser…</p><ProgressBar indeterminate p={{ text: 'Checking…', frac: 0 }} /></div></div>
  if (rom === 'missing') return <RomGate onReady={() => setRom('ready')} />

  const logout = async () => {
    setScreen('menu')
    if (session) await supabase.auth.signOut()
    setGuest(false)
  }

  if (screen === 'lobby' && username) {
    return <LobbyScreen username={username} look={look} onStart={(m) => { setMatch(m); setScreen('match') }} onBack={() => setScreen('menu')} />
  }
  if (screen === 'match' && match) {
    return <PlayScreen key={match.id} royale={match} username={username} look={look} settings={settings} onSettings={setSettings} onExit={() => { setMatch(null); setScreen('menu') }} onCustomize={() => setScreen('customize')} />
  }
  if (screen === 'customize') return <Customizer look={look} onChange={setLook} onDone={finishLook} />
  if (screen === 'practice') {
    return (
      <PlayScreen
        username={username}
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
      <TitleDragon />
      <MainMenu
        username={username}
        onBattleRoyale={() => (username ? startMode('lobby') : alert('Log in with your account to play the Battle Royale with your friends. (The Practice Island works without an account.)'))}
        onPractice={() => startMode('practice')}
        onCustomize={() => setScreen('customize')}
        onSettings={() => setShowSettings(true)}
        onLogout={logout}
        onEditor={() => setEditing(true)}
      />
      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    </>
  )
}
