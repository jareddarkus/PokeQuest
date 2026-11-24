// Where the pictures taken from the player's own game file are kept: the browser's private storage on THEIR computer.
// They are never uploaded, and never put into the website or the database.
import { NdsFile, parseNarc, type RomSource } from './nds'
import { SPRITE_NARC, decodeAllSprites, spriteKey } from './sprites'
import { WORLD_WINDOW, extractWorldData, type WorldData } from './worldData'
import { ITEM_ICON_NARC, decodeItemIcons } from './items'
import { BATTLE_NARC } from './battleScene'
import { UI_NARC, decodeBattleUi, decodePlates } from './plates'
import { TRAINER_NARCS, extractColors, snapAll, type RomColors } from './colors'
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../game/character'

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
const VERSION = 11 // 11 = ... + the game's own trainer colours

let colorsApplied = false
/** Makes the colour choices of the character maker use the colours the game really uses (snaps each to the nearest real one). */
export async function applyRomColors(): Promise<void> {
  if (colorsApplied) return
  try {
    const rc = await get<RomColors>('colors')
    if (!rc || rc.skin.length < 4 || rc.pool.length < 20) return
    const swap = (arr: string[], from: string[]) => { arr.splice(0, arr.length, ...snapAll(arr, from)) }
    swap(SKIN_TONES, rc.skin)
    swap(HAIR_COLORS, rc.pool)
    swap(EYE_COLORS, rc.pool)
    swap(CLOTH_COLORS, rc.pool)
    colorsApplied = true
  } catch { /* keep the built-in colours */ }
}

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
    if (m && m.version === VERSION) await applyRomColors()
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
  await put('sprites:narc', new Blob([new Uint8Array(narc)]))
  onProgress('Reading the battle scenery…', 0.97)
  await put('battle:narc', new Blob([new Uint8Array(await nds.get(BATTLE_NARC))]))
  let count = 0
  count = await decodeAllSprites(narc, (d, t) => onProgress(`Converting Pokémon ${d} of ${t}…`, 0.1 + 0.88 * (d / t)), (k, b) => put(`sprite:${k}`, b))
  onProgress('Reading the item icons…', 0.975)
  await decodeItemIcons(await nds.get(ITEM_ICON_NARC), (id, b) => put(`item:${id}`, b))
  const uiNarc = await nds.get(UI_NARC)
  await decodePlates(uiNarc, (name, b) => put(`plate:${name}`, b))
  await decodeBattleUi(uiNarc, (name, b) => put(`ui:${name}`, b))
  onProgress('Reading the trainer colours…', 0.982)
  const trainerNarcs: Uint8Array[] = []
  for (const p of TRAINER_NARCS) { try { trainerNarcs.push(await nds.get(p)) } catch { /* not in this version */ } }
  await put('colors', extractColors(trainerNarcs))
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


/** A picture address for an item icon from the player's game file (item number = the game's item id). */
export async function romItemUrl(id: number): Promise<string | null> {
  const key = `item:${id}`
  const hit = urlCache.get(key)
  if (hit) return hit
  try {
    const blob = await get<Blob>(key)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(key, url)
    return url
  } catch {
    return null
  }
}
let narcFiles: Uint8Array[] | null = null
/** The 20 files of every Pokémon (kept in the browser) so the animated pictures can be built when they are needed. */
export async function getSpriteFiles(): Promise<Uint8Array[] | null> {
  if (narcFiles) return narcFiles
  try {
    const blob = await get<Blob>('sprites:narc')
    if (!blob) return null
    narcFiles = parseNarc(new Uint8Array(await blob.arrayBuffer()))
    return narcFiles
  } catch {
    return null
  }
}
let battleFiles: Uint8Array[] | null = null
/** The battle scenery files (platform and backdrop models). */
export async function getBattleFiles(): Promise<Uint8Array[] | null> {
  if (battleFiles) return battleFiles
  try {
    const blob = await get<Blob>('battle:narc')
    if (!blob) return null
    battleFiles = parseNarc(new Uint8Array(await blob.arrayBuffer()))
    return battleFiles
  } catch {
    return null
  }
}
/** A move-type label (or the physical / special / status icon) from the player's game file. */
export async function romPlateUrl(name: string): Promise<string | null> {
  const key = `plate:${name}`
  const hit = urlCache.get(key)
  if (hit) return hit
  try {
    const blob = await get<Blob>(key)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(key, url)
    return url
  } catch {
    return null
  }
}
/** A battle-interface picture from the player's game file ("hpbar", "status:par" ...). */
export async function romUiUrl(name: string): Promise<string | null> {
  const key = `ui:${name}`
  const hit = urlCache.get(key)
  if (hit) return hit
  try {
    const blob = await get<Blob>(key)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(key, url)
    return url
  } catch {
    return null
  }
}