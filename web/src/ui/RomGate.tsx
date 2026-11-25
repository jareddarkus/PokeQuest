import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import type { RomSource } from '../rom/nds'
import { importRom, type RomMeta } from '../rom/store'
import { ProgressBar, type Progress } from './ProgressBar'

interface Props {
  onReady: (meta: RomMeta) => void
}

/** PokeQuest ships NO Pokémon pictures. Each player points the game at their own Pokémon White 2 file. */
export default function RomGate({ onReady }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // developer test server only: ?play reads the game file straight from the Desktop
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('play')) {
      void devRomSource().then((src) => src && pick(src))
    }
  }, [])

  async function pick(file: RomSource | undefined) {
    if (!file) return
    if ('name' in file && typeof (file as File).name === 'string' && !/[.](nds|bin|dsi|srl)$/i.test((file as File).name) && (file as File).size < 50 * 1024 * 1024) { setError('That does not look like a Nintendo DS game (a .nds file of Pokémon Black 2 / White 2).'); return }
    setError(null)
    setBusy(true)
    try {
      const meta = await importRom(file, (p) => setProg(p))
      onReady(meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
      setBusy(false)
    }
  }

  return (
    <div className="fullscreen center menu-bg">
      <div className="panel card gate">
        <h1>PokeQuest</h1>
        <p>
          This game contains no Pokémon pictures. Choose <strong>your own Pokémon White 2</strong> file (a .nds file). The
          game reads it on <strong>your computer only</strong> — nothing is uploaded — and keeps the pictures in this browser.
        </p>
        <p className="muted">You only need to do this once per browser.</p>
        {/* no "accept" filter: phones and Macs do not know ".nds" files and grey them out / hang on the type lookup; the file is checked after it is chosen.
            The input is a real (invisible) input inside a label, because some browsers ignore clicks on a hidden one. */}
        {!busy && (
          <label className="primary file-pick" style={{ position: 'relative', display: 'inline-block', cursor: 'pointer', textAlign: 'center' }}>
            Choose my Pokémon White 2 file
            <input ref={input} type="file" onChange={(e) => pick(e.target.files?.[0])} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 0 }} />
          </label>
        )}
        {busy && (
          <>
            <ProgressBar p={prog ?? { text: 'Starting…', frac: 0 }} />
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
