import { useUiUrl } from './CmdButton'
import { music } from '../audio/music'
import { useTheme } from './theme'

/** A button drawn like the game's Start menu: a dark slab with a menu icon at the left (pictures from the player's own game file). */
export default function MenuButton({ icon, label, onClick, badge }: { icon?: number; label: string; onClick: () => void; badge?: number }) {
  const theme = useTheme()
  const slab = useUiUrl('menu:slab')
  const pic = useUiUrl(icon !== undefined ? `menu:icon${icon}` : 'menu:none')
  if (!slab && theme !== 'modern') return <button className="panel" onClick={onClick}>{label}</button>
  return (
    <button
      className="menu-slab"
      onClick={() => { void music.playSfx('se:open'); onClick() }}
      style={theme === 'modern' ? undefined : { background: `url(${slab}) center / 100% 100% no-repeat`, imageRendering: 'pixelated' }}
    >
      {pic ? <img src={pic} alt="" draggable={false} style={{ width: 32, height: 32, imageRendering: 'pixelated', flex: 'none' }} /> : <span style={{ width: 32, flex: 'none' }} />}
      <span>{label}</span>
      {badge ? <span className="menu-badge">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  )
}
