import { useEffect, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import useAuth from './hooks/useAuth'
import { cachedColorMode } from './lib/colorMode'
import { darkTheme, lightTheme } from './theme'

/**
 * D43: the app's theme from `/api/me`'s `color_mode` (the last one seen in
 * this browser until it answers, and on the sign-in page). "Match this
 * device" follows the browser's setting live.
 */
export default function ThemeRoot({ children }: { children: ReactNode }) {
  const mode = useAuth((s) => s.colorMode) ?? cachedColorMode()
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true })
  const theme = mode === 'dark' || (mode === 'device' && prefersDark) ? darkTheme : lightTheme

  // The browser's own bar matches the app's top bar.
  const barColor = theme.palette.background.paper
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor)
  }, [barColor])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
