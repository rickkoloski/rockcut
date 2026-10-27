import { Alert, Box, Card, CardContent, Checkbox, Chip, CircularProgress, Link, List, ListItem, Stack, Typography } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { boardPath, coloradoToday, initials, taskError, todaysTasks } from '../../lib/tasks'
import type { DailyCardItem, TaskBoardData, TaskCardData } from '../../lib/types'

// The board's own query key (TaskBoard), so a tick here refreshes the board too.
const BOARD_KEY = 'task-board'
const DEPT = 'brewery'

/**
 * D40 (spec §3.8, S50): the Brewery Dashboard's Today's tasks card. "Daily
 * 2/4" with the unticked items, today's first five open tasks with assignee
 * initials and "+N more", "N unfinished from earlier days". The boxes tick
 * and complete as on the board (today's own tasks: no "where should it
 * show" question); the title opens the board. D49: a linked task that needs
 * the schedule's prompts opens its step there (decision 8.3).
 */
export default function TodaysTasksCard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const today = coloradoToday()
  // D49 QA 3: as on the board.
  const showPlanned = useAuth((s) => s.showPlannedBatches)
  const { data: board, isLoading, isError, error } = useApiQuery<TaskBoardData>(
    [BOARD_KEY, DEPT, today, today],
    boardPath(DEPT, 'tasks'),
    { from: today, to: today },
    { refetchInterval: 60_000 },
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const write = async (key: string, request: () => Promise<unknown>) => {
    setBusy(key)
    setFailed(null)
    try {
      await request()
    } catch (err) {
      setFailed(taskError(err))
    } finally {
      setBusy(null)
      await qc.invalidateQueries({ queryKey: [BOARD_KEY, DEPT] })
    }
  }

  const complete = (card: TaskCardData) =>
    write(`task:${card.id}`, async () => {
      const path = boardPath(DEPT, 'tasks', card.id, 'complete')
      // D49 decision 8.3: a linked task that needs a prompt (brew day's batch
      // number, or steps to move when done off plan) opens its step on the
      // schedule instead; the rest check off here.
      if (card.production) {
        const { data } = await api.post<{ data: { preview: { needs_batch_number: boolean; move: { following: unknown[] } | null } } }>(path, {
          preview: true,
        })
        const { needs_batch_number, move } = data.data.preview
        if (needs_batch_number || (move && move.following.length > 0))
          return navigate(`/brewery/production?step=${card.production.step_id}&day=${card.due_on}`)
      }
      await api.post(path, {})
    })

  const tick = (item: DailyCardItem) =>
    write(`daily:${item.daily_item_id}`, () => api.put(boardPath(DEPT, 'daily_checks', board!.today, item.daily_item_id)))

  const summary = board ? todaysTasks(board, showPlanned) : null

  return (
    <Card variant="outlined" sx={{ mb: 4 }} data-testid="todays-tasks-card">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Link component={RouterLink} to="/tasks/brewery" variant="h6" underline="hover" data-testid="todays-tasks-title">
            Today's tasks
          </Link>
          <Box sx={{ flexGrow: 1 }} />
          {summary?.daily && summary.daily.total > 0 && (
            <Chip
              size="small"
              data-testid="todays-tasks-daily-count"
              color={summary.daily.done === summary.daily.total ? 'success' : 'default'}
              label={`Daily ${summary.daily.done}/${summary.daily.total}`}
            />
          )}
        </Stack>
        {failed && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setFailed(null)}>
            {failed}
          </Alert>
        )}
        {isLoading && <CircularProgress size={24} />}
        {isError && !board && <Alert severity="error">{taskError(error)}</Alert>}
        {summary && (
          <>
            {summary.daily && summary.daily.unticked.length > 0 && (
              <List dense disablePadding data-testid="todays-tasks-daily">
                {summary.daily.unticked.map((item) => (
                  <ListItem key={item.daily_item_id} disableGutters sx={{ py: 0 }}>
                    <Checkbox
                      size="small"
                      checked={false}
                      disabled={busy !== null}
                      onChange={() => tick(item)}
                      slotProps={{ input: { 'aria-label': `Tick ${item.name}` } }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Daily: {item.name}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            )}
            {summary.tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Nothing open today.
              </Typography>
            ) : (
              <List dense disablePadding data-testid="todays-tasks-list">
                {summary.tasks.map((card) => (
                  <ListItem key={card.key} disableGutters sx={{ py: 0 }} data-testid="todays-task">
                    <Checkbox
                      size="small"
                      checked={false}
                      disabled={busy !== null}
                      onChange={() => complete(card)}
                      slotProps={{ input: { 'aria-label': `Mark "${card.title}" done` } }}
                    />
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {card.title}
                    </Typography>
                    {card.production?.planned && (
                      <Chip label="Planned batch" size="small" variant="outlined" color="info" sx={{ height: 18, fontSize: 11, mr: 0.5 }} data-testid={`todays-task-planned-${card.id}`} />
                    )}
                    {card.assignee_name && (
                      <Chip size="small" variant="outlined" label={initials(card.assignee_name)} title={card.assignee_name} />
                    )}
                  </ListItem>
                ))}
              </List>
            )}
            {summary.more > 0 && (
              <Link component={RouterLink} to="/tasks/brewery" variant="body2" data-testid="todays-tasks-more">
                +{summary.more} more
              </Link>
            )}
            {summary.unfinished > 0 && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }} data-testid="todays-tasks-unfinished">
                {summary.unfinished} unfinished from earlier days
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
