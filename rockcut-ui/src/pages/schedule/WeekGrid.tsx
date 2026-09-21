import { useMemo } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { formatDayColumn, formatTime, localDayKey, weekDayKeys } from '../../lib/datetime'
import { departmentColor, shiftColor } from '../../lib/colors'
import type { Department, RosterEntry, Shift } from '../../lib/types'

interface Props {
  mondayKey: string
  shifts: Shift[]
  roster: RosterEntry[]
  departments: Department[]
  currentUserId?: number
  createDeptId?: number // department to create into (set only when the filter picks one you manage)
  canManageShift: (s: Shift) => boolean
  canClaim: (s: Shift) => boolean
  onCreate: (cell: { userId: number | null; dateKey: string; departmentId: number }) => void
  onEditShift: (s: Shift) => void
  onClaim: (s: Shift) => void
}

const NAME_COL = 160
const DAY_COL = 150

export default function WeekGrid({
  mondayKey, shifts, roster, departments, currentUserId, createDeptId,
  canManageShift, canClaim, onCreate, onEditShift, onClaim,
}: Props) {
  const days = weekDayKeys(mondayKey)
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const byCell = useMemo(() => {
    const m = new Map<string, Shift[]>()
    for (const s of shifts) {
      const key = `${s.assignee_id ?? 'open'}|${localDayKey(s.starts_at)}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    return m
  }, [shifts])

  const rows: Array<{ id: number | null; name: string }> = [
    ...roster.map((r) => ({ id: r.id as number | null, name: r.name })),
    { id: null, name: 'Open shifts' },
  ]

  const cellShifts = (rowId: number | null, dayKey: string) =>
    byCell.get(`${rowId ?? 'open'}|${dayKey}`) ?? []

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
    return (
      <Box
        key={s.id}
        onClick={(e) => {
          e.stopPropagation()
          if (canManageShift(s)) onEditShift(s)
          else if (canClaim(s)) onClaim(s)
        }}
        sx={{
          px: 0.75, py: 0.5, borderRadius: 1, cursor: 'pointer',
          bgcolor: draft ? 'transparent' : bg,
          color: draft ? 'text.primary' : fg,
          border: draft ? '1px dashed' : '1px solid',
          borderColor: draft ? bg : bg,
          opacity: draft ? 0.85 : 1,
          fontSize: 12, lineHeight: 1.3,
        }}
      >
        <Box sx={{ fontWeight: 600 }}>{s.position?.name ?? '—'}</Box>
        <Box>{formatTime(s.starts_at)}{draft ? ' · draft' : ''}</Box>
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
            </Box>
            {days.map((dayKey) => {
              const items = cellShifts(row.id, dayKey)
              const canCreateHere = !!createDeptId
              return (
                <Box
                  key={dayKey}
                  onClick={canCreateHere ? () => onCreate({ userId: row.id, dateKey: dayKey, departmentId: createDeptId! }) : undefined}
                  sx={{
                    display: 'table-cell', p: 0.75, verticalAlign: 'top', minWidth: DAY_COL,
                    borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider',
                    cursor: canCreateHere ? 'pointer' : 'default',
                    '&:hover .add-affordance': { opacity: canCreateHere ? 0.4 : 0 },
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
