// Animated Pokémon pictures from Pokémon Black 2 / White 2 (archive a/0/0/4, 20 files per Pokémon).
// A Pokémon is built from about 10 body parts (cells). A table says where each part sits (multicell), and each part has
// its own little sequence of moving / squashing / turning. This file reads those tables and plays them.
import { decompress } from './nds'

type Rgb = [number, number, number]
const u16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true)
const s16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt16(o, true)
const u32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(o, true)
const s32 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getInt32(o, true)
const tagAt = (d: Uint8Array, tag: string): number => {
  outer: for (let i = 0; i + tag.length <= d.length; i++) {
    for (let k = 0; k < tag.length; k++) if (d[i + k] !== tag.charCodeAt(k)) continue outer
    return i
  }
  return -1
}

interface Oam { x: number; y: number; w: number; h: number; hf: boolean; vf: boolean; tile: number }
const SIZES = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]

function parseCells(d: Uint8Array): Oam[][] {
  const k = tagAt(d, 'KBEC')
  const count = u16(d, k + 8)
  const ext = u16(d, k + 10)
  const base = k + 8 + u32(d, k + 12)
  const stride = ext ? 16 : 8
  const heads: Array<[number, number]> = []
  for (let i = 0; i < count; i++) heads.push([u16(d, base + i * stride), u32(d, base + i * stride + 4)])
  const oamBase = base + count * stride
  return heads.map(([n, off]) => {
    const list: Oam[] = []
    for (let j = 0; j < n; j++) {
      const o = oamBase + off + j * 6
      const a0 = u16(d, o), a1 = u16(d, o + 2), a2 = u16(d, o + 4)
      let y = a0 & 0xff; if (y > 127) y -= 256
      let x = a1 & 0x1ff; if (x > 255) x -= 512
      const [w, h] = SIZES[a0 >> 14][a1 >> 14]
      // a part drawn with the 'rotate/scale + double size' flags sits in a box twice as big, so the picture is centred in it
      if (((a0 >> 8) & 1) === 1 && ((a0 >> 9) & 1) === 1) { x += w / 2; y += h / 2 }
      list.push({ x, y, w, h, hf: ((a1 >> 12) & 1) === 1, vf: ((a1 >> 13) & 1) === 1, tile: a2 & 0x3ff })
    }
    return list
  })
}

interface Frame { idx: number; tx: number; ty: number; rot: number; sx: number; sy: number; dur: number }
interface Seq { kind: number; frames: Frame[]; total: number }

function parseAnimBank(d: Uint8Array): Seq[] {
  const k = tagAt(d, 'KNBA')
  const base = k + 8
  const numSeq = u16(d, base)
  const offSeq = u32(d, base + 4), offFrames = u32(d, base + 8), offData = u32(d, base + 12)
  const out: Seq[] = []
  for (let i = 0; i < numSeq; i++) {
    const o = base + offSeq + i * 16
    const nf = u16(d, o)
    const kind = u32(d, o + 4) & 0xffff
    const foff = u32(d, o + 12)
    const frames: Frame[] = []
    let total = 0
    for (let f = 0; f < nf; f++) {
      const fo = base + offFrames + foff + f * 8
      const dataOff = u32(d, fo)
      const dur = Math.max(1, u16(d, fo + 4))
      const dp = base + offData + dataOff
      let fr: Frame
      if (kind === 1) fr = { idx: u16(d, dp), rot: u16(d, dp + 2), sx: s32(d, dp + 4) / 4096, sy: s32(d, dp + 8) / 4096, tx: s16(d, dp + 12), ty: s16(d, dp + 14), dur }
      else if (kind === 2) fr = { idx: u16(d, dp), rot: 0, sx: 1, sy: 1, tx: s16(d, dp + 4), ty: s16(d, dp + 6), dur }
      else fr = { idx: u16(d, dp), rot: 0, sx: 1, sy: 1, tx: 0, ty: 0, dur }
      frames.push(fr)
      total += dur
    }
    out.push({ kind, frames, total })
  }
  return out
}

interface Node { anim: number; x: number; y: number }
function parseMulticells(d: Uint8Array): Node[][] {
  const k = tagAt(d, 'KBCM')
  const base = k + 8
  const n = u16(d, base)
  const off1 = u32(d, base + 4), off2 = u32(d, base + 8)
  const out: Node[][] = []
  for (let i = 0; i < n; i++) {
    const nn = u16(d, base + off1 + i * 8)
    const noff = u32(d, base + off1 + i * 8 + 4)
    const nodes: Node[] = []
    for (let j = 0; j < nn; j++) {
      const o = base + off2 + noff + j * 8
      nodes.push({ anim: u16(d, o), x: s16(d, o + 2), y: s16(d, o + 4) })
    }
    out.push(nodes)
  }
  return out
}

