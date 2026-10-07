import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import api from '../../lib/api'
import { staffCodeDigits, staffCodeError } from '../../lib/staffCode'
import type { User } from '../../lib/types'

const MASK = '••••'

interface Props {
  user: User
  /** Digits typed for a new code; the dialog's Save sends it (empty = no change). */
  draft: string
  onDraftChange: (draft: string) => void
  /** Called after Remove, so the dialog can refresh the users list. */
  onRemoved: () => void
  disabled?: boolean
}

/**
 * D37 §3.2: a Taproom member's staff code in the Users & Roles edit dialog.
 * An existing code shows as •••• until the eye is pressed, which fetches it
 * (each reveal is audited). Typing 4 digits sets a new code on Save; Suggest
 * fills in an unused one; Remove clears it at once.
 */
export default function StaffCodeSection({ user, draft, onDraftChange, onRemoved, disabled }: Props) {
  const [hasCode, setHasCode] = useState(!!user.has_staff_code)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hidden again every time the dialog opens for someone.
  useEffect(() => {
    setHasCode(!!user.has_staff_code)
    setRevealed(null)
    setShowing(false)
    setError(null)
  }, [user])

  const typing = draft !== ''
  const value = typing ? draft : hasCode ? (showing && revealed ? revealed : MASK) : ''

  const toggleShow = async () => {
    setError(null)
    if (showing) return setShowing(false)
    if (revealed === null) {
      setBusy(true)
      try {
        const { data } = await api.get<{ data: { code: string | null } }>(`/api/users/${user.id}/staff_code`)
        setRevealed(data.data.code)
      } catch (err) {
        setError(staffCodeError(err))
        return
      } finally {
        setBusy(false)
      }
    }
    setShowing(true)
  }

  const suggest = async () => {
    setError(null)
    setBusy(true)
    try {
      const { data } = await api.get<{ data: { code: string } }>('/api/staff_codes/suggest')
      onDraftChange(data.data.code)
    } catch (err) {
      setError(staffCodeError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setError(null)
    setBusy(true)
    try {
      await api.delete(`/api/users/${user.id}/staff_code`)
      setHasCode(false)
      setRevealed(null)
      setShowing(false)
      onDraftChange('')
      onRemoved()
    } catch (err) {
      setError(staffCodeError(err))
    } finally {
      setBusy(false)
    }
  }

  const helper =
    error ??
    (typing
      ? draft.length === 4
        ? 'Saved when you press Save.'
        : 'A staff code is 4 digits.'
      : hasCode
        ? 'Type 4 digits to change it.'
        : 'No code yet. Type 4 digits, or press Suggest.')

  return (
    <Box data-testid="staff-code-section">
      <Divider textAlign="left">
        <Typography variant="overline">Staff code</Typography>
      </Divider>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Typed on the shared Taproom tablet to record who made a change.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          label="Staff code"
          value={value}
          onChange={(e) => onDraftChange(staffCodeDigits(e.target.value))}
          error={!!error || (typing && draft.length !== 4)}
          helperText={helper}
          disabled={disabled || busy}
          sx={{ width: 220 }}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              autoComplete: 'off',
              'data-testid': 'staff-code-input',
            },
            input: {
              endAdornment:
                hasCode && !typing ? (
                  <InputAdornment position="end">
                    <IconButton
                      type="button"
                      aria-label={showing ? 'Hide staff code' : 'Show staff code'}
                      aria-pressed={showing}
                      data-testid="staff-code-toggle"
                      onClick={toggleShow}
                      onMouseDown={(e) => e.preventDefault()}
                      edge="end"
                      disabled={disabled || busy}
                    >
                      {busy ? <CircularProgress size={18} /> : showing ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
            },
          }}
        />
        <Button onClick={suggest} disabled={disabled || busy} data-testid="staff-code-suggest" sx={{ mt: 1 }}>
          Suggest
        </Button>
        {hasCode && (
          <Button
            onClick={remove}
            disabled={disabled || busy}
            color="warning"
            data-testid="staff-code-remove"
            sx={{ mt: 1 }}
          >
            Remove
          </Button>
        )}
      </Box>
    </Box>
  )
}
