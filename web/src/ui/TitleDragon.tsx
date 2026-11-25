import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildModelObject, readModels, readTexFile } from '../rom/mapModel'
import { poseFrameCount, readPose } from '../rom/nitro'
import { loadTitleFiles } from '../rom/store'

/**
 * The 3D dragon of the game's title screen (White Kyurem in White 2), turning slowly behind the menus. It comes from the player's own game
 * file, so it only shows after the game file has been imported. To remove the feature: delete this file and its use in App.tsx.
 * It never blocks the page: the picture is drawn behind everything (the menus stay clickable) and stops when the tab is hidden.
 */
export default function TitleDragon() {
  const mountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('nodragon')) return
    const mount = mountRef.current!
    let stop = false
    let raf = 0
    let renderer: THREE.WebGLRenderer | null = null
    const cleanups: Array<() => void> = []
    void (async () => {
      const files = await loadTitleFiles()
      if (!files || stop) return
      const raw = files.model
      const tex = readTexFile(raw)
      const base = readModels(raw, readPose(files.anim, 0))[0]
      if (!tex || !base || stop) return
      const group = buildModelObject(base, tex)
      const box = new THREE.Box3().setFromObject(group)
      const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
      const pivot = new THREE.Group()
      group.position.set(-centre.x, -centre.y, -centre.z)
      pivot.add(group)
      const scene = new THREE.Scene()
      scene.add(pivot)
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { return }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
      mount.appendChild(renderer.domElement)
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200)
      const fit = () => {
        const w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight
        renderer!.setSize(w, h, false)
        camera.aspect = w / h
        const dim = Math.max(size.x, size.y, size.z)
        const dist = (dim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * (w > h ? 1.45 : 3.5)
        camera.position.set(0, size.y * 0.25, dist)
        camera.lookAt(0, 0, 0)
        // wide screens: the dragon sits to the right of the menu card; tall screens: in the upper part
        if (w > h) camera.setViewOffset(w, h, -w * 0.2, 0, w, h)
        else camera.setViewOffset(w, h, 0, h * 0.37, w, h)
        camera.updateProjectionMatrix()
      }
      fit()
      window.addEventListener('resize', fit)
      cleanups.push(() => window.removeEventListener('resize', fit))

      // the skeleton animation: every few frames of it is turned into vertex positions, a little at a time, while the dragon already turns
      const total = poseFrameCount(files.anim)
      const step = Math.max(1, Math.floor(total / 36))
      const frames: Float32Array[][] = []
      const meshes = group.children as THREE.Mesh[]
      let nextFrame = 0
      const bake = () => {
        if (stop || nextFrame >= total) return
        const m = readModels(raw, readPose(files.anim, nextFrame))[0]
        if (m && m.meshes.length === meshes.length) {
          frames.push(m.meshes.map((me) => {
            const a = new Float32Array(me.verts.length * 3)
            me.verts.forEach((v, i) => { a[i * 3] = v.x / 16; a[i * 3 + 1] = v.y / 16; a[i * 3 + 2] = v.z / 16 })
            return a
          }))
        }
        nextFrame += step
        window.setTimeout(bake, 30)
      }
      window.setTimeout(bake, 300)

      let last = performance.now(), t = 0, shown = -1
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        t += dt
        pivot.rotation.y += dt * 0.35 // a slow turn
        if (frames.length > 1) {
          const f = Math.floor(t * 12) % frames.length // the animation, about 12 pictures a second
          if (f !== shown) {
            shown = f
            frames[f].forEach((pos, i) => {
              const attr = meshes[i].geometry.getAttribute('position') as THREE.BufferAttribute
              if (attr.array.length === pos.length) { (attr.array as Float32Array).set(pos); attr.needsUpdate = true }
            })
          }
        }
        renderer!.render(scene, camera)
      }
      raf = requestAnimationFrame(tick)
    })()
    return () => {
      stop = true
      cancelAnimationFrame(raf)
      cleanups.forEach((f) => f())
      if (renderer) { renderer.dispose(); renderer.domElement.remove() }
    }
  }, [])
  return <div ref={mountRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} aria-hidden="true" />
}
