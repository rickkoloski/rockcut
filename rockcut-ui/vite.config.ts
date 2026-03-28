import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const isDocker = !!process.env.DOCKER_BUILD

// In Docker, datagrid-extended source is copied to .datagrid-extended-src/
// In dev, it's resolved from the linked package outside the project
const datagridExtendedPath = isDocker
  ? path.resolve(__dirname, '.datagrid-extended-src')
  : path.resolve(__dirname, '../../../shared/ui-components/datagrid-extended/src/lib')

const ganttWidgetPath = isDocker
  ? path.resolve(__dirname, '.gantt-widget-src')
  : path.resolve(__dirname, '../../../shared/ui-components/gantt-widget/src')

const workflowEditorPath = isDocker
  ? path.resolve(__dirname, '.workflow-editor-src')
  : path.resolve(__dirname, '../../../shared/wf/ui/src')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    dedupe: [
      'react',
      'react-dom',
      'zustand',
      '@xyflow/react',
      '@mui/material',
      '@mui/x-data-grid',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
    ],
    alias: {
      'datagrid-extended': datagridExtendedPath,
      'gantt-widget': ganttWidgetPath,
      'workflow-editor-ui': workflowEditorPath,
      // Internal path alias used by workflow-editor-ui source
      '@wf': workflowEditorPath,
    },
  },
  server: {
    watch: {
      ignored: ['!**/node_modules/datagrid-extended/**', '!**/node_modules/gantt-widget/**', '!**/node_modules/workflow-editor-ui/**'],
    },
    fs: {
      allow: [
        path.resolve(__dirname),
        ...(!isDocker ? [
          path.resolve(__dirname, '../../../shared/ui-components/datagrid-extended'),
          path.resolve(__dirname, '../../../shared/ui-components/gantt-widget'),
          path.resolve(__dirname, '../../../shared/wf/ui'),
        ] : []),
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
