import { Dex } from '@pkmn/sim'
import { STAT_IDS, STAT_NAMES, natureMods, type Mon, type StatId } from '../data/dex'
import { statLine } from '../game/state'

/**
 * Smogon-style colour of a bar: red for a very low value, then orange, yellow, lime, green, teal and blue for very high ones.
 * (The colour follows the species' base stat, like on Smogon.)
 */
export function statColor(base: number): string {
  const hue = Math.round((Math.min(base, 180) / 180) * 205)
  return `hsl(${hue}, 85%, 48%)`
}

/** The biggest value this stat can reach at a level (base 255, best IV and EV, helpful nature): the full width of a bar. */
function barCap(stat: StatId, level: number): number {
  if (stat === 'hp') return Math.floor(((2 * 255 + 31 + 63) * level) / 100) + level + 10
  return Math.floor((Math.floor(((2 * 255 + 31 + 63) * level) / 100) + 5) * 1.1)
}

/**
 * One bar per stat. Colour part = what the species gives (by base stat), then WHITE = what the EVs added,
 * then LIGHT GREY = what the IVs added (the IV part of the stat is always shown last).
 */
export default function StatBars({ mon }: { mon: Mon }) {
  const base = Dex.species.get(mon.species).baseStats
  const nm = natureMods(mon.nature)
  return (
    <div className="statbars">
      {STAT_IDS.map((s) => {
        const total = statLine(mon, s)
        const mult = nm.plus === s ? 1.1 : nm.minus === s ? 0.9 : 1
        const evPart = Math.max(0, ((mon.evs[s] / 4) * mon.level) / 100) * (s === 'hp' ? 1 : mult)
        const ivPart = Math.max(0, (mon.ivs[s] * mon.level) / 100) * (s === 'hp' ? 1 : mult)
        const basePart = Math.max(0, total - evPart - ivPart)
        const cap = barCap(s, mon.level)
        const pct = (v: number) => `${Math.min(100, (v / cap) * 100)}%`
        const minPx = (v: number) => (v > 0 ? 2 : 0)
        return (
          <div className={`statrow ${nm.plus === s ? 'plus' : nm.minus === s ? 'minus' : ''}`} key={s}>
            <span className="statname">{STAT_NAMES[s]}</span>
            <span className="statval">{total}</span>
            <div className="statbar">
              <div style={{ width: pct(basePart), background: statColor(base[s]) }} />
              <div style={{ width: pct(evPart), minWidth: minPx(evPart), background: '#ffffff' }} />
              <div style={{ width: pct(ivPart), minWidth: minPx(ivPart), background: '#b4b9c4' }} />
            </div>
            <span className="statnums">
              <small>base {base[s]}</small> · IV {mon.ivs[s]} · EV {mon.evs[s]}
            </span>
          </div>
        )
      })}
      <div className="stat-legend">
        <span><i style={{ background: statColor(90) }} />species</span>
        <span><i style={{ background: '#fff' }} />EVs</span>
        <span><i style={{ background: '#b4b9c4' }} />IVs</span>
      </div>
    </div>
  )
}
