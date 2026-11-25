// Where the pictures taken from the player's own game file are kept: the browser's private storage on THEIR computer.
// They are never uploaded, and never put into the website or the database.
import type { Progress } from '../ui/ProgressBar'
import { NdsFile, parseNarc, type RomSource } from './nds'
import { SPRITE_NARC, decodeAllSprites, spriteKey } from './sprites'
import { WORLD_WINDOW, extractWorldData, type WorldData } from './worldData'
import { ITEM_ICON_NARC, decodeItemIcons } from './items'
import { BATTLE_NARC } from './battleScene'
import { UI_NARC, decodeBattleUi, decodePlates } from './plates'
import { TRAINER_NARCS, extractColors, snapAll, type RomColors } from './colors'
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../game/character'
import { EMOTE_NARC, OVERWORLD_NARC, decodeEmotes, decodeFieldBall, decodeOverworld } from './overworld'
import { ICON_NARC, decodeIcons } from './icons'
import { FX_NARC, decodeFx } from './fx'
import { decodeHpBoxes } from './hpBox'
import { TITLE_NARC, titleFiles } from './titleDragon'
import { BAG_NARC, BOX_NARC, PARTY_NARC, PC_NARC, SUMMARY_NARC, decodeScreens } from './screens'
import { COMMAND_NARC, decodeCommandUi } from './commandUi'
import { MENU_NARC, decodeMenuUi } from './menuUi'
import { extractMusic, type MusicIndex } from './sdat'
import { owList, registerBall, registerEmote, registerOw } from '../game/ow'
import { decodeFollowers } from './followerSprites'
import { readFonts, type NftrFont } from './font'
import { FOLLOWER_FILES } from '../data/followerMap'

const DB = 'pokequest-rom'
const STORE = 'assets'
const META_KEY = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null
/** One connection for the whole session (opening the database again for every picture made Safari / Macs crawl or freeze). */
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbPromise = null }; res(r.result) }
      r.onerror = () => { dbPromise = null; rej(r.error) }
    })
  }
  return dbPromise
}

let putCount = 0
async function put(key: string, value: unknown): Promise<void> {
  if ((++putCount & 15) === 0) await new Promise((r) => setTimeout(r)) // let the page breathe (the progress bar keeps moving, the browser does not look frozen)
  const d = await db()
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db()
  const v = await new Promise<T | undefined>((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key)
    r.onsuccess = () => res(r.result as T | undefined)
    r.onerror = () => rej(r.error)
  })
  return v
}

export interface RomMeta { title: string; gameCode: string; sprites: number; version: number }
/** Loads the walking characters (kept in memory for the game). */
let owLoaded = false
export async function loadOverworldSprites(): Promise<void> {
  if (owLoaded) return
  try {
    const list = await get<number[]>('ow:list')
    if (!list) return
    for (const idx of list) {
      const blob = await get<Blob>(`ow:${idx}`)
      if (!blob) continue
      const img = new Image()
      const url = URL.createObjectURL(blob)
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
      registerOw(idx, img)
    }
    owList.sort((a, b) => a - b)
    const ballBlob = await get<Blob>('field:ball')
    if (ballBlob) {
      const img = new Image()
      const url = URL.createObjectURL(ballBlob)
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
      registerBall(img)
    }
    for (const idx of (await get<number[]>('emote:list')) ?? []) {
      const blob = await get<Blob>(`emote:${idx}`)
      if (!blob) continue
      const img = new Image()
      const url = URL.createObjectURL(blob)
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
      registerEmote(idx, img)
    }
    owLoaded = true
  } catch { /* the game falls back to the drawn characters */ }
}

