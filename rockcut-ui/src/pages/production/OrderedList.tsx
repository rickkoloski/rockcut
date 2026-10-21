import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, IconButton, Paper, Tooltip } from '@mui/material'
import { ArrowDownward, ArrowUpward, DragIndicator } from '@mui/icons-material'
import SortableLists, { type DragHandleProps } from '../../components/dnd/SortableLists'
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
 * D46: a list in display order (tanks, phases, step types). Drag a row by
 * its handle through the shared layer (D38: mouse, long-press on touch,
 * Space on the keyboard), or use the arrows. Saved at once; a refusal puts
 * it back. Only the handle is the drag button, so the row's own buttons
 * aren't nested inside one (D47 task 0, item 10).
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

  const row = (key: string, overlay: boolean, dragging: boolean, handle?: DragHandleProps) => {
    const item = byKey.get(key)
    if (!item) return null
    const i = ids.indexOf(key)
    const name = label(item)
    return (
      <Paper
        variant="outlined"
        data-testid={`${testId}-row-${item.id}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, mb: 0.75, opacity: dragging ? 0.4 : 1 }}
      >
        <Box
          {...handle}
          aria-label={`Drag ${name}`}
          data-testid={`${testId}-handle-${item.id}`}
          sx={{
            display: 'flex',
            alignSelf: 'stretch',
            alignItems: 'center',
            px: 0.5,
            borderRadius: 1,
            cursor: 'grab',
            // A long press picks it up; don't let it select text or open the callout menu.
            touchAction: 'manipulation',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
          }}
        >
          <DragIndicator fontSize="small" color="action" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>{render(item)}</Box>
        {!overlay && (
          <Box sx={{ display: 'flex' }}>
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
        handle
        renderItem={(key, state) => row(key, state.overlay, state.dragging, state.handle)}
        renderContainer={(_, slot) => (
          <Box ref={slot.setNodeRef} data-testid={testId} sx={{ minHeight: 40 }}>
            {slot.items}
          </Box>
        )}
      />
    </>
  )
}
