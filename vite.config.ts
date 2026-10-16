import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { version } from './package.json'

export default defineConfig({
  base: './',
  // Single source of truth for the app version — injected from package.json at build time
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    open: false  // Electron opens the window, not the browser
  }
})
