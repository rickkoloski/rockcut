import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { ArrowDownward, ArrowUpward, Check, Close, DragIndicator, Edit, ExpandLess, ExpandMore, RemoveCircleOutline, Restore } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ConfirmDialog'
import SortableLists from '../../components/dnd/SortableLists'
import { applyMove, type ListContainer, type Move } from '../../components/dnd/moveModel'
import { useOptimisticLists } from '../../components/dnd/useOptimisticLists'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { boardPath, dailyItemError } from '../../lib/tasks'
import type { DailyItem } from '../../lib/types'

const ITEMS_KEY = 'daily-items'
const LIST = 'items'
// One empty list while loading: a new [] each render would reset useOptimisticLists every time.
const NO_ITEMS: DailyItem[] = []

interface Props {
  onClose: () => void
  /** Something changed: the board refetches its Daily cards. */
  onChanged: () => void
  /** When the board last loaded: the list refetches with it (O-2). */
  boardUpdatedAt: number
}

/**
 * D38 §3.8 Edit Daily items (managers and owners): add, rename, reorder (drag
 * through the shared layer, or Move up/down for keyboard and touch), and
 * retire after "Retire Temps? Past ticks are kept." Each change saves at once.
 *
 * D39: a collapsed Retired section restores an item to the bottom of the list
 * with its past ticks (S75). The list refetches whenever the board does (its
 * 60-second refresh, focus), so changes made elsewhere show while it's open
 * (O-2); a name being typed in a rename field is the dialog's own and stays.
 */
