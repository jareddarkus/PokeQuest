// Full-screen backgrounds of the game's own menus (found with the community file list of Project Pokémon / PlatinumMaster):
//   a/0/8/7 "inventory buttons and icons for item types": file 2 / 5 / 7 = Bag background maps (red / blue / dark red), tiles 0 / 3 / 6, colours 1 / 4 / 8.
//   a/0/7/7 "pokemon stats summary + ribbons": map 65 with tiles 10 and colours 1 = the stats page (black label column, white value panel, EXP row).
import { parseNarc } from './nds'
import { paletteOf } from './items'
import { renderScreen } from './commandUi'

export const BAG_NARC = 'a/0/8/7'
export const SUMMARY_NARC = 'a/0/7/7'

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))

function top(c: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = 256; out.height = 192
  out.getContext('2d')!.drawImage(c, 0, 0)
  return out
}

/** stores screen:bag:red, screen:bag:blue, screen:bag:dark, screen:sum:stats (256 x 192 each) */
export async function decodeScreens(bagNarc: Uint8Array, sumNarc: Uint8Array, put: (name: string, b: Blob) => Promise<void>): Promise<number> {
  let n = 0
  const jobs: Array<[string, Uint8Array[], number, number, number]> = []
  const bag = parseNarc(bagNarc), sum = parseNarc(sumNarc)
  jobs.push(['screen:bag:red', bag, 2, 0, 1], ['screen:bag:blue', bag, 5, 3, 4], ['screen:bag:dark', bag, 7, 6, 8], ['screen:sum:stats', sum, 65, 10, 1])
  for (const [name, files, scr, chr, pal] of jobs) {
    const colours = paletteOf(files[pal])
    if (!colours) continue
    const c = renderScreen(files[scr], files[chr], colours)
    if (!c) continue
    const b = await toBlob(top(c))
    if (b) { await put(name, b); n++ }
  }
  return n
}
