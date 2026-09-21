import { useState, type FormEvent } from 'react'
import { Box, Button, TextField, Typography, Paper, Alert, Link } from '@mui/material'
import api from '../../lib/api'
import useAuth from '../../hooks/useAuth'

export default function ForcePasswordReset() {
  const { loadMe, logout, user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next !== confirm) {
      setError('New passwords do not match')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/session/password', { current_password: current, new_password: next })
      await loadMe()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not update password'
      setError(msg)
    } finally {
      setLoading(false)
    }
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
      <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6">Set a new password</Typography>
        <Typography variant="body2" color="text.secondary">
          Your account was given a temporary password. Choose a new one to continue
          {user?.email ? ` as ${user.email}` : ''}.
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Current (temporary) password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            fullWidth
            autoComplete="current-password"
          />
          <TextField
            label="New password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            fullWidth
            autoComplete="new-password"
            helperText="At least 8 characters"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            fullWidth
            autoComplete="new-password"
          />
          <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth sx={{ mt: 1 }}>
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </Box>

        <Link component="button" type="button" onClick={logout} sx={{ alignSelf: 'center' }}>
          Sign out
        </Link>
      </Paper>
    </Box>
  )
}
