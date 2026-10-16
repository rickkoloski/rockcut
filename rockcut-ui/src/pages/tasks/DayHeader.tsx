import { Box, Typography } from '@mui/material'
import { eventLine, openShiftLine, personLine } from '../../lib/tasks'
import type { DayHeaderData } from '../../lib/types'

/**
 * D38 §3.2: who's scheduled (the department's published shifts), open shifts and events. Read-only.
 * D43: people and open shifts in start-time order (a person by their first shift); ties keep the
 * Scheduler's roster order, which is the order the API sends. Events stay last.
 * D45: Hide shifts leaves the events only, and no box on a day without any.
 */
export default function DayHeader({ date, header, hideShifts }: { date: string; header: DayHeaderData; hideShifts?: boolean }) {
  if (hideShifts) {
    if (header.events.length === 0) return null
    header = { ...header, people: [], open_shifts: [], no_one_scheduled: false }
  }
  const firstStart = (shifts: { starts_at: string }[]) => Math.min(...shifts.map((s) => Date.parse(s.starts_at)))
  const lines = [
    ...header.people.map((p, i) => ({ at: firstStart(p.shifts), i, person: p, open: null })),
    ...header.open_shifts.map((s, i) => ({ at: Date.parse(s.starts_at), i: header.people.length + i, person: null, open: s })),
  ].sort((a, b) => a.at - b.at || a.i - b.i)
  return (
    <Box
      data-testid={`day-header-${date}`}
      sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1, py: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}
    >
      {header.no_one_scheduled && (
        <Typography variant="caption" color="text.secondary" data-testid={`header-none-${date}`}>
          No one scheduled
        </Typography>
      )}
      {lines.map(({ person: p, open: s }) =>
        p ? (
          <Typography key={`p-${p.user_id}`} variant="caption" data-testid={`header-person-${date}-${p.user_id}`}>
            {personLine(p)}
          </Typography>
        ) : (
          <Typography key={`o-${s!.id}`} variant="caption" color="text.secondary" data-testid={`header-open-${date}-${s!.id}`}>
            {openShiftLine(s!)}
          </Typography>
        ),
      )}
      {header.events.map((e) => (
        <Typography key={e.id} variant="caption" sx={{ fontWeight: 600 }} data-testid={`header-event-${date}-${e.id}`}>
          {eventLine(e)}
        </Typography>
      ))}
    </Box>
  )
}
