import { useRef, useState } from 'react'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import { SubmitGate } from '../lib/submitGate'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  /** May return a promise: until it settles, the confirm button stays busy and another press is dropped. */
  onConfirm: () => unknown
  title: string
  message: string
  loading?: boolean
  confirmLabel?: string
  confirmColor?: 'error' | 'primary'
  /** The other button's words ("Keep editing"); Cancel by default. */
  cancelLabel?: string
  /** More under the message (a list of consequences). */
  children?: React.ReactNode
  /** Still finding out what confirming would do: the confirm button waits, with a spinner (Cancel still works). */
  pending?: boolean
  /** The dialog's `data-testid`. */
  testId?: string
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, loading,
  confirmLabel = 'Delete', confirmColor = 'error', cancelLabel = 'Cancel', children, pending, testId,
}: ConfirmDialogProps) {
  // D61 lead decisions 2 (gap 5): the same gate as FormDialog's Save. A
  // double tap on a slow network sent two cancels; the second came back 409.
  const gate = useRef(new SubmitGate())
  const [busy, setBusy] = useState(false)
  const confirm = () =>
    gate.current.run(async () => {
      setBusy(true)
      try {
        await onConfirm()
      } finally {
        setBusy(false)
      }
    })
  const working = loading || busy
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid={testId}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={working}>{cancelLabel}</Button>
        {/* A spinner in place of the label: the button keeps its name and says it's busy. */}
        <Button
          onClick={() => void confirm()}
          color={confirmColor}
          variant="contained"
          disabled={working || pending}
          aria-label={confirmLabel}
          aria-busy={working || pending ? true : undefined}
        >
          {working || pending ? <CircularProgress size={20} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
