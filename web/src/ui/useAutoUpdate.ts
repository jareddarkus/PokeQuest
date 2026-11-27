import { useEffect } from 'react'

/**
 * Friends that keep the page open for days run an OLD build of the game. While `idle` is true (they are in the main menu, not in a match), the page looks every minute
 * (and when it comes back to the front) whether a newer build has been published, and if so reloads itself. Not in the dev server. Never more than once every 2 minutes.
 */
export function useAutoUpdate(idle: boolean): void {
  useEffect(() => {
    if (!idle || !import.meta.env.PROD) return
    const current = [...document.scripts].map((s) => /assets\/index-[\w-]+\.js/.exec(s.src)?.[0]).find(Boolean)
    if (!current) return
    let stop = false
    const check = async () => {
      if (stop || document.hidden) return
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: 'no-store' })
        const latest = /assets\/index-[\w-]+\.js/.exec(await r.text())?.[0]
        if (!latest || latest === current || stop) return
        const last = Number(sessionStorage.getItem('pq.reloaded') ?? 0)
        if (Date.now() - last < 120_000) return
        sessionStorage.setItem('pq.reloaded', String(Date.now()))
        location.reload()
      } catch { /* offline: try again later */ }
    }
    void check()
    const iv = window.setInterval(() => void check(), 60_000)
    const vis = () => { if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', vis)
    return () => { stop = true; window.clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [idle])
}
