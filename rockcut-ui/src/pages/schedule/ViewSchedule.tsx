import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SyncIcon from '@mui/icons-material/Sync'
import EventNoteIcon from '@mui/icons-material/EventNote'
import RepeatIcon from '@mui/icons-material/Repeat'
import PageHeader from '../../components/PageHeader'
import { PageToolbar, SettingsChoices, SettingsGear, SettingsToggle } from '../../components/SettingsMenu'
import { addDaysKey, formatDayHeading, formatTimeRange, localDayKey, mondayKeyOf } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import { eventDayKeys, eventDayLabel } from '../../lib/events'
import { daysBetween } from '../../lib/gantt'
import type { ScheduleEvent, Shift } from '../../lib/types'
import CalendarSyncDialog from './CalendarSyncDialog'
import { NO_FILTERS, useScheduleData, useScheduleDialogs } from './useScheduleData'

/** `/schedule`: the published schedule as a list of days, for everyone. */
export default function ViewSchedule() {
  // D45: opens on today through six days later (Colorado); not remembered.
  const [filters, setFilters] = useState(() => {
    const from = localDayKey(new Date().toISOString())
    return { ...NO_FILTERS, from, to: addDaysKey(from, 6) }
  })
  // Time off for the shift dialog's conflict check loads for this week.
  const [mondayKey] = useState(mondayKeyOf)
  const data = useScheduleData(filters, filters, mondayKey)
  const { user, isDevice, shifts, isLoading, events, positions, departments, deptById, canManageShift, canClaim, claim } = data
  const { openEdit, openEvent, dialogs } = useScheduleDialogs(data)

  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false)
  // D52: Today keeps the number of days showing and starts them today.
  const showToday = () =>
    setFilters((f) => {
      const from = localDayKey(new Date().toISOString())
      const span = f.from && f.to && f.to >= f.from ? daysBetween(f.from, f.to) : 6
      return { ...f, from, to: addDaysKey(from, span) }
    })
  const filtered = !!(filters.department_id || filters.position_id || filters.mine || filters.open)
  // D35: "Re-subscribe to your Rockcut calendar" links here with ?calendar_sync=1.
  const [searchParams, setSearchParams] = useSearchParams()
  const syncRequested = searchParams.get('calendar_sync') === '1'
  if (syncRequested && !isDevice && !calendarSyncOpen) setCalendarSyncOpen(true)
  useEffect(() => {
    if (!syncRequested) return
    const next = new URLSearchParams(searchParams)
    next.delete('calendar_sync')
    setSearchParams(next, { replace: true })
  }, [syncRequested, searchParams, setSearchParams])

  // Days: shifts, plus events on every day they cover (D32). Days outside
  // the date filters aren't shown for multi-day events.
  const groups = useMemo(() => {
    const map = new Map<string, { shifts: Shift[]; events: ScheduleEvent[] }>()
    const at = (key: string) => {
      if (!map.has(key)) map.set(key, { shifts: [], events: [] })
      return map.get(key)!
    }
    for (const s of shifts) at(localDayKey(s.starts_at)).shifts.push(s)
    for (const e of events) {
      for (const key of eventDayKeys(e)) {
        if ((filters.from && key < filters.from) || (filters.to && key > filters.to)) continue
        at(key).events.push(e)
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [shifts, events, filters.from, filters.to])

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Schedule' }]} title="Schedule" />

      {/* D52: Today and the dates on the left; the filters and Calendar sync behind the gear. */}
      <PageToolbar
        end={
          <SettingsGear label="Schedule settings" testid="schedule-settings" dot={filtered} minWidth={260}>
            {(close) => [
              <SettingsChoices
                key="department"
                label="Department"
                options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
                value={filters.department_id}
                onPick={(v) => setFilters((f) => ({ ...f, department_id: v }))}
                testid="schedule-department"
              />,
              <SettingsChoices
                key="position"
                label="Position"
                options={[{ value: '', label: 'All positions' }, ...positions.map((p) => ({ value: String(p.id), label: p.name }))]}
                value={filters.position_id}
                onPick={(v) => setFilters((f) => ({ ...f, position_id: v }))}
                testid="schedule-position"
              />,
              <Divider key="d1" />,
              !isDevice && (
                <SettingsToggle key="mine" label="My shifts" checked={filters.mine} onChange={(on) => setFilters((f) => ({ ...f, mine: on }))} testid="schedule-mine" />
              ),
              <SettingsToggle key="open" label="Open shifts only" checked={filters.open} onChange={(on) => setFilters((f) => ({ ...f, open: on }))} testid="schedule-open" />,
              // DEV G6: calendar feeds are personal; not on a shared tablet.
              !isDevice && <Divider key="d2" />,
              !isDevice && (
                <MenuItem
                  key="sync"
                  onClick={() => {
                    close()
                    setCalendarSyncOpen(true)
                  }}
                  data-testid="schedule-calendar-sync"
                >
                  <ListItemIcon><SyncIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Calendar sync" />
                </MenuItem>
              ),
            ]}
          </SettingsGear>
        }
      >
        <Button variant="outlined" size="small" onClick={showToday} data-testid="schedule-today">
          Today
        </Button>
        <TextField size="small" label="From" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" label="To" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
      </PageToolbar>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : groups.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>No shifts or events match these filters.</Typography>
      ) : (
        groups.map(([day, { shifts: dayShifts, events: dayEvents }]) => (
          <Box key={day} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{formatDayHeading(`${day}T12:00:00Z`)}</Typography>
            <Stack spacing={1}>
              {dayEvents.map((e) => {
                const color = departmentColor(deptById.get(e.department_id) ?? e.department ?? undefined)
                return (
                  <Paper
                    key={`e-${e.id}`}
                    variant="outlined"
                    data-testid={`agenda-event-${e.id}`}
                    onClick={() => openEvent(e)}
                    sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', cursor: 'pointer', border: '2px solid', borderColor: color, borderStyle: e.status === 'draft' ? 'dashed' : 'solid' }}
                  >
                    <EventNoteIcon sx={{ color }} />
                    <Typography sx={{ fontWeight: 600 }}>{e.title}</Typography>
                    {e.series_id && <RepeatIcon fontSize="small" sx={{ color: 'text.secondary' }} titleAccess="Repeats" />}
                    <Typography color="text.secondary" sx={{ minWidth: 150, flexGrow: 1 }}>{eventDayLabel(e, day, true)}</Typography>
                    <Typography variant="body2" color="text.secondary">{e.department?.name}</Typography>
                    {e.status === 'draft' && <Chip label="Draft" size="small" color="warning" variant="outlined" />}
                  </Paper>
                )
              })}
              {dayShifts.map((s) => {
                const mine = s.assignee_id && s.assignee_id === user?.id
                const { bg, fg } = shiftColor(departmentColor(deptById.get(s.department_id) ?? s.department ?? undefined), s.position_id, s.position?.color_shade)
                return (
                  <Paper
                    key={s.id}
                    data-testid={`agenda-shift-${s.id}`}
                    variant="outlined"
                    sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderColor: mine ? 'primary.main' : 'divider', cursor: canManageShift(s) ? 'pointer' : 'default' }}
                    onClick={canManageShift(s) ? () => openEdit(s) : undefined}
                  >
                    <Chip label={s.position?.name ?? '—'} size="small" sx={{ bgcolor: bg, color: fg, fontWeight: 600 }} />
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

      {dialogs}
      {!isDevice && <CalendarSyncDialog open={calendarSyncOpen} onClose={() => setCalendarSyncOpen(false)} />}
    </>
  )
}
