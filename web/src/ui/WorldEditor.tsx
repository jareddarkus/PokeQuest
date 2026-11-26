// The world editor: paint the ground with the game's own map pictures, set what a tile is, raise the ground, and place the game's 3D models.
// Everything is drawn from the player's own game file; the world is saved in this browser (and can be exported as a file).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildChunkWorld, type BuiltWorld } from '../rom/chunkWorld'
import { loadWorldData } from '../rom/store'
import { ProgressBar } from './ProgressBar'
import { signIn } from '../supabase'
import { claimWorldAdmin, currentUserId, isWorldAdmin, publishWorld, publishedInfo, unpublishWorld } from '../world/publish'
import { SIZE, T } from '../game/world'
import { Dex } from '@pkmn/sim'
import { EVENT_KINDS, EV, groupColor, kindOf, newEvent, newGroup, type GameEvent, type PokeGroup } from '../world/events'
import {
  DEFAULT_TEXTURE, MAX_LEVEL, buildCustomVisuals, cloneWorld, decodeWorld, emptyWorld, encodeWorld, heightOf, loadLocal, saveLocal, texIndex,
  type CustomWorld,
} from '../world/customWorld'

type Tool = 'paint' | 'kind' | 'height' | 'model' | 'pine' | 'move' | 'erase' | 'event' | 'zones'

const KINDS: Array<{ code: number; label: string; hint: string }> = [
  { code: T.Grass, label: 'Hierba', hint: 'Se puede andar' },
  { code: T.Tall, label: 'Hierba alta', hint: 'Se puede andar; salen Pokémon salvajes' },
  { code: T.Sand, label: 'Arena / camino', hint: 'Se puede andar' },
  { code: T.Water, label: 'Agua', hint: 'No se puede andar' },
  { code: T.Tree, label: 'Bloqueado', hint: 'No se puede andar (árboles, rocas, muros)' },
  { code: T.Cliff, label: 'Acantilado', hint: 'No se puede andar' },
]
const KIND_COLOR: Record<number, string> = { [T.Water]: '#3a7fc0', [T.Sand]: '#e8d890', [T.Grass]: '#59b84a', [T.Tall]: '#2a8a3a', [T.Tree]: '#6b3a2a', [T.Cliff]: '#8a6a3a' }

/** a small picture of a map texture */
function thumbOfTexture(t: THREE.DataTexture | null): string | null {
  if (!t) return null
  const c = document.createElement('canvas')
  c.width = t.image.width; c.height = t.image.height
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.image.data as unknown as ArrayLike<number>), c.width, c.height), 0, 0)
  return c.toDataURL()
}

let thumbRenderer: THREE.WebGLRenderer | null = null
/** a small picture of a 3D model, seen from the front and above */
function thumbOfModel(obj: THREE.Object3D): string {
  if (!thumbRenderer) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 96
    thumbRenderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, preserveDrawingBuffer: true, antialias: false })
    thumbRenderer.setSize(96, 96, false)
  }
  const scene = new THREE.Scene()
  scene.add(obj)
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3())
  const r = Math.max(size.x, size.y, size.z, 0.5) * 0.9
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 500)
  cam.position.set(centre.x + r * 1.2, centre.y + r * 1.4, centre.z + r * 2.2)
  cam.lookAt(centre)
  thumbRenderer.setClearColor(0x000000, 0)
  thumbRenderer.render(scene, cam)
  const url = thumbRenderer.domElement.toDataURL()
  scene.remove(obj)
  return url
}

export default function WorldEditor({ onExit, onPlay }: { onExit: () => void; onPlay: (cw: CustomWorld) => void }) {
  const [built, setBuilt] = useState<BuiltWorld | null>(null)
  const [loadText, setLoadText] = useState('Leyendo el mapa de tu archivo del juego…')
  useEffect(() => {
    let live = true
    void (async () => {
      await new Promise((r) => setTimeout(r, 30))
      const data = await loadWorldData()
      if (!live) return
      if (!data) { setLoadText('Faltan las piezas del mapa. Importa tu archivo del juego otra vez.'); return }
      setLoadText('Preparando el editor…')
      await new Promise((r) => setTimeout(r, 30))
      setBuilt(buildChunkWorld(data))
    })()
    return () => { live = false }
  }, [])
  if (!built) return <div className="fullscreen center menu-bg"><div className="panel card"><p className="sub">{loadText}</p><ProgressBar indeterminate p={{ text: 'Cargando…', frac: 0 }} /></div></div>
  return <Editor built={built} onExit={onExit} onPlay={onPlay} />
}

