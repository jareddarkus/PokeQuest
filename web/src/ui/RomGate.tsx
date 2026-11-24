import { useEffect, useRef, useState } from 'react'
import { devRomSource } from '../rom/devSource'
import type { RomSource } from '../rom/nds'
import { importRom, type RomMeta } from '../rom/store'

interface Props {
  onReady: (meta: RomMeta) => void
}

/** PokeQuest ships NO Pokémon pictures. Each player points the game at their own Pokémon White 2 file. */
export default function RomGate({ onReady }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [frac, setFrac] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // developer test server only: ?play reads the game file straight from the Desktop
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('play')) {
      void devRomSource().then((src) => src && pick(src))
    }
  }, [])

  async function pick(file: RomSource | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const meta = await importRom(file, (t, f) => { setText(t); setFrac(f) })
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
        <input ref={input} type="file" accept=".nds,.bin" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {!busy && <button className="primary" onClick={() => input.current?.click()}>Choose my Pokémon White 2 file</button>}
        {busy && (
          <>
            <div className="hpbar"><div style={{ width: `${frac * 100}%`, background: '#4cd964' }} /></div>
            <p className="sub">{text}</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
