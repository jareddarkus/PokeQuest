// DEVELOPER TOOL (local test server only): draws every map chunk of the player's game file as a thumbnail, placed by its grid name.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { devRomSource } from '../rom/devSource'
import { NdsFile, parseNarc } from '../rom/nds'
import { buildModelObject, readModels, readTexFile } from '../rom/mapModel'

const THUMB = 64

export default function WorldMap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState('loading…')

  useEffect(() => {
    let stop = false
    void (async () => {
      const src = await devRomSource()
      if (!src) { setInfo('no dev ROM route'); return }
      const nds = new NdsFile(src)
      await nds.open()
      const maps = parseNarc(await nds.get('a/0/0/8'))
      const texFiles = parseNarc(await nds.get('a/0/1/4'))
      const archives = texFiles.map((t) => { const f = readTexFile(t); return f ? { f, names: new Set(f.texs.map((x) => x.name)) } : null })

      const gl = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false })
      gl.setSize(THUMB, THUMB)
      const cam = new THREE.OrthographicCamera(-16, 16, 16, -16, -200, 200)
      cam.position.set(0, 100, 0)
      cam.up.set(0, 0, -1)
      cam.lookAt(0, 0, 0)

      const cells: Array<{ i: number; name: string; gx: number; gy: number }> = []
      const loaded: Array<{ i: number; name: string }> = []
      const sheet = ref.current!
      const ctx = sheet.getContext('2d')!
      // first pass: find names
      const infos: Array<{ i: number; name: string; ok: boolean }> = []
      for (let i = 0; i < maps.length; i++) {
        if (stop) return
        try {
          const m = maps[i]
          const dv = new DataView(m.buffer, m.byteOffset, m.byteLength)
          const model = readModels(m.subarray(dv.getUint32(4, true)))[0]
          infos.push({ i, name: model.name, ok: true })
          const mm = /^map(\d+)_(\d+)$/.exec(model.name)
          if (mm) cells.push({ i, name: model.name, gx: Number(mm[1]), gy: Number(mm[2]) })
          else loaded.push({ i, name: model.name })
        } catch { infos.push({ i, name: '?', ok: false }) }
      }
      const minX = Math.min(...cells.map((c) => c.gx)), maxX = Math.max(...cells.map((c) => c.gx))
      const minY = Math.min(...cells.map((c) => c.gy)), maxY = Math.max(...cells.map((c) => c.gy))
      sheet.width = (maxX - minX + 1) * THUMB
      sheet.height = (maxY - minY + 1) * THUMB
      ctx.fillStyle = '#222'
      ctx.fillRect(0, 0, sheet.width, sheet.height)
      setInfo(`overworld chunks ${cells.length}, grid x ${minX}..${maxX}, y ${minY}..${maxY}; other named maps ${loaded.length}`)

      let done = 0
      for (const c of cells) {
        if (stop) return
        try {
          const m = maps[c.i]
          const dv = new DataView(m.buffer, m.byteOffset, m.byteLength)
          const model = readModels(m.subarray(dv.getUint32(4, true)))[0]
          const need = Array.from(new Set(model.materials.map((x) => x.texture).filter(Boolean))) as string[]
          const arch = archives.find((a) => a && need.every((n) => a.names.has(n)))
          if (!arch) continue
          const scene = new THREE.Scene()
          scene.background = new THREE.Color('#2f6fa8')
          scene.add(buildModelObject(model, arch.f))
          gl.render(scene, cam)
          ctx.drawImage(gl.domElement, (c.gx - minX) * THUMB, (c.gy - minY) * THUMB)
          ctx.fillStyle = '#fff'
          ctx.font = '9px monospace'
          ctx.fillText(`${c.gx},${c.gy} #${c.i}`, (c.gx - minX) * THUMB + 2, (c.gy - minY) * THUMB + 10)
        } catch { /* skip */ }
        done++
        if (done % 8 === 0) { setInfo(`drawing ${done}/${cells.length}`); await new Promise((r) => setTimeout(r)) }
      }
      setInfo(`done: ${cells.length} chunks, grid x ${minX}..${maxX}, y ${minY}..${maxY}`)
    })()
    return () => { stop = true }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#111' }}>
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 2, background: 'rgba(0,0,0,.7)', color: '#fff', padding: '4px 8px', font: '12px monospace' }}>{info}</div>
      <canvas ref={ref} />
    </div>
  )
}
