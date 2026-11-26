// The sound archive of Pokémon Black 2 / White 2 ("swan_sound_data.sdat", ~90 MB). It holds songs (SSEQ), instrument banks (SBNK)
// and sample archives (SWAR). We only copy the few songs the game plays, plus the instruments and samples they need.
import type { NdsFile } from './nds'

export const SDAT_PATH = 'swan_sound_data.sdat'

/** The songs the game uses: our name -> the name of the song in the sound archive. */
export const SONGS: Record<string, string> = {
  title: 'SEQ_BGM_TITLE',
  field1: 'SEQ_BGM_R_A',
  field2: 'SEQ_BGM_R_B_SU',
  field3: 'SEQ_BGM_R_C_SU',
  center: 'SEQ_BGM_POKECEN',
  gym: 'SEQ_BGM_GYM',
  wild: 'SEQ_BGM_VS_NORAPOKE',
  wildStrong: 'SEQ_BGM_VS_TSUYOPOKE',
  trainer: 'SEQ_BGM_VS_TRAINER',
  gymLeader: 'SEQ_BGM_VS_GYMLEADER',
  win: 'SEQ_BGM_WIN1',
  caught: 'SEQ_ME_POKEGET',
}

/** Short sound effects of the game (menus, battle). */
export const SOUNDS: Record<string, string> = {
  select: 'SEQ_SE_SELECT1', decide: 'SEQ_SE_DECIDE1', cancel: 'SEQ_SE_CANCEL1', open: 'SEQ_SE_OPEN1', close: 'SEQ_SE_CLOSE1',
  hitStrong: 'SEQ_SE_KOUKA_H', hit: 'SEQ_SE_KOUKA_M', hitWeak: 'SEQ_SE_KOUKA_L',
  throw: 'SEQ_SE_NAGERU', shake: 'SEQ_SE_BOWA1', click: 'SEQ_SE_KON', run: 'SEQ_SE_NIGERU', faint: 'SEQ_SE_DEAD',
  exp: 'SEQ_SE_EXP', lvup: 'SEQ_SE_LVUP', heal: 'SEQ_SE_RECOVERY', lowhp: 'SEQ_SE_HINSHI', getting: 'SEQ_SE_GETTING', beep: 'SEQ_SE_BEEP',
}

export interface SongInfo { seq: number; bank: number; waves: number[]; vol: number }
export type MusicIndex = Record<string, SongInfo>

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8)
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0
const cstr = (d: Uint8Array, o: number) => { let e = o; while (d[e] && e < o + 64) e++; return String.fromCharCode(...d.subarray(o, e)) }

