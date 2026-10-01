import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// datagrid-extended is vendored (task 3999): the same source locally and in Docker.
const datagridExtendedPath = path.resolve(__dirname, 'vendor/datagrid-extended')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // D19 — installable PWA; D21 — custom service worker (src/sw.ts) for web push.
    // injectManifest lets us host push/notificationclick handlers alongside the
    // Workbox app-shell precache. NO API caching (schedule data is dynamic + authed).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png', 'rockcut-logo.png'],
      manifest: {
        name: 'Rockcut Scheduler',
        short_name: 'Rockcut',
        description: 'Rockcut Brewing Co — staff scheduling',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // 'any': the taproom tablets (Samsung, Chrome) are mounted landscape, and Android
        // enforces a manifest orientation on installed apps. Phones follow their own rotation.
        orientation: 'any',
        theme_color: '#5C4033',
        background_color: '#FAF6F0',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      // Don't run the service worker during `pnpm dev` (avoids cache-trapping HMR).
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    preserveSymlinks: true,
    dedupe: [
      'react',
      'react-dom',
      '@mui/material',
      '@mui/x-data-grid',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
    ],
    alias: {
      'datagrid-extended': datagridExtendedPath,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4002',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` (used to test the built PWA locally) doesn't inherit
  // server.proxy, so mirror the /api proxy here for login + data to work.
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:4002',
        changeOrigin: true,
      },
    },
  },
})
