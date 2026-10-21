import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, IconButton, Paper, Tooltip } from '@mui/material'
import { ArrowDownward, ArrowUpward, DragIndicator } from '@mui/icons-material'
import SortableLists from '../../components/dnd/SortableLists'
import { applyMove, type ListContainer, type Move } from '../../components/dnd/moveModel'
import { useOptimisticLists } from '../../components/dnd/useOptimisticLists'
import { prodError } from '../../lib/production'

const LIST = 'rows'

interface Props<T extends { id: number }> {
  items: T[]
  /** Saves the new order (all the ids); rejects to put the rows back. */
  onReorder: (ids: number[]) => Promise<unknown>
  label: (item: T) => string
  /** The row's content after the drag handle (name, details, actions). */
  render: (item: T) => ReactNode
  testId: string
}

/**
 * D46: a list in display order (tanks, phases, step types). Drag a row
 * through the shared layer (D38: mouse, long-press on touch, Space on the
 * keyboard), or use the arrows. Saved at once; a refusal puts it back.
 */
export default function OrderedList<T extends { id: number }>({ items, onReorder, label, render, testId }: Props<T>) {
  const byKey = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items])
  const source = useMemo<ListContainer[]>(() => [{ id: LIST, itemIds: items.map((i) => String(i.id)) }], [items])
  const { containers, move } = useOptimisticLists(source)
  const ids = containers[0].itemIds
  const [error, setError] = useState<string | null>(null)

  const reorder = (m: Move) => {
    const next = applyMove(containers, m)
    if (next === containers) return
    setError(null)
    move(m, () => onReorder(next[0].itemIds.map(Number))).catch((err) => setError(prodError(err)))
  }

  const step = (key: string, direction: -1 | 1) => {
    const i = ids.indexOf(key)
    const beforeId = direction === -1 ? ids[i - 1] : (ids[i + 2] ?? null)
    reorder({ itemId: key, fromContainer: LIST, toContainer: LIST, beforeId })
  }

  // Buttons and fields in a row mustn't pick it up.
  const stop = {
    onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  }

  const row = (key: string, overlay: boolean, dragging: boolean) => {
    const item = byKey.get(key)
    if (!item) return null
    const i = ids.indexOf(key)
    const name = label(item)
    return (
      <Paper
        variant="outlined"
        data-testid={`${testId}-row-${item.id}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, mb: 0.75, opacity: dragging ? 0.4 : 1, cursor: 'grab' }}
      >
        <DragIndicator fontSize="small" color="action" />
        <Box sx={{ flex: 1, minWidth: 0 }} {...stop}>
          {render(item)}
        </Box>
        {!overlay && (
          <Box sx={{ display: 'flex' }} {...stop}>
            <Tooltip title="Move up">
              <span>
                <IconButton size="small" aria-label={`Move ${name} up`} disabled={i <= 0} onClick={() => step(key, -1)} data-testid={`${testId}-up-${item.id}`}>
                  <ArrowUpward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton
                  size="small"
                  aria-label={`Move ${name} down`}
                  disabled={i >= ids.length - 1}
                  onClick={() => step(key, 1)}
                  data-testid={`${testId}-down-${item.id}`}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
      </Paper>
    )
  }

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)} data-testid={`${testId}-error`}>
          {error}
        </Alert>
      )}
      <SortableLists
        containers={containers}
        onMove={reorder}
        itemLabel={(key) => (byKey.get(key) ? label(byKey.get(key)!) : 'row')}
        containerLabel={() => 'list'}
        renderItem={(key, state) => row(key, state.overlay, state.dragging)}
        renderContainer={(_, slot) => (
          <Box ref={slot.setNodeRef} data-testid={testId} sx={{ minHeight: 40 }}>
            {slot.items}
          </Box>
        )}
      />
    </>
  )
}
