import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useInfiniteQuery } from '@tanstack/react-query'
import api from '../../../lib/api'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { describeEvent, eventActor, formatEventTime, taskError } from '../../../lib/breweryTasks'
import type { TaskEventPage } from '../../../lib/types'

interface Props {
  /** Only this task's entries; without it, the whole board's. */
  task?: { id: number; title: string }
  onClose: () => void
}

/**
 * D38 §3.8 "Change log" (Brewery managers and owners): newest first, 50 at a
 * time with Load more. Each entry: who, when (Colorado time), and what
 * changed in plain words. Daily checks and items are included in the full list.
 */
export default function HistoryDialog({ task, onClose }: Props) {
  usePhoneBackCloses(true, onClose)
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const { data, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['brewery-task-history', task?.id ?? null],
    queryFn: async ({ pageParam }) =>
      (
        await api.get<TaskEventPage>('/api/brewery/tasks/history', {
          params: { page: pageParam, ...(task ? { task_id: task.id } : {}) },
        })
      ).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.per_page < last.total ? last.page + 1 : undefined),
    // Always fresh when opened: the board changes under it.
    staleTime: 0,
    gcTime: 0,
  })

  const entries = data?.pages.flatMap((p) => p.data.map((ev) => ({ ev, names: p.names }))) ?? []

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} data-testid="history-dialog">
      <DialogTitle>{task ? `History: ${task.title}` : 'History'}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {isLoading && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        )}
        {isError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {taskError(error)}
          </Alert>
        )}
        {data && entries.length === 0 && (
          <Typography sx={{ p: 3 }} color="text.secondary" data-testid="history-empty">
            No changes yet.
          </Typography>
        )}
        <List dense disablePadding data-testid="history-list">
          {entries.map(({ ev, names }) => (
            <ListItem key={ev.id} divider data-testid={`history-entry-${ev.id}`} data-action={ev.action} data-task-id={ev.task_id ?? ''}>
              <ListItemText
                primary={<span data-testid={`history-text-${ev.id}`}>{describeEvent(ev, names)}</span>}
                secondary={
                  <span data-testid={`history-meta-${ev.id}`}>
                    {eventActor(ev)} · {formatEventTime(ev.inserted_at)}
                  </span>
                }
              />
            </ListItem>
          ))}
        </List>
        {hasNextPage && (
          <Box sx={{ p: 1.5, textAlign: 'center' }}>
            <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} data-testid="history-load-more">
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="history-close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
