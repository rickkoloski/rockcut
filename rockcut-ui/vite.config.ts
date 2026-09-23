import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const isDocker = !!process.env.DOCKER_BUILD

// In Docker, datagrid-extended source is copied to .datagrid-extended-src/
// In dev, it's resolved from the shared/ checkout placed as a sibling of rockcut/
const datagridExtendedPath = isDocker
  ? path.resolve(__dirname, '.datagrid-extended-src')
  : path.resolve(__dirname, '../../shared/ui-components/datagrid-extended/src/lib')

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
        orientation: 'portrait',
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
    watch: {
      ignored: ['!**/node_modules/datagrid-extended/**'],
    },
    fs: {
      allow: [
        path.resolve(__dirname),
        ...(!isDocker ? [path.resolve(__dirname, '../../shared/ui-components/datagrid-extended')] : []),
      ],
    },
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
