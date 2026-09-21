import { useMemo, useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { formatDayColumn, formatHoursShort, formatTime, localDayKey, shiftHours, weekDayKeys } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import type { Department, RosterEntry, Shift } from '../../lib/types'

interface Props {
  mondayKey: string
  shifts: Shift[]
  roster: RosterEntry[]
  departments: Department[]
  currentUserId?: number
  canCreate: boolean // may the viewer add shifts (owner/manager)
  canManageShift: (s: Shift) => boolean
  canClaim: (s: Shift) => boolean
  onCreate: (cell: { userId: number | null; dateKey: string }) => void
  onEditShift: (s: Shift) => void
  onClaim: (s: Shift) => void
  onMoveShift: (s: Shift, targetUserId: number | null, targetDayKey: string) => void
}

const NAME_COL = 160
const DAY_COL = 150

export default function WeekGrid({
  mondayKey, shifts, roster, departments, currentUserId, canCreate,
  canManageShift, canClaim, onCreate, onEditShift, onClaim, onMoveShift,
}: Props) {
  const days = weekDayKeys(mondayKey)
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const [dragShift, setDragShift] = useState<Shift | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)

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
    const { bg, fg } = shiftColor(departmentColor(dep), s.position_id)
    const draft = s.status === 'draft'
    const draggable = canManageShift(s)
    return (
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
          border: draft ? '1px dashed' : '1px solid',
          borderColor: bg,
          fontSize: 12, lineHeight: 1.3,
          display: 'flex', justifyContent: 'space-between', gap: 0.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontWeight: 600 }}>{s.position?.name ?? '—'}</Box>
          <Box>{formatTime(s.starts_at)}{draft ? ' · draft' : ''}</Box>
        </Box>
        <Box sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatHoursShort(shiftHours(s.starts_at, s.ends_at))}</Box>
      </Box>
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

        {rows.map((row) => (
          <Box key={row.id ?? 'open'} sx={{ display: 'table-row' }}>
            <Box sx={{ ...stickyCol, display: 'table-cell', p: 1, verticalAlign: 'top', borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: row.id === currentUserId ? 700 : 500, color: row.id === null ? 'text.secondary' : 'text.primary' }}>
                {row.name}{row.id === currentUserId ? ' (you)' : ''}
              </Typography>
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
    </Box>
  )
}
