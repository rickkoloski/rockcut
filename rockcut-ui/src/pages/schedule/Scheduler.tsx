import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import EventIcon from '@mui/icons-material/Event'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PublishIcon from '@mui/icons-material/Publish'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import EventNoteIcon from '@mui/icons-material/EventNote'
import WorkIcon from '@mui/icons-material/Work'
import DeleteIcon from '@mui/icons-material/Delete'
import PageHeader from '../../components/PageHeader'
import { PageToolbar, SettingsChoices, SettingsGear } from '../../components/SettingsMenu'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiList } from '../../hooks/useApiQuery'
import api from '../../lib/api'
import { addDaysKey, defaultDayKeyForWeek, formatDayHeading, formatWeekRange, localDayKey, localInputToUtc, mondayKeyOf, utcToLocalInput, weekDayKeys } from '../../lib/datetime'
import type { RosterEntry, ScheduleTemplate, Shift } from '../../lib/types'
import PositionsDialog from './PositionsDialog'
import TemplatesDialog from './TemplatesDialog'
import WeekGrid from './WeekGrid'
import { NO_FILTERS, useScheduleData, useScheduleDialogs } from './useScheduleData'

/** `/scheduler`: managers build and publish the week on the grid. */
export default function Scheduler() {
  const qc = useQueryClient()
  const [mondayKey, setMondayKey] = useState<string>(mondayKeyOf())
  const [filters, setFilters] = useState(NO_FILTERS)
  // A dot on the gear while a filter narrows the grid, since the filters are out of sight.
  const filtered = !!(filters.department_id || filters.position_id)
  const range = { from: mondayKey, to: addDaysKey(mondayKey, 6) }
  const data = useScheduleData(filters, range, mondayKey)
  const {
    user, isOwner, managedKeys, canManageSchedule, shifts, isLoading, events, positions, departments, roster,
    shiftTemplates, availability, offMarkers, conflicts, managedDepartments, canManageShift, canManageEvent, canClaim, claim,
  } = data
  const { openCreate, openEdit, openCreateEvent, openEvent, dialogs } = useScheduleDialogs(data)
  const conflictCount = conflicts.size

  const { data: scheduleTemplates = [] } = useApiList<ScheduleTemplate>(['schedule_templates'], '/api/schedule_templates', undefined, { enabled: canManageSchedule })

  const [pendingCell, setPendingCell] = useState<{ userId: number | null; dateKey: string } | null>(null)
  const [positionsDialog, setPositionsDialog] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState<{ shifts: number; events: number } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [copyPreview, setCopyPreview] = useState<Shift[] | null>(null)
  const [copyBusy, setCopyBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteState, setDeleteState] = useState<{ label: string; shifts: Shift[] } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Empty week cells can create only when the filter picks one department you manage.
  const filterDept = departments.find((d) => String(d.id) === filters.department_id)
  const createDeptId = filterDept && (isOwner || managedKeys.includes(filterDept.key)) ? filterDept.id : undefined

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

  const weekDrafts = () => ({
    drafts: shifts.filter((s) => s.status === 'draft' && canManageShift(s)),
    // Only events that start this week, so a multi-day event from last week isn't swept in.
    draftEvents: events.filter((e) => e.status === 'draft' && canManageEvent(e) && localDayKey(e.starts_at) >= mondayKey),
  })

  // D52 (task 4232): publishing notifies staff, so it asks first, with the counts.
  const requestPublishWeek = () => {
    const { drafts, draftEvents } = weekDrafts()
    if (drafts.length === 0 && draftEvents.length === 0) {
      setNotice('No draft shifts or events to publish this week')
      return
    }
    setConfirmPublish({ shifts: drafts.length, events: draftEvents.length })
  }

  const publishWeek = async () => {
    setConfirmPublish(null)
    const { drafts, draftEvents } = weekDrafts()
    if (drafts.length === 0 && draftEvents.length === 0) return
    setPublishing(true)
    try {
      // One bulk call so each employee gets a single coalesced notification.
      if (drafts.length) await api.post('/api/shifts/publish', { ids: drafts.map((s) => s.id) })
      if (draftEvents.length) await api.post('/api/schedule_events/publish', { ids: draftEvents.map((e) => e.id) })
    } finally {
      setPublishing(false)
      qc.invalidateQueries({ queryKey: ['shifts'] })
      qc.invalidateQueries({ queryKey: ['schedule_events'] })
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
  // D43: Move mode steps quickly (arrow keys), so the new order shows at once
  // and the saves go one after another; the next step builds on this order,
  // not on a roster that hasn't come back yet.
  const rosterSaves = useRef<Promise<unknown>>(Promise.resolve())
  const reorderRoster = (ids: number[]) => {
    const byId = new Map(roster.map((r) => [r.id, r]))
    qc.setQueryData<RosterEntry[]>(['roster'], ids.map((id) => byId.get(id)).filter((r): r is RosterEntry => !!r))
    rosterSaves.current = rosterSaves.current
      .then(() => api.post('/api/roster/order', { user_ids: ids }))
      .catch(() => {
        setNotice('Could not save order')
        qc.invalidateQueries({ queryKey: ['roster'] })
      })
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

  // New shifts and events start in the week on screen (3940).
  const weekDefaultDay = () => defaultDayKeyForWeek(mondayKey)

  // Cell click → confirm prompt; on Yes, open the add-shift dialog prefilled.
  const requestCellCreate = (cell: { userId: number | null; dateKey: string }) => setPendingCell(cell)

  const confirmCellCreate = () => {
    if (!pendingCell) return
    openCreate({ departmentId: createDeptId, assigneeId: pendingCell.userId, dateKey: pendingCell.dateKey })
    setPendingCell(null)
  }

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Scheduler' }]} title="Scheduler" />

      {/* D52: one row on the page background — the week on the left; its actions, then the
          settings gear (filters, Templates, Positions, Delete week) on the right. */}
      <PageToolbar
        end={
          <>
              {canManageSchedule && (
                <>
                  <Button startIcon={<EventIcon />} onClick={() => openCreate({ dateKey: weekDefaultDay() })}>Add shift</Button>
                  <Button startIcon={<EventNoteIcon />} onClick={() => openCreateEvent({ departmentId: createDeptId, dateKey: weekDefaultDay() })} data-testid="add-event">Add event</Button>
                  <Button startIcon={<ContentCopyIcon />} onClick={startCopyPreviousWeek}>Copy last week</Button>
                  <Button variant="contained" startIcon={<PublishIcon />} disabled={publishing} onClick={requestPublishWeek} data-testid="publish-week">Publish week</Button>
                </>
              )}
            <SettingsGear label="Scheduler settings" testid="scheduler-settings" dot={filtered} minWidth={260}>
              {(close) => (
                <>
                    <SettingsChoices
                      label="Department"
                      options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
                      value={filters.department_id}
                      onPick={(v) => setFilters((f) => ({ ...f, department_id: v }))}
                      testid="scheduler-department"
                    />
                    <SettingsChoices
                      label="Position"
                      options={[{ value: '', label: 'All positions' }, ...positions.map((p) => ({ value: String(p.id), label: p.name }))]}
                      value={filters.position_id}
                      onPick={(v) => setFilters((f) => ({ ...f, position_id: v }))}
                      testid="scheduler-position"
                    />
                    {/* D43: setting up the schedule lives in the Scheduler only. */}
                    {canManageSchedule && <Divider />}
                    {canManageSchedule && (
                      <MenuItem
                        onClick={() => {
                          close()
                          setTemplatesOpen(true)
                        }}
                        data-testid="scheduler-templates"
                      >
                        <ListItemIcon><LibraryBooksIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="Templates" />
                      </MenuItem>
                    )}
                    {canManageSchedule && (
                      <MenuItem
                        onClick={() => {
                          close()
                          setPositionsDialog(true)
                        }}
                        data-testid="scheduler-positions"
                      >
                        <ListItemIcon><WorkIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="Positions" />
                      </MenuItem>
                    )}
                    {/* D52: destructive and rarely used, so it's here rather than on the bar; it still asks first. */}
                    {canManageSchedule && <Divider />}
                    {canManageSchedule && (
                      <MenuItem
                        onClick={() => {
                          close()
                          requestDeleteWeek()
                        }}
                        sx={{ color: 'error.main' }}
                        data-testid="scheduler-delete-week"
                      >
                        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                        <ListItemText primary="Delete week" />
                      </MenuItem>
                    )}
                </>
              )}
            </SettingsGear>
          </>
        }
      >
        <Button variant="outlined" size="small" onClick={() => setMondayKey(mondayKeyOf())}>This week</Button>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" aria-label="Previous week" onClick={() => setMondayKey((k) => addDaysKey(k, -7))}><ChevronLeftIcon /></IconButton>
          <Typography sx={{ minWidth: 120, textAlign: 'center', fontWeight: 600 }}>{formatWeekRange(mondayKey)}</Typography>
          <IconButton size="small" aria-label="Next week" onClick={() => setMondayKey((k) => addDaysKey(k, 7))}><ChevronRightIcon /></IconButton>
        </Stack>
      </PageToolbar>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : (
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
            events={events}
            canCreateEvent={canManageSchedule}
            onEventClick={openEvent}
            onCreateEvent={(dateKey?: string) => openCreateEvent({ departmentId: createDeptId, dateKey: dateKey ?? weekDefaultDay() })}
          />
        </>
      )}

      {dialogs}
      <PositionsDialog open={positionsDialog} onClose={() => setPositionsDialog(false)} positions={positions} departments={managedDepartments} shiftTemplates={shiftTemplates} canEditColors={isOwner} />
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
        open={confirmPublish !== null}
        onClose={() => setConfirmPublish(null)}
        onConfirm={publishWeek}
        loading={publishing}
        title="Publish this week?"
        message={
          confirmPublish
            ? `Publish ${[
                confirmPublish.shifts && `${confirmPublish.shifts} draft shift${confirmPublish.shifts === 1 ? '' : 's'}`,
                confirmPublish.events && `${confirmPublish.events} draft event${confirmPublish.events === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' and ')} for ${formatWeekRange(mondayKey)}? Staff will be notified.`
            : ''
        }
        confirmLabel="Publish"
        confirmColor="primary"
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
