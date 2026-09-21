import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { formatDayHeading, formatTime, localDayKey, localInputToUtc, utcToLocalInput } from '../../lib/datetime'
import type { TimeOffRequest, TimeOffStatus, TimeOffType } from '../../lib/types'

const TYPES: { value: TimeOffType; label: string }[] = [
  { value: 'pto', label: 'Vacation (PTO)' },
  { value: 'sick', label: 'Sick' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'personal', label: 'Personal' },
]
const TYPE_LABEL: Record<TimeOffType, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<TimeOffType, string>
const STATUS_COLOR: Record<TimeOffStatus, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'error',
  cancelled: 'default',
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

function dayLabel(iso: string): string {
  return formatDayHeading(`${localDayKey(iso)}T12:00:00Z`)
}

function describeRange(r: TimeOffRequest): string {
  if (r.all_day) {
    const s = dayLabel(r.starts_at)
    const e = dayLabel(r.ends_at)
    return s === e ? `${s} (all day)` : `${s} – ${e}`
  }
  return `${dayLabel(r.starts_at)}, ${formatTime(r.starts_at)}–${formatTime(r.ends_at)}`
}

export default function TimeOff() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const meId = user?.id

  const { data: requests = [] } = useApiQuery<TimeOffRequest[]>(['time_off'], '/api/time_off')

  const today = utcToLocalInput(new Date().toISOString()).slice(0, 10)
  const [type, setType] = useState<TimeOffType>('pto')
  const [allDay, setAllDay] = useState(true)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [day, setDay] = useState(today)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['time_off'] })

  const submit = async () => {
    setError(null)
    const starts_at = allDay ? localInputToUtc(`${startDate}T00:00`) : localInputToUtc(`${day}T${startTime}`)
    const ends_at = allDay ? localInputToUtc(`${endDate}T23:59`) : localInputToUtc(`${day}T${endTime}`)
    if (new Date(ends_at) <= new Date(starts_at)) {
      setError('End must be after start')
      return
    }
    setBusy(true)
    try {
      await api.post('/api/time_off', { type, all_day: allDay, starts_at, ends_at, note })
      invalidate()
      setNote('')
      setNotice('Time-off request submitted')
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      invalidate()
      setNotice(msg)
    } catch (err) {
      setNotice(readError(err))
    }
  }

  const mine = requests.filter((r) => r.user_id === meId)
  const approvals = requests.filter((r) => r.user_id !== meId && r.status === 'pending')

  const statusChip = (r: TimeOffRequest) => <Chip size="small" label={r.status} color={STATUS_COLOR[r.status]} variant="outlined" />

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Time off' }]} title="Time off" />

      <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="overline">Request time off</Typography>
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value as TimeOffType)} sx={{ minWidth: 180 }}>
              {TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>
            <FormControlLabel control={<Switch checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />} label="All day" />
          </Stack>

          {allDay ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField size="small" type="date" label="Start" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="End" value={endDate} onChange={(e) => setEndDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField size="small" type="date" label="Day" value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="time" label="Start" value={startTime} onChange={(e) => setStartTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
              <TextField size="small" type="time" label="End" value={endTime} onChange={(e) => setEndTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
            </Stack>
          )}

          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
          <Box>
            <Button variant="contained" onClick={submit} disabled={busy}>Submit request</Button>
          </Box>
        </Stack>
      </Paper>

      {approvals.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>Pending approvals</Typography>
          <Stack spacing={1} sx={{ mb: 3 }}>
            {approvals.map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={TYPE_LABEL[r.type]} />
                <Typography sx={{ fontWeight: 600, minWidth: 120 }}>{r.user?.name || r.user?.email}</Typography>
                <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{describeRange(r)}{r.note ? ` · ${r.note}` : ''}</Typography>
                <Button size="small" variant="contained" color="success" onClick={() => act(() => api.post(`/api/time_off/${r.id}/review`, { status: 'approved' }), 'Approved')}>Approve</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => act(() => api.post(`/api/time_off/${r.id}/review`, { status: 'denied' }), 'Denied')}>Deny</Button>
              </Paper>
            ))}
          </Stack>
          <Divider sx={{ mb: 3 }} />
        </>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>My requests</Typography>
      {mine.length === 0 ? (
        <Typography color="text.secondary">No requests yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {mine.map((r) => (
            <Paper key={r.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip size="small" label={TYPE_LABEL[r.type]} />
              <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{describeRange(r)}{r.note ? ` · ${r.note}` : ''}</Typography>
              {statusChip(r)}
              {r.status === 'pending' && (
                <Button size="small" onClick={() => act(() => api.post(`/api/time_off/${r.id}/cancel`, {}), 'Cancelled')}>Cancel</Button>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </>
  )
}