export default function DailyItemsDialog({ onClose, onChanged, boardUpdatedAt }: Props) {
  const qc = useQueryClient()
  const { data: all = NO_ITEMS, isLoading, refetch } = useApiQuery<DailyItem[]>([ITEMS_KEY], boardPath('brewery', 'daily_items'), {
    include_retired: 'true',
  })
  const items = useMemo(() => all.filter((i) => i.active), [all])
  const retired = useMemo(() => all.filter((i) => !i.active), [all])
  useEffect(() => {
    void refetch()
  }, [boardUpdatedAt, refetch])
  const [showRetired, setShowRetired] = useState(false)
  const byKey = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items])
  const source = useMemo<ListContainer[]>(() => [{ id: LIST, itemIds: items.map((i) => String(i.id)) }], [items])
  const { containers, move } = useOptimisticLists(source)
  const ids = containers[0].itemIds

  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  // `from` is the name the rename opened with: an unchanged field saves nothing,
  // even if someone else renamed the item meanwhile (G1).
  const [renaming, setRenaming] = useState<{ id: number; from: string; name: string; error: string | null } | null>(null)
  const [retiring, setRetiring] = useState<DailyItem | null>(null)
  // S76: back closes the retire confirm, then the dialog.
  usePhoneBackCloses(true, onClose)
  usePhoneBackCloses(!!retiring, () => setRetiring(null))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changed = () => {
    qc.invalidateQueries({ queryKey: [ITEMS_KEY] })
    onChanged()
  }

  const add = async () => {
    setBusy(true)
    try {
      await api.post(boardPath('brewery', 'daily_items'), { name: newName })
      setNewName('')
      setAddError(null)
      changed()
    } catch (err) {
      setAddError(dailyItemError(err))
    } finally {
      setBusy(false)
    }
  }

  const rename = async () => {
    if (!renaming) return
    if (renaming.from === renaming.name.trim()) return setRenaming(null)
    setBusy(true)
    try {
      await api.patch(boardPath('brewery', 'daily_items', renaming.id), { name: renaming.name })
      setRenaming(null)
      changed()
    } catch (err) {
      setRenaming({ ...renaming, error: dailyItemError(err) })
    } finally {
      setBusy(false)
    }
  }

  const retire = async (item: DailyItem) => {
    setBusy(true)
    try {
      await api.patch(boardPath('brewery', 'daily_items', item.id), { active: false })
      setRetiring(null)
      setError(null)
      changed()
    } catch (err) {
      setRetiring(null)
      setError(dailyItemError(err))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (item: DailyItem) => {
    setBusy(true)
    try {
      await api.post(boardPath('brewery', 'daily_items', item.id, 'restore'))
      setError(null)
      changed()
    } catch (err) {
      setError(dailyItemError(err))
    } finally {
      setBusy(false)
    }
  }

  const reorder = (m: Move) => {
    const next = applyMove(containers, m)
    if (next === containers) return
    setError(null)
    move(m, () => api.put(boardPath('brewery', 'daily_items', 'order'), { ids: next[0].itemIds.map(Number) }))
      .catch((err) => setError(dailyItemError(err)))
      .finally(changed)
  }

  const step = (key: string, direction: -1 | 1) => {
    const i = ids.indexOf(key)
    const beforeId = direction === -1 ? ids[i - 1] : (ids[i + 2] ?? null)
    reorder({ itemId: key, fromContainer: LIST, toContainer: LIST, beforeId })
  }

  const row = (key: string, overlay: boolean, dragging: boolean) => {
    const item = byKey.get(key)
    if (!item) return null
    const i = ids.indexOf(key)
    const editing = renaming?.id === item.id && !overlay
    return (
      <Paper
        variant="outlined"
        data-testid={`daily-items-row-${item.id}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, mb: 0.5, opacity: dragging ? 0.4 : 1, cursor: editing ? 'auto' : 'grab' }}
      >
        <DragIndicator fontSize="small" color="action" />
        {editing ? (
          <Box
            component="form"
            sx={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
            onSubmit={(e) => {
              e.preventDefault()
              rename()
            }}
            // Typing in the field mustn't pick up the row.
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <TextField
              size="small"
              autoFocus
              fullWidth
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value, error: null })}
              onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), setRenaming(null))}
              error={!!renaming.error}
              helperText={renaming.error}
              slotProps={{ htmlInput: { maxLength: 40, 'aria-label': `New name for ${item.name}`, 'data-testid': `daily-items-rename-input-${item.id}` } }}
            />
            <IconButton type="submit" size="small" aria-label="Save name" disabled={busy} data-testid={`daily-items-rename-save-${item.id}`}>
              <Check fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label="Cancel rename" onClick={() => setRenaming(null)} data-testid={`daily-items-rename-cancel-${item.id}`}>
              <Close fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <>
            <Typography variant="body2" sx={{ flex: 1 }} data-testid={`daily-items-name-${item.id}`}>
              {item.name}
            </Typography>
            {!overlay && (
              <Box
                sx={{ display: 'flex' }}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <Tooltip title="Move up">
                  <span>
                    <IconButton size="small" aria-label={`Move ${item.name} up`} disabled={i <= 0} onClick={() => step(key, -1)} data-testid={`daily-items-up-${item.id}`}>
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Move ${item.name} down`}
                      disabled={i >= ids.length - 1}
                      onClick={() => step(key, 1)}
                      data-testid={`daily-items-down-${item.id}`}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    aria-label={`Rename ${item.name}`}
                    onClick={() => setRenaming({ id: item.id, from: item.name, name: item.name, error: null })}
                    data-testid={`daily-items-rename-${item.id}`}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Retire">
                  <IconButton size="small" aria-label={`Retire ${item.name}`} onClick={() => setRetiring(item)} data-testid={`daily-items-retire-${item.id}`}>
                    <RemoveCircleOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </>
        )}
      </Paper>
    )
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="daily-items-dialog">
      <DialogTitle>Daily items</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Every day's Daily card shows these, in this order. Drag to reorder.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} data-testid="daily-items-error">
            {error}
          </Alert>
        )}
        {isLoading ? (
          <Typography variant="body2">Loading…</Typography>
        ) : (
          <SortableLists
            containers={containers}
            onMove={reorder}
            // A row being renamed stays put.
            isLocked={(key) => renaming?.id === Number(key)}
            itemLabel={(key) => byKey.get(key)?.name ?? 'item'}
            containerLabel={() => 'Daily items'}
            renderItem={(key, state) => row(key, state.overlay, state.dragging)}
            renderContainer={(_, slot) => (
              <Box ref={slot.setNodeRef} data-testid="daily-items-list" sx={{ minHeight: 40 }}>
                {slot.items}
              </Box>
            )}
          />
        )}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim()) add()
          }}
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1 }}
        >
          <TextField
            size="small"
            fullWidth
            label="New item"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setAddError(null)
            }}
            error={!!addError}
            helperText={addError}
            slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'daily-items-new' }, formHelperText: { role: 'alert' } as object }}
          />
          <Button type="submit" variant="outlined" disabled={busy || !newName.trim()} data-testid="daily-items-add" sx={{ mt: 0.25 }}>
            Add
          </Button>
        </Box>
        {retired.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              size="small"
              onClick={() => setShowRetired((v) => !v)}
              endIcon={showRetired ? <ExpandLess /> : <ExpandMore />}
              aria-expanded={showRetired}
              data-testid="daily-items-retired-toggle"
            >
              Retired ({retired.length})
            </Button>
            <Collapse in={showRetired}>
              <Box data-testid="daily-items-retired" sx={{ mt: 0.5 }}>
                {retired.map((item) => (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    data-testid={`daily-items-retired-row-${item.id}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, mb: 0.5 }}
                  >
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {item.name}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<Restore fontSize="small" />}
                      disabled={busy}
                      onClick={() => restore(item)}
                      aria-label={`Restore ${item.name}`}
                      data-testid={`daily-items-restore-${item.id}`}
                    >
                      Restore
                    </Button>
                  </Paper>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="daily-items-close">
          Done
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        onConfirm={() => retiring && retire(retiring)}
        title="Retire item"
        message={retiring ? `Retire ${retiring.name}? Past ticks are kept.` : ''}
        confirmLabel="Retire"
        loading={busy}
      />
    </Dialog>
  )
}
