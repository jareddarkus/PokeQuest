// A small sound tester (open with ?sfxtest): press a button to hear one of the game's own field / battle sounds.
// Used to find out which sound the game plays for walking in tall grass, stat changes etc.
import { useEffect, useState } from 'react'
import { loadMusicIndex } from '../rom/store'
import { music } from '../audio/music'

const STAR_FLD = new Set([10, 12, 13, 14, 22, 49, 50, 55, 64]) // short, noise-like (checked by analysis): likely candidates for the grass rustle

export default function SfxTest() {
  const [keys, setKeys] = useState<string[] | null>(null)
  const [last, setLast] = useState('')
  useEffect(() => { void loadMusicIndex().then((i) => setKeys(i ? Object.keys(i).filter((k) => k.startsWith('fld:') || k.startsWith('be:')) : [])) }, [])
  const num = (k: string) => k.split(':')[1]
  const sorted = (p: string) => (keys ?? []).filter((k) => k.startsWith(p)).sort((a, b) => (Number(num(a)) || 999) - (Number(num(b)) || 999) || a.localeCompare(b))
  const btn = (k: string, star = false) => (
    <button key={k} onClick={() => { setLast(k); void music.playSfx(k) }} style={{ margin: 3, padding: '8px 12px', fontSize: 16, background: star ? '#ffe28a' : '#fff', border: '1px solid #444', borderRadius: 6, cursor: 'pointer' }}>
      {star ? '★ ' : ''}{num(k)}
    </button>
  )
  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto', color: '#111', background: '#eee', minHeight: '100vh', font: '16px system-ui' }}>
      <h2>PokeQuest — sound tester</h2>
      <p>Press the numbers and listen. Tell me the number of the sound that is (1) <b>walking in tall grass</b>, (2) <b>a stat going up</b>, (3) <b>a stat going down</b>. The yellow ★ ones are the most likely.</p>
      <p>Last pressed: <b>{last || '—'}</b></p>
      {keys === null ? <p>Loading…</p> : keys.length === 0 ? <p>No sounds found: open the game once and import your game file first.</p> : (
        <>
          <h3>Field sounds (for walking in grass)</h3>
          <div>{sorted('fld:').map((k) => btn(k, STAR_FLD.has(Number(num(k)))))}</div>
          <h3>Battle sounds</h3>
          <div>{sorted('be:').map((k) => btn(k))}</div>
        </>
      )}
    </div>
  )
}
