// DEVELOPER TOOL (local test server only): plays the way into a battle over a test picture.  ?transview
import { useState } from 'react'
import BattleTransition from '../ui/BattleTransition'

export default function TransView() {
  const [key, setKey] = useState(0)
  const [log, setLog] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(45deg,#3c8,#3c8 40px,#38c 40px,#38c 80px)' }} onClick={() => setKey((k) => k + 1)}>
      <BattleTransition key={key} onBlack={() => setLog((l) => l + ' black')} onFade={() => setLog((l) => l + ' fade')} onDone={() => setLog((l) => l + ' done')} />
      <div style={{ position: 'fixed', left: 8, top: 8, zIndex: 100, color: '#fff', background: '#000a', padding: 4 }}>click to replay {log}</div>
    </div>
  )
}
