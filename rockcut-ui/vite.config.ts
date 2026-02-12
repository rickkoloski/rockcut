import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const datagridExtendedPath = path.resolve(__dirname, '../../ui-components/datagrid-extended')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      // Resolve the linked package directly to its source
      'datagrid-extended': path.join(datagridExtendedPath, 'src/lib'),
    },
  },
  server: {
    watch: {
      ignored: ['!**/node_modules/datagrid-extended/**'],
    },
    fs: {
      allow: [
        path.resolve(__dirname),
        datagridExtendedPath,
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4002',
        changeOrigin: true,
      },
    },
  },
})
