import { useState, type FormEvent } from 'react'
import { Alert, Box, Button } from '@mui/material'
import api from '../lib/api'
import PasswordField from './PasswordField'

interface Props {
  /** "forced": after a temporary password. "profile": the profile page (D34 §3.5). */
  mode: 'forced' | 'profile'
  /** Called after the password changed, with how many other sessions were signed out. */
  onDone: (revoked: number) => void | Promise<void>
}

/** Current + new + confirm, shared by the forced reset and the profile page. */
export default function ChangePasswordForm({ mode, onDone }: Props) {
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
      const { data } = await api.post<{ revoked?: number }>('/api/session/password', {
        current_password: current,
        new_password: next,
      })
      setCurrent('')
      setNext('')
      setConfirm('')
      await onDone(data.revoked ?? 0)
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
      component="form"
      data-testid="change-password-form"
      onSubmit={submit}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {error && (
        <Alert severity="error" data-testid="change-password-error">
          {error}
        </Alert>
      )}
      <PasswordField
        data-testid="current-password"
        label={mode === 'forced' ? 'Current (temporary) password' : 'Current password'}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
        fullWidth
        autoComplete="current-password"
      />
      <PasswordField
        data-testid="new-password"
        label="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
        fullWidth
        autoComplete="new-password"
        helperText="At least 8 characters"
      />
      <PasswordField
        data-testid="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        fullWidth
        autoComplete="new-password"
      />
      <Button
        data-testid="change-password-submit"
        type="submit"
        variant="contained"
        size="large"
        disabled={loading}
        fullWidth={mode === 'forced'}
        sx={{ mt: 1, alignSelf: mode === 'forced' ? undefined : 'flex-start' }}
      >
        {loading ? 'Saving…' : mode === 'forced' ? 'Update password' : 'Change password'}
      </Button>
    </Box>
  )
}
