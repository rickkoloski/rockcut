import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { formatHours, localInputToUtc, shiftHours, utcToLocalInput } from '../../lib/datetime'
import type { Department, Position, RosterEntry, Shift } from '../../lib/types'

interface Prefill {
  departmentId?: number
  assigneeId?: number | null
  dateKey?: string // "YYYY-MM-DD" (Denver) to seed the start day
}

interface Props {
  open: boolean
  onClose: () => void
  editShift: Shift | null
  departments: Department[] // already limited to what the actor manages
  positions: Position[]
  roster: RosterEntry[] // all active staff — any employee can be scheduled in any department
  prefill?: Prefill
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

/** Round a "HH:mm" time to the nearest 15 minutes. */
function roundTime15(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  const total = Math.round((h * 60 + m) / 15) * 15
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function ShiftFormDialog({ open, onClose, editShift, departments, positions, roster, prefill }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editShift

  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [positionId, setPositionId] = useState<number | ''>('')
  const [assigneeId, setAssigneeId] = useState<number | ''>('')
  const [startDay, setStartDay] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDay, setEndDay] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editShift) {
      const [sd, st] = utcToLocalInput(editShift.starts_at).split('T')
      const [ed, et] = utcToLocalInput(editShift.ends_at).split('T')
      setDepartmentId(editShift.department_id)
      setPositionId(editShift.position_id)
      setAssigneeId(editShift.assignee_id ?? '')
      setStartDay(sd)
      setStartTime(st)
      setEndDay(ed)
      setEndTime(et)
      setNotes(editShift.notes ?? '')
    } else {
      const today = utcToLocalInput(new Date().toISOString()).split('T')[0]
      const day = prefill?.dateKey ?? today
      setDepartmentId(prefill?.departmentId ?? departments[0]?.id ?? '')
      setPositionId('')
      setAssigneeId(prefill?.assigneeId ?? '')
      setStartDay(day)
      setStartTime('09:00')
      setEndDay(day)
      setEndTime('17:00')
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editShift])

  // Any active employee can be scheduled for any department's shift.
  const assignees = useMemo(() => [...roster].sort((a, b) => a.name.localeCompare(b.name)), [roster])

  const grouped = useMemo(() => {
    const map = new Map<string, Position[]>()
    for (const p of positions.filter((p) => p.active || p.id === positionId)) {
      const g = p.group ?? 'Other'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    return [...map.entries()]
  }, [positions, positionId])

  const startLocal = startDay && startTime ? `${startDay}T${startTime}` : ''
  const endLocal = endDay && endTime ? `${endDay}T${endTime}` : ''
  const hours = startLocal && endLocal ? shiftHours(localInputToUtc(startLocal), localInputToUtc(endLocal)) : 0

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shifts'] })

  const save = async () => {
    setError(null)
    if (!departmentId || !positionId || !startLocal || !endLocal) {
      setError('Department, position, start, and end are required')
      return
    }
    if (hours <= 0) {
      setError('End must be after start')
      return
    }
    const payload = {
      department_id: departmentId,
      position_id: positionId,
      assignee_id: assigneeId === '' ? null : assigneeId,
      starts_at: localInputToUtc(startLocal),
      ends_at: localInputToUtc(endLocal),
      notes,
    }
    setLoading(true)
    try {
      if (isEdit && editShift) {
        await api.patch(`/api/shifts/${editShift.id}`, payload)
      } else {
        await api.post('/api/shifts', payload)
      }
      invalidate()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoading(false)
    }
  }

  const doAction = async (fn: () => Promise<unknown>) => {
    setError(null)
    setLoading(true)
    try {
      await fn()
      invalidate()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setLoading(false)
    }
  }

  const timeField = (label: string, day: string, setDay: (v: string) => void, time: string, setTime: (v: string) => void) => (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
      <Typography sx={{ minWidth: 44, fontWeight: 600 }}>{label}</Typography>
      <TextField
        label="Day"
        type="date"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Time"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => setTime(roundTime15(time))}
        fullWidth
        slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }}
      />
    </Stack>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit shift' : 'Add shift'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          select
          label="Department"
          value={departmentId}
          onChange={(e) => setDepartmentId(Number(e.target.value))}
          fullWidth
        >
          {departments.map((d) => (
            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
          ))}
        </TextField>

        <TextField select label="Position" value={positionId} onChange={(e) => setPositionId(Number(e.target.value))} fullWidth>
          {grouped.flatMap(([group, list]) => [
            <ListSubheader key={`h-${group}`}>{group}</ListSubheader>,
            ...list.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
                {p.active ? '' : ' (inactive)'}
              </MenuItem>
            )),
          ])}
        </TextField>

        <TextField
          select
          label="Assignee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
          fullWidth
          helperText="Leave open to let staff claim it"
        >
          <MenuItem value="">— Open (unassigned) —</MenuItem>
          {assignees.map((u) => (
            <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
          ))}
        </TextField>

        {timeField('Start', startDay, setStartDay, startTime, setStartTime)}
        {timeField('End', endDay, setEndDay, endTime, setEndTime)}
        <Typography variant="body2" color={hours <= 0 ? 'error' : 'text.secondary'}>
          Total: {hours > 0 ? formatHours(hours) : '—'}
        </Typography>

        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {isEdit && editShift && (
            <Button color="error" disabled={loading} onClick={() => doAction(() => api.delete(`/api/shifts/${editShift.id}`))}>
              Delete
            </Button>
          )}
        </Box>
        <Box>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          {isEdit && editShift?.status === 'draft' && (
            <Button disabled={loading} onClick={() => doAction(() => api.post(`/api/shifts/${editShift.id}/publish`, {}))} sx={{ ml: 1 }}>
              Publish
            </Button>
          )}
          {isEdit && editShift?.status === 'published' && (
            <Button disabled={loading} onClick={() => doAction(() => api.post(`/api/shifts/${editShift.id}/unpublish`, {}))} sx={{ ml: 1 }}>
              Unpublish
            </Button>
          )}
          <Button onClick={save} variant="contained" disabled={loading} sx={{ ml: 1 }}>
            {loading ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
