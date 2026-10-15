import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import queryClient from './lib/queryClient'
import './index.css'
import App from './App.tsx'
import EnvBanner from './components/EnvBanner.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import ThemeRoot from './ThemeRoot.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeRoot>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
          <EnvBanner />
        </ThemeRoot>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
