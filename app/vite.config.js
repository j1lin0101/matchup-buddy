import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): autoUpdate forces workbox.skipWaiting +
      // clientsClaim, which makes a new SW activate and silently reload the page on
      // its own the moment it finishes installing — bypassing our custom UpdateToast
      // entirely (onNeedRefresh never fires under autoUpdate). 'prompt' leaves the new
      // SW in the "waiting" state until the user clicks Refresh in UpdateToast, which
      // calls updateServiceWorker(true) to actually apply it.
      registerType: 'prompt',
      // favicon.svg/.ico, icons.svg, and characters.json are already picked up by
      // workbox.globPatterns below — only list assets here that aren't otherwise globbed.
      includeAssets: ['icons-pwa/apple-touch-icon.png'],
      manifest: {
        name: 'MatchupBuddy',
        short_name: 'MatchupBuddy',
        description: 'Shield safety & punish analysis for Rivals of Aether 2 and Super Smash Bros. Ultimate',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e0e12',
        theme_color: '#0e0e12',
        icons: [
          { src: '/icons-pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons-pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons-pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache every character's data + icon up front (build-time glob) so any
        // matchup works offline after one visit, not just ones the user browsed —
        // a lazy runtimeCaching-only strategy would only ever cache visited characters.
        // Recursive globs cover both games' nested data/roa2, data/ssbu, icons/roa2,
        // icons/ssbu directories under one pattern.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'data/**/*.json', 'icons/**/*.png', 'logos/*.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'matchup-data-runtime', expiration: { maxEntries: 32 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/icons/'),
            handler: 'CacheFirst',
            options: { cacheName: 'matchup-icons-runtime', expiration: { maxEntries: 32 } },
          },
        ],
      },
    }),
  ],
})
