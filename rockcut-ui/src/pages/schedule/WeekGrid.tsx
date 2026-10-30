import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography, alpha, getLuminance } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import EventNoteIcon from '@mui/icons-material/EventNote'
import RepeatIcon from '@mui/icons-material/Repeat'
import { formatDayColumn, formatHoursShort, formatTime, formatWallTime, localDayKey, shiftHours, weekDayKeys, weekdayOf } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import type { ShiftConflict } from '../../lib/conflicts'
import type { OffMarker } from '../../lib/timeoff'
import { eventDayKeys, eventDayLabel } from '../../lib/events'
import type { AvailabilitySlot, Department, RosterEntry, ScheduleEvent, Shift } from '../../lib/types'

// D52: a draft keeps its department/position color, striped. The stripes lean
// away from the text color (light stripes under dark text, dark under white),
// so they cost the text no contrast; a very dark color (Bar-close navy) hides
// dark stripes, so it gets faint light ones, which white text reads over fine.
const draftSx = (bg: string, fg: string, conflicted: boolean) => {
  const stripe =
    getLuminance(bg) < 0.08 ? alpha('#fff', 0.18) : getLuminance(fg) > 0.5 ? alpha('#000', 0.16) : alpha('#fff', 0.3)
  return {
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, ${stripe} 7px 10px)`,
    border: conflicted ? '2px solid' : `1px dashed ${fg}`,
  }
}

interface Props {
  mondayKey: string
  shifts: Shift[]
  roster: RosterEntry[]
  departments: Department[]
  currentUserId?: number
  canCreate: boolean // may the viewer add shifts (owner/manager)
  canManageSchedule: boolean // may the viewer reorder / bulk-act on employees
  canManageShift: (s: Shift) => boolean
  canClaim: (s: Shift) => boolean
  onCreate: (cell: { userId: number | null; dateKey: string }) => void
  onEditShift: (s: Shift) => void
  onClaim: (s: Shift) => void
  onMoveShift: (s: Shift, targetUserId: number | null, targetDayKey: string) => void
  onReorder: (userIds: number[]) => void
  onPublishEmployee: (userId: number) => void
  onDeleteEmployee: (userId: number) => void
  offMarkers: Map<number, Map<string, OffMarker[]>> // userId -> day key -> time-off markers (with times)
  conflicts: Map<number, ShiftConflict[]> // shiftId -> conflict warnings (D24)
  availability: AvailabilitySlot[] // recurring weekly availability, shown per day (D25)
  events: ScheduleEvent[] // D32 — shown in the Events row; never part of conflict detection
  canCreateEvent: boolean
  onEventClick: (e: ScheduleEvent) => void
  onCreateEvent: (dayKey: string) => void
}

const NAME_COL = 160
const DAY_COL = 150

export default function WeekGrid({
  mondayKey, shifts, roster, departments, currentUserId, canCreate, canManageSchedule,
  canManageShift, canClaim, onCreate, onEditShift, onClaim, onMoveShift,
  onReorder, onPublishEmployee, onDeleteEmployee, offMarkers, conflicts, availability,
  events, canCreateEvent, onEventClick, onCreateEvent,
}: Props) {
  const days = weekDayKeys(mondayKey)
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const [dragShift, setDragShift] = useState<Shift | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuUserId, setMenuUserId] = useState<number | null>(null)

  // D43: quick steps (arrow keys) can come before the next render, so each
  // one builds on the order the last one made, not on the roster prop.
  const order = useRef(roster)
  useLayoutEffect(() => {
    order.current = roster
  }, [roster])
  const moveEmployee = (userId: number, dir: -1 | 1) => {
    const list = order.current
    const i = list.findIndex((r) => r.id === userId)
    const target = i + dir
    if (i < 0 || target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[i], next[target]] = [next[target], next[i]]
    order.current = next
    onReorder(next.map((r) => r.id))
  }

  // D43: reordering is a mode, started from a row's ⋮ menu ("Move"). While it's
  // on, that row shows ↑ ↓ and Finished; the arrow keys move it, Enter or Esc
  // ends it. Each step saves, as the arrows always have.
  const [movingId, setMovingId] = useState<number | null>(null)
  const movingIndex = movingId == null ? -1 : roster.findIndex((r) => r.id === movingId)
  useEffect(() => {
    if (movingId == null) return
    const onKey = (e: KeyboardEvent) => {
      // Keys in an open dialog or menu are its own (focus is trapped there): they never move the row (QA G4).
      if ((e.target as Element | null)?.closest?.('[role="dialog"], [role="menu"], [role="listbox"], .MuiModal-root')) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        moveEmployee(movingId, e.key === 'ArrowUp' ? -1 : 1)
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        setMovingId(null)
      }
    }
    // A click anywhere but the moving row's ↑ ↓ Finished ends Move (and still does what it does).
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t && t !== document.documentElement && !t.closest?.('[data-testid="move-controls"]')) setMovingId(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  })
  useEffect(() => {
    if (movingId == null) return
    document.querySelector(`[data-moving-row="${movingId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [movingId, movingIndex])

  const openMenu = (e: React.MouseEvent<HTMLElement>, userId: number) => {
    setMenuAnchor(e.currentTarget)
    setMenuUserId(userId)
  }
  const closeMenu = () => {
    setMenuAnchor(null)
    setMenuUserId(null)
  }

  const byCell = useMemo(() => {
    const m = new Map<string, Shift[]>()
    for (const s of shifts) {
      const key = `${s.assignee_id ?? 'open'}|${localDayKey(s.starts_at)}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    return m
  }, [shifts])

  // Events by Denver day; a multi-day event appears on each of its days (D32).
  const eventsByDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>()
    for (const e of events) {
      for (const key of eventDayKeys(e)) {
        if (!m.has(key)) m.set(key, [])
        m.get(key)!.push(e)
      }
    }
    return m
  }, [events])

  // Weekly hours per assignee (published vs including drafts).
  const hoursByUser = useMemo(() => {
    const m = new Map<number | 'open', { pub: number; draft: number }>()
    for (const s of shifts) {
      const key = s.assignee_id ?? 'open'
      const cur = m.get(key) ?? { pub: 0, draft: 0 }
      const h = shiftHours(s.starts_at, s.ends_at)
      if (s.status === 'published') cur.pub += h
      else cur.draft += h
      m.set(key, cur)
    }
    return m
  }, [shifts])

  // Availability slots indexed by `${userId}|${weekday}` for per-cell markers (D25).
  const availByUserDay = useMemo(() => {
    const m = new Map<string, AvailabilitySlot[]>()
    for (const s of availability) {
      const key = `${s.user_id}|${s.weekday}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    return m
  }, [availability])

  const availLabel = (s: AvailabilitySlot): string => {
    const window = s.all_day ? 'all day' : `${formatWallTime(s.start_time ?? '')}–${formatWallTime(s.end_time ?? '')}`
    return s.kind === 'unavailable' ? `Unavailable ${window}` : `Prefers ${window}`
  }

  const availChips = (userId: number, dayKey: string) => {
    const slots = availByUserDay.get(`${userId}|${weekdayOf(dayKey)}`)
    if (!slots?.length) return null
    return slots.map((s) => (
      <Chip
        key={`av-${s.id}`}
        size="small"
        variant="outlined"
        color={s.kind === 'unavailable' ? 'error' : 'success'}
        label={availLabel(s)}
        title={s.note ?? undefined}
        sx={{ fontSize: 11, height: 20, maxWidth: '100%' }}
      />
    ))
  }

  const round2 = (n: number) => Math.round(n * 100) / 100

  // D43: the week's totals (everyone, open shifts included; follows the filters).
  const weekTotals = useMemo(() => {
    let pub = 0
    let draft = 0
    for (const h of hoursByUser.values()) {
      pub += h.pub
      draft += h.draft
    }
    return { pub, draft }
  }, [hoursByUser])

  const hoursLabel = (rowId: number | null): string => {
    const h = hoursByUser.get(rowId ?? 'open')
    if (!h) return ''
    // D43: as the week totals say it: published, then drafts only.
    if (h.draft > 0) return `${round2(h.pub)} hr · ${round2(h.draft)} hr draft`
    return h.pub > 0 ? `${round2(h.pub)} hr` : ''
  }

  const rows: Array<{ id: number | null; name: string }> = [
    ...roster.map((r) => ({ id: r.id as number | null, name: r.name })),
    { id: null, name: 'Open shifts' },
  ]

  const cellShifts = (rowId: number | null, dayKey: string) =>
    byCell.get(`${rowId ?? 'open'}|${dayKey}`) ?? []

  const cellKey = (rowId: number | null, dayKey: string) => `${rowId ?? 'open'}|${dayKey}`

  const stickyCol = {
    position: 'sticky' as const,
    left: 0,
    zIndex: 1,
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderColor: 'divider',
    minWidth: NAME_COL,
    maxWidth: NAME_COL,
  }

  const chip = (s: Shift) => {
    const dep = deptById.get(s.department_id) ?? s.department ?? undefined
    const { bg, fg } = shiftColor(departmentColor(dep), s.position_id, s.position?.color_shade)
    const draft = s.status === 'draft'
    const draggable = canManageShift(s)
    const shiftConflicts = conflicts.get(s.id)
    const conflicted = !!shiftConflicts?.length
    const box = (
      <Box
        key={s.id}
        data-testid={`shift-chip-${s.id}`}
        draggable={draggable}
        onDragStart={(e) => {
          setDragShift(s)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(s.id))
        }}
        onDragEnd={() => {
          setDragShift(null)
          setHoverKey(null)
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (canManageShift(s)) onEditShift(s)
          else if (canClaim(s)) onClaim(s)
        }}
        sx={{
          px: 0.75, py: 0.5, borderRadius: 1,
          cursor: draggable ? 'grab' : 'pointer',
          opacity: dragShift?.id === s.id ? 0.4 : 1,
          bgcolor: bg,
          color: fg,
          border: conflicted ? '2px solid' : '1px solid',
          borderColor: conflicted ? 'error.main' : bg,
          fontSize: 12, lineHeight: 1.3,
          display: 'flex', justifyContent: 'space-between', gap: 0.5,
          ...(draft && draftSx(bg, fg, conflicted)),
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.25 }}>
            {conflicted && <WarningAmberIcon sx={{ fontSize: 14, color: draft ? 'error.main' : 'inherit' }} />}
            {s.position?.name ?? '—'}
          </Box>
          <Box>{formatTime(s.starts_at)}{draft ? ' · draft' : ''}</Box>
        </Box>
        <Box sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatHoursShort(shiftHours(s.starts_at, s.ends_at))}</Box>
      </Box>
    )
    if (!conflicted) return box
    return (
      <Tooltip
        key={s.id}
        arrow
        title={
          <Box>
            {shiftConflicts!.map((c, i) => (
              <Box key={i}>• {c.message}</Box>
            ))}
          </Box>
        }
      >
        {box}
      </Tooltip>
    )
  }

  const eventChip = (e: ScheduleEvent, dayKey: string) => {
    const color = departmentColor(deptById.get(e.department_id) ?? e.department ?? undefined)
    const draft = e.status === 'draft'
    return (
      <Box
        key={e.id}
        data-testid={`event-chip-${e.id}`}
        onClick={(ev) => {
          ev.stopPropagation()
          onEventClick(e)
        }}
        sx={{
          px: 0.75, py: 0.5, borderRadius: 1, cursor: 'pointer',
          // A long title truncates rather than widening the day column (G4).
          maxWidth: DAY_COL - 12, boxSizing: 'border-box', overflow: 'hidden',
          border: `2px ${draft ? 'dashed' : 'solid'}`, borderColor: color,
          opacity: draft ? 0.85 : 1, fontSize: 12, lineHeight: 1.3,
        }}
      >
        <Box sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
          <EventNoteIcon sx={{ fontSize: 14, color }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</Box>
          {e.series_id && <RepeatIcon sx={{ fontSize: 12, color: 'text.secondary' }} titleAccess="Repeats" />}
        </Box>
        <Box>{eventDayLabel(e, dayKey)}{draft ? ' · draft' : ''}</Box>
      </Box>
    )
  }

  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'table', borderCollapse: 'collapse', minWidth: NAME_COL + DAY_COL * 7 }}>
        {/* header */}
        <Box sx={{ display: 'table-row' }}>
          <Box sx={{ ...stickyCol, display: 'table-cell', p: 1, fontWeight: 700, top: 0 }}>
            Staff
            <Box
              data-testid="week-hours"
              title="This week's shifts, open shifts included, for the department and position shown"
              sx={{ fontWeight: 400, fontSize: 12, color: 'text.secondary', lineHeight: 1.4, mt: 0.25 }}
            >
              <Box>Scheduled {round2(weekTotals.pub)} hr</Box>
              <Box>Draft {round2(weekTotals.draft)} hr</Box>
            </Box>
          </Box>
          {days.map((d) => (
            <Box key={d} sx={{ display: 'table-cell', p: 1, fontWeight: 700, minWidth: DAY_COL, borderBottom: '1px solid', borderColor: 'divider' }}>
              {formatDayColumn(d)}
            </Box>
          ))}
        </Box>

        {/* D32 — events row (no conflicts, no drag) */}
        <Box sx={{ display: 'table-row' }} data-testid="events-row">
          <Box sx={{ ...stickyCol, display: 'table-cell', p: 1, verticalAlign: 'top', borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Events</Typography>
          </Box>
          {days.map((dayKey) => {
            const items = eventsByDay.get(dayKey) ?? []
            return (
              <Box
                key={dayKey}
                data-testid={`events-cell-${dayKey}`}
                onClick={canCreateEvent ? () => onCreateEvent(dayKey) : undefined}
                sx={{
                  display: 'table-cell', p: 0.75, verticalAlign: 'top', minWidth: DAY_COL,
                  borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider',
                  bgcolor: 'action.hover',
                  cursor: canCreateEvent ? 'pointer' : 'default',
                  '&:hover .add-affordance': { opacity: canCreateEvent ? 0.4 : 0 },
                }}
              >
                <Stack spacing={0.5}>
                  {items.map((e) => eventChip(e, dayKey))}
                  {items.length === 0 && (
                    <AddIcon className="add-affordance" fontSize="small" sx={{ opacity: 0, color: 'text.disabled' }} />
                  )}
                </Stack>
              </Box>
            )
          })}
        </Box>

        {rows.map((row, rowIndex) => (
          <Box key={row.id ?? 'open'} sx={{ display: 'table-row' }}>
            <Box
              data-moving-row={row.id === movingId ? movingId : undefined}
              sx={{
                ...stickyCol, display: 'table-cell', p: 1, verticalAlign: 'top', borderTop: '1px solid', borderColor: 'divider',
                ...(row.id === movingId && movingId != null
                  ? { bgcolor: 'background.boardToday', boxShadow: (t) => `inset 3px 0 0 ${t.palette.primary.main}` }
                  : {}),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ flexGrow: 1, minWidth: 0, fontWeight: row.id === currentUserId ? 700 : 500, color: row.id === null ? 'text.secondary' : 'text.primary' }}
                >
                  {row.name}{row.id === currentUserId ? ' (you)' : ''}
                </Typography>
                {canManageSchedule && row.id !== null && movingId == null && (
                  <IconButton size="small" sx={{ p: 0.25 }} aria-label={`${row.name} options`} onClick={(e) => openMenu(e, row.id!)}>
                    <MoreVertIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Stack>
              {row.id === movingId && movingId != null && (
                <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mt: 0.5 }} data-testid="move-controls">
                  <IconButton size="small" aria-label="Move up" sx={{ p: 0.25 }} disabled={rowIndex === 0} onClick={() => moveEmployee(row.id!, -1)}>
                    <ArrowUpwardIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <IconButton size="small" aria-label="Move down" sx={{ p: 0.25 }} disabled={rowIndex >= roster.length - 1} onClick={() => moveEmployee(row.id!, 1)}>
                    <ArrowDownwardIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <Button size="small" variant="contained" onClick={() => setMovingId(null)} sx={{ ml: 'auto', minWidth: 0, px: 1, py: 0, fontSize: 12 }}>
                    Finished
                  </Button>
                </Stack>
              )}
              {hoursLabel(row.id) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {hoursLabel(row.id)}
                </Typography>
              )}
            </Box>
            {days.map((dayKey) => {
              const items = cellShifts(row.id, dayKey)
              const canCreateHere = canCreate
              const key = cellKey(row.id, dayKey)
              const isHover = dragShift && hoverKey === key
              return (
                <Box
                  key={dayKey}
                  onClick={canCreateHere && !dragShift ? () => onCreate({ userId: row.id, dateKey: dayKey }) : undefined}
                  onDragOver={(e) => {
                    if (dragShift) {
                      e.preventDefault()
                      if (hoverKey !== key) setHoverKey(key)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragShift) onMoveShift(dragShift, row.id, dayKey)
                    setDragShift(null)
                    setHoverKey(null)
                  }}
                  sx={{
                    display: 'table-cell', p: 0.75, verticalAlign: 'top', minWidth: DAY_COL,
                    borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider',
                    bgcolor: isHover ? 'action.hover' : undefined,
                    outline: isHover ? '2px dashed' : 'none',
                    outlineColor: 'primary.main',
                    cursor: canCreateHere && !dragShift ? 'pointer' : 'default',
                    '&:hover .add-affordance': { opacity: canCreateHere && !dragShift ? 0.4 : 0 },
                  }}
                >
                  <Stack spacing={0.5}>
                    {row.id !== null && offMarkers.get(row.id)?.get(dayKey)?.map((mk, i) =>
                      mk.pending ? (
                        <Chip
                          key={`off-${i}`}
                          label={`${mk.label} (pending)`}
                          size="small"
                          variant="outlined"
                          color="warning"
                          title={`Pending approval · ${mk.label} · ${mk.type}`}
                          sx={{ fontSize: 11, height: 20, maxWidth: '100%', borderStyle: 'dashed' }}
                        />
                      ) : (
                        <Chip
                          key={`off-${i}`}
                          label={mk.label}
                          size="small"
                          title={`${mk.label} · ${mk.type}`}
                          sx={{ bgcolor: 'action.selected', fontSize: 11, height: 20, maxWidth: '100%' }}
                        />
                      ),
                    )}
                    {row.id !== null && availChips(row.id, dayKey)}
                    {items.map(chip)}
                    {items.length === 0 && (
                      <AddIcon className="add-affordance" fontSize="small" sx={{ opacity: 0, color: 'text.disabled' }} />
                    )}
                  </Stack>
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem
          data-testid="row-move"
          onClick={() => {
            setMovingId(menuUserId)
            closeMenu()
            // Focus leaves the closing menu, so the arrow keys aren't taken as the menu's own.
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
        >
          Move
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuUserId != null) onPublishEmployee(menuUserId)
            closeMenu()
          }}
        >
          Publish this week's shifts
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuUserId != null) onDeleteEmployee(menuUserId)
            closeMenu()
          }}
        >
          Delete this week's shifts
        </MenuItem>
      </Menu>
    </Box>
  )
}
