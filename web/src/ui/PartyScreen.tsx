import { maxHp, type Mon } from '../data/dex'
import { useUiUrl } from './CmdButton'
import { DsScreen, DsText, dsK } from './DsScreen'
import ItemIcon from './ItemIcon'
import { MonIcon } from './MonSprite'

// The slots of the party screen, in DS pixels: two columns, the right one 8 pixels lower (the positions of the panels in the game's own picture).
const SLOTS: Array<[number, number]> = [[1, 12], [129, 20], [1, 60], [129, 68], [1, 108], [129, 116]]
// which of the seven panels of the game's picture is used for what (the colours are the game's own; the choice of use is ours)
const PANEL = { normal: 5, fainted: 3, hover: 0, empty: 6 }

function Slot({ mon, i, K, onPick }: { mon: Mon | null; i: number; K: number; onPick: (i: number) => void }) {
  const normal = useUiUrl(`screen:party:${PANEL.normal}`)
  const fainted = useUiUrl(`screen:party:${PANEL.fainted}`)
  const hover = useUiUrl(`screen:party:${PANEL.hover}`)
  const empty = useUiUrl(`screen:party:${PANEL.empty}`)
  const [x, y] = SLOTS[i]
  const url = !mon ? empty : mon.hp <= 0 ? fainted : normal
  const max = mon ? maxHp(mon) : 1
  const f = mon ? Math.max(0, Math.min(1, mon.hp / max)) : 0
  const color = f > 0.5 ? '#00e040' : f > 0.2 ? '#ffb000' : '#ff4060'
  return (
    <button
      className="party-panel"
      disabled={!mon}
      onClick={() => mon && onPick(i)}
      style={{ position: 'absolute', left: x * K, top: y * K, width: 126 * K, height: 43 * K, padding: 0, border: 'none', background: url ? `url(${url}) 0 0 / 100% 100% no-repeat` : 'rgba(0,0,0,.3)', imageRendering: 'pixelated', cursor: mon ? 'pointer' : 'default', color: '#fff' }}
      onMouseEnter={(e) => { if (mon && hover && mon.hp > 0) e.currentTarget.style.background = `url(${hover}) 0 0 / 100% 100% no-repeat` }}
      onMouseLeave={(e) => { if (url) e.currentTarget.style.background = `url(${url}) 0 0 / 100% 100% no-repeat` }}
    >
      {mon && (
        <>
          <span style={{ position: 'absolute', left: 6 * K, top: 5 * K }}><MonIcon species={mon.species} shiny={mon.shiny} size={32 * K} /></span>
          <DsText x={44} y={8} K={K}>{mon.species}</DsText>
          <DsText x={44} y={19} K={K} size={7}>Lv{mon.level}</DsText>
          <DsText x={70} y={19} w={50} K={K} size={7} align="right">{mon.hp}/{max}</DsText>
          <span style={{ position: 'absolute', left: 44 * K, top: 30 * K, width: 72 * K, height: 4 * K, background: '#101018', boxShadow: '0 0 0 1px #000' }}>
            <span style={{ position: 'absolute', left: 0, top: K, height: K, width: `${f * 100}%`, background: color }} />
            <span style={{ position: 'absolute', left: 0, top: 2 * K, height: K, width: `${f * 100}%`, background: color, filter: 'brightness(.7)' }} />
          </span>
          {mon.item && <span style={{ position: 'absolute', left: 104 * K, top: 3 * K }}><ItemIcon name={mon.item} size={14 * K} /></span>}
        </>
      )}
    </button>
  )
}

/** The party screen on the game's own slot panels: two columns of three, the right column a little lower. */
export default function PartyScreen({ team, onPick, onClose }: { team: Mon[]; onPick: (i: number) => void; onClose: () => void }) {
  const K = dsK(3)
  return (
    <div>
      <DsScreen bg="party:bg" K={K} style={{ background: 'linear-gradient(#173a78, #0c1f4a)' }}>
        {SLOTS.map((_, i) => <Slot key={i} mon={team[i] ?? null} i={i} K={K} onPick={onPick} />)}
        <button onClick={onClose} style={{ position: 'absolute', left: 190 * K, top: 168 * K, width: 60 * K, height: 18 * K, border: 'none', borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 8 * K, background: 'rgba(255,255,255,.88)', color: '#222' }}>Close</button>
        <DsText x={8} y={172} K={K} size={7}>Pick a Pokémon to see its summary</DsText>
      </DsScreen>
    </div>
  )
}
