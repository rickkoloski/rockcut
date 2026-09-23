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
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { formatDayHeading, formatTime, localDayKey, localInputToUtc, utcToLocalInput } from '../../lib/datetime'
import type { RosterEntry, TimeOffRequest, TimeOffStatus, TimeOffType } from '../../lib/types'

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
  // Timed ranges may span days: same day → "Sep 23, 3:30–5:00 PM";
  // across days → "Sep 23, 3:30 PM – Sep 26, 12:00 PM".
  if (localDayKey(r.starts_at) === localDayKey(r.ends_at)) {
    return `${dayLabel(r.starts_at)}, ${formatTime(r.starts_at)}–${formatTime(r.ends_at)}`
  }
  return `${dayLabel(r.starts_at)}, ${formatTime(r.starts_at)} – ${dayLabel(r.ends_at)}, ${formatTime(r.ends_at)}`
}

export default function TimeOff() {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()
  const meId = user?.id
  const isOwner = !!user?.is_owner
  const managedKeys = capabilities?.manages_departments ?? []
  const canManageOthers = isOwner || managedKeys.length > 0

  const { data: requests = [] } = useApiQuery<TimeOffRequest[]>(['time_off'], '/api/time_off')
  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster', undefined, { enabled: canManageOthers })

  // Employees this manager/owner may enter time off for (owner: everyone).
  const manageable = roster.filter(
    (r) => r.id !== meId && (isOwner || r.departments.some((k) => managedKeys.includes(k))),
  )

  const today = utcToLocalInput(new Date().toISOString()).slice(0, 10)
  const [forUserId, setForUserId] = useState<number | ''>('')
  const [type, setType] = useState<TimeOffType>('pto')
  const [allDay, setAllDay] = useState(true)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['time_off'] })

  // Combine a Denver date + wall-clock time into a UTC instant.
  const toUtc = (date: string, time: string) => localInputToUtc(`${date}T${time}`)

  const submit = async () => {
    setError(null)
    // Timed requests may span multiple days (e.g. 9/23 15:30 → 9/26 12:00).
    const starts_at = allDay ? toUtc(startDate, '00:00') : toUtc(startDate, startTime)
    const ends_at = allDay ? toUtc(endDate, '23:59') : toUtc(endDate, endTime)
    if (new Date(ends_at) <= new Date(starts_at)) {
      setError('End must be after start')
      return
    }
    setBusy(true)
    try {
      const onBehalf = forUserId !== '' && forUserId !== meId
      await api.post('/api/time_off', {
        type,
        all_day: allDay,
        starts_at,
        ends_at,
        note,
        ...(onBehalf ? { user_id: forUserId } : {}),
      })
      invalidate()
      setNote('')
      const who = onBehalf ? roster.find((r) => r.id === forUserId)?.name ?? 'employee' : null
      setNotice(onBehalf ? `Time off added for ${who}` : 'Time-off request submitted')
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

  const byDate = (a: TimeOffRequest, b: TimeOffRequest) => a.starts_at.localeCompare(b.starts_at)
  const mine = requests.filter((r) => r.user_id === meId).sort(byDate)
  const teamPending = requests.filter((r) => r.user_id !== meId && r.status === 'pending').sort(byDate)
  const teamApproved = requests.filter((r) => r.user_id !== meId && r.status === 'approved').sort(byDate)

  const statusChip = (r: TimeOffRequest) => <Chip size="small" label={r.status} color={STATUS_COLOR[r.status]} variant="outlined" />
  const approvedBy = (r: TimeOffRequest) =>
    r.status === 'approved' && r.reviewed_by ? `Approved by ${r.reviewed_by.name || r.reviewed_by.email}` : null

  const review = (r: TimeOffRequest, status: 'approved' | 'denied', msg: string) =>
    act(() => api.post(`/api/time_off/${r.id}/review`, { status }), msg)
  const cancelReq = (r: TimeOffRequest) => act(() => api.post(`/api/time_off/${r.id}/cancel`, {}), 'Cancelled')

  // Removing/cancelling an already-approved request goes through a confirm step.
  const [confirmTarget, setConfirmTarget] = useState<{ req: TimeOffRequest; mode: 'remove' | 'cancel' } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const performConfirm = async () => {
    if (!confirmTarget) return
    setConfirmBusy(true)
    try {
      const { req, mode } = confirmTarget
      if (mode === 'remove') await review(req, 'denied', 'Removed')
      else await cancelReq(req)
    } finally {
      setConfirmBusy(false)
      setConfirmTarget(null)
    }
  }

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Time off' }]} title="Time off" />

      <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="overline">{forUserId === '' ? 'Request time off' : 'Add time off'}</Typography>
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {canManageOthers && manageable.length > 0 && (
            <TextField
              select
              size="small"
              label="For"
              value={forUserId}
              onChange={(e) => setForUserId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ minWidth: 220 }}
              helperText="Entering for an employee approves it immediately"
            >
              <MenuItem value="">Myself (request approval)</MenuItem>
              {manageable.map((r) => (
                <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
              ))}
            </TextField>
          )}
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap">
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ minWidth: 40, fontWeight: 600 }}>Start</Typography>
                <TextField size="small" type="date" label="Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label="Time" value={startTime} onChange={(e) => setStartTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ minWidth: 40, fontWeight: 600 }}>End</Typography>
                <TextField size="small" type="date" label="Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label="Time" value={endTime} onChange={(e) => setEndTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
              </Stack>
            </Stack>
          )}

          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
          <Box>
            <Button variant="contained" onClick={submit} disabled={busy}>Submit request</Button>
          </Box>
        </Stack>
      </Paper>

      {/* 1) My own requests */}
      <Typography variant="h6" sx={{ mb: 1 }}>My requests</Typography>
      {mine.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>No requests yet.</Typography>
      ) : (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {mine.map((r) => (
            <Paper key={r.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip size="small" label={TYPE_LABEL[r.type]} />
              <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                {describeRange(r)}{r.note ? ` · ${r.note}` : ''}{approvedBy(r) ? ` · ${approvedBy(r)}` : ''}
              </Typography>
              {statusChip(r)}
              {r.status === 'pending' && canManageOthers && (
                <Button size="small" variant="contained" color="success" onClick={() => review(r, 'approved', 'Approved')}>Approve</Button>
              )}
              {r.status === 'pending' && (
                <Button size="small" onClick={() => cancelReq(r)}>Cancel</Button>
              )}
              {r.status === 'approved' && (
                <Button size="small" color="error" onClick={() => setConfirmTarget({ req: r, mode: 'cancel' })}>Cancel</Button>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      {/* 2) Pending requests for other employees, then 3) approved for others */}
      {canManageOthers && (
        <>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Pending — other employees</Typography>
          {teamPending.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 3 }}>Nothing pending.</Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 3 }}>
              {teamPending.map((r) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={TYPE_LABEL[r.type]} />
                  <Typography sx={{ fontWeight: 600, minWidth: 120 }}>{r.user?.name || r.user?.email}</Typography>
                  <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{describeRange(r)}{r.note ? ` · ${r.note}` : ''}</Typography>
                  <Button size="small" variant="contained" color="success" onClick={() => review(r, 'approved', 'Approved')}>Approve</Button>
                  <Button size="small" variant="outlined" color="error" onClick={() => review(r, 'denied', 'Denied')}>Deny</Button>
                </Paper>
              ))}
            </Stack>
          )}

          <Typography variant="h6" sx={{ mb: 1 }}>Approved — other employees</Typography>
          {teamApproved.length === 0 ? (
            <Typography color="text.secondary">None approved.</Typography>
          ) : (
            <Stack spacing={1}>
              {teamApproved.map((r) => (
                <Paper key={r.id} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={TYPE_LABEL[r.type]} />
                  <Typography sx={{ fontWeight: 600, minWidth: 120 }}>{r.user?.name || r.user?.email}</Typography>
                  <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                    {describeRange(r)}{r.note ? ` · ${r.note}` : ''}{approvedBy(r) ? ` · ${approvedBy(r)}` : ''}
                  </Typography>
                  <Button size="small" variant="outlined" color="error" onClick={() => setConfirmTarget({ req: r, mode: 'remove' })}>Remove</Button>
                </Paper>
              ))}
            </Stack>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={performConfirm}
        loading={confirmBusy}
        title={confirmTarget?.mode === 'cancel' ? 'Cancel approved time off?' : 'Remove approved time off?'}
        message={
          confirmTarget
            ? confirmTarget.mode === 'cancel'
              ? `Cancel your approved time off (${describeRange(confirmTarget.req)})? This puts you back on the schedule.`
              : `Remove ${confirmTarget.req.user?.name || confirmTarget.req.user?.email || 'this employee'}'s approved time off (${describeRange(confirmTarget.req)})? This puts them back on the schedule.`
            : ''
        }
        confirmLabel={confirmTarget?.mode === 'cancel' ? 'Cancel time off' : 'Remove'}
        confirmColor="error"
      />

      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </>
  )
}
