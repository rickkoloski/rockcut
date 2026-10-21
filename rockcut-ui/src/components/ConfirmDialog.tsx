import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  loading?: boolean
  confirmLabel?: string
  confirmColor?: 'error' | 'primary'
  /** More under the message (a list of consequences). */
  children?: React.ReactNode
  /** Still finding out what confirming would do: the confirm button waits, with a spinner (Cancel still works). */
  pending?: boolean
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, loading,
  confirmLabel = 'Delete', confirmColor = 'error', children, pending,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {/* A spinner in place of the label: the button keeps its name and says it's busy. */}
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="contained"
          disabled={loading || pending}
          aria-label={confirmLabel}
          aria-busy={loading || pending ? true : undefined}
        >
          {loading || pending ? <CircularProgress size={20} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
