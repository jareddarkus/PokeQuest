interface Props {
  username: string | null
  onBattleRoyale: () => void
  onPractice: () => void
  onCustomize: () => void
  onSettings: () => void
  onLogout: () => void
}

export default function MainMenu({ username, onBattleRoyale, onPractice, onCustomize, onSettings, onLogout }: Props) {
  return (
    <div className="fullscreen center menu-bg">
      <div className="panel menu">
        <h1>PokeQuest</h1>
        <p className="sub">{username ? `Trainer ${username}` : 'Playing without an account'}</p>
        <button className="big" disabled title="Coming later">
          <span>Pokémon White 2 Together</span>
          <small>Shared world with your friends (coming later)</small>
        </button>
        <button className="big primary" onClick={onBattleRoyale}>
          <span>Pokémon Battle Royale</span>
          <small>Last trainer standing wins</small>
        </button>
        <button className="big" onClick={onPractice}>
          <span>Practice Island</span>
          <small>Explore alone, no account needed</small>
        </button>
        <div className="btn-row">
          <button onClick={onCustomize}>Customize</button>
          <button onClick={onSettings}>Settings</button>
          <button onClick={onLogout}>{username ? 'Log out' : 'Back'}</button>
        </div>
      </div>
    </div>
  )
}
