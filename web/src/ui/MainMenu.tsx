import { useEffect, useState } from 'react'
import { isWorldAdmin } from '../world/publish'

interface Props {
  username: string | null
  onBattleRoyale: () => void
  onPractice: () => void
  onCustomize: () => void
  onSettings: () => void
  onLogout: () => void
  /** opens the world builder (only shown to the owner's account) */
  onEditor?: () => void
}

export default function MainMenu({ username, onBattleRoyale, onPractice, onCustomize, onSettings, onLogout, onEditor }: Props) {
  const [admin, setAdmin] = useState(false)
  useEffect(() => { if (username) void isWorldAdmin().then(setAdmin).catch(() => setAdmin(false)); else setAdmin(false) }, [username])
  return (
    <div className="fullscreen title-screen">
      <div className="title-side">
      <h1 className="title-logo">PokeQuest</h1>
      <div className="panel menu">
        <p className="sub">{username ? `Trainer ${username}` : 'Playing without an account'}</p>
        <button className="big" disabled title="Coming later">
          <span>Pokémon White 2 Together</span>
          <small>Shared world with your friends (coming later)</small>
        </button>
        <button className="big primary" onClick={onBattleRoyale}>
          <span>Pokémon Battle Royale</span>
          <small>Last trainer standing wins</small>
        </button>
        <button className="big" disabled title="Coming later">
          <span>Competitive</span>
          <small>Play for points and climb the ranking (coming later)</small>
        </button>
        <button className="big" onClick={onPractice}>
          <span>Practice Island</span>
          <small>Explore alone, no account needed</small>
        </button>
        {admin && onEditor && (
          <button className="big" onClick={onEditor}>
            <span>World Builder</span>
            <small>Make and publish the world everybody plays (owner only)</small>
          </button>
        )}
        <div className="btn-row">
          <button onClick={onCustomize}>Customize</button>
          <button onClick={onSettings}>Settings</button>
          <button onClick={onLogout}>{username ? 'Log out' : 'Back'}</button>
        </div>
      </div>
      </div>
    </div>
  )
}