const VERSION = 46 // 46 = ... + field / battle sound effects;  45 = ... + BAG / POKÉMON buttons as in the game (no mirrored ends);  44 = ... + the Poké Ball model;  43 = 43 = ... + the game's own HP-box digits / gender signs / gauge pieces and team balls;  42 = ... + trainer pictures;  41 = ... + the game's fonts;  40 = ... + walking Pokémon (followers);  39 = ... + no X pictures / one-direction objects among the characters;  38 = ... + no X inside characters;  37 = ... + title dragon;  36 = ... + Elixir icon;  35 = ... + no placeholder characters;  34 = ... + message frames;  33 = ... + PC wallpapers;  32 = ... + party panels, summary pages;  31 = ... + Bag and Summary backgrounds;  30 = ... + HP boxes;  29 = ... + potion/vitamin colours;  28 = ... + move-effect shapes;  27 = ... + all item icons by file;  26 = ... + item ball;  25 = ... + running pictures;  24 = ... + water animation data;  23 = ... + sound effects and cries;  22 = ... + menu backdrops;  21 = ... + music;  20 = gym buildings;  19 = buildings fixed;  18 = ... + buildings;  17 = ... + emote bubbles;  16 = ... + start menu art;  15 = battle buttons rebuilt;  14 = ... + battle command buttons;  13 = ... + menu icons;  12 = ... + walking characters;  11 = ... + the game's own trainer colours

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
    if (m && m.version === VERSION) { await applyRomColors(); await loadOverworldSprites() }
    return m && m.version === VERSION ? m : null
  } catch {
    return null
  }
}

/** How many files each step of the import stores (measured on a real import; only used to show "done / total", a step that stores more just shows its own count). */
const EXPECTED_FILES: Record<string, number> = { open: 1, sprites: 2596, scenery: 1, icons: 465, menus: 100, menuIcons: 649, colors: 1, walkers: 274, followers: 479, fonts: 4, effects: 27, sounds: 2411, map: 1 }

