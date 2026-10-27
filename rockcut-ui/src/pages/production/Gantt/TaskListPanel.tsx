import { useState } from 'react'
import { Alert, Box, Button, Checkbox, Drawer, IconButton, MenuItem, TextField, Typography, useMediaQuery } from '@mui/material'
import { Close } from '@mui/icons-material'
import api from '../../../lib/api'
import { useApiQuery } from '../../../hooks/useApiQuery'
import useAuth from '../../../hooks/useAuth'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { addDaysKey } from '../../../lib/datetime'
import { daysBetween } from '../../../lib/gantt'
import { prodPath, type Person } from '../../../lib/production'
import { BOARD_QUERY_KEY, boardPath, formatTaskDay, linkedStep, taskError } from '../../../lib/tasks'
import type { TaskBoardData, TaskCardData } from '../../../lib/types'
import { useFlows } from './flowsContext'

interface Props {
  today: string
  brewers: Person[]
  onOpenStep: (stepId: number, day: string) => void
  onClose: () => void
}

/**
 * D49 §3.12 (P102): the Gantt's Task list. The Brewery board's linked tasks
 * (`linked=true`) for today through the next 6 days, Late from the board's
 * Unfinished list (decision 6.7), following "Show planned batches" as the
 * board does. Each row: check off, the title, notes (two lines), Move to
 * [date], the assignee and Open; the same writes and prompts as the board.
 */
export default function TaskListPanel({ today, brewers, onOpenStep, onClose }: Props) {
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

  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      slotProps={{ paper: { sx: { width: phone ? '100%' : 440 }, 'data-testid': 'task-list-panel' } as object }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Task list
        </Typography>
        <IconButton aria-label="Close" onClick={onClose} data-testid="task-list-close">
          <Close />
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
              <TaskRow key={c.key} card={c} today={today} brewers={brewers} onOpen={() => onOpenStep(c.production!.step_id, c.due_on!)} />
            ))}
          </Box>
        ))}
      </Box>
    </Drawer>
  )
}

function TaskRow({ card, today, brewers, onOpen }: { card: TaskCardData; today: string; brewers: Person[]; onOpen: () => void }) {
  const flows = useFlows()
  const step = linkedStep(card)!
  const [moveTo, setMoveTo] = useState(card.due_on ?? today)
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
  const options = card.assignee_id && !brewers.some((b) => b.id === card.assignee_id) ? [...brewers, { id: card.assignee_id, name: card.assignee_name ?? 'Unknown' }] : brewers
  const days = card.due_on ? daysBetween(card.due_on, moveTo) : 0

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
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, textDecoration: card.done ? 'line-through' : undefined, color: card.done ? 'text.secondary' : undefined }}
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
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {!card.done && (
            <>
              <TextField
                size="small"
                type="date"
                label="Move to"
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                sx={{ width: 150 }}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': `task-list-move-date-${card.id}` } }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={busy || !days || !/^\d{4}-\d{2}-\d{2}$/.test(moveTo)}
                onClick={() => run(() => flows.moveSteps([step.id], days))}
                data-testid={`task-list-move-${card.id}`}
              >
                Move
              </Button>
            </>
          )}
          <TextField
            select
            size="small"
            label="Assigned to"
            value={card.assignee_id ?? ''}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value === '' ? null : Number(e.target.value)
              const name = options.find((p) => p.id === id)?.name ?? 'nobody'
              run(() => flows.write(() => api.post(prodPath('steps', 'assign'), { ids: [step.id], assignee_id: id }), `${step.name} assigned to ${name}.`))
            }}
            sx={{ minWidth: 140 }}
            slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'data-testid': `task-list-assignee-${card.id}` } as object }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Nobody</MenuItem>
            {options.map((p) => (
              <MenuItem key={p.id} value={p.id} data-testid={`task-list-assignee-${card.id}-${p.id}`}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
          <Button size="small" onClick={onOpen} sx={{ ml: 'auto' }} data-testid={`task-list-open-${card.id}`}>
            Open
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
