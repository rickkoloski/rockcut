import type { CSSProperties, ReactNode } from 'react'
import { closestCenter, DndContext, MouseSensor, useSensor, useSensors, type DragEndEvent, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/** What a list column needs to be dragged left or right by its header. */
export interface ColumnDrag {
  setNodeRef: (node: HTMLElement | null) => void
  /** Spread on the header; undefined when this list can't move. */
  handle: DraggableSyntheticListeners
  style: CSSProperties
  dragging: boolean
}

interface Props {
  /** The columns, left to right. */
  ids: string[]
  isDisabled: (id: string) => boolean
  /** `beforeId` is the column it now sits before (null: last); `ids` the new order. */
  onReorder: (id: string, beforeId: string | null, ids: string[]) => void
  children: (drags: Record<string, ColumnDrag>) => ReactNode
}

/**
 * D58 §3.16 (5193): Idea Board lists drag left or right on desktop. An outer
 * horizontal sortable with its own `DndContext`, so the shared card layer
 * (`components/dnd/SortableLists`, rendered inside `children`) is unchanged.
 * A component inside the card layer would register with the card layer's
 * context, so each column's `useSortable` runs here, outside it, in a chain
 * (one hook per component), and reaches the column as props. Mouse only:
 * the ⋮ menu's Move left / Move right is the keyboard and phone way.
 */
export default function ListColumnsSortable({ ids, isDisabled, onReorder, children }: Props) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }))

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(ids, from, to)
    onReorder(String(active.id), next[to + 1] ?? null, next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        <Chain ids={ids} drags={{}} isDisabled={isDisabled} render={children} />
      </SortableContext>
    </DndContext>
  )
}

interface ChainProps {
  ids: string[]
  drags: Record<string, ColumnDrag>
  isDisabled: (id: string) => boolean
  render: (drags: Record<string, ColumnDrag>) => ReactNode
}

function Chain({ ids, drags, isDisabled, render }: ChainProps) {
  if (ids.length === 0) return <>{render(drags)}</>
  return <Link id={ids[0]} rest={ids.slice(1)} drags={drags} isDisabled={isDisabled} render={render} />
}

function Link({ id, rest, drags, isDisabled, render }: Omit<ChainProps, 'ids'> & { id: string; rest: string[] }) {
  const disabled = isDisabled(id)
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id, disabled })
  const drag: ColumnDrag = {
    setNodeRef,
    handle: disabled ? undefined : listeners,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      ...(isDragging ? { position: 'relative', zIndex: 2, opacity: 0.85 } : {}),
    },
    dragging: isDragging,
  }
  return <Chain ids={rest} drags={{ ...drags, [id]: drag }} isDisabled={isDisabled} render={render} />
}
