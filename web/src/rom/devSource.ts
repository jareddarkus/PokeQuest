// DEVELOPER TEST SERVER ONLY (never part of the website that friends use): reads the game file that sits on the
// developer's own Desktop through a tiny local route, so the game can be tested without clicking a file picker.
import type { RomSource } from './nds'

export async function devRomSource(): Promise<RomSource | null> {
  if (!import.meta.env.DEV) return null
  try {
    const info = await fetch('/__dev_rom_info')
    if (!info.ok) return null
    const { size } = (await info.json()) as { size: number }
    return {
      size,
      slice: (start, end) => ({
        arrayBuffer: async () => {
          const r = await fetch('/__dev_rom', { headers: { Range: `bytes=${start}-${end - 1}` } })
          return r.arrayBuffer()
        },
      }),
    }
  } catch {
    return null
  }
}
