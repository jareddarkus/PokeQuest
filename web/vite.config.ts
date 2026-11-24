import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Developer test server only: lets the local test page read the game file that stays on the developer's Desktop.
// Set POKEQUEST_DEV_ROM to the path of the .nds file. This route does not exist in the published website.
function devRom() {
  return {
    name: 'pokequest-dev-rom',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      const path = process.env.POKEQUEST_DEV_ROM
      server.middlewares.use((req, res, next) => {
        if (!path || !fs.existsSync(path)) return next()
        const size = fs.statSync(path).size
        if (req.url === '/__dev_rom_info') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ size }))
          return
        }
        if (req.url === '/__dev_rom') {
          const m = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range ?? ''))
          const start = m ? Number(m[1]) : 0
          const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', String(end - start + 1))
          res.setHeader('Content-Type', 'application/octet-stream')
          fs.createReadStream(path, { start, end }).pipe(res)
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/PokeQuest/', // GitHub Pages serves the site under /PokeQuest/
  plugins: [react(), devRom()],
})
