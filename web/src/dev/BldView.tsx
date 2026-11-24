// DEVELOPER TOOL (local test server only): look at the building models of one pack.  ?bldview&pack=0&from=0&n=12
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildModelObject } from '../rom/mapModel'
import { readModelName, readModels, readTexFile } from '../rom/nitro'

/** Offsets of every BMD0 inside an 'AB' container (start of each model up to the next one). */
function splitModels(d: Uint8Array): Uint8Array[] {
  const out: number[] = []
  for (let i = 0; i + 4 <= d.length; i++) if (d[i] === 0x42 && d[i + 1] === 0x4d && d[i + 2] === 0x44 && d[i + 3] === 0x30) out.push(i)
  return out.map((o, k) => d.subarray(o, k + 1 < out.length ? out[k + 1] : d.length))
}

export default function BldView() {
  const ref = useRef<HTMLDivElement>(null)
  const [info, setInfo] = useState('loading…')
  useEffect(() => {
    let stop = false
    let renderer: THREE.WebGLRenderer | null = null
    void (async () => {
      const q = new URLSearchParams(location.search)
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const packs = parseNarc(await nds.get('a/2/2/5'))
      const texs = parseNarc(await nds.get('a/1/7/4'))
      if (q.has('scan')) { // list every distinct model name of every pack
        const seen = new Map<string, string>()
        packs.forEach((p, pi) => splitModels(p).forEach((m, mi) => { const nm = readModelName(m) ?? '?'; if (!seen.has(nm)) seen.set(nm, `${pi}.${mi}`) }))
        setInfo(`${seen.size} names: ` + [...seen].map(([k, v]) => `${k}@${v}`).join(' '))
        return
      }
      const pack = Number(q.get('pack') ?? 0)
      const models = splitModels(packs[pack])
      const tex = readTexFile(texs[pack])
      const from = Number(q.get('from') ?? 0), n = Number(q.get('n') ?? 12)
      const names: string[] = []
      const w = ref.current!.clientWidth, h = ref.current!.clientHeight
      renderer = new THREE.WebGLRenderer({ antialias: false })
      renderer.setSize(w, h)
      renderer.setScissorTest(true)
      ref.current!.appendChild(renderer.domElement)
      const cols = 6
      const cw = Math.floor(w / cols), ch = Math.floor(h / Math.ceil(n / cols))
      const scenes: Array<{ scene: THREE.Scene; cam: THREE.PerspectiveCamera; x: number; y: number }> = []
      for (let k = 0; k < n; k++) {
        const raw = models[from + k]
        if (!raw) break
        const nm = readModelName(raw) ?? '?'
        names.push(`${from + k}:${nm}`)
        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#7fb4e0')
        scene.add(new THREE.AmbientLight('#ffffff', 1.2))
        try {
          const model = readModels(raw)[0]
          const obj = buildModelObject(model, tex ?? { texs: [], pals: [] })
          const box = new THREE.Box3().setFromObject(obj)
          const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
          const r = Math.max(s.x, s.y, s.z, 0.5)
          scene.add(obj)
          const cam = new THREE.PerspectiveCamera(35, cw / ch, 0.1, 500)
          cam.position.set(c.x + r * 1.1, c.y + r * 1.0, c.z + r * 1.6)
          cam.lookAt(c)
          scenes.push({ scene, cam, x: (k % cols) * cw, y: h - (Math.floor(k / cols) + 1) * ch })
        } catch { names[names.length - 1] += ' (failed)' }
      }
      setInfo(`pack ${pack}: ${models.length} models. ` + names.join('  '))
      const draw = () => {
        if (stop) return
        for (const s of scenes) {
          renderer!.setViewport(s.x, s.y, cw, ch)
          renderer!.setScissor(s.x, s.y, cw, ch)
          renderer!.render(s.scene, s.cam)
        }
        requestAnimationFrame(draw)
      }
      draw()
    })()
    return () => { stop = true; renderer?.dispose() }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, background: 'rgba(0,0,0,.7)', color: '#fff', padding: '4px 8px', font: '11px monospace', maxWidth: '95vw' }}>{info}</div>
    </div>
  )
}
