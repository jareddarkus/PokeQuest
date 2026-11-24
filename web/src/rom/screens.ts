// Full-screen backgrounds of the game's own menus (found with the community file list of Project Pokémon / PlatinumMaster):
//   a/0/8/7 "inventory buttons and icons for item types": file 2 / 5 / 7 = Bag background maps (red / blue / dark red), tiles 0 / 3 / 6, colours 1 / 4 / 8.
//   a/0/7/7 "pokemon stats summary + ribbons": map 65 with tiles 10 and colours 1 = the stats page (black label column, white value panel, EXP row).
import { decompress, parseNarc } from './nds'

function find(d: Uint8Array, tag: string): number {
  for (let i = 0; i + 4 <= d.length; i++) if (String.fromCharCode(d[i], d[i + 1], d[i + 2], d[i + 3]) === tag) return i
  return -1
}
import { paletteOf } from './items'
import { crop, renderScreen } from './commandUi'

export const BAG_NARC = 'a/0/8/7'
export const SUMMARY_NARC = 'a/0/7/7'
/** a/0/7/5 "matrixy background and buttons": map 18 + tiles 12 + colours 6 = the seven party slot panels (126 x 43 pixels each) */
export const PARTY_NARC = 'a/0/7/5'
/** a/1/1/7 "PC box backgrounds": map 13 (168 x 160, banner + box area) with tiles 14..37 and colours 38..61 = the 24 box wallpapers */
export const PC_NARC = 'a/1/1/7'
/** a/0/0/5 "basic boxes and arrow": file 8 = nine tiles (3 x 3) of a message window frame, colours 1 = dark window (battle messages), 3 = white window (dialogue) */
export const BOX_NARC = 'a/0/0/5'
const PARTY_BOXES: Array<[number, number, number, number]> = [[1, 12, 126, 43], [129, 20, 126, 43], [1, 60, 126, 43], [129, 68, 126, 43], [1, 108, 126, 43], [129, 116, 126, 43], [1, 157, 126, 42]]

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))

function top(c: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = 256; out.height = 192
  out.getContext('2d')!.drawImage(c, 0, 0)
  return out
}

/** stores screen:bag:red, screen:bag:blue, screen:bag:dark, screen:sum:stats (256 x 192 each) */
export async function decodeScreens(bagNarc: Uint8Array, sumNarc: Uint8Array, partyNarc: Uint8Array, pcNarc: Uint8Array, boxNarc: Uint8Array, put: (name: string, b: Blob) => Promise<void>): Promise<number> {
  let n = 0
  const jobs: Array<[string, Uint8Array[], number, number, number]> = []
  const bag = parseNarc(bagNarc), sum = parseNarc(sumNarc)
  jobs.push(['screen:bag:red', bag, 2, 0, 1], ['screen:bag:blue', bag, 5, 3, 4], ['screen:bag:dark', bag, 7, 6, 8], ['screen:sum:stats', sum, 65, 10, 1], ['screen:sum:info', sum, 66, 12, 3], ['screen:sum:moves', sum, 75, 12, 3])
  for (const [name, files, scr, chr, pal] of jobs) {
    const colours = paletteOf(files[pal])
    if (!colours) continue
    const c = renderScreen(files[scr], files[chr], colours)
    if (!c) continue
    const b = await toBlob(top(c))
    if (b) { await put(name, b); n++ }
  }
  // the party slot panels
  const party = parseNarc(partyNarc)
  const colours = paletteOf(party[6])
  const sheet = colours ? renderScreen(party[18], party[12], colours) : null
  if (sheet) {
    for (let i = 0; i < PARTY_BOXES.length; i++) {
      const [x, y, w, h] = PARTY_BOXES[i]
      const b = await toBlob(crop(sheet, x, y, w, h))
      if (b) { await put(`screen:party:${i}`, b); n++ }
    }
  }
  // the message window frames (3 x 3 tiles, stretched by the page as a 9-slice picture)
  const boxes = parseNarc(boxNarc)
  for (const [name, pal] of [['frame:dark', 1], ['frame:white', 3]] as Array<[string, number]>) {
    const colours = paletteOf(boxes[pal])
    if (!colours) continue
    const d = decompress(boxes[8])
    const i = find(d, 'RAHC')
    if (i < 0) continue
    const px = d.subarray(i + 32)
    const c = document.createElement('canvas')
    c.width = 24; c.height = 24
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(24, 24)
    for (let t = 0; t < 9; t++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const b = px[t * 32 + y * 4 + (x >> 1)] ?? 0
      const v = x & 1 ? b >> 4 : b & 15
      const rgb = colours[v] ?? [0, 0, 0]
      const o = (((t / 3 | 0) * 8 + y) * 24 + (t % 3) * 8 + x) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const b = await toBlob(c)
    if (b) { await put(`screen:${name}`, b); n++ }
  }
  // the PC box wallpapers
  const pc = parseNarc(pcNarc)
  for (let k = 0; k < 24; k++) {
    const colours = paletteOf(pc[38 + k])
    const c = colours ? renderScreen(pc[13], pc[14 + k], colours) : null
    if (!c) continue
    const out = document.createElement('canvas')
    out.width = 168; out.height = 160
    out.getContext('2d')!.drawImage(c, 0, 0)
    const b = await toBlob(out)
    if (b) { await put(`screen:pc:${k}`, b); n++ }
  }
  return n
}
