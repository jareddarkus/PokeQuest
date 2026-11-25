// DEVELOPER TOOL (local test server only): look at the battle scenery stored in the player's own game file (a/0/1/1).
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildModelObject, readModels, readTexFile } from '../rom/mapModel'
import { readPose } from '../rom/nitro'

export default function BtlView() {
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
      const files = parseNarc(await nds.get(q.get('narc') ?? 'a/0/1/1'))
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#7fc4ee')
      const names: string[] = []
      for (const key of ['stage', 'bg']) {
        const idx = q.get(key)
        if (idx === null) continue
        const raw = files[Number(idx)]
        const pose = q.has('bca') ? readPose(files[Number(q.get('bca'))], Number(q.get('frame') ?? 0)) : null
        const model = readModels(raw, pose)[0]
        const tex = readTexFile(raw)
        if (!model || !tex) { names.push(`${key} ${idx}: failed`); continue }
        const obj = buildModelObject(model, tex)
        if (q.has('wire')) obj.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m) { m.wireframe = true; m.side = THREE.DoubleSide; m.transparent = false } })
        scene.add(obj)
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
        for (const me of model.meshes) for (const v of me.verts) {
          const p = [v.x / 16, v.y / 16, v.z / 16]
          mn = mn.map((a, i) => Math.min(a, p[i])); mx = mx.map((a, i) => Math.max(a, p[i]))
        }
        names.push(`${key} ${idx} "${model.name}" meshes ${model.meshes.length} mats ${model.materials.map((m) => m.name).join('/')} bounds ${mn.map((x) => x.toFixed(1))} .. ${mx.map((x) => x.toFixed(1))}`)
      }
      if (stop) return
      setInfo(names.join('  |  '))
      const w = ref.current!.clientWidth, h = ref.current!.clientHeight
      renderer = new THREE.WebGLRenderer({ antialias: false })
      renderer.setSize(w, h)
      ref.current!.appendChild(renderer.domElement)
      const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 35), w / h, 0.1, 2000)
      const cx = Number(q.get('cx') ?? 0), cy = Number(q.get('cy') ?? 6), cz = Number(q.get('cz') ?? 22)
      cam.position.set(cx, cy, cz)
      cam.lookAt(Number(q.get('tx') ?? 0), Number(q.get('ty') ?? 1), Number(q.get('tz') ?? 0))
      const draw = () => { if (!stop) { renderer!.render(scene, cam); requestAnimationFrame(draw) } }
      draw()
    })()
    return () => { stop = true; renderer?.dispose() }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,.7)', color: '#fff', padding: '4px 8px', font: '11px monospace', maxWidth: '95vw' }}>{info}</div>
    </div>
  )
}
