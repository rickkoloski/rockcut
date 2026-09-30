import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import RepeatIcon from '@mui/icons-material/Repeat'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { addDaysKey, formatDayHeading, localInputToUtc, utcToLocalInput } from '../../lib/datetime'
import {
  eventTimeLabel,
  formatDateKey,
  isoWeekday,
  repeatParams,
  repeatSummary,
  ruleFromSeries,
  weekOfMonth,
  type RepeatRule,
} from '../../lib/events'
import type { Department, ScheduleEvent } from '../../lib/types'

interface Prefill {
  departmentId?: number
  dateKey?: string // "YYYY-MM-DD" (Denver) to seed the start day
}

interface Props {
  open: boolean
  onClose: () => void
  editEvent: ScheduleEvent | null
  departments: Department[] // already limited to what the actor manages
  readOnly: boolean // the viewer can't manage this event's department
  prefill?: Prefill
}

type RepeatMode = 'none' | 'weekly' | 'monthly_weekday'
type Scope = 'this' | 'following'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function EventFormDialog({ open, onClose, editEvent, departments, readOnly, prefill }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editEvent
  const inSeries = !!editEvent?.series_id

  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startDay, setStartDay] = useState('')
  const [startTime, setStartTime] = useState('19:00')
  const [endDay, setEndDay] = useState('')
  const [endTime, setEndTime] = useState('21:00')
  const [repeat, setRepeat] = useState<RepeatMode>('none')
  const [rule, setRule] = useState<RepeatRule>({ frequency: 'weekly', interval: 1, weekdays: [], weekOfMonth: 1, weekday: 1, until: '', count: '' })
  const [endsMode, setEndsMode] = useState<'never' | 'until' | 'count'>('never')
  const [ruleTouched, setRuleTouched] = useState(false)
  const [scopeFor, setScopeFor] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setScopeFor(null)
    setRuleTouched(false)
    if (editEvent) {
      const [sd, st] = utcToLocalInput(editEvent.starts_at).split('T')
      const [ed, et] = utcToLocalInput(editEvent.ends_at).split('T')
      setDepartmentId(editEvent.department_id)
      setTitle(editEvent.title)
      setNotes(editEvent.notes ?? '')
      setAllDay(editEvent.all_day)
      setStartDay(sd)
      setStartTime(editEvent.all_day ? '19:00' : st)
      // An all-day end is local midnight after the last day.
      setEndDay(editEvent.all_day ? addDaysKey(ed, -1) : ed)
      setEndTime(editEvent.all_day ? '21:00' : et)
      if (editEvent.series) {
        const r = ruleFromSeries(editEvent.series)
        setRepeat(r.frequency)
        setRule(r)
        setEndsMode(r.until ? 'until' : r.count ? 'count' : 'never')
      } else {
        setRepeat('none')
      }
    } else {
      const day = prefill?.dateKey ?? utcToLocalInput(new Date().toISOString()).split('T')[0]
      setDepartmentId(prefill?.departmentId ?? (departments.length === 1 ? departments[0].id : ''))
      setTitle('')
      setNotes('')
      setAllDay(false)
      setStartDay(day)
      setStartTime('19:00')
      setEndDay(day)
      setEndTime('21:00')
      setRepeat('none')
      setEndsMode('never')
      setRule({ frequency: 'weekly', interval: 1, weekdays: [isoWeekday(day)], weekOfMonth: weekOfMonth(day), weekday: isoWeekday(day), until: '', count: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEvent])

  const updateRule = (patch: Partial<RepeatRule>) => {
    setRule((r) => ({ ...r, ...patch }))
    setRuleTouched(true)
  }

  const chooseRepeat = (mode: RepeatMode) => {
    setRepeat(mode)
    setRuleTouched(true)
    if (mode !== 'none') {
      // Seed the pattern from the start day: its weekday, and which one it is in the month.
      setRule((r) => ({
        ...r,
        frequency: mode,
        interval: mode === 'weekly' ? r.interval : 1,
        weekdays: r.weekdays.length ? r.weekdays : [isoWeekday(startDay)],
        weekOfMonth: weekOfMonth(startDay),
        weekday: isoWeekday(startDay),
      }))
    }
  }

  const effectiveRule: RepeatRule = {
    ...rule,
    until: endsMode === 'until' ? rule.until : '',
    count: endsMode === 'count' ? rule.count : '',
  }

  const startsAt = () => localInputToUtc(`${startDay}T${allDay ? '00:00' : startTime}`)
  const endsAt = () => localInputToUtc(allDay ? `${addDaysKey(endDay, 1)}T00:00` : `${endDay}T${endTime}`)

  const validate = (): string | null => {
    if (!departmentId) return 'Department is required'
    if (!title.trim()) return 'Title is required'
    if (!startDay || !endDay) return 'Start and end are required'
    if (allDay ? endDay < startDay : new Date(endsAt()) <= new Date(startsAt())) return 'End must be after start'
    if (repeat === 'weekly' && rule.weekdays.length === 0) return 'Pick at least one day to repeat on'
    if (repeat !== 'none' && endsMode === 'until' && !rule.until) return 'Pick an end date for the repeat'
    if (repeat !== 'none' && endsMode === 'count' && !(Number(rule.count) > 0)) return 'Enter how many times it repeats'
    return null
  }

  const payload = (): Record<string, unknown> => ({
    department_id: departmentId,
    title: title.trim(),
    notes,
    all_day: allDay,
    starts_at: startsAt(),
    ends_at: endsAt(),
  })

  const run = async (request: () => Promise<unknown>) => {
    setError(null)
    setLoading(true)
    try {
      await request()
      qc.invalidateQueries({ queryKey: ['schedule_events'] })
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoading(false)
      setScopeFor(null)
    }
  }

  const save = (scope: Scope = 'this') => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    if (!isEdit) {
      const body = repeat === 'none' ? payload() : { ...payload(), ...repeatParams(effectiveRule) }
      return run(() => api.post('/api/schedule_events', body))
    }
    const body: Record<string, unknown> = { ...payload(), scope }
    // A changed repeat rule applies from this date on (the series splits there).
    if (inSeries && scope === 'following' && ruleTouched && repeat !== 'none') Object.assign(body, repeatParams(effectiveRule))
    return run(() => api.patch(`/api/schedule_events/${editEvent!.id}`, body))
  }

  const onSaveClick = () => {
    const problem = validate()
    if (problem) return setError(problem)
    if (inSeries && ruleTouched) return save('following') // a rule change always applies from here on
    if (inSeries) return setScopeFor('save')
    save()
  }

  const remove = (scope: Scope) =>
    run(() => api.delete(`/api/schedule_events/${editEvent!.id}`, { params: { scope } }))

  const onDeleteClick = () => (inSeries ? setScopeFor('delete') : remove('this'))

  const setStatus = (action: 'publish' | 'unpublish') =>
    run(() => api.post(`/api/schedule_events/${editEvent!.id}/${action}`, {}))

  // Extend only helps a series that runs past what's been generated: no count, and
  // no end date on or before the generated horizon.
  const series = editEvent?.series
  const canExtend =
    !!series?.generated_through && !series.count && (!series.until_date || series.until_date > series.generated_through)

  const extend = () =>
    run(() => api.post(`/api/schedule_event_series/${editEvent!.series_id}/extend`, {}))

  // ── Read-only view (employees, other departments' managers, the taproom device) ──
  if (readOnly && editEvent) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="event-dialog">
        <DialogTitle>{editEvent.title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography>{formatDayHeading(editEvent.starts_at)} · {eventTimeLabel(editEvent)}</Typography>
          <Typography variant="body2" color="text.secondary">{editEvent.department?.name}</Typography>
          {editEvent.series && (
            <Stack direction="row" spacing={0.5} alignItems="center" color="text.secondary">
              <RepeatIcon fontSize="small" />
              <Typography variant="body2">{repeatSummary(ruleFromSeries(editEvent.series))}</Typography>
            </Stack>
          )}
          {editEvent.notes && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }} data-testid="event-notes-view">{editEvent.notes}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    )
  }

  const repeatSection = (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <TextField
        select
        size="small"
        label="Repeat"
        value={repeat}
        onChange={(e) => chooseRepeat(e.target.value as RepeatMode)}
        fullWidth
        disabled={isEdit && !inSeries}
        slotProps={{ htmlInput: { 'data-testid': 'event-repeat' } }}
      >
        <MenuItem value="none" disabled={inSeries}>Does not repeat</MenuItem>
        <MenuItem value="weekly">Weekly</MenuItem>
        <MenuItem value="monthly_weekday">Monthly (by weekday)</MenuItem>
      </TextField>

      {repeat === 'weekly' && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
            {WEEKDAYS.map((label, i) => {
              const day = i + 1
              const on = rule.weekdays.includes(day)
              return (
                <Chip
                  key={day}
                  label={label}
                  size="small"
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  onClick={() => updateRule({ weekdays: on ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day] })}
                  data-testid={`event-repeat-day-${day}`}
                />
              )
            })}
          </Stack>
          <TextField select size="small" label="How often" value={rule.interval} onChange={(e) => updateRule({ interval: Number(e.target.value) })}>
            <MenuItem value={1}>Every week</MenuItem>
            <MenuItem value={2}>Every other week</MenuItem>
          </TextField>
        </Stack>
      )}

      {repeat === 'monthly_weekday' && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <TextField select size="small" label="Which" value={rule.weekOfMonth} onChange={(e) => updateRule({ weekOfMonth: Number(e.target.value) })} sx={{ minWidth: 110 }} slotProps={{ htmlInput: { 'data-testid': 'event-repeat-week' } }}>
            <MenuItem value={1}>1st</MenuItem>
            <MenuItem value={2}>2nd</MenuItem>
            <MenuItem value={3}>3rd</MenuItem>
            <MenuItem value={4}>4th</MenuItem>
            <MenuItem value={-1}>Last</MenuItem>
          </TextField>
          <TextField select size="small" label="Day" value={rule.weekday} onChange={(e) => updateRule({ weekday: Number(e.target.value) })} fullWidth slotProps={{ htmlInput: { 'data-testid': 'event-repeat-weekday' } }}>
            {DAY_NAMES.map((n, i) => (
              <MenuItem key={n} value={i + 1}>{n}</MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      {repeat !== 'none' && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField select size="small" label="Ends" value={endsMode} onChange={(e) => { setEndsMode(e.target.value as typeof endsMode); setRuleTouched(true) }} sx={{ minWidth: 150 }} slotProps={{ htmlInput: { 'data-testid': 'event-repeat-ends' } }}>
              <MenuItem value="never">12 months ahead</MenuItem>
              <MenuItem value="until">On a date</MenuItem>
              <MenuItem value="count">After a number of times</MenuItem>
            </TextField>
            {endsMode === 'until' && (
              <TextField size="small" type="date" label="Last date" value={rule.until} onChange={(e) => updateRule({ until: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'event-repeat-until' } }} />
            )}
            {endsMode === 'count' && (
              <TextField size="small" type="number" label="Times" value={rule.count} onChange={(e) => updateRule({ count: e.target.value })} slotProps={{ htmlInput: { min: 1, max: 400, 'data-testid': 'event-repeat-count' } }} />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" data-testid="event-repeat-summary">
            {repeatSummary(effectiveRule)}
          </Typography>
          {canExtend && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Scheduled through {formatDateKey(series!.generated_through!)}
              </Typography>
              <Button size="small" disabled={loading} onClick={extend} data-testid="event-extend">Extend</Button>
            </Stack>
          )}
          {inSeries && ruleTouched && (
            <Alert severity="info" sx={{ py: 0 }}>A new repeat applies to this date and every later one.</Alert>
          )}
        </Stack>
      )}
    </Box>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="event-dialog">
      <DialogTitle>{isEdit ? 'Edit event' : 'Add event'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {editEvent?.series_exception && (
          <Alert severity="info" sx={{ py: 0 }}>This date was changed on its own; it differs from the rest of the series.</Alert>
        )}

        <TextField select label="Department" value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value))} fullWidth slotProps={{ htmlInput: { 'data-testid': 'event-department' } }}>
          {departments.map((d) => (
            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
          ))}
        </TextField>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 100, 'data-testid': 'event-title' } }} />

        <FormControlLabel
          control={<Switch checked={allDay} onChange={(e) => setAllDay(e.target.checked)} slotProps={{ input: { 'data-testid': 'event-all-day' } as object }} />}
          label="All day"
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={allDay ? 'First day' : 'Start day'} type="date" value={startDay} onChange={(e) => { setStartDay(e.target.value); if (endDay < e.target.value) setEndDay(e.target.value) }} fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'event-start-day' } }} />
          {!allDay && <TextField label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 900, 'data-testid': 'event-start-time' } }} />}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={allDay ? 'Last day' : 'End day'} type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'event-end-day' } }} />
          {!allDay && <TextField label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 900, 'data-testid': 'event-end-time' } }} />}
        </Stack>

        {(!isEdit || inSeries) && repeatSection}

        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} slotProps={{ htmlInput: { 'data-testid': 'event-notes' } }} />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {isEdit && (
            <Button color="error" disabled={loading} onClick={onDeleteClick} data-testid="event-delete">Delete</Button>
          )}
        </Box>
        <Box>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          {isEdit && editEvent?.status === 'draft' && (
            <Button disabled={loading} onClick={() => setStatus('publish')} sx={{ ml: 1 }} data-testid="event-publish">Publish</Button>
          )}
          {isEdit && editEvent?.status === 'published' && (
            <Button disabled={loading} onClick={() => setStatus('unpublish')} sx={{ ml: 1 }} data-testid="event-unpublish">Unpublish</Button>
          )}
          <Button onClick={onSaveClick} variant="contained" disabled={loading} sx={{ ml: 1 }} data-testid="event-save">
            {loading ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </Box>
      </DialogActions>

      {/* Repeating event: which dates does this save or delete apply to? */}
      <Dialog open={scopeFor !== null} onClose={() => setScopeFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{scopeFor === 'delete' ? 'Delete repeating event' : 'Save repeating event'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {scopeFor === 'delete'
              ? 'Delete only this date, or this date and every later one? Earlier dates are kept.'
              : 'Apply to only this date, or this date and every later one? Later dates changed on their own will be overwritten.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
          <Button variant="outlined" disabled={loading} data-testid="series-scope-this" onClick={() => (scopeFor === 'delete' ? remove('this') : save('this'))}>
            This event only
          </Button>
          <Button variant="contained" color={scopeFor === 'delete' ? 'error' : 'primary'} disabled={loading} data-testid="series-scope-following" onClick={() => (scopeFor === 'delete' ? remove('following') : save('following'))}>
            This and all following
          </Button>
          <Button onClick={() => setScopeFor(null)} disabled={loading}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

