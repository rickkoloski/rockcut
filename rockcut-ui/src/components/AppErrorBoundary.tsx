import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Typography } from '@mui/material'

interface State {
  failed: boolean
}

/**
 * Last line of defense (D36-J, task 4053): a render crash shows a way out
 * instead of a blank white page. Reloading fetches everything fresh.
 */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Box
        data-testid="app-error"
        sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', px: 2 }}
      >
        <Typography variant="h6">Something went wrong</Typography>
        <Typography color="text.secondary" textAlign="center">
          Reloading usually fixes it.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Box>
    )
  }
}
