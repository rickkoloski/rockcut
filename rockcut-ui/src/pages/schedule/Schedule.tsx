import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import SyncIcon from '@mui/icons-material/Sync'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { addDaysKey, formatDayHeading, formatTimeRange, formatWeekRange, localDayKey, localInputToUtc, mondayKeyOf, utcToLocalInput, weekDayKeys } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import { buildUnavailability, conflictMap } from '../../lib/conflicts'
import { buildOffMarkers } from '../../lib/timeoff'
import type { AvailabilitySlot, Department, Position, RosterEntry, Shift, ShiftTemplate, ScheduleTemplate, TimeOffRequest } from '../../lib/types'
import ShiftFormDialog from './ShiftFormDialog'
import PositionsDialog from './PositionsDialog'
import PaletteDialog from './PaletteDialog'
import TemplatesDialog from './TemplatesDialog'
import CalendarSyncDialog from './CalendarSyncDialog'
import WeekGrid from './WeekGrid'

type View = 'agenda' | 'week'

function initialView(): View {
  try {
    return localStorage.getItem('rockcut:schedule:view') === 'week' ? 'week' : 'agenda'
  } catch {
    return 'agenda'
  }
}

export default function Schedule({ forceView }: { forceView?: View }) {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()

  const isOwner = !!user?.is_owner
  const managedKeys = capabilities?.manages_departments ?? []
  const canManageSchedule = isOwner || managedKeys.length > 0
  const myModules = capabilities?.modules ?? []

  const [view, setView] = useState<View>(forceView ?? initialView)
  const [mondayKey, setMondayKey] = useState<string>(mondayKeyOf())
  const [filters, setFilters] = useState({ department_id: '', position_id: '', from: '', to: '', mine: false, open: false })
  const [shiftDialog, setShiftDialog] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [prefill, setPrefill] = useState<{ departmentId?: number; assigneeId?: number | null; dateKey?: string } | undefined>()
  const [pendingCell, setPendingCell] = useState<{ userId: number | null; dateKey: string } | null>(null)
  const [positionsDialog, setPositionsDialog] = useState(false)
  const [paletteDialog, setPaletteDialog] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false)
  const [copyPreview, setCopyPreview] = useState<Shift[] | null>(null)
  const [copyBusy, setCopyBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteState, setDeleteState] = useState<{ label: string; shifts: Shift[] } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const setViewPersist = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('rockcut:schedule:view', v)
    } catch {
      /* ignore */
    }
  }

  // When the route pins a view (View Schedule = agenda, Scheduler = week), follow it.
  useEffect(() => {
    if (forceView) setView(forceView)
  }, [forceView])

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
  const { data: shiftTemplates = [] } = useApiQuery<ShiftTemplate[]>(['shift_templates'], '/api/shift_templates')
  const { data: scheduleTemplates = [] } = useApiQuery<ScheduleTemplate[]>(['schedule_templates'], '/api/schedule_templates', undefined, { enabled: canManageSchedule })
  // Fetch all statuses in range; the grid shows approved + pending distinctly.
  const timeOffParams = useMemo(() => ({ from: mondayKey, to: addDaysKey(mondayKey, 6) }), [mondayKey])
  const { data: timeOff = [] } = useApiQuery<TimeOffRequest[]>(['time_off', 'schedule', mondayKey], '/api/time_off', timeOffParams)
  // Recurring availability (D25) — used for conflict detection; managers/owner only.
  const { data: availability = [] } = useApiQuery<AvailabilitySlot[]>(['availability'], '/api/availability', undefined, { enabled: canManageSchedule })

  // userId -> (Denver day key -> time-off markers with times), for the visible week.
  const offMarkers = useMemo(() => buildOffMarkers(timeOff, mondayKey), [timeOff, mondayKey])

  // Day-level set for conflict detection — approved time off only (pending is a
  // heads-up, not a hard conflict).
  const offDays = useMemo(() => {
    const m = new Map<number, Set<string>>()
    for (const [uid, dayMap] of offMarkers) {
      const set = new Set<string>()
      for (const [dayKey, marks] of dayMap) if (marks.some((mk) => !mk.pending)) set.add(dayKey)
      if (set.size) m.set(uid, set)
    }
    return m
  }, [offMarkers])

  // D24/D25 — non-blocking conflict warnings (time-off overlap + double-booking + availability).
  const unavailability = useMemo(() => buildUnavailability(availability), [availability])
  const conflicts = useMemo(() => conflictMap(shifts, offDays, unavailability), [shifts, offDays, unavailability])
  const conflictCount = conflicts.size

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

  // Drag-move in the week grid: reassign (row) and/or reschedule (day); the move
  // unpublishes the shift (back to draft). Department is unchanged.
  const moveShift = async (s: Shift, targetUserId: number | null, targetDayKey: string) => {
    const sameAssignee = (targetUserId ?? null) === (s.assignee_id ?? null)
    if (sameAssignee && targetDayKey === localDayKey(s.starts_at)) return

    const newStartLocal = targetDayKey + utcToLocalInput(s.starts_at).slice(10) // keep time-of-day
    const newStartUtc = localInputToUtc(newStartLocal)
    const durationMs = new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()
    const newEndUtc = new Date(new Date(newStartUtc).getTime() + durationMs).toISOString()

    try {
      await api.patch(`/api/shifts/${s.id}`, {
        assignee_id: targetUserId,
        starts_at: newStartUtc,
        ends_at: newEndUtc,
        status: 'draft',
      })
    } finally {
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  const publishWeek = async () => {
    const drafts = shifts.filter((s) => s.status === 'draft' && canManageShift(s))
    if (drafts.length === 0) return
    setPublishing(true)
    try {
      // One bulk call so each employee gets a single coalesced notification.
      await api.post('/api/shifts/publish', { ids: drafts.map((s) => s.id) })
    } finally {
      setPublishing(false)
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  // B — copy previous week: load last week's manageable shifts, confirm, then create +7-day drafts.
  const startCopyPreviousWeek = async () => {
    const prevMonday = addDaysKey(mondayKey, -7)
    const p: Record<string, string> = { from: prevMonday, to: addDaysKey(prevMonday, 6) }
    if (filters.department_id) p.department_id = filters.department_id
    try {
      const { data } = await api.get<{ data: Shift[] }>('/api/shifts', { params: p })
      const source = data.data.filter(canManageShift)
      if (source.length === 0) {
        setNotice('No shifts to copy from last week')
        return
      }
      setCopyPreview(source)
    } catch {
      setNotice('Could not load last week')
    }
  }

  const performCopy = async () => {
    if (!copyPreview) return
    setCopyBusy(true)
    try {
      await Promise.allSettled(
        copyPreview.map((s) => {
          const sLocal = utcToLocalInput(s.starts_at)
          const eLocal = utcToLocalInput(s.ends_at)
          return api.post('/api/shifts', {
            position_id: s.position_id,
            assignee_id: s.assignee_id,
            starts_at: localInputToUtc(addDaysKey(sLocal.slice(0, 10), 7) + sLocal.slice(10)),
            ends_at: localInputToUtc(addDaysKey(eLocal.slice(0, 10), 7) + eLocal.slice(10)),
            notes: s.notes,
          })
        }),
      )
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setNotice(`Copied ${copyPreview.length} shift${copyPreview.length === 1 ? '' : 's'} as drafts`)
    } finally {
      setCopyBusy(false)
      setCopyPreview(null)
    }
  }

  // Employee display order (up/down arrows → persist globally).
  const reorderRoster = async (ids: number[]) => {
    try {
      await api.post('/api/roster/order', { user_ids: ids })
      qc.invalidateQueries({ queryKey: ['roster'] })
    } catch {
      setNotice('Could not save order')
    }
  }

  const publishForEmployee = async (userId: number) => {
    const drafts = shifts.filter((s) => s.assignee_id === userId && s.status === 'draft' && canManageShift(s))
    if (drafts.length === 0) {
      setNotice('No draft shifts to publish this week')
      return
    }
    await api.post('/api/shifts/publish', { ids: drafts.map((s) => s.id) })
    qc.invalidateQueries({ queryKey: ['shifts'] })
    setNotice(`Published ${drafts.length} shift${drafts.length === 1 ? '' : 's'}`)
  }

  const requestDeleteWeek = () => {
    const source = shifts.filter(canManageShift)
    if (source.length === 0) {
      setNotice('No shifts to delete this week')
      return
    }
    setDeleteState({ label: 'this week', shifts: source })
  }

  const requestDeleteEmployee = (userId: number) => {
    const source = shifts.filter((s) => s.assignee_id === userId && canManageShift(s))
    if (source.length === 0) {
      setNotice("No shifts to delete for this employee this week")
      return
    }
    const who = roster.find((r) => r.id === userId)?.name ?? 'this employee'
    setDeleteState({ label: `${who}'s shifts this week`, shifts: source })
  }

  const performDelete = async () => {
    if (!deleteState) return
    setDeleteBusy(true)
    try {
      await Promise.allSettled(deleteState.shifts.map((s) => api.delete(`/api/shifts/${s.id}`)))
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setNotice(`Deleted ${deleteState.shifts.length} shift${deleteState.shifts.length === 1 ? '' : 's'}`)
    } finally {
      setDeleteBusy(false)
      setDeleteState(null)
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
  // Cell click → confirm prompt; on Yes, open the add-shift dialog prefilled.
  const requestCellCreate = (cell: { userId: number | null; dateKey: string }) => setPendingCell(cell)

  const confirmCellCreate = () => {
    if (!pendingCell) return
    setEditShift(null)
    setPrefill({ departmentId: createDeptId, assigneeId: pendingCell.userId, dateKey: pendingCell.dateKey })
    setShiftDialog(true)
    setPendingCell(null)
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
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: forceView === 'week' ? 'Scheduler' : 'Schedule' }]}
        title={forceView === 'week' ? 'Scheduler' : 'Schedule'}
        toolbar={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {!forceView && (
              <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v) => v && setViewPersist(v)}>
                <ToggleButton value="agenda">Agenda</ToggleButton>
                <ToggleButton value="week">Week</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Button startIcon={<SyncIcon />} onClick={() => setCalendarSyncOpen(true)}>Calendar sync</Button>
            {isOwner && (
              <Button startIcon={<PaletteIcon />} onClick={() => setPaletteDialog(true)}>Colors</Button>
            )}
            {canManageSchedule && (
              <>
                {view === 'week' && (
                  <>
                    <Button startIcon={<PublishIcon />} disabled={publishing} onClick={publishWeek}>Publish week</Button>
                    <Button startIcon={<ContentCopyIcon />} onClick={startCopyPreviousWeek}>Copy last week</Button>
                    <Button color="error" onClick={requestDeleteWeek}>Delete week</Button>
                  </>
                )}
                <Button startIcon={<LibraryBooksIcon />} onClick={() => setTemplatesOpen(true)}>Templates</Button>
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
        <>
          {conflictCount > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {conflictCount} scheduling conflict{conflictCount === 1 ? '' : 's'} this week
              {' '}(time off, unavailability, or overlapping shifts). Marked shifts are outlined in red.
            </Alert>
          )}
          <WeekGrid
            mondayKey={mondayKey}
            shifts={shifts}
            roster={roster}
            departments={departments}
            currentUserId={user?.id}
            canCreate={canManageSchedule}
            canManageSchedule={canManageSchedule}
            canManageShift={canManageShift}
            canClaim={canClaim}
            onCreate={requestCellCreate}
            onEditShift={openEdit}
            onClaim={claim}
            onMoveShift={moveShift}
            onReorder={reorderRoster}
            onPublishEmployee={publishForEmployee}
            onDeleteEmployee={requestDeleteEmployee}
            offMarkers={offMarkers}
            conflicts={conflicts}
            availability={availability}
          />
        </>
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

      <ShiftFormDialog open={shiftDialog} onClose={() => setShiftDialog(false)} editShift={editShift} departments={managedDepartments} positions={positions} roster={roster} shiftTemplates={shiftTemplates} prefill={prefill} allShifts={shifts} offDays={offDays} unavailability={unavailability} />
      <PositionsDialog open={positionsDialog} onClose={() => setPositionsDialog(false)} positions={positions} departments={managedDepartments} shiftTemplates={shiftTemplates} />
      <PaletteDialog open={paletteDialog} onClose={() => setPaletteDialog(false)} departments={departments} />
      <CalendarSyncDialog open={calendarSyncOpen} onClose={() => setCalendarSyncOpen(false)} />
      <ConfirmDialog
        open={pendingCell !== null}
        onClose={() => setPendingCell(null)}
        onConfirm={confirmCellCreate}
        title="Add shift?"
        message={
          pendingCell
            ? `Add a shift for ${
                pendingCell.userId ? roster.find((r) => r.id === pendingCell.userId)?.name ?? 'this employee' : 'an open slot'
              } on ${formatDayHeading(`${pendingCell.dateKey}T12:00:00Z`)}?`
            : ''
        }
        confirmLabel="Yes"
        confirmColor="primary"
      />
      <TemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        templates={scheduleTemplates}
        weekShifts={shifts}
        mondayKey={mondayKey}
        days={weekDayKeys(mondayKey)}
        canManageShift={canManageShift}
        onNotice={setNotice}
      />
      <ConfirmDialog
        open={copyPreview !== null}
        onClose={() => setCopyPreview(null)}
        onConfirm={performCopy}
        loading={copyBusy}
        title="Copy last week?"
        message={`Copy ${copyPreview?.length ?? 0} shift${copyPreview?.length === 1 ? '' : 's'} from last week into this week as drafts?`}
        confirmLabel="Copy"
        confirmColor="primary"
      />
      <ConfirmDialog
        open={deleteState !== null}
        onClose={() => setDeleteState(null)}
        onConfirm={performDelete}
        loading={deleteBusy}
        title="Delete shifts?"
        message={`Permanently delete ${deleteState?.shifts.length ?? 0} shift${deleteState?.shifts.length === 1 ? '' : 's'} (${deleteState?.label ?? ''})? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
      />
      <Snackbar
        open={!!notice}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}
