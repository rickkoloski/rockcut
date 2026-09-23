import { useMemo, useState } from 'react'
import { Box, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { formatDayColumn, formatHoursShort, formatTime, formatWallTime, localDayKey, shiftHours, weekDayKeys, weekdayOf } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import type { ShiftConflict } from '../../lib/conflicts'
import type { OffMarker } from '../../lib/timeoff'
import type { AvailabilitySlot, Department, RosterEntry, Shift } from '../../lib/types'

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
}

const NAME_COL = 160
const DAY_COL = 150

export default function WeekGrid({
  mondayKey, shifts, roster, departments, currentUserId, canCreate, canManageSchedule,
  canManageShift, canClaim, onCreate, onEditShift, onClaim, onMoveShift,
  onReorder, onPublishEmployee, onDeleteEmployee, offMarkers, conflicts, availability,
}: Props) {
  const days = weekDayKeys(mondayKey)
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const [dragShift, setDragShift] = useState<Shift | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuUserId, setMenuUserId] = useState<number | null>(null)

  const moveEmployee = (rosterIndex: number, dir: -1 | 1) => {
    const target = rosterIndex + dir
    if (target < 0 || target >= roster.length) return
    const next = [...roster]
    ;[next[rosterIndex], next[target]] = [next[target], next[rosterIndex]]
    onReorder(next.map((r) => r.id))
  }

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

  const hoursLabel = (rowId: number | null): string => {
    const h = hoursByUser.get(rowId ?? 'open')
    if (!h) return ''
    if (h.draft > 0) return `${round2(h.pub)} hr / ${round2(h.pub + h.draft)} hr draft`
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
          opacity: dragShift?.id === s.id ? 0.4 : draft ? 0.85 : 1,
          bgcolor: draft ? 'transparent' : bg,
          color: draft ? 'text.primary' : fg,
          border: conflicted ? '2px solid' : draft ? '1px dashed' : '1px solid',
          borderColor: conflicted ? 'error.main' : bg,
          fontSize: 12, lineHeight: 1.3,
          display: 'flex', justifyContent: 'space-between', gap: 0.5,
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

  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'table', borderCollapse: 'collapse', minWidth: NAME_COL + DAY_COL * 7 }}>
        {/* header */}
        <Box sx={{ display: 'table-row' }}>
          <Box sx={{ ...stickyCol, display: 'table-cell', p: 1, fontWeight: 700, top: 0 }}>Staff</Box>
          {days.map((d) => (
            <Box key={d} sx={{ display: 'table-cell', p: 1, fontWeight: 700, minWidth: DAY_COL, borderBottom: '1px solid', borderColor: 'divider' }}>
              {formatDayColumn(d)}
            </Box>
          ))}
        </Box>

        {rows.map((row, rowIndex) => (
          <Box key={row.id ?? 'open'} sx={{ display: 'table-row' }}>
            <Box sx={{ ...stickyCol, display: 'table-cell', p: 1, verticalAlign: 'top', borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ flexGrow: 1, minWidth: 0, fontWeight: row.id === currentUserId ? 700 : 500, color: row.id === null ? 'text.secondary' : 'text.primary' }}
                >
                  {row.name}{row.id === currentUserId ? ' (you)' : ''}
                </Typography>
                {canManageSchedule && row.id !== null && (
                  <>
                    <IconButton size="small" sx={{ p: 0.25 }} disabled={rowIndex === 0} onClick={() => moveEmployee(rowIndex, -1)}>
                      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" sx={{ p: 0.25 }} disabled={rowIndex >= roster.length - 1} onClick={() => moveEmployee(rowIndex, 1)}>
                      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => openMenu(e, row.id!)}>
                      <MoreVertIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </>
                )}
              </Stack>
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
