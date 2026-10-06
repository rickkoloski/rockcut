import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'
import useAuth from '../../hooks/useAuth'
import { boardError } from '../../lib/beerBoard'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  submitColor?: 'primary' | 'error'
  /** Runs the write. `staffCode` is set on a shared device; throw to keep the dialog open. */
  onSubmit: (staffCode: string | undefined) => Promise<void>
  /** Disables the submit button (e.g. invalid form). */
  submitDisabled?: boolean
  testId: string
  /** The entry is already gone (404): e.g. refresh the list behind the dialog. */
  onGone?: () => void
  children: ReactNode
}

/**
 * D37: the frame of every Buy-a-Beer Board write. On a shared device it ends
 * with a Staff code field (4 digits, numeric keypad, masked); a wrong code or
 * the lockout shows under the field and keeps the dialog open.
 */
export default function BoardActionDialog({
  open,
  onClose,
  title,
  submitLabel,
  submitColor = 'primary',
  onSubmit,
  submitDisabled,
  testId,
  onGone,
  children,
}: Props) {
  const { user } = useAuth()
  const isDevice = user?.kind === 'device'
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setCode('')
    setCodeError(null)
    setError(null)
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setCodeError(null)
    if (isDevice && !/^\d{4}$/.test(code)) {
      setCodeError('Enter your 4-digit staff code')
      return
    }
    setLoading(true)
    try {
      await onSubmit(isDevice ? code : undefined)
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) onGone?.()
      const { staffCode, message } = boardError(err)
      if (staffCode) {
        setCodeError(staffCode)
        setCode('')
      } else {
        setError(message ?? 'Something went wrong')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth data-testid={testId}>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && (
            <Alert severity="error" data-testid="board-dialog-error">
              {error}
            </Alert>
          )}
          {children}
          {isDevice && (
            <TextField
              label="Your staff code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              error={!!codeError}
              helperText={codeError ?? 'Records who made this change.'}
              autoComplete="off"
              // Masked with CSS, not type="password": Android keyboards may
              // ignore inputMode on password fields and show letters.
              sx={{ '& input': { WebkitTextSecurity: 'disc' } }}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4, 'data-testid': 'board-staff-code' } }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={submitColor}
            disabled={loading || submitDisabled}
            data-testid="board-dialog-submit"
          >
            {loading ? <CircularProgress size={20} /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
