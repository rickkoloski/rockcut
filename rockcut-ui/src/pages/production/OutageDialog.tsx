import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { addDaysKey } from '../../lib/datetime'
import { prodError, prodPath, shortPeriod, type Outage, type Tank } from '../../lib/production'
import { coloradoToday } from '../../lib/tasks'

interface Props {
  tank: Tank
  /** The period to change; none = Mark out of service. */
  outage: Outage | null
  onClose: () => void
  /** Something was saved: the tank list refetches. */
  onSaved: (message: string) => void
}

/**
 * D46 §3.2: an out-of-service period. First day out, last day out (or Until
 * further notice), an optional reason; for an existing one, Delete and, while
 * it's going on, Back in service today. Errors show inline, the overlap one
 * naming the other period.
 */
export default function OutageDialog({ tank, outage, onClose, onSaved }: Props) {
  const today = coloradoToday()
  const [from, setFrom] = useState(outage?.starts_on ?? today)
  const [open, setOpen] = useState(outage ? outage.ends_on === null : false)
  const [to, setTo] = useState(outage?.ends_on ?? addDaysKey(outage?.starts_on ?? today, 2))
  const [reason, setReason] = useState(outage?.reason ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePhoneBackCloses(true, onClose)

  // The last day keeps its distance from the first when the first moves.
  const moveFrom = (next: string) => {
    if (next && from && to) {
      const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
      setTo(addDaysKey(next, Math.max(0, span)))
    }
    setFrom(next)
  }

  const check = (): string | null => {
    if (!from) return 'Pick the first day out.'
    if (!open && !to) return 'Pick the last day out, or turn on Until further notice.'
    if (!open && to < from) return 'The last day out can’t be before the first.'
    return null
  }

  const run = async (call: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      await call()
      onSaved(message)
    } catch (err) {
      setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const invalid = check()
    if (invalid) return setError(invalid)
    const body = { starts_on: from, ends_on: open ? null : to, reason: reason.trim() || null }
    const period = shortPeriod({ starts_on: from, ends_on: open ? null : to })
    run(
      () => (outage ? api.patch(prodPath('outages', outage.id), body) : api.post(prodPath('tanks', tank.id, 'outages'), body)),
      `${tank.name} out of service ${period}.`,
    )
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="outage-dialog">
      <DialogTitle>{outage ? `${tank.name} out of service` : `Mark ${tank.name} out of service`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          Shows on the schedule and flags anything planned in {tank.name} while it’s out. No task is added.
        </Typography>
        {error && (
          <Alert severity="error" data-testid="outage-error">
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Out from"
            type="date"
            value={from}
            onChange={(e) => moveFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'outage-from' } }}
          />
          <TextField
            label="Last day out"
            type="date"
            value={open ? '' : to}
            disabled={open}
            onChange={(e) => setTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'outage-to' } }}
          />
        </Box>
        <FormControlLabel
          control={<Switch checked={open} onChange={(e) => setOpen(e.target.checked)} slotProps={{ input: { 'data-testid': 'outage-open' } as object }} />}
          label="Until further notice (no end date yet)"
        />
        <TextField
          label="Reason (optional)"
          placeholder="e.g. Valve repair"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 80, 'data-testid': 'outage-reason' } }}
        />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {outage && (
          <Button
            color="error"
            disabled={busy}
            onClick={() => run(() => api.delete(prodPath('outages', outage.id)), `Out-of-service period deleted.`)}
            data-testid="outage-delete"
          >
            Delete
          </Button>
        )}
        {outage?.state === 'now' && (
          <Button
            disabled={busy}
            onClick={() => run(() => api.post(prodPath('outages', outage.id, 'end_today')), `${tank.name} is back in service today.`)}
            data-testid="outage-end-today"
          >
            Back in service today
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy} data-testid="outage-cancel">
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="outage-save">
          {busy ? <CircularProgress size={20} /> : outage ? 'Save' : 'Mark out of service'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
