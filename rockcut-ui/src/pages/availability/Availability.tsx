import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import type { AvailabilityKind, AvailabilitySlot, RosterEntry } from '../../lib/types'

// Display order Monday→Sunday; value is the JS weekday (0=Sun..6=Sat).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
]
const KINDS: { value: AvailabilityKind; label: string }[] = [
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'preferred', label: 'Preferred' },
]

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

function describe(s: AvailabilitySlot): string {
  return s.all_day ? 'All day' : `${hhmm(s.start_time)}–${hhmm(s.end_time)}`
}

export default function Availability() {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()
  const meId = user?.id
  const isOwner = !!user?.is_owner
  const managedKeys = capabilities?.manages_departments ?? []
  const canManageOthers = isOwner || managedKeys.length > 0

  // Whose availability is being viewed/edited ('' = myself).
  const [forUserId, setForUserId] = useState<number | ''>('')
  const targetId = forUserId === '' ? meId : forUserId

  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster', undefined, { enabled: canManageOthers })
  const manageable = roster.filter(
    (r) => r.id !== meId && (isOwner || r.departments.some((k) => managedKeys.includes(k))),
  )
  const targetName = forUserId === '' ? null : roster.find((r) => r.id === forUserId)?.name ?? 'employee'

  const params = useMemo(() => (targetId ? { user_id: String(targetId) } : undefined), [targetId])
  const { data: slots = [] } = useApiQuery<AvailabilitySlot[]>(['availability', targetId], '/api/availability', params, {
    enabled: !!targetId,
  })

  const [weekday, setWeekday] = useState<number>(1)
  const [kind, setKind] = useState<AvailabilityKind>('unavailable')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['availability'] })

  const submit = async () => {
    setError(null)
    if (!allDay && endTime <= startTime) {
      setError('End must be after start')
      return
    }
    setBusy(true)
    try {
      await api.post('/api/availability', {
        weekday,
        kind,
        all_day: allDay,
        start_time: allDay ? null : `${startTime}:00`,
        end_time: allDay ? null : `${endTime}:00`,
        note: note || null,
        ...(forUserId !== '' ? { user_id: forUserId } : {}),
      })
      invalidate()
      setNote('')
      setNotice('Availability saved')
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/availability/${id}`)
      invalidate()
      setNotice('Removed')
    } catch (err) {
      setNotice(readError(err))
    }
  }

  const byWeekday = useMemo(() => {
    const m = new Map<number, AvailabilitySlot[]>()
    for (const s of slots) {
      const arr = m.get(s.weekday) ?? []
      arr.push(s)
      m.set(s.weekday, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)))
    return m
  }, [slots])

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Availability' }]}
        title={targetName ? `Availability — ${targetName}` : 'My availability'}
      />

      <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="overline">Add weekly availability</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Recurring every week. <strong>Unavailable</strong> times show as conflicts when scheduling.
        </Typography>
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {canManageOthers && manageable.length > 0 && (
            <TextField
              select
              size="small"
              label="For"
              value={forUserId}
              onChange={(e) => { setForUserId(e.target.value === '' ? '' : Number(e.target.value)); setError(null) }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Myself</MenuItem>
              {manageable.map((r) => (
                <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap">
            <TextField select size="small" label="Day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} sx={{ minWidth: 150 }}>
              {WEEKDAYS.map((d) => (
                <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Type" value={kind} onChange={(e) => setKind(e.target.value as AvailabilityKind)} sx={{ minWidth: 150 }}>
              {KINDS.map((k) => (
                <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>
              ))}
            </TextField>
            <FormControlLabel control={<Switch checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />} label="All day" />
            {!allDay && (
              <>
                <TextField size="small" type="time" label="Start" value={startTime} onChange={(e) => setStartTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label="End" value={endTime} onChange={(e) => setEndTime(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
              </>
            )}
          </Stack>
          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Box>
            <Button variant="contained" onClick={submit} disabled={busy}>Add</Button>
          </Box>
        </Stack>
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>Weekly schedule</Typography>
      <Stack spacing={1}>
        {WEEKDAYS.map((d) => {
          const daySlots = byWeekday.get(d.value) ?? []
          return (
            <Paper key={d.value} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Typography sx={{ fontWeight: 600, minWidth: 96 }}>{d.label}</Typography>
                {daySlots.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">Available</Typography>
                ) : (
                  daySlots.map((s) => (
                    <Chip
                      key={s.id}
                      size="small"
                      color={s.kind === 'unavailable' ? 'error' : 'success'}
                      variant="outlined"
                      label={`${s.kind === 'unavailable' ? 'Unavailable' : 'Preferred'}: ${describe(s)}${s.note ? ` · ${s.note}` : ''}`}
                      onDelete={() => remove(s.id)}
                      deleteIcon={<DeleteOutlineIcon />}
                    />
                  ))
                )}
              </Stack>
            </Paper>
          )
        })}
      </Stack>

      <Snackbar open={!!notice} autoHideDuration={3000} onClose={() => setNotice(null)} message={notice ?? ''} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </>
  )
}