function readChr(d: Uint8Array): { w: number; h: number; px: Uint8Array } {
  const p = tagAt(d, 'RAHC')
  let th = u16(d, p + 8), tw = u16(d, p + 10)
  const size = u32(d, p + 24)
  const px = d.subarray(p + 32, p + 32 + size)
  if (!tw || tw === 0xffff || !th || th === 0xffff) { tw = 32; th = Math.ceil((px.length * 2) / 64 / tw) }
  return { w: tw * 8, h: th * 8, px }
}

function readPalette(d0: Uint8Array): Rgb[] {
  const d = decompress(d0)
  const p = tagAt(d, 'TTLP')
  const n = u32(d, p + 16)
  const out: Rgb[] = []
  for (let k = 0; k + 1 < Math.min(n, 32); k += 2) {
    const v = u16(d, p + 24 + k)
    const c = (x: number) => (x << 3) | (x >> 2)
    out.push([c(v & 31), c((v >> 5) & 31), c((v >> 10) & 31)])
  }
  return out
}

/** the 96 x 96 still picture of a Pokémon as palette numbers (same layout as sprites.ts) */
function stillIndices(d0: Uint8Array): Uint8Array {
  const d = decompress(d0)
  const tiles = readChr(d).px
  const out = new Uint8Array(96 * 96)
  const blocks: Array<[number, number, number, number]> = [[0, 0, 8, 8], [64, 0, 4, 8], [0, 64, 8, 4], [64, 64, 4, 4]]
  let t = 0
  for (const [bx, by, tw, th] of blocks) {
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const base = t * 32
        t++
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const b = tiles[base + y * 4 + (x >> 1)] ?? 0
          out[(by + ty * 8 + y) * 96 + bx + tx * 8 + x] = x & 1 ? b >> 4 : b & 15
        }
      }
    }
  }
  return out
}

interface PartCell { canvas: HTMLCanvasElement; pixels: Array<[number, number, number]> } // pixels: x, y (from cell origin), palette number

function buildCell(oams: Oam[], atlas: { w: number; h: number; px: Uint8Array }, pal: Rgb[]): PartCell {
  const SZ = 256
  const canvas = document.createElement('canvas')
  canvas.width = SZ
  canvas.height = SZ
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SZ, SZ)
  const pixels: Array<[number, number, number]> = []
  const tilesPerRow = atlas.w / 8
  for (const o of oams) {
    const tx = (o.tile % tilesPerRow) * 8
    const ty = Math.floor(o.tile / tilesPerRow) * 8
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const sx = tx + (o.hf ? o.w - 1 - x : x)
        const sy = ty + (o.vf ? o.h - 1 - y : y)
        if (sx >= atlas.w || sy >= atlas.h) continue
        const pos = sy * atlas.w + sx
        const b = atlas.px[pos >> 1] ?? 0
        const c = pos & 1 ? b >> 4 : b & 15
        if (c === 0) continue
        const X = SZ / 2 + o.x + x, Y = SZ / 2 + o.y + y
        if (X < 0 || Y < 0 || X >= SZ || Y >= SZ) continue
        const rgb = pal[c] ?? [255, 0, 255]
        const i = (Y * SZ + X) * 4
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255
        pixels.push([o.x + x, o.y + y, c])
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, pixels }
}

export interface AnimatedSprite {
  size: number
  /** draw the picture for time t (in 1/60 s) with its feet at the bottom middle of a 96 x 96 area */
  draw(ctx: CanvasRenderingContext2D, t: number): void
  loopLength: number
}

const FINE_TUNE = false // the authored layout (table position + one common offset) is used as it is

interface PartInfo { cell: PartCell; anim: Seq; node: Node; rest: [number, number] }

/**
 * files: the 20 files of one Pokémon. front = true uses the front set (files 2,4,5,6,7), otherwise the back set (11,13,14,15,16).
 * The resting position of every part is found by laying the parts over the game's own still picture.
 */
