// Reads a Nintendo DS game file (.nds) on the player's own computer. Nothing is uploaded anywhere.

export interface NdsHeader {
  title: string
  gameCode: string
}

/** Anything we can read bytes from: a File the player picked (or, on the developer's test server only, a slice reader). */
export interface RomSource {
  size: number
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> }
}

export class NdsFile {
  header!: NdsHeader
  private files = new Map<string, [number, number]>()
  private file: RomSource

  constructor(file: RomSource) {
    this.file = file
  }

  private async read(offset: number, length: number): Promise<Uint8Array> {
    return new Uint8Array(await this.file.slice(offset, offset + length).arrayBuffer())
  }

  async open(): Promise<void> {
    const h = await this.read(0, 0x200)
    const dv = new DataView(h.buffer)
    const ascii = (a: number, n: number) => String.fromCharCode(...h.slice(a, a + n)).replace(/\0+$/, '')
    this.header = { title: ascii(0, 12), gameCode: ascii(12, 4) }
    const fntOff = dv.getUint32(0x40, true)
    const fntSize = dv.getUint32(0x44, true)
    const fatOff = dv.getUint32(0x48, true)
    const fatSize = dv.getUint32(0x4c, true)
    if (fntSize === 0 || fatSize === 0 || fntOff > this.file.size) throw new Error('This does not look like a Nintendo DS game file.')
    const fnt = await this.read(fntOff, fntSize)
    const fat = await this.read(fatOff, fatSize)
    const fv = new DataView(fnt.buffer)
    const av = new DataView(fat.buffer)
    const walk = (dirId: number, prefix: string) => {
      const entry = (dirId & 0xfff) * 8
      let p = fv.getUint32(entry, true)
      let fileId = fv.getUint16(entry + 4, true)
      for (;;) {
        const t = fnt[p++]
        if (t === 0) break
        const len = t & 0x7f
        const name = String.fromCharCode(...fnt.slice(p, p + len))
        p += len
        if (t & 0x80) {
          const sub = fv.getUint16(p, true)
          p += 2
          walk(sub, `${prefix}${name}/`)
        } else {
          this.files.set(prefix + name, [av.getUint32(fileId * 8, true), av.getUint32(fileId * 8 + 4, true)])
          fileId++
        }
      }
    }
    walk(0xf000, '')
  }

  has(path: string): boolean {
    return this.files.has(path)
  }

  async get(path: string): Promise<Uint8Array> {
    const f = this.files.get(path)
    if (!f) throw new Error(`The game file has no "${path}" (is it Pokémon Black 2 / White 2?)`)
    return this.read(f[0], f[1] - f[0])
  }
}

// ---------------------------------------------------------------- archives and compression
/** A "NARC" is a folder of numbered files stored as one file. */
export function parseNarc(data: Uint8Array): Uint8Array[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const tag = (o: number) => String.fromCharCode(data[o], data[o + 1], data[o + 2], data[o + 3])
  if (tag(0) !== 'NARC') throw new Error('Not a NARC archive')
  let pos = dv.getUint16(0xc, true)
  if (tag(pos) !== 'BTAF') throw new Error('Bad NARC')
  const fatSize = dv.getUint32(pos + 4, true)
  const count = dv.getUint16(pos + 8, true)
  const entries: Array<[number, number]> = []
  for (let i = 0; i < count; i++) entries.push([dv.getUint32(pos + 12 + i * 8, true), dv.getUint32(pos + 16 + i * 8, true)])
  pos += fatSize
  const fntSize = dv.getUint32(pos + 4, true)
  pos += fntSize
  const base = pos + 8
  return entries.map(([s, e]) => data.subarray(base + s, base + e))
}

/** Nintendo LZ77 (type 0x10) and the extended version (type 0x11). */
export function decompress(d: Uint8Array): Uint8Array {
  if (d.length === 0) return d
  const type = d[0]
  if (type !== 0x10 && type !== 0x11) return d
  let size = d[1] | (d[2] << 8) | (d[3] << 16)
  let i = 4
  if (size === 0) {
    size = new DataView(d.buffer, d.byteOffset).getUint32(4, true)
    i = 8
  }
  const out = new Uint8Array(size)
  let o = 0
  while (o < size) {
    const flags = d[i++]
    for (let b = 0; b < 8 && o < size; b++) {
      if (flags & (0x80 >> b)) {
        let len: number
        let disp: number
        if (type === 0x10) {
          const x = (d[i] << 8) | d[i + 1]
          i += 2
          len = (x >> 12) + 3
          disp = (x & 0xfff) + 1
        } else {
          const b0 = d[i++]
          const t = b0 >> 4
          if (t === 0) {
            const b1 = d[i++]
            const b2 = d[i++]
            len = (((b0 & 0xf) << 4) | (b1 >> 4)) + 0x11
            disp = (((b1 & 0xf) << 8) | b2) + 1
          } else if (t === 1) {
            const b1 = d[i++]
            const b2 = d[i++]
            const b3 = d[i++]
            len = (((b0 & 0xf) << 12) | (b1 << 4) | (b2 >> 4)) + 0x111
            disp = (((b2 & 0xf) << 8) | b3) + 1
          } else {
            const b1 = d[i++]
            len = t + 1
            disp = (((b0 & 0xf) << 8) | b1) + 1
          }
        }
        for (let k = 0; k < len && o < size; k++) {
          out[o] = out[o - disp]
          o++
        }
      } else {
        out[o++] = d[i++]
      }
    }
  }
  return out
}
