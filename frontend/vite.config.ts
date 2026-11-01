import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The browser tests give each lane's Vite its own cache (playwright.config.ts).
  cacheDir: process.env.VITE_CACHE_DIR,
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080' },
  },
})
