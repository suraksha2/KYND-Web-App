import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src')

const api = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/superadmin/',
  // Kept from the Next.js app so the ported pages' "@/..." imports still resolve.
  resolve: { alias: { '@': src } },
  build: { outDir: 'dist' },
  server: {
    host: true,
    port: 5177,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/images': { target: api, changeOrigin: true },
    },
  },
})
