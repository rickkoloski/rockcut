import { useEffect, useState } from 'react'
import { Alert, Box, Checkbox, Drawer, IconButton, Paper, Typography, useMediaQuery } from '@mui/material'
import { Close } from '@mui/icons-material'
import { useApiQuery } from '../../../hooks/useApiQuery'
import useAuth from '../../../hooks/useAuth'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { addDaysKey } from '../../../lib/datetime'
import { BOARD_QUERY_KEY, boardPath, formatTaskDay, linkedStep, taskError } from '../../../lib/tasks'
import type { TaskBoardData, TaskCardData } from '../../../lib/types'
import { useFlows } from './flowsContext'
import { HEAD_H } from './GanttGrid'

interface Props {
  today: string
  onOpenStep: (stepId: number, day: string) => void
  onClose: () => void
}

/**
 * D49 §3.12 (P102): the Gantt's Task list. The Brewery board's linked tasks
 * (`linked=true`) for today through the next 6 days, Late from the board's
 * Unfinished list (decision 6.7), following "Show planned batches" as the
 * board does. Each row: check off, the title (D52: a click opens the step),
 * notes (two lines) and who has it; moving and assigning are in the step.
 * D52: it sits over the Gantt (the page renders it inside the chart's box),
 * so the toolbar stays in reach; at phone width it's still a full-screen drawer.
 */
export default function TaskListPanel({ today, onOpenStep, onClose }: Props) {
  usePhoneBackCloses(true, onClose)
  const phone = useMediaQuery('(max-width:559.95px)')
  const showPlanned = useAuth((s) => s.showPlannedBatches)
  const to = addDaysKey(today, 6)
  const { data, error, isLoading } = useApiQuery<TaskBoardData>(
    [BOARD_QUERY_KEY, 'brewery', today, to, 'linked'],
    boardPath('brewery', 'tasks'),
    { from: today, to, linked: 'true' },
    { refetchInterval: 60_000 },
  )
  const shown = (cards: TaskCardData[]) => cards.filter((c) => showPlanned || !c.production?.planned)
  const groups = data
    ? [
        { key: 'late', label: 'Late', cards: shown(data.unfinished) },
        ...data.days.map((d) => ({ key: d.date, label: d.date === today ? 'Today' : formatTaskDay(d.date), cards: shown(d.cards) })),
      ].filter((g) => g.key === today || g.cards.length > 0)
    : []

  // Over the Gantt there's no backdrop to click, so Escape closes it as the drawer did.
  useEffect(() => {
    if (phone) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phone, onClose])

  const body = (
    <>
      {/* D52: lines up with the chart's date header beside it (+1 for the chart's top border). */}
      <Box sx={{ display: 'flex', alignItems: 'center', flex: 'none', height: HEAD_H + 1, boxSizing: 'border-box', px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Task list
        </Typography>
        <IconButton size="small" edge="end" aria-label="Close" onClick={onClose} data-testid="task-list-close">
          <Close fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {error && !data && <Alert severity="error">{taskError(error)}</Alert>}
        {isLoading && <Typography variant="body2">Loading…</Typography>}
        {groups.map((g) => (
          <Box key={g.key} data-testid={`task-list-group-${g.key}`}>
            <Typography variant="overline" color={g.key === 'late' ? 'warning.main' : 'text.secondary'} sx={{ fontWeight: 700 }}>
              {g.label}
            </Typography>
            {g.cards.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Nothing on the task list.
              </Typography>
            )}
            {g.cards.map((c) => (
              <TaskRow key={c.key} card={c} today={today} onOpen={() => onOpenStep(c.production!.step_id, c.due_on!)} />
            ))}
          </Box>
        ))}
      </Box>
    </>
  )

  return phone ? (
    <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { sx: { width: '100%' }, 'data-testid': 'task-list-panel' } as object }}>
      {body}
    </Drawer>
  ) : (
    <Paper
      elevation={8}
      data-testid="task-list-panel"
      sx={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 317,
        maxWidth: '100%',
        // Above the chart's sticky date header (9) and corner (10).
        zIndex: 11,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '0 20px 20px 0',
      }}
    >
      {body}
    </Paper>
  )
}

function TaskRow({ card, today, onOpen }: { card: TaskCardData; today: string; onOpen: () => void }) {
  const flows = useFlows()
  const step = linkedStep(card)!
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<{ ok: boolean; error?: string } | null>) => {
    setBusy(true)
    try {
      const r = await fn()
      if (r && !r.ok && r.error) flows.notify(r.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, py: 1, borderBottom: 1, borderColor: 'divider' }} data-testid={`task-list-row-${card.id}`}>
      <Checkbox
        size="small"
        checked={card.done}
        disabled={busy}
        sx={{ p: 0.5, alignSelf: 'flex-start' }}
        onChange={() => run(() => (card.done ? flows.uncheck(step) : flows.checkOff(step, today, step.batchLabel)))}
        slotProps={{ input: { 'aria-label': card.done ? `Mark ${card.title} not done` : `Mark ${card.title} completed`, 'data-testid': `task-list-check-${card.id}` } as object }}
      />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {/* D52: the title opens the step (it replaced the Open button). */}
        <Typography
          variant="body2"
          component="button"
          type="button"
          onClick={onOpen}
          sx={{
            fontWeight: 600,
            textDecoration: card.done ? 'line-through' : undefined,
            color: card.done ? 'text.secondary' : 'text.primary',
            textAlign: 'left',
            p: 0,
            border: 0,
            bgcolor: 'transparent',
            cursor: 'pointer',
            '&:hover, &:focus-visible': { color: 'primary.main', textDecorationLine: 'underline' },
          }}
          data-testid={`task-list-title-${card.id}`}
        >
          {card.title}
          {card.production?.planned && (
            <Typography component="span" variant="caption" color="info.main" sx={{ ml: 1 }}>
              Planned batch
            </Typography>
          )}
        </Typography>
        {card.notes && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            data-testid={`task-list-notes-${card.id}`}
          >
            {card.notes}
          </Typography>
        )}
        {/* D52: moving and assigning are in the step; the row just says who has it. */}
        {card.assignee_name && (
          <Typography variant="caption" color="text.secondary" data-testid={`task-list-assignee-${card.id}`}>
            {card.assignee_name}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
