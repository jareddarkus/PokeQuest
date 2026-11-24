import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/PokeQuest/', // GitHub Pages serves the site under /PokeQuest/
  plugins: [react()],
})
