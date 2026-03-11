import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    open: false, // Disable auto-open in browser for Electron workflow
    proxy: {
      '/tv-scan': {
        target: 'https://scanner.tradingview.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tv-scan/, '')
      }
    }
  }
})
