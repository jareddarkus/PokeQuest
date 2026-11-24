import { useEffect, useState } from 'react'
import { romUiUrl } from '../rom/store'

const KNOWN = ['par', 'frz', 'slp', 'psn', 'brn', 'fnt', 'tox']

/** PAR / FRZ / SLP / PSN / BRN / FNT icons from the player's own game file. */
export default function StatusIcon({ status, scale = 2 }: { status?: string; scale?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  const key = status && KNOWN.includes(status) ? status : null
  useEffect(() => {
    let live = true
    setUrl(null)
    if (key) void romUiUrl(`status:${key}`).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [key])
  if (!key || !url) return null
  return <img src={url} alt={key} draggable={false} style={{ width: 32 * scale, height: 8 * scale, imageRendering: 'pixelated' }} />
}