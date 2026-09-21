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
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { localInputToUtc, utcToLocalInput } from '../../lib/datetime'
import type { Department, Position, Shift, User } from '../../lib/types'

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
  users: User[]
  prefill?: Prefill
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

function defaultStart(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return utcToLocalInput(d.toISOString())
}

export default function ShiftFormDialog({ open, onClose, editShift, departments, positions, users, prefill }: Props) {
  const qc = useQueryClient()
  const isEdit = !!editShift

  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [positionId, setPositionId] = useState<number | ''>('')
  const [assigneeId, setAssigneeId] = useState<number | ''>('')
  const [startsLocal, setStartsLocal] = useState('')
  const [endsLocal, setEndsLocal] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editShift) {
      setDepartmentId(editShift.department_id)
      setPositionId(editShift.position_id)
      setAssigneeId(editShift.assignee_id ?? '')
      setStartsLocal(utcToLocalInput(editShift.starts_at))
      setEndsLocal(utcToLocalInput(editShift.ends_at))
      setNotes(editShift.notes ?? '')
    } else {
      const start = prefill?.dateKey ? `${prefill.dateKey}T09:00` : defaultStart()
      setDepartmentId(prefill?.departmentId ?? departments[0]?.id ?? '')
      setPositionId('')
      setAssigneeId(prefill?.assigneeId ?? '')
      setStartsLocal(start)
      const end = new Date(localInputToUtc(start))
      end.setHours(end.getHours() + 6)
      setEndsLocal(utcToLocalInput(end.toISOString()))
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editShift])

  const selectedDeptKey = departments.find((d) => d.id === departmentId)?.key

  // Assignees = users who belong to the selected department.
  const deptUsers = useMemo(
    () =>
      users.filter((u) => (u.memberships ?? []).some((m) => m.department_key === selectedDeptKey)),
    [users, selectedDeptKey],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Position[]>()
    for (const p of positions.filter((p) => p.active || p.id === positionId)) {
      const g = p.group ?? 'Other'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    return [...map.entries()]
  }, [positions, positionId])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shifts'] })

  const save = async () => {
    setError(null)
    if (!departmentId || !positionId || !startsLocal || !endsLocal) {
      setError('Department, position, start, and end are required')
      return
    }
    const payload = {
      department_id: departmentId,
      position_id: positionId,
      assignee_id: assigneeId === '' ? null : assigneeId,
      starts_at: localInputToUtc(startsLocal),
      ends_at: localInputToUtc(endsLocal),
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit shift' : 'Add shift'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          select
          label="Department"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(Number(e.target.value))
            setAssigneeId('')
          }}
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
          {deptUsers.map((u) => (
            <MenuItem key={u.id} value={u.id}>{u.name || u.email}</MenuItem>
          ))}
        </TextField>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Starts"
            type="datetime-local"
            value={startsLocal}
            onChange={(e) => setStartsLocal(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Ends"
            type="datetime-local"
            value={endsLocal}
            onChange={(e) => setEndsLocal(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

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
            <Button
              disabled={loading}
              onClick={() => doAction(() => api.post(`/api/shifts/${editShift.id}/publish`, {}))}
              sx={{ ml: 1 }}
            >
              Publish
            </Button>
          )}
          {isEdit && editShift?.status === 'published' && (
            <Button
              disabled={loading}
              onClick={() => doAction(() => api.post(`/api/shifts/${editShift.id}/unpublish`, {}))}
              sx={{ ml: 1 }}
            >
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
