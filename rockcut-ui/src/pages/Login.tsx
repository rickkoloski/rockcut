import { useState, type FormEvent } from 'react'
import { Box, Button, TextField, Typography, Paper, Alert, Link } from '@mui/material'
import useAuth from '../hooks/useAuth'
import { asideDeviceToken } from '../lib/device'

// "abcd efgh" → "ABCD-EFGH" as it's typed (D33 pairing codes: 8 characters).
function formatCode(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deviceSetup, setDeviceSetup] = useState(false)
  const [code, setCode] = useState('')
  const [tabletName, setTabletName] = useState('')
  const { login, pairDevice, endPersonalSession, isLoading, error } = useAuth()
  // D33: a staff member chose "Sign in as me" on a shared tablet.
  const onSharedTablet = !!asideDeviceToken()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  const handlePair = async (e: FormEvent) => {
    e.preventDefault()
    await pairDevice(code, tabletName.trim())
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper
        elevation={2}
        sx={{
          p: 4,
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <img
          src="/rockcut-logo.png"
          alt="Rockcut Brewing Co"
          style={{ width: 140, marginBottom: 8 }}
        />

        <Typography variant="h6" color="text.secondary">
          {deviceSetup ? 'Set up as a shared device' : onSharedTablet ? 'Sign in as yourself' : 'Sign in to continue'}
        </Typography>

        {deviceSetup && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: -2 }}>
            Ask a manager for a pairing code from Admin → Shared devices.
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        )}

        {deviceSetup ? (
          <Box component="form" onSubmit={handlePair} sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Pairing code"
              value={code}
              onChange={(e) => setCode(formatCode(e.target.value))}
              required
              fullWidth
              autoFocus
              autoComplete="off"
              placeholder="ABCD-EFGH"
              slotProps={{ htmlInput: { 'data-testid': 'device-code', 'aria-label': 'Pairing code' } }}
            />
            <TextField
              label="Tablet name"
              value={tabletName}
              onChange={(e) => setTabletName(e.target.value)}
              required
              fullWidth
              placeholder="Taproom iPad 1"
              slotProps={{ htmlInput: { 'data-testid': 'device-name', 'aria-label': 'Tablet name', maxLength: 60 } }}
            />
            <Button data-testid="device-submit" type="submit" variant="contained" size="large" disabled={isLoading} fullWidth sx={{ mt: 1 }}>
              {isLoading ? 'Setting up...' : 'Set up this tablet'}
            </Button>
            <Link component="button" type="button" variant="body2" onClick={() => setDeviceSetup(false)}>
              Back to sign in
            </Link>
          </Box>
        ) : (
        <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            data-testid="login-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            autoFocus
            autoComplete="email"
          />
          <TextField
            data-testid="login-password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            autoComplete="current-password"
          />
          <Button
            data-testid="login-submit"
            type="submit"
            variant="contained"
            size="large"
            disabled={isLoading}
            fullWidth
            sx={{ mt: 1 }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
          {onSharedTablet ? (
            <Button data-testid="back-to-shared" variant="text" onClick={endPersonalSession}>
              Cancel — back to the shared screen
            </Button>
          ) : (
            <Link data-testid="device-setup-link" component="button" type="button" variant="body2" onClick={() => setDeviceSetup(true)}>
              Set up as a shared device
            </Link>
          )}
        </Box>
        )}
      </Paper>
    </Box>
  )
}
