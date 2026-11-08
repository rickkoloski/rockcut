import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Search } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { archivedMatching, formatIdeaDate, ideaError, ideaPath } from '../../lib/ideas'
import type { IdeaArchived, IdeaBoardEntry } from '../../lib/types'

interface Props {
  board: IdeaBoardEntry
  onClose: () => void
  onChanged: () => void
  onOpenCard: (id: number) => void
}

/**
 * D53 §4.1 "Archived" (the board's ⋮ menu): archived lists, with their card
 * counts, and archived cards. A search box narrows both as you type (list
 * name, card title or description, ignoring case; Matt, 2026-11-08); the
 * API returns them all, so it filters here. Anyone on the board restores; the board's
 * managers (owners on Company) also delete for good.
 */
export default function ArchivedDialog({ board, onClose, onChanged, onOpenCard }: Props) {
  usePhoneBackCloses(true, onClose)
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))
  const qc = useQueryClient()
  const queryKey = ['idea-archived', board.key]
  const { data: all, isLoading, isError, error } = useApiQuery<IdeaArchived>(queryKey, ideaPath(board.key, 'archived'), undefined, { staleTime: 0 })
  const [q, setQ] = useState('')
  const data = all && archivedMatching(all, q)
  const [problem, setProblem] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'lists' | 'cards'; id: number; name: string; extra: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (write: () => Promise<unknown>) => {
    setBusy(true)
    setProblem(null)
    try {
      await write()
      onChanged()
    } catch (err) {
      setProblem(ideaError(err))
    } finally {
      setBusy(false)
      void qc.invalidateQueries({ queryKey })
    }
  }

  const nothing = all && all.lists.length === 0 && all.cards.length === 0
  const noMatch = !nothing && data && data.lists.length === 0 && data.cards.length === 0

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen} data-testid="idea-archived-dialog">
      <DialogTitle>Archived</DialogTitle>
      <DialogContent dividers>
        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{ideaError(error)}</Alert>}
        {problem && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {problem}
          </Alert>
        )}
        {!nothing && all && (
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Search archived lists and cards"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ mb: 1 }}
            slotProps={{
              htmlInput: { 'aria-label': 'Search archived', 'data-testid': 'idea-archived-search' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
        {nothing && <Typography color="text.secondary">Nothing archived.</Typography>}
        {noMatch && (
          <Typography color="text.secondary" data-testid="idea-archived-none">
            Nothing archived matches
          </Typography>
        )}
        {data && data.lists.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary">
              Lists
            </Typography>
            <List dense disablePadding>
              {data.lists.map((l) => (
                <ListItem
                  key={l.id}
                  divider
                  data-testid={`idea-archived-list-${l.id}`}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" disabled={busy} onClick={() => act(() => api.post(ideaPath(board.key, 'lists', l.id, 'restore')))} data-testid={`idea-archived-list-restore-${l.id}`}>
                        Restore
                      </Button>
                      {board.manage && (
                        <Button
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => setDeleting({ kind: 'lists', id: l.id, name: l.name, extra: `${l.card_count} ${l.card_count === 1 ? 'card goes' : 'cards go'} with it, and their notes and checklists.` })}
                          data-testid={`idea-archived-list-delete-${l.id}`}
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  }
                >
                  <ListItemText
                    primary={l.name}
                    secondary={`${l.card_count} ${l.card_count === 1 ? 'card' : 'cards'}${l.archived_at ? ` · archived ${formatIdeaDate(l.archived_at)}` : ''}`}
                    sx={{ pr: board.manage ? 18 : 10 }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
        {data && data.cards.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Cards
            </Typography>
            <List dense disablePadding>
              {data.cards.map((c) => (
                <ListItem
                  key={c.id}
                  divider
                  data-testid={`idea-archived-card-${c.id}`}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" disabled={busy} onClick={() => act(() => api.post(ideaPath(board.key, 'cards', c.id, 'restore')))} data-testid={`idea-archived-card-restore-${c.id}`}>
                        Restore
                      </Button>
                      {board.manage && (
                        <Button
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => setDeleting({ kind: 'cards', id: c.id, name: c.title, extra: 'Its notes, checklist and watches go too. Tasks already sent stay.' })}
                          data-testid={`idea-archived-card-delete-${c.id}`}
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box component="span" onClick={() => onOpenCard(c.id)} sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                        {c.title}
                      </Box>
                    }
                    secondary={`in ${c.list.name} · archived ${formatIdeaDate(c.archived_at)}`}
                    sx={{ pr: board.manage ? 18 : 10 }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="idea-archived-close">
          Close
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.name ?? ''}" for good?`}
        message={deleting?.extra ?? ''}
        confirmLabel="Delete for good"
        confirmColor="error"
        loading={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await act(() => api.delete(ideaPath(board.key, deleting.kind, deleting.id)))
          setDeleting(null)
        }}
      />
    </Dialog>
  )
}
