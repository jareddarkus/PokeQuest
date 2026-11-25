// DEVELOPER TOOL (local test server only): the HP boxes on a 256 x 192 DS frame to compare with the reference video.  ?hpview&k=6
import { HpBox, type Side } from '../ui/BattleScreen'

export default function HpView() {
  const q = new URLSearchParams(location.search)
  const K = Number(q.get('k') ?? 6)
  const nf = Number(q.get('font') ?? 2) as 0 | 1 | 2
  const foe: Side = { uid: 'f', species: q.get('foe') ?? 'Golduck', level: 47, hp: Number(q.get('fhp') ?? 100), maxHp: 100, shiny: false, fainted: false }
  const me: Side = { uid: 'm', species: q.get('me') ?? 'M', level: 53, hp: Number(q.get('hp') ?? 196), maxHp: 196, shiny: false, fainted: false }
  const shift = q.get('view') === 'me' ? `translate(${-140 * K}px, ${-108 * K}px)` : undefined
  return (
    <div style={{ background: '#222', minHeight: '100vh', margin: 0 }}>
      <div style={{ position: 'relative', transform: shift, width: 256 * K, height: 192 * K, background: 'linear-gradient(#cfe3ea, #f4d9a8 40%, #e8a868)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 6 * K, top: 31 * K }}><HpBox side={foe} mine={false} gender="F" k={K} nameFont={nf} /></div>
        <div style={{ position: 'absolute', left: 145 * K, top: 112 * K }}><HpBox side={me} mine gender="F" exp={53 ** 3 + 20000} k={K} nameFont={nf} /></div>
      </div>
    </div>
  )
}
