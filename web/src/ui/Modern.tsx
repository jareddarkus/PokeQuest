// The modern look of the screens that are built from the game's pictures in the classic look: the Bag, the Party and the PC.
// Light cards, slanted shapes, Unbounded Black titles, Lexend text (all the styles are in modern.css, classes "mx-...").
import { useState, type ReactNode } from 'react'
import { ITEM_LIST, type ItemDef } from '../data/items'
import { maxHp, type Mon } from '../data/dex'
import { itemDesc, shortDesc, trText, useLang } from '../i18n'
import { POCKETS } from './pockets'
import ItemIcon from './ItemIcon'
import { MonIcon } from './MonSprite'

/** The black slanted button with a white X that closes a window. */
export function MxClose({ onClose }: { onClose: () => void }) {
  return (
    <button className="mx-x" onClick={onClose} aria-label="Close" title="Close">
      <svg viewBox="0 0 14 14" width="14" height="14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="square" /></svg>
    </button>
  )
}

/** A window of the modern look: a title on the left, tabs / the close button on the right, then the content. */
export function MxWindow({ title, tabs, onClose, children, className = '', foot }: { title: ReactNode; tabs?: ReactNode; onClose?: () => void; children: ReactNode; className?: string; foot?: ReactNode }) {
  return (
    <div className={`mx-win ${className}`}>
      <div className="mx-head">
        <h2 className="mx-title">{title}</h2>
        <div className="mx-tabs">{tabs}{onClose && <MxClose onClose={onClose} />}</div>
      </div>
      {children}
      {foot && <div className="mx-foot">{foot}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- the Bag
export function ModernBag({ bag, pockets, canUse, onUse, onClose, only, title, describe }: {
  bag: Record<string, number>
  pockets?: number[]
  canUse: (d: ItemDef) => boolean
  onUse: (id: string) => void
  onClose: () => void
  only?: (d: ItemDef) => boolean
  title?: string
  describe?: (d: ItemDef) => string | null
}) {
  useLang()
  const shown = pockets ?? [0, 1, 2]
  const [pocket, setPocket] = useState(shown[shown.length - 1])
  const [sel, setSel] = useState<string | null>(null)
  const list = ITEM_LIST.filter((i) => (bag[i.id] ?? 0) > 0 && POCKETS[pocket].kinds.includes(i.kind) && (!only || only(i)))
  const cur = list.find((d) => d.id === sel) ?? list[0] ?? null
  const empty = !Object.values(bag).some((n) => n > 0)
  return (
    <MxWindow
      title={title ?? 'Bag'}
      className="mx-bag"
      onClose={onClose}
      tabs={shown.map((p) => <button key={p} className={`mx-tab ${p === pocket ? 'on' : ''}`} onClick={() => { setPocket(p); setSel(null) }}><span>{POCKETS[p].name}</span></button>)}
      foot={<button className="primary mx-go" disabled={!cur || !canUse(cur)} onClick={() => cur && onUse(cur.id)}>Use</button>}
    >
      <div className="mx-desc"><div className="mx-desc-in">
        {cur ? (
          <>
            <span className="mx-desc-pic"><ItemIcon name={cur.id} size={56} /></span>
            <div className="mx-desc-txt">
              <div className="mx-desc-top"><b className="mx-title sm">{cur.name}</b><span className="mx-qty">x{bag[cur.id]}</span>{describe?.(cur) && <span className="mx-tag">{describe(cur)}</span>}</div>
              <p>{trText(shortDesc(itemDesc(cur.name, cur.desc)))}</p>
            </div>
          </>
        ) : <p>{empty ? 'Your bag is empty. Look for Poké Balls on the ground!' : 'Nothing in this pocket.'}</p>}
      </div></div>
      <div className="mx-list">
        {list.map((d, i) => (
          <button key={d.id} className={`mx-row ${cur?.id === d.id ? 'on' : ''}`} style={{ ['--i' as string]: i } as React.CSSProperties} onClick={() => setSel(d.id)} onDoubleClick={() => canUse(d) && onUse(d.id)}>
            <span className="mx-row-in"><ItemIcon name={d.id} size={28} /><span className="mx-row-name">{d.name}</span><span className="mx-qty">x{bag[d.id]}</span></span>
          </button>
        ))}
      </div>
    </MxWindow>
  )
}

// ---------------------------------------------------------------- the Party
export function ModernParty({ team, onPick, onClose, hint, title, active }: {
  team: Mon[]
  onPick: (i: number) => void
  onClose?: () => void
  hint?: string
  title?: string
  active?: number
}) {
  useLang()
  return (
    <MxWindow title={title ?? 'Team'} className="mx-party" onClose={onClose}>
      <p className="mx-hint">{hint ?? 'Pick a Pokémon to see its summary'}</p>
      <div className="mx-slots">
        {Array.from({ length: 6 }, (_, i) => team[i] ?? null).map((m, i) => {
          if (!m) return <div key={i} className="mx-slot empty" />
          const mx = maxHp(m), f = Math.max(0, Math.min(1, m.hp / mx))
          return (
            <button key={m.uid} className={`mx-slot ${m.hp <= 0 ? 'fainted' : ''} ${active === i ? 'on' : ''}`} style={{ ['--i' as string]: i } as React.CSSProperties} onClick={() => onPick(i)}>
              <span className="mx-slot-in">
                <MonIcon species={m.species} shiny={m.shiny} size={52} />
                <span className="mx-slot-txt">
                  <b className="mx-title sm">{m.species}</b>
                  <span className="mx-mut">Lv {m.level} · {m.hp}/{mx}</span>
                  <span className="mx-hpbar"><span style={{ width: `${f * 100}%`, background: f > 0.5 ? '#19c37d' : f > 0.2 ? '#f0a800' : '#e03a4c' }} /></span>
                </span>
                {m.item && <ItemIcon name={m.item} size={22} />}
              </span>
            </button>
          )
        })}
      </div>
    </MxWindow>
  )
}

// ---------------------------------------------------------------- the PC
export function ModernPc({ team, pc, box, boxes, setBox, toTeam, toPc, onClose }: {
  team: Mon[]; pc: Mon[]; box: number; boxes: number; setBox: (f: (b: number) => number) => void
  toTeam: (i: number) => void; toPc: (i: number) => void; onClose: () => void
}) {
  useLang()
  const first = box * 30
  const slots = Array.from({ length: 30 }, (_, i) => pc[first + i] ?? null)
  return (
    <MxWindow title="PC" className="mx-pc" onClose={onClose}>
      <div className="mx-pc-body">
        <div className="mx-box">
          <div className="mx-box-head">
            <button className="mx-arrow" onClick={() => setBox((b) => (b + boxes - 1) % boxes)}><span>‹</span></button>
            <b className="mx-title sm">BOX {box + 1}</b>
            <button className="mx-arrow" onClick={() => setBox((b) => (b + 1) % boxes)}><span>›</span></button>
          </div>
          <div className="mx-box-grid">
            {slots.map((m, i) => (
              <button key={i} className={`mx-cell ${m ? '' : 'empty'}`} disabled={!m} onClick={() => m && toTeam(first + i)} title={m ? `${m.species} Lv${m.level}` : ''}>
                {m && <MonIcon species={m.species} shiny={m.shiny} size={40} />}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-team">
          <b className="mx-title sm">Your team ({team.length}/6)</b>
          <span className="mx-mut">Tap a Pokémon to swap it between the team and the box.</span>
          {team.map((m, i) => (
            <button key={m.uid} className="mx-slot small" onClick={() => toPc(i)}>
              <span className="mx-slot-in"><MonIcon species={m.species} shiny={m.shiny} size={40} /><span className="mx-slot-txt"><b className="mx-title sm">{m.species}</b><span className="mx-mut">Lv {m.level}</span></span></span>
            </button>
          ))}
        </div>
      </div>
    </MxWindow>
  )
}
