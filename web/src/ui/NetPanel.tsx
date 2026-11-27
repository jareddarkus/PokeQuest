import { useEffect, useState } from 'react'
import { netStats } from '../net/netStats'
import { statsUrl } from '../net/transport'
import { useLang } from '../i18n'

interface Usage { resetAt: number; now: number; requests: number; requestsLimit: number; requestsFraction: number; gbSeconds: number; gbSecondsLimit: number; durationFraction: number; messages: number; connections: number; activeSeconds: number }

const pingColor = (ms: number | null) => (ms === null ? '#999' : ms < 60 ? '#2fdc5a' : ms < 130 ? '#f0b000' : '#ee3d5e')

/** For the owner only: how the match connection is doing (ping of everybody) and how much of today's free Cloudflare allowance has been used (counted by our server: an estimate). */
export default function NetPanel({ me }: { me: string }) {
  const es = useLang() === 'es'
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => { const id = window.setInterval(() => tick((k) => k + 1), 1000); return () => window.clearInterval(id) }, [])
  useEffect(() => {
    const url = statsUrl()
    if (!url || !open) return
    let live = true
    const load = () => { fetch(url, { cache: 'no-store' }).then((r) => r.json()).then((u: Usage) => live && setUsage(u)).catch(() => {}) }
    load()
    const id = window.setInterval(load, 20000)
    return () => { live = false; window.clearInterval(id) }
  }, [open])
  const bar = (label: string, f: number, detail: string) => (
    <div style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{(f * 100).toFixed(f < 0.1 ? 1 : 0)}%</b></div>
      <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, f * 100)}%`, height: '100%', background: f > 0.85 ? '#ee3d5e' : f > 0.6 ? '#f0b000' : '#2fdc5a' }} /></div>
      <small style={{ opacity: 0.7 }}>{detail}</small>
    </div>
  )
  const left = usage ? Math.max(0, usage.resetAt - Date.now()) : 0
  const peers = [...netStats.peers.entries()]
  return (
    <div style={{ position: 'fixed', left: 10, bottom: 70, zIndex: 20, font: '12px system-ui, sans-serif', color: '#fff' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,.65)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer' }}>
        <span style={{ color: pingColor(netStats.ping) }}>●</span> {netStats.ping === null ? (netStats.via === 'supabase' ? 'Supabase' : '…') : `${netStats.ping} ms`}
      </button>
      {open && (
        <div style={{ marginTop: 6, width: 250, padding: 10, borderRadius: 10, background: 'rgba(12,14,22,.96)', border: '2px solid rgba(255,255,255,.4)' }}>
          <b>{es ? 'Conexión' : 'Connection'}</b>: {netStats.via === 'cloudflare' ? 'Cloudflare' : netStats.via === 'supabase' ? 'Supabase' : '—'}
          <div style={{ margin: '4px 0' }}>
            <div><span style={{ color: pingColor(netStats.ping) }}>●</span> {me} (tú/you): {netStats.ping === null ? '—' : `${netStats.ping} ms`}</div>
            {peers.map(([n, ms]) => <div key={n}><span style={{ color: pingColor(ms) }}>●</span> {n}: {ms} ms</div>)}
          </div>
          {statsUrl() ? (usage ? (
            <>
              <b>{es ? 'Cloudflare hoy (gratis)' : 'Cloudflare today (free)'}</b>
              {bar(es ? 'Peticiones' : 'Requests', usage.requestsFraction, `${usage.requests.toLocaleString()} / ${usage.requestsLimit.toLocaleString()}`)}
              {bar(es ? 'Tiempo activo' : 'Duration', usage.durationFraction, `${usage.gbSeconds.toLocaleString()} / ${usage.gbSecondsLimit.toLocaleString()} GB-s · ${(usage.activeSeconds / 3600).toFixed(1)} h`)}
              <small style={{ opacity: 0.7 }}>{es ? 'Se reinicia en' : 'Resets in'} {Math.floor(left / 3600000)}h {Math.floor((left % 3600000) / 60000)}m ({es ? '00:00 UTC' : '00:00 UTC'}) · {es ? 'estimación' : 'estimate'}</small>
            </>
          ) : <small>{es ? 'Cargando uso…' : 'Loading usage…'}</small>) : <small>{es ? 'Sin servidor Cloudflare.' : 'No Cloudflare server.'}</small>}
        </div>
      )}
    </div>
  )
}
