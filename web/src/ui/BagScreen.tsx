import { useState } from 'react'
import { ITEMS, ITEM_LIST, type ItemDef } from '../data/items'
import { DsScreen, DsText, dsK } from './DsScreen'
import ItemIcon from './ItemIcon'
import { itemDesc, shortDesc, trText, useLang } from '../i18n'
import FontText from './FontText'
import { POCKETS } from './pockets'
import { ModernBag } from './Modern'
import { useTheme } from './theme'

export { POCKETS }

/**
 * The Bag on the game's own Bag backgrounds, laid out like the real one: the item's description in a pink box on top, a list of dark rows
 * (the chosen one outlined in white) and the pockets along the bottom.
 */
function ClassicBag({ bag, pockets, canUse, onUse, onClose, only, title, describe, K: K0 }: {
  K?: number
  bag: Record<string, number>
  pockets?: number[] // which pockets to show (default: all)
  canUse: (d: ItemDef) => boolean
  onUse: (id: string) => void
  onClose: () => void
  only?: (d: ItemDef) => boolean // extra filter (in a battle only some items can be used)
  title?: string
  describe?: (d: ItemDef) => string | null // extra line under the description (for example the catch chance)
}) {
  useLang()
  const shown = pockets ?? [0, 1, 2]
  const [pocket, setPocket] = useState(shown[shown.length - 1])
  const [sel, setSel] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const K = K0 ?? dsK(3)
  const list = ITEM_LIST.filter((i) => (bag[i.id] ?? 0) > 0 && POCKETS[pocket].kinds.includes(i.kind) && (!only || only(i)))
  const cur = list.find((d) => d.id === sel) ?? list[0] ?? null
  const rows = 6, rowH = 15
  const top = Math.min(scroll, Math.max(0, list.length - rows))
  const btn = (x: number, y: number, w: number, label: string, onClick: () => void, bg: string, color = '#222', disabled = false) => (
    <button disabled={disabled} onClick={onClick} style={{ position: 'absolute', left: x * K, top: y * K, width: w * K, height: 15 * K, border: 'none', borderRadius: 3 * K, cursor: disabled ? 'default' : 'pointer', fontWeight: 700, fontSize: 7.5 * K, background: bg, color, opacity: disabled ? 0.5 : 1 }}>{label}</button>
  )
  return (
    <DsScreen bg={POCKETS[pocket].bg} K={K}>
      {title && <DsText x={8} y={5} K={K} size={8}>{title}</DsText>}
      {/* the item's description (the top screen of the real Bag) */}
      <div style={{ position: 'absolute', left: 6 * K, top: 16 * K, width: 214 * K, height: 52 * K, background: 'rgba(255,170,200,.5)', border: `${K}px solid rgba(255,255,255,.85)`, borderRadius: 4 * K, boxSizing: 'border-box' }}>
        {cur ? (
          <>
            <DsText x={6} y={4} K={K} size={8}>{cur.name}</DsText>
            <DsText x={150} y={4} w={56} K={K} size={8} align="right">x{bag[cur.id]}</DsText>
            <span style={{ position: 'absolute', left: 6 * K, top: 14 * K }}><ItemIcon name={cur.id} size={24 * K} /></span>
            {describe?.(cur) && <DsText x={70} y={4} w={76} K={K} size={7} align="right" color="#ffd84a">{describe(cur)!}</DsText>}
            <div style={{ position: 'absolute', left: 34 * K, top: 14 * K, width: 170 * K }}><FontText text={trText(shortDesc(itemDesc(cur.name, cur.desc)))} font={1} k={K} maxWidth={168} color="#ffffff" shadow="#40404c" /></div>
          </>
        ) : (
          <DsText x={8} y={20} K={K} size={7.5}>{bag && Object.values(bag).some((n) => n > 0) ? 'Nothing in this pocket.' : 'Your bag is empty. Look for Poké Balls on the ground!'}</DsText>
        )}
      </div>
      {/* the list */}
      <div style={{ position: 'absolute', left: 70 * K, top: 74 * K, width: 160 * K, height: rows * rowH * K, overflow: 'hidden' }} onWheel={(e) => setScroll(Math.max(0, Math.min(Math.max(0, list.length - rows), top + (e.deltaY > 0 ? 1 : -1))))}>
        {list.slice(top, top + rows).map((d) => (
          <button key={d.id} onClick={() => setSel(d.id)} onDoubleClick={() => canUse(d) && onUse(d.id)} style={{ display: 'flex', alignItems: 'center', width: '100%', height: (rowH - 1) * K, marginBottom: K, padding: `0 ${5 * K}px`, borderRadius: 3 * K, cursor: 'pointer', background: '#25262c', border: `${K}px solid ${cur?.id === d.id ? '#fff' : '#555a66'}`, color: '#fff', fontWeight: 700, fontSize: 7.5 * K, textAlign: 'left', gap: 4 * K, boxSizing: 'border-box' }}>
            <ItemIcon name={d.id} size={12 * K} /><span style={{ flex: 1 }}>{d.name}</span><span>x{bag[d.id]}</span>
          </button>
        ))}
      </div>
      {/* a big picture of the chosen item where the real Bag shows the bag */}
      {cur && <span style={{ position: 'absolute', left: 12 * K, top: 92 * K, opacity: 0.95, filter: 'drop-shadow(0 3px 2px rgba(0,0,0,.45))' }}><ItemIcon name={cur.id} size={48 * K} /></span>}
      {/* scroll arrows */}
      {list.length > rows && (<>{btn(232, 76, 18, '▲', () => setScroll(Math.max(0, top - 1)), 'rgba(0,0,0,.5)', '#fff')}{btn(232, 150, 18, '▼', () => setScroll(Math.min(list.length - rows, top + 1)), 'rgba(0,0,0,.5)', '#fff')}</>)}
      {/* pockets along the bottom */}
      {shown.map((p, i) => (
        <button key={p} onClick={() => { setPocket(p); setSel(null); setScroll(0) }} style={{ position: 'absolute', left: (6 + i * 52) * K, top: 172 * K, width: 50 * K, height: 15 * K, border: `${K}px solid ${p === pocket ? '#fff' : 'transparent'}`, borderRadius: 3 * K, cursor: 'pointer', fontWeight: 700, fontSize: 7 * K, color: '#fff', background: p === pocket ? 'rgba(0,0,0,.75)' : 'rgba(0,0,0,.4)', boxSizing: 'border-box' }}>{POCKETS[p].name}</button>
      ))}
      {btn(166, 172, 38, 'Use', () => cur && onUse(cur.id), '#ffd84a', '#222', !cur || !canUse(cur))}
      {btn(208, 172, 42, 'Close', onClose, 'rgba(255,255,255,.88)')}
    </DsScreen>
  )
}

type BagProps = Parameters<typeof ClassicBag>[0]
/** The Bag: on the game's own pictures (classic look) or the light slanted cards (modern look). */
export default function BagScreen(props: BagProps) {
  const theme = useTheme()
  if (theme === 'modern') return <ModernBag bag={props.bag} pockets={props.pockets} canUse={props.canUse} onUse={props.onUse} onClose={props.onClose} only={props.only} title={props.title} describe={props.describe} />
  return <ClassicBag {...props} />
}

export { ITEMS }
