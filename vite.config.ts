/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served at https://timesnapx.github.io/loading-dock-runner/ — the service worker lives under
// /loading-dock-runner/ with that scope only, so it never controls the other apps on this origin.
export default defineConfig({
  base: '/loading-dock-runner/',
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      scope: '/loading-dock-runner/',
      filename: 'sw.js',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', '.nojekyll'],
      manifest: {
        id: '/loading-dock-runner/',
        name: 'Loading Dock Runner',
        short_name: 'Dock Runner',
        description: 'Liquorland SEQ loading docks + trip tracker with store arrival log. For TimeSnap / BevChain drivers.',
        start_url: '/loading-dock-runner/',
        scope: '/loading-dock-runner/',
        display: 'standalone',
        lang: 'en-AU',
        orientation: 'portrait',
        background_color: '#0f1410',
        theme_color: '#0f1410',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        cacheId: 'loading-dock-runner',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/loading-dock-runner\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/([abc]\.)?tile\.openstreetmap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ldr-osm-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
