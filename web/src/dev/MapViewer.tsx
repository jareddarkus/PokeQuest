// DEVELOPER TOOL (local test server only): look at the maps stored in the player's own game file.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildModelObject, readModels, readTexFile } from '../rom/mapModel'

export default function MapViewer() {
  const ref = useRef<HTMLDivElement>(null)
  const [info, setInfo] = useState('loading…')
  const q = new URLSearchParams(location.search)
  const mapIndex = Number(q.get('map') ?? 1)
  const texIndexParam = q.get('tex')

  useEffect(() => {
    let stop = false
    let renderer: THREE.WebGLRenderer | null = null
    void (async () => {
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const maps = parseNarc(await nds.get('a/0/0/8'))
      const texs = parseNarc(await nds.get('a/0/1/4'))
      const m = maps[mapIndex]
      const dv = new DataView(m.buffer, m.byteOffset, m.byteLength)
      const models = readModels(m.subarray(dv.getUint32(4, true)))
      const model = models[0]
      const need = Array.from(new Set(model.materials.map((x) => x.texture).filter(Boolean))) as string[]
      let found = -1
      let tf: ReturnType<typeof readTexFile> = null
      for (let i = 0; i < texs.length; i++) {
        if (texIndexParam !== null && i !== Number(texIndexParam)) continue
        const t = readTexFile(texs[i])
        if (!t) continue
        const have = new Set(t.texs.map((x) => x.name))
        if (need.every((n) => have.has(n))) { found = i; tf = t; break }
      }
      if (!tf) { setInfo(`map ${mapIndex}: no matching textures (${need.join(',')})`); return }
      if (stop) return
      setInfo(`map ${mapIndex} "${model.name}" · ${model.meshes.length} meshes · textures a/0/1/4 #${found}`)
      const obj = buildModelObject(model, tf)
      const w = ref.current!.clientWidth
      const h = ref.current!.clientHeight
      renderer = new THREE.WebGLRenderer({ antialias: false })
      renderer.setSize(w, h)
      ref.current!.appendChild(renderer.domElement)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#7fc4ee')
      scene.add(obj)
      const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 500)
      const pitch = Number(q.get('pitch') ?? 55) * Math.PI / 180
      const dist = Number(q.get('dist') ?? 22)
      cam.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist)
      cam.lookAt(0, 0, 0)
      const draw = () => { if (!stop) { renderer!.render(scene, cam); requestAnimationFrame(draw) } }
      draw()
    })()
    return () => { stop = true; renderer?.dispose() }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '6px 10px', font: '12px monospace' }}>{info}</div>
    </div>
  )
}
