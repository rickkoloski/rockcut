import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import queryClient from './lib/queryClient'
import './index.css'
import App from './App.tsx'
import EnvBanner from './components/EnvBanner.tsx'
import UpdatePrompt from './components/UpdatePrompt.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import ThemeRoot from './ThemeRoot.tsx'

// D45: which build this is (VITE_BUILD_ID, if the build set one), for the update tests and devtools.
if (import.meta.env.VITE_BUILD_ID) document.documentElement.dataset.build = import.meta.env.VITE_BUILD_ID

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeRoot>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
          <EnvBanner />
          <UpdatePrompt />
        </ThemeRoot>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
