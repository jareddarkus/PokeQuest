import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../i18n'
import { DEFAULT_RULES, RULE_GROUPS, type Rules, type RuleDef } from '../game/rules'
import { fetchGameConfig, gameConfigInfo, saveGameConfig } from '../world/gameConfig'

/**
 * Settings → Admin (owner only): every number that changes how a match plays. You edit a DRAFT; nothing changes for anybody until you press Save,
 * and then the new values are used from the NEXT match that starts (a match that is already playing keeps the rules it began with).
 */
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export default function AdminSettings() {
  const es = useLang() === 'es'
  const [live, setLive] = useState<Rules | null>(null) // what is saved online (what the next match will use)
  const [draft, setDraft] = useState<Rules>({ ...DEFAULT_RULES })
  const [at, setAt] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    void (async () => {
      const [cfg, info] = await Promise.all([fetchGameConfig(), gameConfigInfo()])
      if (!on) return
      const cur = { ...DEFAULT_RULES, ...(cfg ?? {}) }
      setLive(cur); setDraft(cur); setAt(info?.at ?? null)
    })()
    return () => { on = false }
  }, [])

  const dirty = useMemo(() => !live || (Object.keys(DEFAULT_RULES) as Array<keyof Rules>).some((k) => live[k] !== draft[k]), [live, draft])
  const set = (k: keyof Rules, v: number) => { setDraft((d) => ({ ...d, [k]: v })); setMsg('') }
  const save = async () => {
    setBusy(true); setMsg(es ? 'Guardando…' : 'Saving…')
    const err = await saveGameConfig(draft)
    setBusy(false)
    if (err) { setMsg((es ? 'No se pudo guardar: ' : 'Could not save: ') + err); return }
    setLive({ ...draft }); setAt(new Date().toISOString())
    setMsg(es ? 'Guardado ✓ Se usará desde la próxima partida (las que ya están en marcha no cambian).' : 'Saved ✓ It will be used from the next match (matches already playing do not change).')
  }

  const row = (d: RuleDef) => {
    const v = draft[d.key]
    const changed = live ? live[d.key] !== v : false
    const help = es ? d.helpEs : d.helpEn
    return (
      <label className="row adm-row" key={d.key} title={help}>
        <span>{es ? d.es : d.en}{help && <small className="adm-help">{help}</small>}</span>
        {d.kind === 'toggle'
          ? <input type="checkbox" checked={v > 0} onChange={(e) => set(d.key, e.target.checked ? 1 : 0)} />
          : <span className="adm-num">
              <input type="number" min={d.min} max={d.max} value={v} data-nonav onChange={(e) => { const x = Number(e.target.value); if (Number.isFinite(x)) set(d.key, Math.min(d.max ?? 1e9, Math.max(d.min ?? 0, x))) }} />
              {d.kind === 'time' && <em>{mmss(v)}</em>}
            </span>}
        {changed && <b className="adm-dot" title={es ? 'Cambiado, sin guardar' : 'Changed, not saved'}>●</b>}
      </label>
    )
  }

  const d = draft
  const timeline = d.collapseOn > 0
    ? `${es ? 'Línea de tiempo' : 'Timeline'}: ${es ? 'anillo 1' : 'ring 1'} ${mmss(d.ring1Seconds)}→${mmss(d.ring1Seconds + d.fall1Seconds)} · ${es ? 'anillo 2' : 'ring 2'} ${mmss(d.ring2Seconds)}→${mmss(d.ring2Seconds + d.fall2Seconds)} · ${es ? 'anillo 3' : 'ring 3'} ${mmss(d.ring3Seconds)}→${mmss(d.ring3Seconds + d.fall3Seconds)}${d.tournamentOn > 0 ? ` · ${es ? 'torneo' : 'tournament'} ${mmss(d.ring3Seconds + d.peakSeconds)}` : ''}`
    : es ? 'La isla no se hunde.' : 'The island does not collapse.'

  return (
    <div className="adm">
      <p className="adm-note">
        {es ? 'Aquí cambias las reglas de las partidas. Nada cambia para nadie hasta que pulses Guardar; entonces se usa desde la próxima partida.' : 'Change the rules of the matches here. Nothing changes for anybody until you press Save; then it is used from the next match.'}
        {' '}{at ? (es ? `Guardado por última vez: ${new Date(at).toLocaleString()}.` : `Last saved: ${new Date(at).toLocaleString()}.`) : (es ? 'Aún no has guardado nada: se usan los valores por defecto.' : 'Nothing saved yet: the defaults are used.')}
      </p>
      <p className="adm-timeline">{timeline}</p>
      {RULE_GROUPS.map((g, i) => (
        <details key={g.id} open={i === 0}>
          <summary>{es ? g.es : g.en}</summary>
          {g.rules.map(row)}
        </details>
      ))}
      <div className="btn-row adm-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>{es ? 'Guardar para la próxima partida' : 'Save for the next match'}</button>
        <button disabled={busy || !live || !dirty} onClick={() => { if (live) { setDraft({ ...live }); setMsg('') } }}>{es ? 'Descartar cambios' : 'Discard changes'}</button>
        <button disabled={busy} onClick={() => { setDraft({ ...DEFAULT_RULES }); setMsg('') }}>{es ? 'Valores por defecto' : 'Defaults'}</button>
      </div>
      <p className="adm-msg">{msg || (dirty ? (es ? 'Hay cambios sin guardar.' : 'There are unsaved changes.') : '')}</p>
    </div>
  )
}
