import { Box, Button, Chip, Paper, Typography } from '@mui/material'
import { Add } from '@mui/icons-material'
import type { ContainerSlot } from '../../components/dnd/SortableLists'
import { formatTaskDay } from '../../lib/tasks'
import type { BoardDay, DailyCardItem } from '../../lib/types'
import DailyCard from './DailyCard'
import DayHeader from './DayHeader'

interface Props {
  day: BoardDay
  today: string
  openCount: number
  slot: ContainerSlot
  onAdd: (date: string) => void
  onDailyToggle: (date: string, item: DailyCardItem) => void
  onEditDailyItems?: () => void
}

/**
 * D38 §3.8 day column: title and open count, header, Daily card, tasks, "+ Add a task".
 * D41: no Daily card on a day the board has no Daily items for (S107).
 */
export default function DayColumn({ day, today, openCount, slot: { setNodeRef, isOver, items }, onAdd, onDailyToggle, onEditDailyItems }: Props) {
  const isToday = day.date === today
  return (
    <Paper
      variant="outlined"
      data-testid={`day-${day.date}`}
      data-today={isToday}
      sx={{
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
        borderColor: isToday ? 'primary.main' : undefined,
        borderWidth: isToday ? 2 : 1,
        bgcolor: isToday ? 'action.selected' : 'background.default',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" data-testid={`day-title-${day.date}`} sx={{ fontWeight: isToday ? 700 : 600 }}>
          {formatTaskDay(day.date)}
          {isToday && ' · Today'}
        </Typography>
        <Chip size="small" label={openCount} data-testid={`day-count-${day.date}`} aria-label={`${openCount} open`} sx={{ height: 20 }} />
      </Box>
      <DayHeader date={day.date} header={day.header} />
      {day.daily.items.length > 0 && (
        <DailyCard daily={day.daily} today={today} onToggle={onDailyToggle} onEditItems={onEditDailyItems} />
      )}
      <Box
        ref={setNodeRef}
        data-testid={`day-list-${day.date}`}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          // An empty day is still a real drop zone (step 5 trial).
          minHeight: 48,
          borderRadius: 1,
          outline: isOver ? '2px dashed' : undefined,
          outlineColor: 'primary.light',
        }}
      >
        {items}
      </Box>
      <Button size="small" startIcon={<Add />} onClick={() => onAdd(day.date)} data-testid={`day-add-${day.date}`} sx={{ alignSelf: 'flex-start' }}>
        Add a task
      </Button>
    </Paper>
  )
}
