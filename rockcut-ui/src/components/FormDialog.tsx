import type { FormEvent, ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useBackCloses } from '../hooks/useBackCloses'

interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  onSubmit: () => void
  loading?: boolean
  error?: string | null
  children: ReactNode
  /** Shown at the left of the actions (e.g. a Delete button). */
  secondaryAction?: ReactNode
  testId?: string
  /** The dismiss button's label: "Close" when parts of the dialog save at once (D46). */
  cancelLabel?: string
  /** The submit button's label (default "Save"). */
  submitLabel?: string
  /** D60: full screen at phone width, and the back button (Android back) closes it. */
  phone?: boolean
  /** D60: keep the submit button disabled (e.g. a number box holds something that isn't a number). */
  submitDisabled?: boolean
}

export default function FormDialog({ open, onClose, title, onSubmit, loading, error, children, secondaryAction, testId, cancelLabel = 'Cancel', submitLabel = 'Save', phone, submitDisabled }: FormDialogProps) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'))
  useBackCloses(open && !!phone, onClose)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={!!phone && narrow} data-testid={testId}>
      {/* While a save is in flight a second submit (Enter again) does nothing: no double movements. */}
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (!loading && !submitDisabled) onSubmit() }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions>
          {secondaryAction && <Box sx={{ mr: 'auto' }}>{secondaryAction}</Box>}
          <Button onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button type="submit" variant="contained" disabled={loading || submitDisabled}>
            {loading ? <CircularProgress size={20} /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
