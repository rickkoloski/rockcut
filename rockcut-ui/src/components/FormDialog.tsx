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
} from '@mui/material'

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
}

export default function FormDialog({ open, onClose, title, onSubmit, loading, error, children, secondaryAction, testId, cancelLabel = 'Cancel' }: FormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid={testId}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit() }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions>
          {secondaryAction && <Box sx={{ mr: 'auto' }}>{secondaryAction}</Box>}
          <Button onClick={onClose} disabled={loading}>{cancelLabel}</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