function Editor({ built, onExit, onPlay }: { built: BuiltWorld; onExit: () => void; onPlay: (cw: CustomWorld) => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const cwRef = useRef<CustomWorld>(loadLocal() ?? emptyWorld())
  const [tool, setTool] = useState<Tool>('paint')
  const [brush, setBrush] = useState(2)
  const [selTex, setSelTex] = useState(DEFAULT_TEXTURE)
  const [selKind, setSelKind] = useState<number>(T.Grass)
  const [selModel, setSelModel] = useState<{ pack: number; model: number } | null>(null)
  const [rot, setRot] = useState(0)
  const [search, setSearch] = useState('')
  const [pack, setPack] = useState<number>(-1)
  const [showBlocked, setShowBlocked] = useState(false)
  const [showEvents, setShowEvents] = useState(true)
  const [selEventType, setSelEventType] = useState<number>(EV.Trainer)
  const [selEventId, setSelEventId] = useState<number>(-1)
  const [selGroup, setSelGroup] = useState(1)
  const [info, setInfo] = useState('')
  const [saved, setSaved] = useState('')
  const [name, setName] = useState(cwRef.current.name)
  const [barriers, setBarriers] = useState(cwRef.current.barriers)
  const [, force] = useState(0)
  const [showPub, setShowPub] = useState(false)
  const redraw = useRef<() => void>(() => {})
  const undo = useRef<CustomWorld[]>([])
  const redo = useRef<CustomWorld[]>([])
  const toolRef = useRef({ tool, brush, selTex, selKind, selModel, rot, selEventType, selGroup })
  toolRef.current = { tool, brush, selTex, selKind, selModel, rot, selEventType, selGroup }
  const selEvRef = useRef(-1)
  selEvRef.current = selEventId

  // palette pictures
  const names = useMemo(() => built.textureNames(), [built])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    let i = 0
    const step = () => {
      if (!live || i >= names.length) return
      const batch: Record<string, string> = {}
      for (let k = 0; k < 4 && i < names.length; k++, i++) { const u = thumbOfTexture(built.textureNamed(names[i], false)); if (u) batch[names[i]] = u }
      setThumbs((t) => ({ ...t, ...batch }))
      setTimeout(step, 10)
    }
    step()
    return () => { live = false }
  }, [built, names])
  const packs = useMemo(() => built.packModels(), [built])
  useEffect(() => { if (pack < 0 && packs.length) setPack(packs[0].pack) }, [packs, pack])
  const [modelThumbs, setModelThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    if (tool !== 'model' || pack < 0) return
    const p = packs.find((q) => q.pack === pack)
    if (!p) return
    let live = true
    let m = 0
    const step = () => {
      if (!live || m >= p.count) return
      const key = `${pack}:${m}`
      const todo = m++
      if (!(`${pack}:${todo}` in modelThumbs)) {
        const b = built.makeBuilding(pack, todo)
        if (b) { const u = thumbOfModel(b.obj); setModelThumbs((t) => ({ ...t, [`${pack}:${todo}`]: u })) } else setModelThumbs((t) => ({ ...t, [`${pack}:${todo}`]: '' }))
      }
      void key
      setTimeout(step, 8)
    }
    step()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, pack, built, packs])

  const snapshot = () => { undo.current.push(cloneWorld(cwRef.current)); if (undo.current.length > 40) undo.current.shift(); redo.current = [] }
  const doUndo = () => { const s = undo.current.pop(); if (!s) return; redo.current.push(cloneWorld(cwRef.current)); cwRef.current = s; redraw.current(); force((n) => n + 1) }
  const doRedo = () => { const s = redo.current.pop(); if (!s) return; undo.current.push(cloneWorld(cwRef.current)); cwRef.current = s; redraw.current(); force((n) => n + 1) }
  const save = useCallback(() => {
    cwRef.current.name = name
    cwRef.current.barriers = barriers
    setSaved(saveLocal(cwRef.current) ? 'Guardado en este navegador ✓' : 'No se pudo guardar (poco espacio): usa Exportar')
  }, [name, barriers])
  useEffect(() => { cwRef.current.name = name; cwRef.current.barriers = barriers }, [name, barriers])

  // ------------------------------------------------------------ the 3D view
  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#3a7fc0')
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 800)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a7fc0' }))
    sea.position.set(SIZE / 2, built.waterY - 0.03, SIZE / 2)
    scene.add(sea)
    const look = { x: SIZE / 2, z: SIZE / 2, dist: 50 }
    const PITCH = (58 * Math.PI) / 180
    const place = () => {
      camera.position.set(look.x, built.waterY + 0.4 + look.dist * Math.sin(PITCH), look.z + look.dist * Math.cos(PITCH))
      camera.lookAt(look.x, built.waterY + 0.4, look.z)
    }
    const resize = () => { const w = mount.clientWidth, h = mount.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
    resize()
    window.addEventListener('resize', resize)

    let ground: THREE.Group | null = null, objects: THREE.Group | null = null, blockedMask: Uint8Array = new Uint8Array(SIZE * SIZE), holders = new Map<number, THREE.Group>()
    let selectedId = -1
    let overlay: THREE.Mesh | null = null
    const dispose = (g: THREE.Group | null) => { if (!g) return; scene.remove(g); g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() }) }
    const rebuildGround = () => { dispose(ground); const r = buildCustomVisuals(cwRef.current, built, { only: 'ground' }); ground = r.group; scene.add(ground); updateOverlay() }
    const rebuildObjects = () => { dispose(objects); const r = buildCustomVisuals(cwRef.current, built, { only: 'objects' }); objects = r.group; blockedMask = r.blocked; holders = r.holders; scene.add(objects); updateOverlay() }
    const updateOverlay = () => {
      if (overlay) { scene.remove(overlay); overlay.geometry.dispose(); overlay = null }
      if (!showBlockedRef.current) return
      const cw = cwRef.current
      const pos: number[] = []
      for (let i = 0; i < SIZE * SIZE; i++) {
        const k = cw.kind[i]
        if (!(k === T.Tree || k === T.Cliff || blockedMask[i])) continue
        const x = i % SIZE, z = (i / SIZE) | 0
        const y = (k === T.Water ? built.waterY : heightOf(built, cw.level[i])) + 0.7
        pos.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x, y, z + 1)
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      overlay = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide }))
      overlay.renderOrder = 999
      scene.add(overlay)
    }
    // events (numbered markers) and wild zones (coloured tiles)
    let evGroup: THREE.Group | null = null
    const numberSprite = (n: number, color: string): THREE.Sprite => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64
      const g = c.getContext('2d')!
      g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill()
      g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke()
      g.fillStyle = '#000'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34)
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }))
      sp.renderOrder = 1002
      return sp
    }
    const rebuildEvents = () => {
      if (evGroup) { scene.remove(evGroup); evGroup.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose() }); evGroup = null }
      if (!showEventsRef.current) return
      const cw = cwRef.current
      evGroup = new THREE.Group()
      // wild zones: every tile with a group number is tinted with the colour of its group
      const pos: number[] = [], col: number[] = []
      for (let i = 0; i < SIZE * SIZE; i++) {
        const gid = cw.enc[i]
        if (!gid) continue
        const x = i % SIZE, z = (i / SIZE) | 0
        const y = (cw.kind[i] === T.Water ? built.waterY : heightOf(built, cw.level[i])) + 0.55
        const c = new THREE.Color(groupColor(gid))
        pos.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x, y, z + 1)
        for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b)
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide }))
        m.renderOrder = 998
        evGroup.add(m)
      }
      for (const e of cw.events) {
        const gi = Math.max(0, Math.min(SIZE - 1, e.y)) * SIZE + Math.max(0, Math.min(SIZE - 1, e.x))
        const sp = numberSprite(e.type, kindOf(e.type).color)
        sp.scale.set(0.95, 0.95, 1)
        sp.position.set(e.x + 0.5, heightOf(built, cw.level[gi]) + 1.1, e.y + 0.5)
        evGroup.add(sp)
        if (e.id === selEvRef.current) { const ring = numberSprite(e.type, '#ffffff'); ring.scale.set(1.25, 1.25, 1); ring.position.copy(sp.position); ring.renderOrder = 1001; evGroup.add(ring) }
      }
      scene.add(evGroup)
    }
    const showEventsRef = { current: true }
    ;(redraw as unknown as { events: () => void; showEvents: (b: boolean) => void }).events = rebuildEvents
    ;(redraw as unknown as { events: () => void; showEvents: (b: boolean) => void }).showEvents = (b) => { showEventsRef.current = b; rebuildEvents() }
    const showBlockedRef = { current: false }
    redraw.current = () => { rebuildGround(); rebuildObjects(); rebuildEvents() }
    ;(redraw as unknown as { blocked: (b: boolean) => void }).blocked = (b) => { showBlockedRef.current = b; updateOverlay() }
    rebuildGround(); rebuildObjects(); rebuildEvents()

    // the square that follows the mouse
    const cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe040, transparent: true, opacity: 0.45, depthTest: false }))
    cursor.renderOrder = 1000
    scene.add(cursor)
    const selBox = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe040, transparent: true, opacity: 0.5, depthTest: false }))
    selBox.visible = false
    selBox.renderOrder = 1001
    scene.add(selBox)
    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const hover = { x: -1, z: -1, fx: 0, fz: 0, on: false }
    const pick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      let y = built.waterY + 0.35
      let hit = new THREE.Vector3()
      for (let k = 0; k < 3; k++) { // (the ground can be higher than the flat guess: ask again at the height of the tile that was hit)
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) { hover.on = false; return }
        const tx = Math.floor(hit.x), tz = Math.floor(hit.z)
        if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) break
        const i = tz * SIZE + tx
        y = cwRef.current.kind[i] === T.Water ? built.waterY : heightOf(built, cwRef.current.level[i])
      }
      hover.fx = hit.x; hover.fz = hit.z
      hover.x = Math.floor(hit.x); hover.z = Math.floor(hit.z)
      hover.on = hover.x >= 0 && hover.z >= 0 && hover.x < SIZE && hover.z < SIZE
      if (hover.on) {
        const i = hover.z * SIZE + hover.x, cw = cwRef.current
        setInfo(`Casilla ${hover.x}, ${hover.z} · ${KINDS.find((q) => q.code === cw.kind[i])?.label ?? '?'} · altura ${cw.level[i]} · ${cw.tile[i] ? cw.tex[cw.tile[i] - 1] : DEFAULT_TEXTURE}`)
      }
    }
    const brushTiles = (): number[] => {
      const n = toolRef.current.brush, o = Math.floor((n - 1) / 2), out: number[] = []
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const x = hover.x - o + a, z = hover.z - o + b; if (x >= 0 && z >= 0 && x < SIZE && z < SIZE) out.push(z * SIZE + x) }
      return out
    }
    let dragging = false, dragOff = { x: 0, z: 0 }
    let draggingEv = false
    const selectEvent = (id: number) => { selEvRef.current = id; setSelEventId(id) }
    let painting = false, panning = false, last = { x: 0, y: 0 }, dirty = false, strokeSeen = new Set<number>(), lowering = false
    const apply = () => {
      if (!hover.on) return
      const cw = cwRef.current, t = toolRef.current
      if (t.tool === 'paint') { const ti = texIndex(cw, t.selTex); for (const i of brushTiles()) { cw.tile[i] = ti; if (cw.kind[i] === T.Water) cw.kind[i] = T.Grass } dirty = true }
      else if (t.tool === 'zones') { for (const i of brushTiles()) cw.enc[i] = t.selGroup; dirty = true }
      else if (t.tool === 'kind') { for (const i of brushTiles()) { cw.kind[i] = t.selKind; if (t.selKind === T.Water) cw.level[i] = 0 } dirty = true }
      else if (t.tool === 'height') {
        for (const i of brushTiles()) {
          if (strokeSeen.has(i)) continue
          strokeSeen.add(i)
          if (cw.kind[i] === T.Water && !lowering) cw.kind[i] = T.Grass
          cw.level[i] = Math.max(0, Math.min(MAX_LEVEL, cw.level[i] + (lowering ? -1 : 1)))
        }
        dirty = true
      }
    }
    let timer = 0
    const flush = () => { if (!dirty) return; dirty = false; rebuildGround(); rebuildEvents(); setSaved('') }
    const onDown = (ev: MouseEvent) => {
      if (ev.button === 1 || ev.button === 2) { panning = true; last = { x: ev.clientX, y: ev.clientY }; ev.preventDefault(); return }
      if (ev.button !== 0) return
      pick(ev)
      const t = toolRef.current
      if (!hover.on) return
      if (t.tool === 'event') {
        const cw = cwRef.current
        let best = -1, bd = 0.9
        cw.events.forEach((e, k) => { const d = Math.hypot(e.x + 0.5 - hover.fx, e.y + 0.5 - hover.fz); if (d < bd) { bd = d; best = k } })
        snapshot()
        if (best >= 0) { selectEvent(cw.events[best].id); draggingEv = true }
        else { const e = newEvent(cw.nextId++, t.selEventType, hover.x, hover.z); cw.events.push(e); selectEvent(e.id); draggingEv = true; setSaved('') }
        rebuildEvents()
        return
      }
      if (t.tool === 'model' || t.tool === 'pine') {
        if (t.tool === 'model' && !t.selModel) { setInfo('Elige primero un modelo de la lista.'); return }
        snapshot()
        const cw = cwRef.current
        const px = Math.round(hover.fx * 2) / 2, pz = Math.round(hover.fz * 2) / 2
        cw.objects.push({ id: cw.nextId++, kind: t.tool === 'pine' ? 'pine' : 'model', pack: t.selModel?.pack, model: t.selModel?.model, x: t.tool === 'pine' ? Math.round(hover.fx) : px, z: t.tool === 'pine' ? Math.round(hover.fz) : pz, rot: t.rot })
        rebuildObjects(); setSaved('')
        return
      }
      if (t.tool === 'move') {
        const cw = cwRef.current
        let best = -1, bd = 2.2
        cw.objects.forEach((o, k) => { const d = Math.hypot(o.x - hover.fx, o.z - hover.fz); if (d < bd) { bd = d; best = k } })
        if (best >= 0) { snapshot(); const o = cw.objects[best]; selectedId = o.id; dragging = true; dragOff = { x: o.x - hover.fx, z: o.z - hover.fz } } else selectedId = -1
        return
      }
      if (t.tool === 'erase') {
        const cw = cwRef.current
        let best = -1, bd = 2.2
        cw.objects.forEach((o, k) => { const d = Math.hypot(o.x - hover.fx, o.z - hover.fz); if (d < bd) { bd = d; best = k } })
        if (best >= 0) { snapshot(); cw.objects.splice(best, 1); rebuildObjects(); setSaved('') }
        return
      }
      snapshot()
      painting = true; strokeSeen = new Set(); lowering = ev.shiftKey
      apply()
      flush()
    }
    const onMove = (ev: MouseEvent) => {
      if (panning) {
        const k = look.dist * 0.0022
        look.x -= (ev.clientX - last.x) * k; look.z -= (ev.clientY - last.y) * k / Math.sin(PITCH)
        last = { x: ev.clientX, y: ev.clientY }
        return
      }
      pick(ev)
      if (draggingEv && hover.on) {
        const e = cwRef.current.events.find((q) => q.id === selEvRef.current)
        if (e && (e.x !== hover.x || e.y !== hover.z)) { e.x = hover.x; e.y = hover.z; rebuildEvents(); setSaved('') }
        return
      }
      if (dragging && hover.on) {
        const o = cwRef.current.objects.find((q) => q.id === selectedId)
        if (o) {
          const nx = o.kind === 'pine' ? Math.round(hover.fx + dragOff.x) : Math.round((hover.fx + dragOff.x) * 2) / 2
          const nz = o.kind === 'pine' ? Math.round(hover.fz + dragOff.z) : Math.round((hover.fz + dragOff.z) * 2) / 2
          if (nx !== o.x || nz !== o.z) {
            o.x = nx; o.z = nz
            const h = holders.get(o.id)
            if (h) { const gi = Math.max(0, Math.min(SIZE - 1, Math.floor(nz))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(nx))); h.position.set(nx, cwRef.current.kind[gi] === T.Water ? built.waterY : heightOf(built, cwRef.current.level[gi]), nz) }
          }
        }
        return
      }
      if (painting) { apply(); if (!timer) timer = window.setTimeout(() => { timer = 0; flush() }, 90) }
    }
    const onUp = () => { if (draggingEv) { draggingEv = false; force((n) => n + 1) } if (dragging) { dragging = false; rebuildObjects(); setSaved('') } painting = false; panning = false; flush(); window.clearTimeout(timer); timer = 0 }
    const onWheel = (ev: WheelEvent) => { ev.preventDefault(); look.dist = Math.max(8, Math.min(220, look.dist * (ev.deltaY > 0 ? 1.12 : 0.89))) }
    const keys = new Set<string>()
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement
      if (el && /INPUT|TEXTAREA/.test(el.tagName)) return
      if (ev.type === 'keydown') {
        keys.add(ev.key.toLowerCase())
        if (ev.key.toLowerCase() === 'r') {
          const o = selectedId >= 0 ? cwRef.current.objects.find((q) => q.id === selectedId) : undefined
          if (o && toolRef.current.tool === 'move') { snapshot(); o.rot = (o.rot + 90) % 360; rebuildObjects(); setSaved('') } else setRot((r) => (r + 90) % 360)
        }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && selEvRef.current >= 0 && toolRef.current.tool === 'event') {
          snapshot(); cwRef.current.events = cwRef.current.events.filter((q) => q.id !== selEvRef.current); selectEvent(-1); rebuildEvents(); setSaved(''); force((n) => n + 1)
        }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedId >= 0 && toolRef.current.tool === 'move') {
          snapshot(); cwRef.current.objects = cwRef.current.objects.filter((q) => q.id !== selectedId); selectedId = -1; rebuildObjects(); setSaved('')
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) doRedoRef.current(); else doUndoRef.current() }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); doRedoRef.current() }
      } else keys.delete(ev.key.toLowerCase())
    }
    const el = renderer.domElement
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    let raf = 0, lastT = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now
      const sp = look.dist * 0.9 * dt
      if (keys.has('w') || keys.has('arrowup')) look.z -= sp
      if (keys.has('s') || keys.has('arrowdown')) look.z += sp
      if (keys.has('a') || keys.has('arrowleft')) look.x -= sp
      if (keys.has('d') || keys.has('arrowright')) look.x += sp
      look.x = Math.max(0, Math.min(SIZE, look.x)); look.z = Math.max(0, Math.min(SIZE, look.z))
      place()
      const t = toolRef.current
      const n = t.tool === 'paint' || t.tool === 'kind' || t.tool === 'height' || t.tool === 'zones' ? t.brush : 1
      cursor.visible = hover.on
      if (hover.on) {
        const o = Math.floor((n - 1) / 2)
        const gi = Math.max(0, Math.min(SIZE - 1, hover.z)) * SIZE + Math.max(0, Math.min(SIZE - 1, hover.x))
        cursor.scale.set(n, 1, n)
        cursor.position.set(hover.x - o + n / 2, heightOf(built, cwRef.current.level[gi]) + 0.6, hover.z - o + n / 2)
      }
      const so = selectedId >= 0 ? cwRef.current.objects.find((q) => q.id === selectedId) : undefined
      if (so && toolRef.current.tool === 'move') {
        const h = holders.get(so.id)
        const gi = Math.max(0, Math.min(SIZE - 1, Math.floor(so.z))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(so.x)))
        let w = 2, d = 2
        if (h) { h.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(h); w = Math.max(1, bb.max.x - bb.min.x); d = Math.max(1, bb.max.z - bb.min.z) }
        selBox.scale.set(w + 0.3, 1, d + 0.3)
        selBox.position.set(so.x, heightOf(built, cwRef.current.level[gi]) + 0.65, so.z)
        selBox.visible = true
      } else selBox.visible = false
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey)
      dispose(ground); dispose(objects)
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [built])
  const doUndoRef = useRef(doUndo), doRedoRef = useRef(doRedo)
  doUndoRef.current = doUndo; doRedoRef.current = doRedo
  useEffect(() => { (redraw as unknown as { blocked?: (b: boolean) => void }).blocked?.(showBlocked) }, [showBlocked])
  useEffect(() => { (redraw as unknown as { showEvents?: (b: boolean) => void }).showEvents?.(showEvents) }, [showEvents, selEventId])
  // saved automatically a moment after every change
  useEffect(() => {
    const id = window.setInterval(() => { saveLocal({ ...cwRef.current, name, barriers }) }, 4000)
    return () => window.clearInterval(id)
  }, [name, barriers])

  const exportFile = () => {
    const text = encodeWorld({ ...cwRef.current, name, barriers })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = `${name.replace(/[^a-z0-9]+/gi, '_') || 'mundo'}.pqworld.json`
    a.click()
  }
  const importFile = () => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = '.json,application/json'
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if (!f) return
      const w = decodeWorld(await f.text())
      if (!w) { setSaved('Ese archivo no es un mundo válido.'); return }
      snapshot()
      cwRef.current = w; setName(w.name); setBarriers(w.barriers)
      redraw.current(); force((n) => n + 1); setSaved('Mundo cargado ✓')
    }
    inp.click()
  }
  const newWorld = () => {
    if (!window.confirm('¿Empezar un mundo nuevo y vacío? (Puedes deshacerlo con Ctrl+Z)')) return
    snapshot()
    cwRef.current = emptyWorld(); setName(cwRef.current.name); setBarriers(false)
    redraw.current(); force((n) => n + 1)
  }

  const filtered = names.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
  const curPack = packs.find((q) => q.pack === pack)
  return (
    <div className="we-root">
      <div className="we-top">
        <button onClick={() => { save(); onExit() }}>← Salir</button>
        <input className="we-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del mundo" />
        <button onClick={doUndo} title="Ctrl+Z">Deshacer</button>
        <button onClick={doRedo} title="Ctrl+Y">Rehacer</button>
        <button onClick={save}>Guardar</button>
        <button onClick={exportFile}>Exportar</button>
        <button onClick={importFile}>Importar</button>
        <button onClick={newWorld}>Mundo nuevo</button>
        <label className="we-check"><input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} /> Ver eventos</label>
        <label className="we-check"><input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} /> Ver bloqueos</label>
        <label className="we-check" title="El juego añade muros entre los anillos (hace falta ganar un gimnasio para pasar)"><input type="checkbox" checked={barriers} onChange={(e) => setBarriers(e.target.checked)} /> Muros de anillo</label>
        <button onClick={() => setShowPub(true)}>Publicar…</button>
        <button className="we-play" onClick={() => { save(); onPlay({ ...cwRef.current, name, barriers }) }}>▶ Probar mundo</button>
        <span className="we-saved">{saved}</span>
      </div>
      <div className="we-body">
        <div className="we-side">
          <div className="we-tools">
            {([['paint', 'Pintar suelo'], ['kind', 'Tipo de casilla'], ['height', 'Altura'], ['model', 'Modelos 3D'], ['pine', 'Pino'], ['move', 'Mover objeto'], ['erase', 'Borrar objeto'], ['event', 'Eventos (números)'], ['zones', 'Zonas de Pokémon']] as Array<[Tool, string]>).map(([k, l]) => (
              <button key={k} className={tool === k ? 'on' : ''} onClick={() => setTool(k)}>{l}</button>
            ))}
          </div>
          {(tool === 'paint' || tool === 'kind' || tool === 'height' || tool === 'zones') && (
            <div className="we-row">Pincel: {[1, 2, 3, 5, 8].map((n) => <button key={n} className={brush === n ? 'on' : ''} onClick={() => setBrush(n)}>{n}</button>)}</div>
          )}
          {tool === 'paint' && (
            <>
              <input className="we-search" placeholder="Buscar imagen…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="we-grid">
                {filtered.map((n) => (
                  <button key={n} className={`we-cell ${selTex === n ? 'on' : ''}`} title={n} onClick={() => setSelTex(n)}>
                    {thumbs[n] ? <img src={thumbs[n]} alt={n} draggable={false} /> : <span className="we-ph" />}
                    <span>{n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tool === 'kind' && (
            <div className="we-kinds">
              {KINDS.map((k) => (
                <button key={k.code} className={selKind === k.code ? 'on' : ''} onClick={() => setSelKind(k.code)}>
                  <i style={{ background: KIND_COLOR[k.code] }} /> <b>{k.label}</b><small>{k.hint}</small>
                </button>
              ))}
              <p className="we-help">El tipo decide si se puede andar y si salen Pokémon. La imagen se elige en “Pintar suelo”.</p>
            </div>
          )}
          {tool === 'height' && <p className="we-help">Clic: sube el suelo un escalón. Mayús + clic: lo baja. Los escalones se ven como acantilado. En el agua, sube para hacer tierra.</p>}
          {tool === 'model' && (
            <>
              <div className="we-row">Paquete: {packs.map((q) => <button key={q.pack} className={pack === q.pack ? 'on' : ''} onClick={() => setPack(q.pack)}>{q.pack}</button>)}</div>
              <p className="we-help">Clic en el mapa para colocar. R gira el modelo ({rot}°).</p>
              <div className="we-grid">
                {Array.from({ length: curPack?.count ?? 0 }, (_, m) => {
                  const u = modelThumbs[`${pack}:${m}`]
                  if (u === '') return null
                  return (
                    <button key={m} className={`we-cell ${selModel?.pack === pack && selModel.model === m ? 'on' : ''}`} onClick={() => setSelModel({ pack, model: m })}>
                      {u ? <img src={u} alt={`modelo ${m}`} draggable={false} /> : <span className="we-ph" />}
                      <span>{pack}·{m}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {tool === 'pine' && <p className="we-help">Clic en el mapa para plantar un pino (ocupa 2 × 2 casillas y bloquea el paso).</p>}
          {tool === 'move' && <p className="we-help">Arrastra un modelo o pino para moverlo. Con uno elegido: R lo gira, Supr lo borra.</p>}
          {tool === 'erase' && <p className="we-help">Clic junto a un modelo o pino para quitarlo.</p>}
          {tool === 'event' && (
            <EventPanel cw={cwRef.current} selType={selEventType} setSelType={setSelEventType} selId={selEventId} onChange={() => { force((n) => n + 1); setSaved(''); (redraw as unknown as { events?: () => void }).events?.() }} onSelect={(id) => setSelEventId(id)} />
          )}
          {tool === 'zones' && (
            <GroupPanel cw={cwRef.current} selGroup={selGroup} setSelGroup={setSelGroup} onChange={() => { force((n) => n + 1); setSaved(''); (redraw as unknown as { events?: () => void }).events?.() }} />
          )}
        </div>
        <div className="we-view" ref={mountRef} />
      </div>
      {showPub && <PublishPanel getWorld={() => ({ ...cwRef.current, name, barriers })} onClose={() => setShowPub(false)} />}
      <div className="we-status">{info || 'Rueda: zoom · WASD o botón derecho: mover la vista · Ctrl+Z: deshacer'}</div>
    </div>
  )
}

/** Publishing the world for everybody (only the owner's account can do it). */
function PublishPanel({ getWorld, onClose }: { getWorld: () => CustomWorld; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'out' | 'user' | 'admin'>('loading')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [info, setInfo] = useState<{ name: string; at: string } | null>(null)
  const refresh = useCallback(async () => {
    setInfo(await publishedInfo())
    if (!(await currentUserId())) { setState('out'); return }
    setState((await isWorldAdmin()) ? 'admin' : 'user')
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return (
    <div className="we-modal" onClick={onClose}>
      <div className="we-modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>Publicar el mundo</h3>
        <p className="we-help">Publicado: {info ? `“${info.name}” (${new Date(info.at).toLocaleString()})` : 'ningún mundo (se juega la isla normal)'}</p>
        {state === 'loading' && <p>Comprobando tu cuenta…</p>}
        {state === 'out' && (
          <>
            <p className="we-help">Inicia sesión con tu cuenta de PokeQuest.</p>
            <input className="we-search" placeholder="Usuario" value={user} onChange={(e) => setUser(e.target.value)} />
            <input className="we-search" placeholder="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button onClick={async () => { const err = await signIn(user, pass); setMsg(err ?? ''); if (!err) void refresh() }}>Iniciar sesión</button>
          </>
        )}
        {state === 'user' && (
          <>
            <p className="we-help">Esta cuenta aún no es la del propietario. Escribe el código de propietario (solo hace falta una vez).</p>
            <input className="we-search" placeholder="Código de propietario" value={code} onChange={(e) => setCode(e.target.value)} />
            <button onClick={async () => { const ok = await claimWorldAdmin(code); setMsg(ok ? 'Listo: esta cuenta es la propietaria.' : 'Código incorrecto.'); if (ok) void refresh() }}>Activar</button>
          </>
        )}
        {state === 'admin' && (
          <>
            <button className="we-play" onClick={async () => { setMsg('Publicando…'); const err = await publishWorld(getWorld()); setMsg(err ?? 'Publicado ✓ Todos jugarán este mundo.'); void refresh() }}>Publicar este mundo para todos</button>
            <button onClick={async () => { if (!window.confirm('¿Quitar el mundo publicado? Volverá la isla normal.')) return; const err = await unpublishWorld(); setMsg(err ?? 'Quitado ✓'); void refresh() }}>Quitar el mundo publicado</button>
          </>
        )}
        {msg && <p>{msg}</p>}
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------- events
const speciesNames: string[] = Dex.species.all().filter((sp) => sp.num > 0 && sp.exists && !sp.isNonstandard).map((sp) => sp.name)
const TYPE_NAMES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']

function EventPanel({ cw, selType, setSelType, selId, onChange, onSelect }: { cw: CustomWorld; selType: number; setSelType: (t: number) => void; selId: number; onChange: () => void; onSelect: (id: number) => void }) {
  const ev = cw.events.find((e) => e.id === selId)
  const upd = (patch: Partial<GameEvent>) => { if (ev) { Object.assign(ev, patch); onChange() } }
  const lines = (arr?: string[]) => (arr ?? []).join('\n')
  const k = ev ? kindOf(ev.type) : null
  return (
    <>
      <p className="we-help">Elige el tipo (su número) y haz clic en el mapa para colocarlo. Clic en uno puesto: lo eliges y lo editas; arrástralo para moverlo; Supr lo borra.</p>
      <div className="we-kinds">
        {EVENT_KINDS.map((q) => (
          <button key={q.type} className={selType === q.type ? 'on' : ''} onClick={() => setSelType(q.type)}>
            <i style={{ background: q.color }} /> <b>{q.type} · {q.name}</b><small>{q.help}</small>
          </button>
        ))}
      </div>
      {ev && k && (
        <div className="we-form">
          <h4><i style={{ background: k.color }} /> Evento {ev.type}: {k.name} ({ev.x}, {ev.y})</h4>
          {(ev.type === EV.Trainer || ev.type === EV.Person || ev.type === EV.Gym) && <label>Nombre<input value={ev.name ?? ''} onChange={(e) => upd({ name: e.target.value })} /></label>}
          {(ev.type === EV.Trainer || ev.type === EV.Person) && (
            <>
              <label>Mira hacia<select value={ev.dir ?? 0} onChange={(e) => upd({ dir: Number(e.target.value) })}><option value={0}>Abajo</option><option value={1}>Izquierda</option><option value={2}>Derecha</option><option value={3}>Arriba</option></select></label>
              <label>Comportamiento<select value={ev.behavior ?? 'stand'} onChange={(e) => upd({ behavior: e.target.value as GameEvent['behavior'] })}><option value="stand">Quieto</option><option value="look">Mira alrededor</option><option value="walk">Pasea</option><option value="run">Corre</option></select></label>
              <button onClick={() => upd({ look: Math.floor(Math.random() * 1e9) })}>Cambiar colores al azar</button>
            </>
          )}
          {(ev.type === EV.Trainer || ev.type === EV.Person || ev.type === EV.Gym) && <label>Frases (una por línea; sale una al azar)<textarea rows={4} value={lines(ev.lines)} onChange={(e) => upd({ lines: e.target.value.split('\n').filter((l) => l.trim()) })} /></label>}
          {ev.type === EV.Trainer && <label>Frases al perder<textarea rows={3} value={lines(ev.after)} onChange={(e) => upd({ after: e.target.value.split('\n').filter((l) => l.trim()) })} /></label>}
          {(ev.type === EV.Trainer || ev.type === EV.Gym) && (
            <label>Grupo de Pokémon
              <select value={ev.group ?? 0} onChange={(e) => upd({ group: Number(e.target.value) })}>
                <option value={0}>(al azar, según el anillo)</option>
                {cw.groups.map((g) => <option key={g.id} value={g.id}>{g.id} · {g.name}</option>)}
              </select>
            </label>
          )}
          {ev.type === EV.Gym && <label>Tipo<select value={ev.gymType ?? 'Normal'} onChange={(e) => upd({ gymType: e.target.value })}>{TYPE_NAMES.map((t) => <option key={t}>{t}</option>)}</select></label>}
          {(ev.type === EV.Gym || ev.type === EV.Teleport) && (
            <div className="we-row">{ev.type === EV.Gym ? 'Al ganar, llevar a' : 'Llevar a'}: X <input type="number" value={ev.tx ?? -1} onChange={(e) => upd({ tx: Number(e.target.value) })} /> Y <input type="number" value={ev.ty ?? -1} onChange={(e) => upd({ ty: Number(e.target.value) })} />{ev.type === EV.Gym && <small> (-1 = a ningún sitio)</small>}</div>
          )}
          {ev.type === EV.Sign && <label>Texto<textarea rows={3} value={ev.text ?? ''} onChange={(e) => upd({ text: e.target.value })} /></label>}
          <button onClick={() => { cw.events = cw.events.filter((q) => q.id !== ev.id); onSelect(-1); onChange() }}>Borrar este evento</button>
        </div>
      )}
      <p className="we-help">Eventos puestos: {cw.events.length}. Sin ningún evento, el juego pone entrenadores, gimnasios y objetos solo; con eventos, solo salen los tuyos.</p>
    </>
  )
}

function GroupPanel({ cw, selGroup, setSelGroup, onChange }: { cw: CustomWorld; selGroup: number; setSelGroup: (g: number) => void; onChange: () => void }) {
  const g = cw.groups.find((q) => q.id === selGroup)
  const upd = (fn: (g: PokeGroup) => void) => { if (g) { fn(g); onChange() } }
  return (
    <>
      <p className="we-help">Un grupo es una lista de Pokémon con niveles. Pinta zonas del mapa con un grupo: en la hierba alta de esa zona saldrán esos Pokémon. Los entrenadores y gimnasios también usan grupos. “Sin grupo” borra la zona.</p>
      <div className="we-kinds">
        <button className={selGroup === 0 ? 'on' : ''} onClick={() => setSelGroup(0)}><i style={{ background: '#444' }} /> <b>Sin grupo (borrar)</b></button>
        {cw.groups.map((q) => (
          <button key={q.id} className={selGroup === q.id ? 'on' : ''} onClick={() => setSelGroup(q.id)}><i style={{ background: groupColor(q.id) }} /> <b>{q.id} · {q.name}</b><small>{q.entries.map((e) => e.species).join(', ')}</small></button>
        ))}
        <button onClick={() => { const id = Math.max(0, ...cw.groups.map((q) => q.id)) + 1; cw.groups.push(newGroup(id)); setSelGroup(id); onChange() }}>+ Grupo nuevo</button>
      </div>
      <datalist id="we-species">{speciesNames.map((n) => <option key={n} value={n} />)}</datalist>
      {g && (
        <div className="we-form">
          <h4><i style={{ background: groupColor(g.id) }} /> Grupo {g.id}</h4>
          <label>Nombre<input value={g.name} onChange={(e) => upd((q) => { q.name = e.target.value })} /></label>
          <div className="we-row">Entrenador lleva de <input type="number" min={1} max={6} value={g.count[0]} onChange={(e) => upd((q) => { q.count = [Number(e.target.value), Math.max(Number(e.target.value), q.count[1])] })} /> a <input type="number" min={1} max={6} value={g.count[1]} onChange={(e) => upd((q) => { q.count = [Math.min(q.count[0], Number(e.target.value)), Number(e.target.value)] })} /> Pokémon</div>
          <table className="we-table"><thead><tr><th>Pokémon</th><th>Nv mín</th><th>Nv máx</th><th>Peso</th><th /></tr></thead><tbody>
            {g.entries.map((e, i) => (
              <tr key={i}>
                <td><input list="we-species" value={e.species} onChange={(ev2) => upd(() => { e.species = ev2.target.value })} /></td>
                <td><input type="number" min={1} max={100} value={e.min} onChange={(ev2) => upd(() => { e.min = Number(ev2.target.value) })} /></td>
                <td><input type="number" min={1} max={100} value={e.max} onChange={(ev2) => upd(() => { e.max = Number(ev2.target.value) })} /></td>
                <td><input type="number" min={0} max={100} value={e.weight} onChange={(ev2) => upd(() => { e.weight = Number(ev2.target.value) })} /></td>
                <td><button onClick={() => upd((q) => { q.entries.splice(i, 1) })}>×</button></td>
              </tr>
            ))}
          </tbody></table>
          <button onClick={() => upd((q) => { q.entries.push({ species: 'Pikachu', min: 5, max: 8, weight: 1 }) })}>+ Pokémon</button>
          <button onClick={() => { cw.groups = cw.groups.filter((q) => q.id !== g.id); cw.enc.forEach((v, i) => { if (v === g.id) cw.enc[i] = 0 }); setSelGroup(0); onChange() }}>Borrar este grupo</button>
          <p className="we-help">El “peso” es la probabilidad relativa: 3 sale el triple que 1.</p>
        </div>
      )}
    </>
  )
}
