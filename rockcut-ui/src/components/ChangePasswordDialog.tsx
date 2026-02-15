import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'

interface ChangePasswordDialogProps {
  onChangePassword: (password: string, passwordConfirmation: string) => Promise<void>
}

export default function ChangePasswordDialog({ onChangePassword }: ChangePasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await onChangePassword(password, confirm)
    } catch {
      setError('Failed to change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open disableEscapeKeyDown maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Please Update Your Password</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Your administrator has requested that you change your password.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="New Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            margin="normal"
            autoFocus
          />
          <TextField
            label="Confirm Password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            fullWidth
            margin="normal"
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : 'Change Password'}
            </Button>
          </Box>
        </DialogContent>
      </form>
    </Dialog>
  )
}
