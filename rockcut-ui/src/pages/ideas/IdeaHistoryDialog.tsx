import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useInfiniteQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import { describeIdeaEvent, formatIdeaTime, ideaError, ideaPath } from '../../lib/ideas'
import type { IdeaBoardEntry, IdeaEvent } from '../../lib/types'

interface Props {
  board: IdeaBoardEntry
  /** Only this card's entries; without it, the whole board's. */
  card?: { id: number; title: string }
  onClose: () => void
}

interface Page {
  data: IdeaEvent[]
  names: { users: Record<string, string> }
  page: number
  total: number
  per_page: number
}

/** Decision 13: an Idea Board's History (its managers; owners on Company), newest first, 50 at a time. */
export default function IdeaHistoryDialog({ board, card, onClose }: Props) {
  usePhoneBackCloses(true, onClose)
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))
  const { data, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['idea-history', board.key, card?.id ?? null],
    queryFn: async ({ pageParam }) =>
      (await api.get<Page>(ideaPath(board.key, 'history'), { params: { page: pageParam, ...(card ? { card_id: card.id } : {}) } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.per_page < last.total ? last.page + 1 : undefined),
    staleTime: 0,
    gcTime: 0,
  })
  const entries = data?.pages.flatMap((p) => p.data.map((ev) => ({ ev, names: p.names.users }))) ?? []

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} data-testid="idea-history-dialog">
      <DialogTitle>{card ? `History: ${card.title}` : `History: ${board.name} board`}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {isLoading && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        )}
        {isError && (
          <Alert severity="error" sx={{ m: 2 }}>
            {ideaError(error)}
          </Alert>
        )}
        {data && entries.length === 0 && (
          <Typography sx={{ p: 3 }} color="text.secondary">
            No changes yet.
          </Typography>
        )}
        <List dense disablePadding data-testid="idea-history-list">
          {entries.map(({ ev, names }) => (
            <ListItem key={ev.id} divider data-testid={`idea-history-entry-${ev.id}`} data-action={ev.action}>
              <ListItemText primary={describeIdeaEvent(ev, names)} secondary={`${ev.actor_name ?? 'Someone'} · ${formatIdeaTime(ev.inserted_at)}`} />
            </ListItem>
          ))}
        </List>
        {hasNextPage && (
          <Box sx={{ p: 1.5, textAlign: 'center' }}>
            <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
