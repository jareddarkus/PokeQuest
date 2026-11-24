import { useEffect, useMemo, useRef, useState } from 'react'
import GameView, { type GameEvents, type GameHandle } from '../game/GameView'
import type { Look } from '../game/character'
import type { Settings } from '../game/settings'
import { COLLAPSE_SECONDS, RADIUS, collapseRadius, generateWorld, ringAt } from '../game/world'
import SettingsPanel from './SettingsPanel'

interface Props {
  look: Look
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onExit: () => void
  onCustomize: () => void
}

export default function PlayScreen({ look, settings, onSettings, onExit, onCustomize }: Props) {
  const world = useMemo(() => generateWorld(Math.floor(Math.random() * 1e9)), [])
  const spawn = world.spawns[0]
  const handleRef = useRef<GameHandle | null>(null)
  const startRef = useRef(Date.now())
  const [collapseOn, setCollapseOn] = useState(false)
  const collapseRef = useRef(false)
  collapseRef.current = collapseOn
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [ring, setRing] = useState(1)
  const [secs, setSecs] = useState(0)
  const [radius, setRadius] = useState(RADIUS)

  useEffect(() => {
    if (collapseOn) startRef.current = Date.now()
  }, [collapseOn])

  useEffect(() => {
    const id = setInterval(() => {
      const pos = handleRef.current?.getPos()
      if (pos) setRing(ringAt(pos.x, pos.y))
      const el = (Date.now() - startRef.current) / 1000
      setSecs(COLLAPSE_SECONDS - (el % COLLAPSE_SECONDS))
      setRadius(collapseRadius(el))
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const events: GameEvents = useMemo(
    () => ({
      onGym: (id) => setToast(`Gym ${id} — gym battles arrive in the next step`),
      onPickup: (id) => {
        handleRef.current?.removePickup(id)
        setToast('You found items! (the bag arrives in the next step)')
      },
      onPushed: (_x, _y, r) => setToast(`The ground crumbled — you were pushed to ring ${r}!`),
      onNpcSpotted: (id) => setToast(`A trainer spotted you! (${id}) Battles arrive in the next step`),
    }),
    [],
  )

  return (
    <div className="fullscreen">
      <GameView
        world={world}
        look={look}
        settings={settings}
        startTile={spawn}
        elapsed={() => (collapseRef.current ? Date.now() - startRef.current : null)}
        others={() => []}
        events={events}
        handleRef={handleRef}
        paused={showSettings}
      />

      <div className="hud-top-left panel">
        <strong>Ring {ring}</strong>
        <span>
          {collapseOn ? `Next band falls in ${Math.ceil(secs)}s · island radius ${Math.max(0, radius)}` : 'Island collapse is off'}
        </span>
        <label className="mini">
          <input type="checkbox" checked={collapseOn} onChange={(e) => setCollapseOn(e.target.checked)} /> Test collapse
        </label>
      </div>

      <div className="hud-top-right">
        <button className="panel" disabled>Team</button>
        <button className="panel" disabled>Bag</button>
        <button className="panel" disabled>PC</button>
        <button className="panel" onClick={() => setShowSettings(true)}>Settings</button>
        <button className="panel" onClick={onExit}>Menu</button>
      </div>

      {toast && <div className="toast panel">{toast}</div>}
      {showSettings && (
        <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setShowSettings(false)} onCustomize={onCustomize} />
      )}
    </div>
  )
}