/** Copies the needed songs out of the sound archive. `put` stores one file under `music:<id>`. */
export async function extractMusic(nds: NdsFile, put: (id: number, data: Uint8Array) => Promise<void>): Promise<MusicIndex> {
  const head = await nds.getRange(SDAT_PATH, 0, 0x10 + 8 * 4)
  const symb = u32(head, 0x10), info = u32(head, 0x18), fat = u32(head, 0x20), fileOff = u32(head, 0x28)
  const tables = await nds.getRange(SDAT_PATH, 0, fileOff) // names + records + file table (about 280 KB)
  // names of the songs
  const seqNames = u32(tables, symb + 8)
  const count = u32(tables, symb + seqNames)
  const byName = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const no = u32(tables, symb + seqNames + 4 + i * 4)
    if (no) byName.set(cstr(tables, symb + no), i)
  }
  const rec = (group: number, i: number) => {
    const list = info + u32(tables, info + 8 + group * 4)
    return info + u32(tables, list + 4 + i * 4)
  }
  const fileRange = (id: number): [number, number] => [u32(tables, fat + 12 + id * 16), u32(tables, fat + 12 + id * 16 + 4)]
  const index: MusicIndex = {}
  const saved = new Set<number>()
  const save = async (id: number) => {
    if (saved.has(id)) return
    saved.add(id)
    const [off, size] = fileRange(id)
    await put(id, await nds.getRange(SDAT_PATH, off, size))
  }
  const addSeq = async (key: string, sid: number, bankOverride?: { seqFile: number; bankId: number }) => {
    const r = rec(0, sid)
    const seqFile = bankOverride ? bankOverride.seqFile : u16(tables, r)
    const bankId = bankOverride ? bankOverride.bankId : u16(tables, r + 4)
    const vol = tables[r + 6]
    const br = rec(2, bankId)
    const bankFile = u16(tables, br)
    const waves: number[] = []
    for (let k = 0; k < 4; k++) {
      const w = u16(tables, br + 4 + k * 2)
      waves.push(w === 0xffff ? -1 : u16(tables, rec(3, w)))
    }
    await save(seqFile)
    await save(bankFile)
    for (const w of waves) if (w >= 0) await save(w)
    index[key] = { seq: seqFile, bank: bankFile, waves, vol }
  }
  for (const [key, name] of Object.entries(SONGS)) {
    const sid = byName.get(name)
    if (sid !== undefined) await addSeq(key, sid)
  }
  for (const [key, name] of Object.entries(SOUNDS)) {
    const sid = byName.get(name)
    if (sid !== undefined) await addSeq(`se:${key}`, sid)
  }
  // the sound of every move that has one: SEQ_SE_W<move number>_<part>; we keep the first part
  const moveSeq = new Map<number, [string, number]>()
  for (const [name, sid] of byName) {
    const m = /^SEQ_SE_W(\d{3})_(\d\d)$/.exec(name)
    if (!m) continue
    const n = Number(m[1])
    const cur = moveSeq.get(n)
    if (!cur || name < cur[0]) moveSeq.set(n, [name, sid])
  }
  for (const [n, [, sid]] of moveSeq) await addSeq(`mv:${n}`, sid)
  // the game's field sound effects (SEQ_SE_FLD_nn: walking in grass, bumping into a wall ...) and battle sounds (SEQ_SE_BE_SE_nn)
  for (const [name, sid] of byName) {
    const f = /^SEQ_SE_FLD_(\d+)$/.exec(name) ?? /^SEQ_SE_(KAIDAN|WALL_HIT|DANSA)$/.exec(name)
    if (f) await addSeq(`fld:${f[1]}`, sid)
    const b = /^SEQ_SE_BE_SE_(\d+)$/.exec(name)
    if (b) await addSeq(`be:${Number(b[1])}`, sid)
  }
  // every move sound part and battle sound by its sequence number: the move / effect scripts play them by number (`PlaySE`, with a delay)
  for (const [name, sid] of byName) {
    if (/^SEQ_SE_W\d{3}_\d\d$/.test(name) || /^SEQ_SE_BE_SE_/.test(name) || /^SEQ_SE_KOUKA_[HML]$/.test(name)) await addSeq(`seq:${sid}`, sid)
  }
  // Pokémon cries: every Pokémon has its own instrument bank (BANK_PV001... / BANK_PMWB_494...) played by the one song SEQ_PV
  const bankNames = u32(tables, symb + 8 + 2 * 4)
  const bcount = u32(tables, symb + bankNames)
  const pv = byName.get('SEQ_PV')
  if (pv !== undefined) {
    const pvSeqFile = u16(tables, rec(0, pv))
    for (let i = 0; i < bcount; i++) {
      // the banks are in the order of the national numbers (bank 1 = Bulbasaur ... bank 649 = Genesect). Their NAMES of the new Pokémon (BANK_PMWB_5xx) are the game's old development numbers, so they are not used.
      const no = u32(tables, symb + bankNames + 4 + i * 4)
      if (!no || i < 1 || i > 649) continue
      if (/^BANK_(PV|PMWB)_?\d{3}/.test(cstr(tables, symb + no))) await addSeq(`cry:${i}`, pv, { seqFile: pvSeqFile, bankId: i })
    }
  }
  return index
}
