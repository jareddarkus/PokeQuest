import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import type { Settings } from '../game/settings'
import { bindKey, capture, KEY_ACTIONS, keyLabel, resetKeys, useKeyBindings, type KeyAction } from '../game/keys'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onCustomize?: () => void
}

const ACTION_NAMES: Record<'en' | 'es', Record<KeyAction, string>> = {
  en: { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', a: 'A: talk, pick up, accept', b: 'B: cancel (hold to run)', x: 'X: open the menu' },
  es: { up: 'Mover arriba', down: 'Mover abajo', left: 'Mover a la izquierda', right: 'Mover a la derecha', a: 'A: hablar, recoger, aceptar', b: 'B: cancelar (mantén para correr)', x: 'X: abrir el menú' },
}

export default function SettingsPanel({ settings, onChange, onClose, onCustomize }: Props) {
  const keys = useKeyBindings()
  const lang = useLang()
  const names = ACTION_NAMES[lang]
  const [listen, setListen] = useState<KeyAction | null>(null)
  useEffect(() => {
    if (!listen) return
    capture.on = true
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopImmediatePropagation()
      if (['Dead', 'Meta', 'CapsLock', 'Unidentified'].includes(e.key)) return
      bindKey(listen, e.key)
      setListen(null)
    }
    window.addEventListener('keydown', on, true)
    return () => { window.removeEventListener('keydown', on, true); capture.on = false }
  }, [listen])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="row">
          <span>Theme</span>
          <div className="seg">
            <button className={(settings.theme ?? 'modern') === 'modern' ? 'on' : ''} onClick={() => onChange({ theme: 'modern' })}>Modern</button>
            <button className={settings.theme === 'classic' ? 'on' : ''} onClick={() => onChange({ theme: 'classic' })}>Classic</button>
          </div>
        </div>

        <div className="row">
          <span>Language</span>
          <div className="seg">
            <button className={settings.language === 'es' ? 'on' : ''} onClick={() => onChange({ language: 'es' })}>Español</button>
            <button className={settings.language === 'en' ? 'on' : ''} onClick={() => onChange({ language: 'en' })}>English</button>
          </div>
        </div>

        <div className="row">
          <span>Text speed</span>
          <div className="seg">
            {(['slow', 'normal', 'fast', 'instant'] as const).map((v) => (
              <button key={v} className={(settings.textSpeed ?? 'normal') === v ? 'on' : ''} onClick={() => onChange({ textSpeed: v })}>{v === 'slow' ? 'Slow' : v === 'normal' ? 'Normal' : v === 'fast' ? 'Fast' : 'Instant'}</button>
            ))}
          </div>
        </div>

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

        <h3 style={{ margin: '14px 0 4px' }}>{lang === 'es' ? 'Controles (teclado)' : 'Controls (keyboard)'}</h3>
        {KEY_ACTIONS.map((a) => (
          <div className="row" key={a}>
            <span>{names[a]}</span>
            <button className={listen === a ? 'on' : ''} onClick={() => setListen(listen === a ? null : a)} style={{ minWidth: 120 }}>
              {listen === a ? (lang === 'es' ? 'Pulsa una tecla…' : 'Press a key…') : keys[a].map(keyLabel).join(' / ')}
            </button>
          </div>
        ))}
        <div className="btn-row"><button onClick={() => { setListen(null); resetKeys() }}>{lang === 'es' ? 'Restablecer teclas' : 'Reset keys'}</button></div>

        <div className="btn-row">
          {onCustomize && <button onClick={onCustomize}>Customize character</button>}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
