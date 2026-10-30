// D52 (D44 item 0): what View Schedule and the Scheduler share — the loading,
// permissions, conflicts, claiming, and the shift and event dialogs.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiList } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { addDaysKey } from '../../lib/datetime'
import { buildOffWindows, buildUnavailability, conflictMap } from '../../lib/conflicts'
import { buildOffMarkers } from '../../lib/timeoff'
import type { AvailabilitySlot, Department, Position, RosterEntry, ScheduleEvent, Shift, ShiftTemplate, TimeOffRequest } from '../../lib/types'
import ShiftFormDialog from './ShiftFormDialog'
import EventFormDialog from './EventFormDialog'

export interface ScheduleFilters {
  department_id: string
  position_id: string
  mine: boolean
  open: boolean
}

export const NO_FILTERS: ScheduleFilters = { department_id: '', position_id: '', mine: false, open: false }

/**
 * Shifts and events for the filters and dates, plus the reference data. Time off
 * and availability (for conflicts and the shift dialog) load for the week of
 * `mondayKey`.
 */
export function useScheduleData(filters: ScheduleFilters, range: { from: string; to: string }, mondayKey: string) {
  const qc = useQueryClient()
  const { user, capabilities } = useAuth()

  const isOwner = !!user?.is_owner
  const managedKeys = useMemo(() => capabilities?.manages_departments ?? [], [capabilities])
  const canManageSchedule = isOwner || managedKeys.length > 0
  // D33: a shared tablet reads the published schedule only — no time off,
  // templates or claiming (its API would refuse them anyway).
  const isDevice = user?.kind === 'device'
  const myModules = capabilities?.modules ?? []

  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (filters.department_id) p.department_id = filters.department_id
    if (filters.position_id) p.position_id = filters.position_id
    if (filters.mine) p.mine = 'true'
    if (filters.open) p.open = 'true'
    if (range.from) p.from = range.from
    if (range.to) p.to = range.to
    return p
  }, [filters, range.from, range.to])

  const { data: shifts = [], isLoading } = useApiList<Shift>(['shifts', params], '/api/shifts', params)

  // D32 — events follow the department and date filters. "My shifts", "Open only"
  // and a position filter are about shifts, so they hide events.
  const eventsHidden = filters.mine || filters.open || !!filters.position_id
  const eventParams = useMemo(() => {
    const p: Record<string, string> = {}
    if (params.department_id) p.department_id = params.department_id
    if (params.from) p.from = params.from
    if (params.to) p.to = params.to
    return p
  }, [params])
  const { data: loadedEvents } = useApiList<ScheduleEvent>(['schedule_events', eventParams], '/api/schedule_events', eventParams, { enabled: !eventsHidden })
  const events = useMemo(() => (eventsHidden || !loadedEvents ? [] : loadedEvents), [eventsHidden, loadedEvents])
  const { data: positions = [] } = useApiList<Position>(['positions'], '/api/positions')
  const { data: departments = [] } = useApiList<Department>(['departments'], '/api/departments')
  const { data: roster = [] } = useApiList<RosterEntry>(['roster'], '/api/roster')
  const { data: shiftTemplates = [] } = useApiList<ShiftTemplate>(['shift_templates'], '/api/shift_templates', undefined, { enabled: !isDevice })
  // Fetch all statuses in range; the grid shows approved + pending distinctly.
  // Through the next Monday (D36 QA): a Sunday overnight shift runs into it, so
  // its conflict check needs that day's time off. The grid clips to the week.
  const timeOffParams = useMemo(() => ({ from: mondayKey, to: addDaysKey(mondayKey, 7) }), [mondayKey])
  const { data: timeOff = [] } = useApiList<TimeOffRequest>(['time_off', 'schedule', mondayKey], '/api/time_off', timeOffParams, { enabled: !isDevice })
  // Recurring availability (D25) — used for conflict detection; managers/owner only.
  const { data: availability = [] } = useApiList<AvailabilitySlot>(['availability'], '/api/availability', undefined, { enabled: canManageSchedule })

  // userId -> (Denver day key -> time-off markers with times), for the visible week.
  const offMarkers = useMemo(() => buildOffMarkers(timeOff, mondayKey), [timeOff, mondayKey])

  // Approved time off as time windows for conflict detection (D36: a timed
  // request conflicts only with shifts that overlap its hours).
  const offWindows = useMemo(() => buildOffWindows(timeOff), [timeOff])

  // D24/D25 — non-blocking conflict warnings (time-off overlap + double-booking + availability).
  const unavailability = useMemo(() => buildUnavailability(availability), [availability])
  const conflicts = useMemo(() => conflictMap(shifts, offWindows, unavailability), [shifts, offWindows, unavailability])

  const managedDepartments = isOwner ? departments : departments.filter((d) => managedKeys.includes(d.key))
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const canManageShift = (s: Shift) => isOwner || (s.department?.key ? managedKeys.includes(s.department.key) : false)
  const canManageEvent = (e: ScheduleEvent) => isOwner || (e.department?.key ? managedKeys.includes(e.department.key) : false)
  const canClaim = (s: Shift) => !isDevice && !s.assignee_id && s.status === 'published' && !!s.department?.key && myModules.includes(s.department.key)

  const claim = async (s: Shift) => {
    try {
      await api.post(`/api/shifts/${s.id}/claim`, {})
    } finally {
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
  }

  return {
    user,
    isOwner,
    managedKeys,
    canManageSchedule,
    isDevice,
    shifts,
    isLoading,
    events,
    positions,
    departments,
    roster,
    shiftTemplates,
    availability,
    offMarkers,
    offWindows,
    unavailability,
    conflicts,
    managedDepartments,
    deptById,
    canManageShift,
    canManageEvent,
    canClaim,
    claim,
  }
}

