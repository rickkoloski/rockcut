import type { FormEvent, ReactNode } from 'react'
import {
  Alert,
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
  submitLabel?: string
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export default function FormDialog({ open, onClose, title, onSubmit, loading, error, children, submitLabel = 'Save', maxWidth = 'sm' }: FormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit() }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
