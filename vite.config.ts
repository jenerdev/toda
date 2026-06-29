import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Build id shown in-app so you can confirm which deploy you're on. On Vercel
// this is the git commit SHA; locally it falls back to "dev". Read via globalThis
// so we don't need @types/node just for process.env.
const env =
  (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env ?? {}
const buildId = (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'dev'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not autoUpdate): a new build waits and we show a "Reload"
      // banner (see ReloadPrompt) instead of silently swapping — so it's always
      // visible which version you're on and updating is one explicit tap.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      // Pull our Web Push handlers (push / notificationclick) into the generated
      // Workbox service worker so notifications work with the app closed.
      workbox: {
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'MotoQueue',
        short_name: 'MotoQueue',
        description: 'Book the next motorcycle in your subdivision queue.',
        theme_color: '#0d9488',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
