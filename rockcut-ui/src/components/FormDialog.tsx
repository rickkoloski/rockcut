import { useRef, useState, type FormEvent, type ReactNode } from 'react'
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
import { SubmitGate } from '../lib/submitGate'

interface FormDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** May return a promise: until it settles, Save stays disabled and another submit is dropped. */
  onSubmit: () => void | Promise<unknown>
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
  // D60 lead decisions 2 (gap 6): `loading` comes from the mutation one render
  // late, so a double-click got two submits through. The gate drops a second
  // submit at once; `busy` keeps Save disabled until the first one settles.
  const gate = useRef(new SubmitGate())
  const [busy, setBusy] = useState(false)
  const submit = () => {
    if (loading || submitDisabled) return
    return gate.current.run(async () => {
      setBusy(true)
      try {
        await onSubmit()
      } finally {
        setBusy(false)
      }
    })
  }
  const pending = loading || busy
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={!!phone && narrow} data-testid={testId}>
      {/* While a save is in flight a second submit (a double-click, Enter again) does nothing: no double movements. */}
      {/* noValidate (D61 lead decisions 2, item 4): the browser's required check dropped a Save without a word; the app's own checks give the messages. */}
      <form noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void submit() }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions>
          {secondaryAction && <Box sx={{ mr: 'auto' }}>{secondaryAction}</Box>}
          <Button onClick={onClose} disabled={pending}>{cancelLabel}</Button>
          <Button type="submit" variant="contained" disabled={pending || submitDisabled} aria-label={submitLabel} aria-busy={pending || undefined}>
            {pending ? <CircularProgress size={20} /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