export function buildAnimatedSprite(files: Uint8Array[], base: number, front: boolean, shiny: boolean): AnimatedSprite | null {
  try {
    const o = front ? 0 : 9
    const pal = readPalette(files[base + (shiny ? 19 : 18)])
    const atlas = readChr(decompress(files[base + o + 2]))
    const cells = parseCells(decompress(files[base + o + 4]))
    const anims = parseAnimBank(decompress(files[base + o + 5]))
    const multi = parseMulticells(decompress(files[base + o + 6]))
    const timeline = parseAnimBank(decompress(files[base + o + 7]))[0]
    if (!cells.length || !multi.length || !timeline) return null
    const still = stillIndices(files[base + o])
    const cellCache = new Map<number, PartCell>()
    const cellOf = (i: number) => {
      let c = cellCache.get(i)
      if (!c) { c = buildCell(cells[i] ?? [], atlas, pal); cellCache.set(i, c) }
      return c
    }

    // find where every part of the first multicell rests, using the still picture:
    // first slide ALL parts together to the best overall position, then fine-tune each part a little
    const mc0 = multi[0]
    const prelim: Array<{ cell: PartCell; anim: Seq; node: Node; px: number; py: number }> = []
    for (const node of mc0) {
      const anim = anims[node.anim]
      if (!anim) continue
      const f0 = anim.frames[0]
      prelim.push({ cell: cellOf(f0.idx), anim, node, px: node.x + f0.tx, py: node.y + f0.ty })
    }
    const scoreAt = (cell: PartCell, ox: number, oy: number): number => {
      let s = 0
      for (const [x, y, c] of cell.pixels) {
        const X = ox + x, Y = oy + y
        if (X >= 0 && Y >= 0 && X < 96 && Y < 96 && still[Y * 96 + X] === c) s++
      }
      return s
    }
    let gBest = -1, gx = 49, gy = 71
    for (let by = 30; by <= 110; by++) {
      for (let bx = 20; bx <= 80; bx++) {
        let s = 0
        for (const p of prelim) s += scoreAt(p.cell, bx + p.px, by + p.py)
        if (s > gBest) { gBest = s; gx = bx; gy = by }
      }
    }
    // fine-tune: move the parts one at a time, in smaller and smaller steps, so that the parts laid on top of each other
    // look as much as possible like the still picture
    const pos: Array<[number, number]> = prelim.map((p) => [gx + p.px, gy + p.py])
    const comp = new Uint8Array(96 * 96)
    const error = (): number => {
      comp.fill(0)
      for (let i = 0; i < prelim.length; i++) {
        const [ox, oy] = pos[i]
        for (const [x, y, c] of prelim[i].cell.pixels) {
          const X = ox + x, Y = oy + y
          if (X >= 0 && Y >= 0 && X < 96 && Y < 96) comp[Y * 96 + X] = c
        }
      }
      let e = 0
      for (let i = 0; i < 96 * 96; i++) if (comp[i] !== still[i]) e++
      return e
    }
    let cur = error()
    for (const step of FINE_TUNE ? [8, 4, 2, 1, 1] : []) {
      for (let i = 0; i < prelim.length; i++) {
        let improved = true
        while (improved) {
          improved = false
          for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            pos[i][0] += dx; pos[i][1] += dy
            const e = error()
            if (e < cur) { cur = e; improved = true } else { pos[i][0] -= dx; pos[i][1] -= dy }
          }
        }
      }
    }
    const parts: PartInfo[] = prelim.map((p, i) => ({ cell: p.cell, anim: p.anim, node: p.node, rest: [pos[i][0], pos[i][1]] as [number, number] }))
    if ((globalThis as { __pqDebug?: boolean }).__pqDebug) console.log('PARTS', base / 20, front ? 'front' : 'back', JSON.stringify({ g: [gx, gy], score: gBest, parts: parts.map((p) => ({ anim: p.node.anim, cell: p.anim.frames[0].idx, kind: p.anim.kind, node: [p.node.x, p.node.y], rest: p.rest, px: p.cell.pixels.length })) }))
    const restByAnim = new Map<number, [number, number]>(parts.map((p) => [p.node.anim, p.rest]))
    const total = Math.max(1, timeline.total)
    const frameAt = (s: Seq, t: number): Frame => {
      let tt = t % Math.max(1, s.total)
      for (const f of s.frames) { if (tt < f.dur) return f; tt -= f.dur }
      return s.frames[s.frames.length - 1]
    }
    const partsFor = (mcIdx: number): PartInfo[] => {
      if (mcIdx === 0 || !multi[mcIdx]) return parts
      // other poses: keep the same parts, moved by how much their table positions differ
      return multi[mcIdx].map((node) => {
        const anim = anims[node.anim]
        if (!anim) return null
        const f0 = anim.frames[0]
        const cell = cellOf(f0.idx)
        const same = parts.find((p) => anims[p.node.anim]?.frames[0].idx === f0.idx)
        const rest: [number, number] = same ? [same.rest[0] + (node.x - same.node.x), same.rest[1] + (node.y - same.node.y)] : [49 + node.x, 71 + node.y]
        return { cell, anim, node, rest }
      }).filter((p): p is PartInfo => p !== null)
    }
    void restByAnim
    return {
      size: 96,
      loopLength: total,
      draw(ctx, t) {
        // which pose of the parts is shown right now
        let tt = t % total
        let mcIdx = 0
        for (const f of timeline.frames) { if (tt < f.dur) { mcIdx = f.idx; break } tt -= f.dur }
        ctx.imageSmoothingEnabled = false
        for (const p of partsFor(mcIdx)) {
          const f = frameAt(p.anim, t)
          const f0 = p.anim.frames[0]
          ctx.save()
          ctx.translate(Math.round(p.rest[0] + (f.tx - f0.tx)), Math.round(p.rest[1] + (f.ty - f0.ty)))
          if (f.rot) ctx.rotate((f.rot / 65536) * Math.PI * 2)
          if (f.sx !== 1 || f.sy !== 1) ctx.scale(f.sx, f.sy)
          const cell = f.idx === f0.idx ? p.cell : cellOf(f.idx)
          ctx.drawImage(cell.canvas, -128, -128)
          ctx.restore()
        }
      },
    }
  } catch {
    return null
  }
}