export type ScheduleData = ReturnType<typeof useScheduleData>

/** The add/edit shift and event dialogs; `dialogs` renders them. */
export function useScheduleDialogs(data: ScheduleData) {
  const [shiftDialog, setShiftDialog] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [prefill, setPrefill] = useState<{ departmentId?: number; assigneeId?: number | null; dateKey?: string } | undefined>()
  const [eventDialog, setEventDialog] = useState(false)
  const [editEvent, setEditEvent] = useState<ScheduleEvent | null>(null)
  const [eventPrefill, setEventPrefill] = useState<{ departmentId?: number; dateKey?: string } | undefined>()

  const openCreate = (fill?: { departmentId?: number; assigneeId?: number | null; dateKey?: string }) => {
    setEditShift(null)
    setPrefill(fill)
    setShiftDialog(true)
  }
  const openEdit = (s: Shift) => {
    setEditShift(s)
    setPrefill(undefined)
    setShiftDialog(true)
  }
  const openCreateEvent = (fill?: { departmentId?: number; dateKey?: string }) => {
    setEditEvent(null)
    setEventPrefill(fill)
    setEventDialog(true)
  }
  const openEvent = (e: ScheduleEvent) => {
    setEditEvent(e)
    setEventPrefill(undefined)
    setEventDialog(true)
  }

  const dialogs = (
    <>
      <EventFormDialog
        open={eventDialog}
        onClose={() => setEventDialog(false)}
        editEvent={editEvent}
        departments={data.managedDepartments}
        readOnly={!!editEvent && !data.canManageEvent(editEvent)}
        prefill={eventPrefill}
      />
      <ShiftFormDialog
        open={shiftDialog}
        onClose={() => setShiftDialog(false)}
        editShift={editShift}
        departments={data.managedDepartments}
        positions={data.positions}
        roster={data.roster}
        shiftTemplates={data.shiftTemplates}
        prefill={prefill}
        allShifts={data.shifts}
        offWindows={data.offWindows}
        unavailability={data.unavailability}
      />
    </>
  )

  return { openCreate, openEdit, openCreateEvent, openEvent, dialogs }
}
