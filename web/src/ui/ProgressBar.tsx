// The one progress bar of the game: wherever the page reads or builds something, it shows this (step n of N, what is being read, files done / files to do).
import { trText, useLang } from '../i18n'

const UNITS_ES: Record<string, string> = { files: 'archivos', 'map pieces': 'piezas del mapa', step: 'paso', 'Pokémon': 'Pokémon' }

export interface Progress {
  text: string
  /** 0..1 over the whole job */
  frac: number
  /** files (or pieces) done in this step, out of `total` */
  done?: number
  total?: number
  unit?: string
  step?: number
  steps?: number
}

export function ProgressBar({ p, indeterminate = false }: { p?: Progress | null; indeterminate?: boolean }) {
  const lang = useLang()
  const frac = Math.max(0, Math.min(1, p?.frac ?? 0))
  const hasCount = p?.total !== undefined && p.total > 0 && p.done !== undefined
  return (
    <div className="pq-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <div className={`pq-progress-track ${indeterminate ? 'indet' : ''}`}><div className="pq-progress-fill" style={indeterminate ? undefined : { width: `${frac * 100}%` }} /></div>
      <div className="pq-progress-line">
        <span>{p?.step && p.steps ? `${p.step} / ${p.steps} · ` : ''}{trText(p?.text ?? '')}</span>
        <span className="pq-progress-pct">{indeterminate ? '' : `${Math.round(frac * 100)}%`}</span>
      </div>
      {hasCount && <div className="pq-progress-count">{Math.min(p!.done!, p!.total!).toLocaleString()} / {p!.total!.toLocaleString()} {lang === 'es' ? UNITS_ES[p!.unit ?? 'files'] ?? p!.unit : p!.unit ?? 'files'}</div>}
    </div>
  )
}
