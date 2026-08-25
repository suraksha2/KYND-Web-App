import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const api = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/admin/',
  build: { outDir: 'dist' },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/images': { target: api, changeOrigin: true },
    },
  },
})
