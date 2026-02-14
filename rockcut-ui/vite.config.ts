import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const isDocker = !!process.env.DOCKER_BUILD

// In Docker, datagrid-extended source is copied to .datagrid-extended-src/
// In dev, it's resolved from the linked package outside the project
const datagridExtendedPath = isDocker
  ? path.resolve(__dirname, '.datagrid-extended-src')
  : path.resolve(__dirname, '../../../shared/ui-components/datagrid-extended/src/lib')

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
        ...(!isDocker ? [path.resolve(__dirname, '../../../shared/ui-components/datagrid-extended')] : []),
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
