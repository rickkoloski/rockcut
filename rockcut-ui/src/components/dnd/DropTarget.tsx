import { useContext, useEffect, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { DropTargetsContext, targetDropId } from './dropTargets'

interface Props {
  /** Unique among the drop targets inside one SortableLists. */
  id: string
  /** Called with the dropped item's id. The item's list doesn't change. */
  onDrop: (itemId: string) => void
  /** Plain words for screen readers ("Future"). */
  label: string
  children: (state: { isOver: boolean }) => ReactNode
}

/** A plain drop zone inside a SortableLists (D38): it reports the dropped item id. */
export default function DropTarget({ id, onDrop, label, children }: Props) {
  const handlers = useContext(DropTargetsContext)
  const { setNodeRef, isOver } = useDroppable({ id: targetDropId(id) })

  useEffect(() => {
    if (!handlers) return
    handlers.set(id, { onDrop, label })
    return () => {
      handlers.delete(id)
    }
  }, [handlers, id, onDrop, label])

  return <div ref={setNodeRef}>{children({ isOver })}</div>
}
