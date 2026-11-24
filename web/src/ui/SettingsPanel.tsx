import type { Settings } from '../game/settings'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onCustomize?: () => void
}

export default function SettingsPanel({ settings, onChange, onClose, onCustomize }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="row">
          <span>Zoom (left = see more of the map)</span>
          <input
            type="range" min={0.5} max={1.6} step={0.05} value={settings.zoom}
            onChange={(e) => onChange({ zoom: Number(e.target.value) })}
          />
        </label>

        <label className="row">
          <span>Music volume</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
            onChange={(e) => onChange({ musicVolume: Number(e.target.value) })}
          />
        </label>

        <label className="row">
          <span>Sound effects volume</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.sfxVolume}
            onChange={(e) => onChange({ sfxVolume: Number(e.target.value) })}
          />
        </label>

        <label className="row">
          <span>On-screen D-pad (for phones)</span>
          <input type="checkbox" checked={settings.showDpad} onChange={(e) => onChange({ showDpad: e.target.checked })} />
        </label>

        <div className="row">
          <span>D-pad side</span>
          <div className="seg">
            <button className={settings.dpadSide === 'left' ? 'on' : ''} onClick={() => onChange({ dpadSide: 'left' })}>Left</button>
            <button className={settings.dpadSide === 'right' ? 'on' : ''} onClick={() => onChange({ dpadSide: 'right' })}>Right</button>
          </div>
        </div>

        <div className="btn-row">
          {onCustomize && <button onClick={onCustomize}>Customize character</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
