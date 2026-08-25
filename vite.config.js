import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  build: { outDir: 'dist' },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/images': { target: api, changeOrigin: true },
      '/admin': { target: 'http://127.0.0.1:5174', changeOrigin: true, ws: true },
      '/provider': { target: 'http://127.0.0.1:5175', changeOrigin: true, ws: true },
      '/superadmin': { target: 'http://127.0.0.1:5177', changeOrigin: true, ws: true },
    },
  },
})
