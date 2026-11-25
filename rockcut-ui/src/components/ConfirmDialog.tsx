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
import { usePhoneBackCloses } from '../hooks/useBackCloses'
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
  /**
   * D64: the other button is a second answer ("This brink is empty"), not a
   * Cancel: it runs this (through the same one-press gate) while Escape and
   * the backdrop still only close.
   */
  onCancel?: () => unknown
  /** More under the message (a list of consequences). */
  children?: React.ReactNode
  /** Still finding out what confirming would do: the confirm button waits, with a spinner (Cancel still works). */
  pending?: boolean
  /** The dialog's `data-testid`. */
  testId?: string
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, loading,
  confirmLabel = 'Delete', confirmColor = 'error', cancelLabel = 'Cancel', onCancel, children, pending, testId,
}: ConfirmDialogProps) {
  // D61 lead decisions 2 (gap 5): the same gate as FormDialog's Save. A
  // double tap on a slow network sent two cancels; the second came back 409.
  const gate = useRef(new SubmitGate())
  const [busy, setBusy] = useState(false)
  const run = (action: () => unknown) =>
    gate.current.run(async () => {
      setBusy(true)
      try {
        await action()
      } finally {
        setBusy(false)
      }
    })
  const confirm = () => run(onConfirm)
  const working = loading || busy
  // D63 (6260): phone Back closes it, as Escape does (never `onCancel`'s answer),
  // and waits while a press is in flight.
  usePhoneBackCloses(open, onClose, () => !!loading || gate.current.inFlight)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid={testId}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel ? () => void run(onCancel) : onClose} disabled={working} data-testid={testId && onCancel ? `${testId}-other` : undefined}>
          {cancelLabel}
        </Button>
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
