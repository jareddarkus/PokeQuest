// Where the pictures taken from the player's own game file are kept: the browser's private storage on THEIR computer.
// They are never uploaded, and never put into the website or the database.
import { NdsFile, type RomSource } from './nds'
import { SPRITE_NARC, decodeAllSprites, spriteKey } from './sprites'
import { WORLD_WINDOW, extractWorldData, type WorldData } from './worldData'

const DB = 'pokequest-rom'
const STORE = 'assets'
const META_KEY = 'meta'

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function put(key: string, value: unknown): Promise<void> {
  const d = await db()
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
  d.close()
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db()
  const v = await new Promise<T | undefined>((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key)
    r.onsuccess = () => res(r.result as T | undefined)
    r.onerror = () => rej(r.error)
  })
  d.close()
  return v
}

export interface RomMeta { title: string; gameCode: string; sprites: number; version: number }
const VERSION = 3 // 3 = pictures + map pieces of window (20,5)

export async function loadWorldData(): Promise<WorldData | undefined> {
  try {
    return await get<WorldData>('world')
  } catch {
    return undefined
  }
}

export async function getRomMeta(): Promise<RomMeta | null> {
  try {
    const m = await get<RomMeta>(META_KEY)
    return m && m.version === VERSION ? m : null
  } catch {
    return null
  }
}

/** Reads the player's game file and stores the pictures. Returns what was found. */
export async function importRom(file: RomSource, onProgress: (text: string, frac: number) => void): Promise<RomMeta> {
  onProgress('Opening the game file…', 0.02)
  const nds = new NdsFile(file)
  await nds.open()
  const code = nds.header.gameCode
  if (!/^I[RA][ABD]/.test(code) && !/^IR[ABDE]/.test(code)) {
    throw new Error(`This is "${nds.header.title}" (${code}). Please choose Pokémon Black 2 or White 2 (or Black / White).`)
  }
  onProgress('Reading the Pokémon pictures…', 0.05)
  const narc = await nds.get(SPRITE_NARC)
  let count = 0
  count = await decodeAllSprites(narc, (d, t) => onProgress(`Converting Pokémon ${d} of ${t}…`, 0.1 + 0.88 * (d / t)), (k, b) => put(`sprite:${k}`, b))
  onProgress('Reading the island map…', 0.985)
  await put('world', await extractWorldData(nds, WORLD_WINDOW))
  const meta: RomMeta = { title: nds.header.title, gameCode: code, sprites: count, version: VERSION }
  await put(META_KEY, meta)
  onProgress('Done!', 1)
  return meta
}

const urlCache = new Map<string, string>()

/** A picture address for a Pokémon from the player's game file, or null if it is not (yet) imported. */
export async function romSpriteUrl(dex: number, back: boolean, shiny: boolean): Promise<string | null> {
  const key = spriteKey(dex, back, shiny)
  const hit = urlCache.get(key)
  if (hit) return hit
  try {
    const blob = await get<Blob>(`sprite:${key}`)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(key, url)
    return url
  } catch {
    return null
  }
}

export async function clearRom(): Promise<void> {
  const d = await db()
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => res()
  })
  d.close()
  urlCache.clear()
}

