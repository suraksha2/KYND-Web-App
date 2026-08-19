import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src')

export default defineConfig({
  plugins: [react()],
  // Kept from the Next.js app so the ported pages' "@/..." imports still resolve.
  resolve: { alias: { '@': src } },
  build: { outDir: 'dist' },
  server: { host: true, port: 5177 }
})
