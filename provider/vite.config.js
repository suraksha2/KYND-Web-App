import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/provider/',
  build: { outDir: 'dist' },
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/images': { target: api, changeOrigin: true },
    },
  },
})