/** Reads the player's game file and stores the pictures. Returns what was found. */
export async function importRom(file: RomSource, onProgress: (p: Progress) => void): Promise<RomMeta> {
  const STEPS = 13
  let stepNo = 0
  /** Starts a step: returns a `put` that counts the files it stores and shows "done / total". */
  const step = (key: string, text: string, frac: number) => {
    stepNo++
    let n = 0
    const total = () => Math.max(EXPECTED_FILES[key] ?? 1, n)
    const report = () => onProgress({ text, frac, done: n, total: total(), step: stepNo, steps: STEPS, unit: 'files' })
    report()
    return {
      put: async (k: string, v: unknown) => { n++; if (n % 6 === 0) { report(); await new Promise((r) => setTimeout(r)) } return put(k, v) },
      end: () => { if (import.meta.env.DEV) console.info('[import]', key, n); n = Math.max(n, 1); report() },
      report,
    }
  }
  let st = step('open', 'Opening the game file…', 0.0)
  const nds = new NdsFile(file)
  await nds.open()
  const code = nds.header.gameCode
  if (!/^I[RA][ABD]/.test(code) && !/^IR[ABDE]/.test(code)) {
    throw new Error(`This is "${nds.header.title}" (${code}). Please choose Pokémon Black 2 or White 2 (or Black / White).`)
  }
  st.end()
  st = step('sprites', 'Converting the Pokémon pictures…', 0.02)
  const narc = await nds.get(SPRITE_NARC)
  await put('sprites:narc', new Blob([new Uint8Array(narc)]))
  let count = 0
  count = await decodeAllSprites(narc, (d, t) => onProgress({ text: 'Converting the Pokémon pictures…', frac: 0.02 + 0.78 * (d / t), done: d, total: t, unit: 'Pokémon', step: stepNo, steps: STEPS }), (k, b) => put(`sprite:${k}`, b))
  st.end()
  st = step('scenery', 'Reading the battle scenery…', 0.8)
  await st.put('battle:narc', new Blob([new Uint8Array(await nds.get(BATTLE_NARC))]))
  st.end()
  st = step('icons', 'Reading the item icons…', 0.81)
  await decodeItemIcons(await nds.get(ITEM_ICON_NARC), (id, b) => st.put(`item:${id}`, b))
  st.end()
  st = step('menus', 'Reading the menus and battle screens…', 0.83)
  const uiNarc = await nds.get(UI_NARC)
  await decodePlates(uiNarc, (name, b) => st.put(`plate:${name}`, b))
  await decodeBattleUi(uiNarc, (name, b) => st.put(`ui:${name}`, b))
  const commandNarc = await nds.get(COMMAND_NARC)
  await decodeCommandUi(commandNarc, (name, b) => st.put(`ui:${name}`, b))
  try { await decodeHpBoxes(parseNarc(commandNarc), /^IR[DB]/.test(code), (name, b) => st.put(`ui:${name}`, b)) } catch { /* the page draws plain boxes */ }
  await decodeMenuUi(await nds.get(MENU_NARC), (name, b) => st.put(`ui:${name}`, b))
  try { await decodeScreens(await nds.get(BAG_NARC), await nds.get(SUMMARY_NARC), await nds.get(PARTY_NARC), await nds.get(PC_NARC), await nds.get(BOX_NARC), (name, b) => st.put(`ui:${name}`, b)) } catch { /* the menus keep a plain look */ }
  st.end()
  st = step('menuIcons', 'Making the menu icons…', 0.86)
  await decodeIcons(parseNarc(await nds.get(ICON_NARC)), async (dex) => (await get<Blob>(`sprite:${spriteKey(dex, false, false)}`)) ?? null, (dex, b) => st.put(`icon:${dex}`, b))
  st.end()
  st = step('colors', 'Reading the trainer colours…', 0.88)
  const trainerNarcs: Uint8Array[] = []
  for (const p of TRAINER_NARCS) { try { trainerNarcs.push(await nds.get(p)) } catch { /* not in this version */ } }
  await st.put('colors', extractColors(trainerNarcs))
  st.end()
  st = step('walkers', 'Reading the walking characters…', 0.89)
  const owFiles = parseNarc(await nds.get(OVERWORLD_NARC))
  const ow = await decodeOverworld(owFiles, (i, b) => st.put(`ow:${i}`, b))
  const ballPic = await decodeFieldBall(owFiles)
  if (ballPic) await st.put('field:ball', ballPic)
  await st.put('ow:list', ow)
  await st.put('emote:list', await decodeEmotes(parseNarc(await nds.get(EMOTE_NARC)), (i, b) => st.put(`emote:${i}`, b)))
  st.end()
  st = step('followers', 'Reading the walking Pokémon…', 0.91)
  try { await decodeFollowers(owFiles, FOLLOWER_FILES, (k, b) => st.put(k, b)) } catch { /* followers fall back to the menu icon */ }
  st.end()
  st = step('fonts', 'Reading the fonts, balls and trainers…', 0.92)
  try { await st.put('font:narc', new Blob([new Uint8Array(await nds.get('a/0/2/3'))])) } catch { /* the page's own font is used */ }
  try { await st.put('ball:narc', new Blob([new Uint8Array(await nds.get('a/2/0/1'))])) } catch { /* the send-out ball is a plain disc */ }
  try { await st.put('trainer:front', new Blob([new Uint8Array(await nds.get('a/0/7/1'))])); await st.put('trainer:back', new Blob([new Uint8Array(await nds.get('a/0/7/2'))])) } catch { /* battles go without trainer pictures */ }
  st.end()
  st = step('effects', 'Reading the move effects and the title…', 0.93)
  try { await decodeFx(await nds.get(FX_NARC), (name, b) => st.put(`ui:fx:${name}`, b)) } catch { /* the battle uses plain flashes */ }
  try { // the 3D dragon of the title screen (two small files: the model and its skeleton animation)
    const t = titleFiles(code)
    if (t) { const tf = parseNarc(await nds.get(TITLE_NARC)); await st.put('title:model', new Blob([new Uint8Array(tf[t.model])])); await st.put('title:anim', new Blob([new Uint8Array(tf[t.anim])])) }
  } catch { /* no dragon on the title screen */ }
  st.end()
  st = step('sounds', 'Reading the music and sounds…', 0.94)
  try { await st.put('music:index', await extractMusic(nds, (id, d) => st.put(`music:${id}`, d))) } catch { /* no sound archive: the game stays quiet */ }
  st.end()
  st = step('map', 'Reading the island map…', 0.97)
  await st.put('world', await extractWorldData(nds, WORLD_WINDOW, (_t, done, total) => onProgress({ text: 'Reading the island map…', frac: 0.97 + 0.02 * (done / Math.max(1, total)), done, total, unit: 'map pieces', step: stepNo, steps: STEPS })))
  const meta: RomMeta = { title: nds.header.title, gameCode: code, sprites: count, version: VERSION }
  await put(META_KEY, meta)
  colorsApplied = false
  owLoaded = false
  musicIndex = undefined
  await applyRomColors()
  await loadOverworldSprites()
  st.end()
  onProgress({ text: 'Done!', frac: 1, step: STEPS, steps: STEPS })
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
/** A picture address for the small menu icon of a Pokémon (by Pokédex number), or null. */
export async function romIconUrl(dex: number): Promise<string | null> {
  const key = `icon:${dex}`
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
/** The list of songs that were copied from the sound archive (name -> files). */
let musicIndex: MusicIndex | null | undefined
export async function loadMusicIndex(): Promise<MusicIndex | null> {
  if (musicIndex !== undefined) return musicIndex
  try { musicIndex = (await get<MusicIndex>('music:index')) ?? null } catch { musicIndex = null }
  return musicIndex
}
export async function loadMusicFile(id: number): Promise<Uint8Array | null> {
  try { return (await get<Uint8Array>(`music:${id}`)) ?? null } catch { return null }
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
let ballRaw: Uint8Array | null | undefined
/** The game's Poké Ball model (3D, used for the thrown / hovering ball), or null. */
export async function getBallModel(): Promise<Uint8Array | null> {
  if (ballRaw !== undefined) return ballRaw
  try {
    const blob = await get<Blob>('ball:narc')
    ballRaw = blob ? parseNarc(new Uint8Array(await blob.arrayBuffer()))[0] ?? null : null
  } catch { ballRaw = null }
  return ballRaw
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
/** The files of the 3D dragon of the title screen, or null if the game file has none (or it was not imported). */
export async function loadTitleFiles(): Promise<{ model: Uint8Array; anim: Uint8Array } | null> {
  try {
    const m = await get<Blob>('title:model'), a = await get<Blob>('title:anim')
    if (!m || !a) return null
    return { model: new Uint8Array(await m.arrayBuffer()), anim: new Uint8Array(await a.arrayBuffer()) }
  } catch { return null }
}

const followerPics = new Map<number, Promise<HTMLImageElement | null>>()
/** The strip of walking pictures (up, up, down, down, left, left, right, right; 32 x 32 each) of one walking-Pokémon file, or null when not imported. */
export function loadFollowerPicture(file: number): Promise<HTMLImageElement | null> {
  let p = followerPics.get(file)
  if (!p) {
    p = (async () => {
      try {
        const blob = await get<Blob>(`pow:${file}`)
        if (!blob) return null
        const img = new Image()
        const url = URL.createObjectURL(blob)
        await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = url })
        return img.naturalWidth ? img : null
      } catch { return null }
    })()
    followerPics.set(file, p)
  }
  return p
}

let gameFonts: Promise<NftrFont[] | null> | null = null
/** The game's own fonts (main text 15 px, small 10 px, medium 13 px ...), or null when the game file is not imported (yet). */
export function loadGameFonts(): Promise<NftrFont[] | null> {
  if (!gameFonts) {
    gameFonts = (async () => {
      try {
        const blob = await get<Blob>('font:narc')
        if (!blob) return null
        const list = readFonts(parseNarc(new Uint8Array(await blob.arrayBuffer())))
        return list.length ? list : null
      } catch { return null }
    })()
  }
  return gameFonts
}

let trainerNarcs: Promise<{ front: Uint8Array[]; back: Uint8Array[] } | null> | null = null
/** The trainers' battle pictures of the game file (front: 188 trainer classes, back: the player characters), or null when not imported. */
export function loadTrainerNarcs(): Promise<{ front: Uint8Array[]; back: Uint8Array[] } | null> {
  if (!trainerNarcs) {
    trainerNarcs = (async () => {
      try {
        const f = await get<Blob>('trainer:front'), b = await get<Blob>('trainer:back')
        if (!f || !b) return null
        return { front: parseNarc(new Uint8Array(await f.arrayBuffer())), back: parseNarc(new Uint8Array(await b.arrayBuffer())) }
      } catch { return null }
    })()
  }
  return trainerNarcs
}
