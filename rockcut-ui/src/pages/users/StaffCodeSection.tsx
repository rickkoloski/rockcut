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
import { maskedCodeSx, staffCodeDigits, staffCodeError } from '../../lib/staffCode'
import type { User } from '../../lib/types'

const MASK = '••••'

interface Props {
  user: User
  /** Digits typed for a new code; the dialog's Save sends it (empty = no change). */
  draft: string
  onDraftChange: (draft: string) => void
  /** D58 §3.8: Remove only marks the code; the dialog's Save sends the delete. */
  removing: boolean
  onRemovingChange: (removing: boolean) => void
  /** D58 §3.12: this Save clears the code (deactivated, or no department left). */
  clearing?: boolean
  disabled?: boolean
}

/**
 * D37 §3.2: an employee's staff code in the Users & Roles edit dialog (any
 * department since D40).
 * An existing code shows as •••• until the eye is pressed, which fetches it
 * (each reveal is audited). Typing 4 digits sets a new code on Save; Suggest
 * fills in an unused one; Remove marks it to go on Save (Keep takes that
 * back, and Cancel drops it, D58 §3.8). Typed digits are masked too, and the
 * eye shows them without fetching anything.
 */
export default function StaffCodeSection({ user, draft, onDraftChange, removing, onRemovingChange, clearing, disabled }: Props) {
  const [hasCode, setHasCode] = useState(!!user.has_staff_code)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const [showTyped, setShowTyped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hidden again every time the dialog opens for someone.
  useEffect(() => {
    setHasCode(!!user.has_staff_code)
    setRevealed(null)
    setShowing(false)
    setShowTyped(false)
    setError(null)
  }, [user])

  const typing = draft !== ''
  const held = hasCode && !removing
  const value = typing ? draft : held ? (showing && revealed ? revealed : MASK) : ''
  const shown = typing ? showTyped : showing

  const toggleShow = async () => {
    setError(null)
    // Digits being typed are already here: nothing to fetch or audit.
    if (typing) return setShowTyped((s) => !s)
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

  const toggleRemove = () => {
    setError(null)
    setShowing(false)
    onDraftChange('')
    onRemovingChange(!removing)
  }

  const helper =
    error ??
    (clearing && (typing || held)
      ? 'The staff code is cleared when you press Save.'
      : typing
        ? draft.length === 4
          ? 'Saved when you press Save.'
          : 'A staff code is 4 digits.'
        : removing
          ? 'Removed when you press Save.'
          : hasCode
            ? 'Type 4 digits to change it.'
            : 'No code yet. Type 4 digits, or press Suggest.')

  return (
    <Box data-testid="staff-code-section">
      <Divider textAlign="left">
        <Typography variant="overline">Staff code</Typography>
      </Divider>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Typed on a shared tablet (the Taproom's or the brewhouse's) to record who made a change.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          label="Staff code"
          value={value}
          onChange={(e) => onDraftChange(staffCodeDigits(e.target.value))}
          error={!!error || (typing && draft.length !== 4)}
          helperText={helper}
          disabled={disabled || busy}
          sx={{ width: 220, ...(shown ? {} : maskedCodeSx) }}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              autoComplete: 'off',
              'data-testid': 'staff-code-input',
            },
            input: {
              endAdornment:
                held || typing ? (
                  <InputAdornment position="end">
                    <IconButton
                      type="button"
                      aria-label={shown ? 'Hide staff code' : 'Show staff code'}
                      aria-pressed={shown}
                      data-testid="staff-code-toggle"
                      onClick={toggleShow}
                      onMouseDown={(e) => e.preventDefault()}
                      edge="end"
                      disabled={disabled || busy}
                    >
                      {busy ? <CircularProgress size={18} /> : shown ? <VisibilityOff /> : <Visibility />}
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
            onClick={toggleRemove}
            disabled={disabled || busy}
            color="warning"
            data-testid="staff-code-remove"
            aria-pressed={removing}
            sx={{ mt: 1 }}
          >
            {removing ? 'Keep' : 'Remove'}
          </Button>
        )}
      </Box>
    </Box>
  )
}
