// D44 §2.1–2.2: one dialog for a time off request, opened from the Scheduler's
// week grid, View Schedule's agenda and the Time off page. Reviewers get
// Approve / Deny (pending) or Remove (approved), each with an optional note to
// the employee; a past request is read-only for everyone.
import { useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ConfirmDialog from '../ConfirmDialog'
import api from '../../lib/api'
import useAuth from '../../hooks/useAuth'
import { describeTimeOffRange, isPastTimeOff, TIME_OFF_TYPE_LABEL } from '../../lib/timeoff'
import type { TimeOffRequest, TimeOffStatus } from '../../lib/types'
import { formatWhen, personName, reviewedLine, timeOffError, timeOffStatusLabel, useCanReviewTimeOff, useTimeOffRefresh } from './timeOffHelpers'

/** The optional note to the employee, sent as `reviewer_note` (D44 Q2). */
export function ReviewNoteField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <TextField
      size="small"
      label="Note to the employee (optional)"
      placeholder="e.g. Sorry, we're short that weekend"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      multiline
      minRows={2}
      fullWidth
      slotProps={{ htmlInput: { 'data-testid': 'time-off-review-note' } }}
    />
  )
}

const STATUS_COLOR: Record<TimeOffStatus, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'error',
  cancelled: 'default',
}

export function TimeOffStatusChip({ r }: { r: TimeOffRequest }) {
  const notReviewed = r.status === 'pending' && isPastTimeOff(r)
  return (
    <Chip
      size="small"
      variant="outlined"
      label={timeOffStatusLabel(r)}
      color={notReviewed ? 'default' : STATUS_COLOR[r.status]}
      data-testid="time-off-status"
    />
  )
}

interface Props {
  /** The request to show; null closes the dialog. */
  request: TimeOffRequest | null
  onClose: () => void
  /** Open straight on Remove's confirm step (the Time off page's Remove button); backing out closes. */
  startWith?: 'remove'
}

export default function TimeOffDialog({ request, onClose, startWith }: Props) {
  const canReview = useCanReviewTimeOff()
  const meId = useAuth((s) => s.user?.id)
  const refresh = useTimeOffRefresh()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  // The request as the API last reported it (a 409's `data`), over the one we were given.
  const [current, setCurrent] = useState<TimeOffRequest | null>(null)

  // A new request starts clean.
  const [shownId, setShownId] = useState<number | null>(null)
  if ((request?.id ?? null) !== shownId) {
    setShownId(request?.id ?? null)
    setNote('')
    setError(null)
    setCurrent(null)
    setConfirmRemove(startWith === 'remove')
  }
  const direct = startWith === 'remove'

  if (!request) return null
  const r = current?.id === request.id ? current : request
  const reviewer = canReview(r)
  const name = personName(r.user)

  const review = async (status: 'approved' | 'denied') => {
    setBusy(true)
    setError(null)
    try {
      // expected_status: the status shown here; the API answers 409 if it has changed.
      await api.post(`/api/time_off/${r.id}/review`, { status, reviewer_note: note.trim() || null, expected_status: r.status })
      refresh()
      setConfirmRemove(false)
      onClose()
    } catch (err) {
      setConfirmRemove(false)
      setError(timeOffError(err))
      // A 409 carries the request as it is now: show that state and its buttons.
      const now = (err as { response?: { status?: number; data?: { data?: TimeOffRequest } } })?.response
      if (now?.status === 409 && now.data?.data) setCurrent(now.data.data)
      // A refusal may mean the request changed (passed, reviewed elsewhere).
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={!(direct && confirmRemove)} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth data-testid="time-off-dialog">
        <DialogTitle>{name} · time off</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip size="small" label={TIME_OFF_TYPE_LABEL[r.type] ?? r.type} />
              <TimeOffStatusChip r={r} />
            </Stack>
            <Typography>{describeTimeOffRange(r)}</Typography>
            {r.note && (
              <Typography variant="body2">
                <strong>{r.user_id === meId ? 'Your note' : 'Their note'}:</strong> {r.note}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">Requested {formatWhen(r.inserted_at)}</Typography>
            {reviewedLine(r) && <Typography variant="body2" color="text.secondary">{reviewedLine(r)}</Typography>}
            {r.reviewer_note && (r.status === 'approved' || r.status === 'denied') && (
              <Typography variant="body2" data-testid="time-off-reviewer-note">
                <strong>Note to {name}:</strong> {r.reviewer_note}
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {reviewer && r.status === 'pending' && <ReviewNoteField value={note} onChange={setNote} disabled={busy} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>Close</Button>
          {reviewer && r.status === 'pending' && (
            <>
              <Button variant="outlined" color="error" disabled={busy} onClick={() => review('denied')} data-testid="time-off-deny">
                Deny
              </Button>
              <Button variant="contained" color="success" disabled={busy} onClick={() => review('approved')} data-testid="time-off-approve">
                Approve
              </Button>
            </>
          )}
          {reviewer && r.status === 'approved' && (
            <Button variant="outlined" color="error" disabled={busy} onClick={() => setConfirmRemove(true)} data-testid="time-off-remove">
              Remove
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => (direct ? onClose() : setConfirmRemove(false))}
        onConfirm={() => review('denied')}
        loading={busy}
        title="Remove approved time off?"
        message={`Remove ${name}'s approved time off (${describeTimeOffRange(r)})? This puts them back on the schedule.`}
        confirmLabel="Remove"
        confirmColor="error"
        testId="time-off-remove-confirm"
      >
        <Stack sx={{ mt: 2 }}>
          <ReviewNoteField value={note} onChange={setNote} disabled={busy} />
        </Stack>
      </ConfirmDialog>
    </>
  )
}
