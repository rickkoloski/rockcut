import { Box, Typography } from '@mui/material'
import { eventLine, openShiftLine, personLine } from '../../lib/tasks'
import type { DayHeaderData } from '../../lib/types'

/** D38 §3.2: who's scheduled (published Brewery shifts), open shifts and events. Read-only. */
export default function DayHeader({ date, header }: { date: string; header: DayHeaderData }) {
  return (
    <Box
      data-testid={`day-header-${date}`}
      sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1, py: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}
    >
      {header.no_brewers && (
        <Typography variant="caption" color="text.secondary" data-testid={`header-none-${date}`}>
          No brewers scheduled
        </Typography>
      )}
      {header.people.map((p) => (
        <Typography key={p.user_id} variant="caption" data-testid={`header-person-${date}-${p.user_id}`}>
          {personLine(p)}
        </Typography>
      ))}
      {header.open_shifts.map((s) => (
        <Typography key={s.id} variant="caption" color="text.secondary" data-testid={`header-open-${date}-${s.id}`}>
          {openShiftLine(s)}
        </Typography>
      ))}
      {header.events.map((e) => (
        <Typography key={e.id} variant="caption" sx={{ fontWeight: 600 }} data-testid={`header-event-${date}-${e.id}`}>
          {eventLine(e)}
        </Typography>
      ))}
    </Box>
  )
}
