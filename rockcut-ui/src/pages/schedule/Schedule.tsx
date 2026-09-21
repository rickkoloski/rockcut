import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import EventIcon from '@mui/icons-material/Event'
import SettingsIcon from '@mui/icons-material/Settings'
import PaletteIcon from '@mui/icons-material/Palette'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PublishIcon from '@mui/icons-material/Publish'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { addDaysKey, formatDayHeading, formatTimeRange, formatWeekRange, localDayKey, mondayKeyOf } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import type { Department, Position, RosterEntry, Shift, User } from '../../lib/types'
import ShiftFormDialog from './ShiftFormDialog'
import PositionsDialog from './PositionsDialog'
import PaletteDialog from './PaletteDialog'
import WeekGrid from './WeekGrid'

type View = 'agenda' | 'week'

function initialView(): View {
  try {
    return localStorage.getItem('rockcut:schedule:view') === 'week' ? 'week' : 'agenda'
  } catch {
    return 'agenda'
  }
}

export default function Schedule() {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()

  const isOwner = !!user?.is_owner
  const managedKeys = capabilities?.manages_departments ?? []
  const canManageSchedule = isOwner || managedKeys.length > 0
  const myModules = capabilities?.modules ?? []

  const [view, setView] = useState<View>(initialView)
  const [mondayKey, setMondayKey] = useState<string>(mondayKeyOf())
  const [filters, setFilters] = useState({ department_id: '', position_id: '', from: '', to: '', mine: false, open: false })
  const [shiftDialog, setShiftDialog] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [prefill, setPrefill] = useState<{ departmentId?: number; assigneeId?: number | null; dateKey?: string } | undefined>()
  const [positionsDialog, setPositionsDialog] = useState(false)
  const [paletteDialog, setPaletteDialog] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const setViewPersist = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('rockcut:schedule:view', v)
    } catch {
      /* ignore */
    }
  }

  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (filters.department_id) p.department_id = filters.department_id
    if (filters.position_id) p.position_id = filters.position_id
    if (filters.mine) p.mine = 'true'
    if (filters.open) p.open = 'true'
    if (view === 'week') {
      p.from = mondayKey
      p.to = addDaysKey(mondayKey, 6)
    } else {
      if (filters.from) p.from = filters.from
      if (filters.to) p.to = filters.to
    }
    return p
  }, [filters, view, mondayKey])

  const { data: shifts = [], isLoading } = useApiQuery<Shift[]>(['shifts', params], '/api/shifts', params)
  const { data: positions = [] } = useApiQuery<Position[]>(['positions'], '/api/positions')
  const { data: departments = [] } = useApiQuery<Department[]>(['departments'], '/api/departments')
  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster')
  const { data: users = [] } = useApiQuery<User[]>(['users'], '/api/users', undefined, { enabled: canManageSchedule })

  const managedDepartments = isOwner ? departments : departments.filter((d) => managedKeys.includes(d.key))
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const canManageShift = (s: Shift) => isOwner || (s.department?.key ? managedKeys.includes(s.department.key) : false)
  const canClaim = (s: Shift) => !s.assignee_id && s.status === 'published' && !!s.department?.key && myModules.includes(s.department.key)

  // Empty week cells can create only when the filter picks one department you manage.
  const filterDept = departments.find((d) => String(d.id) === filters.department_id)
  const createDeptId = view === 'week' && filterDept && (isOwner || managedKeys.includes(filterDept.key)) ? filterDept.id : undefined

  const claim = async (s: Shift) => {
    try {
      await api.post(`/api/shifts/${s.id}/claim`, {})
    } finally {
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  const publishWeek = async () => {
    const drafts = shifts.filter((s) => s.status === 'draft' && canManageShift(s))
    if (drafts.length === 0) return
    setPublishing(true)
    try {
      await Promise.allSettled(drafts.map((s) => api.post(`/api/shifts/${s.id}/publish`, {})))
    } finally {
      setPublishing(false)
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  const openCreate = () => {
    setEditShift(null)
    setPrefill(undefined)
    setShiftDialog(true)
  }
  const openEdit = (s: Shift) => {
    setEditShift(s)
    setPrefill(undefined)
    setShiftDialog(true)
  }
  const openCellCreate = (cell: { userId: number | null; dateKey: string; departmentId: number }) => {
    setEditShift(null)
    setPrefill({ departmentId: cell.departmentId, assigneeId: cell.userId, dateKey: cell.dateKey })
    setShiftDialog(true)
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

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Schedule' }]}
        title="Schedule"
        toolbar={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && setViewPersist(v)}>
              <ToggleButton value="agenda">Agenda</ToggleButton>
              <ToggleButton value="week">Week</ToggleButton>
            </ToggleButtonGroup>
            {isOwner && (
              <Button startIcon={<PaletteIcon />} onClick={() => setPaletteDialog(true)}>Colors</Button>
            )}
            {canManageSchedule && (
              <>
                {view === 'week' && (
                  <Button startIcon={<PublishIcon />} disabled={publishing} onClick={publishWeek}>Publish week</Button>
                )}
                <Button startIcon={<SettingsIcon />} onClick={() => setPositionsDialog(true)}>Positions</Button>
                <Button variant="contained" startIcon={<EventIcon />} onClick={openCreate}>Add shift</Button>
              </>
            )}
          </Stack>
        }
      />

      <Paper sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
          {view === 'week' ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <IconButton size="small" onClick={() => setMondayKey((k) => addDaysKey(k, -7))}><ChevronLeftIcon /></IconButton>
              <Typography sx={{ minWidth: 120, textAlign: 'center', fontWeight: 600 }}>{formatWeekRange(mondayKey)}</Typography>
              <IconButton size="small" onClick={() => setMondayKey((k) => addDaysKey(k, 7))}><ChevronRightIcon /></IconButton>
              <Button size="small" onClick={() => setMondayKey(mondayKeyOf())}>This week</Button>
            </Stack>
          ) : (
            <>
              <TextField size="small" label="From" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" label="To" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            </>
          )}
          <TextField select size="small" label="Department" value={filters.department_id} onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))} sx={{ minWidth: 150 }}>
            <MenuItem value="">All departments</MenuItem>
            {departments.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Position" value={filters.position_id} onChange={(e) => setFilters((f) => ({ ...f, position_id: e.target.value }))} sx={{ minWidth: 150 }}>
            <MenuItem value="">All positions</MenuItem>
            {positions.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={filters.mine} onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} />} label="My shifts" />
          <FormControlLabel control={<Switch checked={filters.open} onChange={(e) => setFilters((f) => ({ ...f, open: e.target.checked }))} />} label="Open only" />
        </Stack>

        {/* legend */}
        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }} flexWrap="wrap">
          {departments.map((d) => (
            <Stack key={d.id} direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: departmentColor(d) }} />
              <Typography variant="caption" color="text.secondary">{d.name}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : view === 'week' ? (
        <WeekGrid
          mondayKey={mondayKey}
          shifts={shifts}
          roster={roster}
          departments={departments}
          currentUserId={user?.id}
          createDeptId={createDeptId}
          canManageShift={canManageShift}
          canClaim={canClaim}
          onCreate={openCellCreate}
          onEditShift={openEdit}
          onClaim={claim}
        />
      ) : groups.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>No shifts match these filters.</Typography>
      ) : (
        groups.map(([day, dayShifts]) => (
          <Box key={day} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{formatDayHeading(dayShifts[0].starts_at)}</Typography>
            <Stack spacing={1}>
              {dayShifts.map((s) => {
                const mine = s.assignee_id && s.assignee_id === user?.id
                const { bg, fg } = shiftColor(departmentColor(deptById.get(s.department_id) ?? s.department ?? undefined), s.position_id)
                return (
                  <Paper
                    key={s.id}
                    variant="outlined"
                    sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderColor: mine ? 'primary.main' : 'divider', cursor: canManageShift(s) ? 'pointer' : 'default' }}
                    onClick={canManageShift(s) ? () => openEdit(s) : undefined}
                  >
                    <Chip label={`${s.department?.name ?? '—'} · ${s.position?.name ?? '—'}`} size="small" sx={{ bgcolor: bg, color: fg, fontWeight: 600 }} />
                    <Typography color="text.secondary" sx={{ minWidth: 150 }}>{formatTimeRange(s.starts_at, s.ends_at)}</Typography>
                    <Typography sx={{ flexGrow: 1 }}>{s.assignee ? (s.assignee.name || s.assignee.email) : <em>Open</em>}</Typography>
                    {s.status === 'draft' && <Chip label="Draft" size="small" color="warning" variant="outlined" />}
                    {mine && <Chip label="You" size="small" color="primary" />}
                    {canClaim(s) && (
                      <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); claim(s) }}>Claim</Button>
                    )}
                  </Paper>
                )
              })}
            </Stack>
          </Box>
        ))
      )}

      <ShiftFormDialog open={shiftDialog} onClose={() => setShiftDialog(false)} editShift={editShift} departments={managedDepartments} positions={positions} users={users} prefill={prefill} />
      <PositionsDialog open={positionsDialog} onClose={() => setPositionsDialog(false)} positions={positions} />
      <PaletteDialog open={paletteDialog} onClose={() => setPaletteDialog(false)} departments={departments} />
    </>
  )
}
