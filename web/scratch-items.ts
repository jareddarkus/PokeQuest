import { NdsFile, parseNarc, decompress } from './src/rom/nds'
import { ITEM_ICON_NARC } from './src/rom/items'
import fs from 'node:fs'
const path = process.env.POKEQUEST_DEV_ROM!
const fd = fs.openSync(path, 'r'); const size = fs.statSync(path).size
const src = { size, slice: (a: number, b: number) => ({ arrayBuffer: async () => { const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) } }) }
const nds = new NdsFile(src as never); await nds.open()
const files = parseNarc(await nds.get(ITEM_ICON_NARC))
const tag = (f: Uint8Array) => { try { const d = decompress(f); const t: string[] = []; for (const k of ['RAHC', 'TTLP', 'RGCN', 'RLCN']) { for (let i = 0; i + 4 <= d.length; i++) if (String.fromCharCode(d[i], d[i+1], d[i+2], d[i+3]) === k) { t.push(k); break } } return `${f.length}:${t.join('+')}` } catch { return `${f.length}:err` } }
console.log('count', files.length)
for (const n of [151,152,153,154,155,156,157,158,159,160,161,162,240,241,242,243,244, 115,116,117,118,119]) console.log(n, tag(files[n]))
