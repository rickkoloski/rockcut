import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import EventIcon from '@mui/icons-material/Event'
import SettingsIcon from '@mui/icons-material/Settings'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { formatDayHeading, formatTimeRange, localDayKey } from '../../lib/datetime'
import type { Department, Position, Shift, User } from '../../lib/types'
import ShiftFormDialog from './ShiftFormDialog'
import PositionsDialog from './PositionsDialog'

export default function Schedule() {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()

  const isOwner = !!user?.is_owner
  const managedKeys = capabilities?.manages_departments ?? []
  const canManageSchedule = isOwner || managedKeys.length > 0
  const myModules = capabilities?.modules ?? []

  const [filters, setFilters] = useState({ department_id: '', position_id: '', from: '', to: '', mine: false, open: false })
  const [shiftDialog, setShiftDialog] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [positionsDialog, setPositionsDialog] = useState(false)

  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (filters.department_id) p.department_id = filters.department_id
    if (filters.position_id) p.position_id = filters.position_id
    if (filters.from) p.from = filters.from
    if (filters.to) p.to = filters.to
    if (filters.mine) p.mine = 'true'
    if (filters.open) p.open = 'true'
    return p
  }, [filters])

  const { data: shifts = [], isLoading } = useApiQuery<Shift[]>(['shifts', params], '/api/shifts', params)
  const { data: positions = [] } = useApiQuery<Position[]>(['positions'], '/api/positions')
  const { data: departments = [] } = useApiQuery<Department[]>(['departments'], '/api/departments')
  const { data: users = [] } = useApiQuery<User[]>(['users'], '/api/users', undefined, { enabled: canManageSchedule })

  const managedDepartments = isOwner ? departments : departments.filter((d) => managedKeys.includes(d.key))

  const canManageShift = (s: Shift) => isOwner || (s.department?.key ? managedKeys.includes(s.department.key) : false)
  const canClaim = (s: Shift) => !s.assignee_id && s.status === 'published' && !!s.department?.key && myModules.includes(s.department.key)

  const claim = async (s: Shift) => {
    try {
      await api.post(`/api/shifts/${s.id}/claim`, {})
      qc.invalidateQueries({ queryKey: ['shifts'] })
    } catch {
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const s of shifts) {
      const key = localDayKey(s.starts_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [shifts])

  const openCreate = () => {
    setEditShift(null)
    setShiftDialog(true)
  }
  const openEdit = (s: Shift) => {
    setEditShift(s)
    setShiftDialog(true)
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Schedule' }]}
        title="Schedule"
        toolbar={
          canManageSchedule ? (
            <Stack direction="row" spacing={1}>
              <Button startIcon={<SettingsIcon />} onClick={() => setPositionsDialog(true)}>
                Positions
              </Button>
              <Button variant="contained" startIcon={<EventIcon />} onClick={openCreate}>
                Add shift
              </Button>
            </Stack>
          ) : undefined
        }
      />

      <Paper sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
          <TextField
            select size="small" label="Department" value={filters.department_id}
            onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))} sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All departments</MenuItem>
            {departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" label="Position" value={filters.position_id}
            onChange={(e) => setFilters((f) => ({ ...f, position_id: e.target.value }))} sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All positions</MenuItem>
            {positions.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>)}
          </TextField>
          <TextField
            size="small" label="From" type="date" value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small" label="To" type="date" value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControlLabel control={<Switch checked={filters.mine} onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} />} label="My shifts" />
          <FormControlLabel control={<Switch checked={filters.open} onChange={(e) => setFilters((f) => ({ ...f, open: e.target.checked }))} />} label="Open only" />
        </Stack>
      </Paper>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : groups.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>No shifts match these filters.</Typography>
      ) : (
        groups.map(([day, dayShifts]) => (
          <Box key={day} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              {formatDayHeading(dayShifts[0].starts_at)}
            </Typography>
            <Stack spacing={1}>
              {dayShifts.map((s) => {
                const mine = s.assignee_id && s.assignee_id === user?.id
                return (
                  <Paper
                    key={s.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      flexWrap: 'wrap',
                      borderColor: mine ? 'primary.main' : 'divider',
                      cursor: canManageShift(s) ? 'pointer' : 'default',
                    }}
                    onClick={canManageShift(s) ? () => openEdit(s) : undefined}
                  >
                    <Chip label={s.department?.name ?? '—'} size="small" color="secondary" variant="outlined" />
                    <Typography sx={{ fontWeight: 600, minWidth: 120 }}>{s.position?.name ?? '—'}</Typography>
                    <Typography color="text.secondary" sx={{ minWidth: 150 }}>
                      {formatTimeRange(s.starts_at, s.ends_at)}
                    </Typography>
                    <Typography sx={{ flexGrow: 1 }}>
                      {s.assignee ? (s.assignee.name || s.assignee.email) : <em>Open</em>}
                    </Typography>
                    {s.status === 'draft' && <Chip label="Draft" size="small" color="warning" variant="outlined" />}
                    {mine && <Chip label="You" size="small" color="primary" />}
                    {canClaim(s) && (
                      <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); claim(s) }}>
                        Claim
                      </Button>
                    )}
                  </Paper>
                )
              })}
            </Stack>
          </Box>
        ))
      )}

      <ShiftFormDialog
        open={shiftDialog}
        onClose={() => setShiftDialog(false)}
        editShift={editShift}
        departments={managedDepartments}
        positions={positions}
        users={users}
      />
      <PositionsDialog open={positionsDialog} onClose={() => setPositionsDialog(false)} positions={positions} />
    </>
  )
}
