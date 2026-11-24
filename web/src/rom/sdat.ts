// The sound archive of Pokémon Black 2 / White 2 ("swan_sound_data.sdat", ~90 MB). It holds songs (SSEQ), instrument banks (SBNK)
// and sample archives (SWAR). We only copy the few songs the game plays, plus the instruments and samples they need.
import type { NdsFile } from './nds'

export const SDAT_PATH = 'swan_sound_data.sdat'

/** The songs the game uses: our name -> the name of the song in the sound archive. */
export const SONGS: Record<string, string> = {
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
  for (const [key, name] of Object.entries(SONGS)) {
    const sid = byName.get(name)
    if (sid === undefined) continue
    const r = rec(0, sid)
    const seqFile = u16(tables, r), bankId = u16(tables, r + 4), vol = tables[r + 6]
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
  return index
}
