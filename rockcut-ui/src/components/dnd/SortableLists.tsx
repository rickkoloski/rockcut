import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { canLand, containerOf, moveBetween, placeAt, type ListContainer, type Move } from './moveModel'
import { DragActiveContext } from './dragActive'
import { CONTAINER_PREFIX, containerDropId, DropTargetsContext, TARGET_PREFIX, type DropHandlers } from './dropTargets'

// The shared drag layer (D38): any number of vertical lists in one
// DndContext, so a drag between any two of them is one onMove. Nothing here
// knows about the Brewery board.

export interface ItemState {
  /** This item is the one being dragged (its place in the list). */
  dragging: boolean
  /** This is the lifted copy under the pointer. */
  overlay: boolean
  locked: boolean
}

export interface ContainerSlot {
  setNodeRef: (node: HTMLElement | null) => void
  /** A drag is over this list or one of its items. */
  isOver: boolean
  /** The list's items, ready to place. */
  items: ReactNode
}

interface Props {
  containers: ListContainer[]
  onMove: (move: Move) => void
  isLocked?: (itemId: string) => boolean
  /**
   * Items that always sit at the end of their list, after every item that
   * can move there (locked ones the server orders apart). Nothing lands
   * after them: a drop on or below them lands just above.
   */
  staysLast?: (itemId: string) => boolean
  renderItem: (itemId: string, state: ItemState) => ReactNode
  renderContainer: (container: ListContainer, slot: ContainerSlot) => ReactNode
  /** Plain words for screen readers: "Package FV6", "Mon 10/12". */
  itemLabel: (itemId: string) => string
  containerLabel: (containerId: string) => string
  /** Enter on a focused item (Space picks it up). */
  onItemActivate?: (itemId: string, element: HTMLElement) => void
  /**
   * Whether an item from `fromList` may land in `toList` (default: any). A
   * phone showing one list at a time allows its own list, and whatever else
   * the page says.
   */
  canMoveTo?: (fromList: string, toList: string) => boolean
  /**
   * Places the rendered lists (keyed by container id). Defaults to their
   * order in `containers`. DropTargets go here too.
   */
  children?: (lists: Record<string, ReactNode>) => ReactNode
}

interface DragState {
  itemId: string
  original: ListContainer[]
  preview: ListContainer[]
}

const CONTAINER = CONTAINER_PREFIX
const TARGET = TARGET_PREFIX
const isContainerId = (id: UniqueIdentifier) => String(id).startsWith(CONTAINER)
const isTargetId = (id: UniqueIdentifier) => String(id).startsWith(TARGET)
const unprefix = (id: UniqueIdentifier, prefix: string) => String(id).slice(prefix.length)

const noLock = () => false

export default function SortableLists({
  containers,
  onMove,
  isLocked = noLock,
  staysLast = noLock,
  renderItem,
  renderContainer,
  itemLabel,
  containerLabel,
  onItemActivate,
  canMoveTo,
  children,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const shown = drag?.preview ?? containers
  const dropHandlers = useMemo<DropHandlers>(() => new Map(), [])
  // Announcements run between renders; they read the lists as last shown.
  const shownRef = useRef(shown)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])

  const sensors = useSensors(
    // Mouse only: a PointerSensor would also take touch, and turn a scroll into a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Long press on touch screens, so a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Space picks up and drops; Enter is left for the item's own action.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const collision: CollisionDetection = (input) => aboveLast(input, detect(input))

  const detect: CollisionDetection = (input) => {
    // Where it started, not the preview's list it may already be shown in.
    const from = containerOf(drag?.original ?? containers, String(input.active.id))
    const args = canMoveTo && from !== null ? allowedOnly(input, from, canMoveTo) : input
    if (!args.pointerCoordinates) return closestCorners(args)
    const hits = pointerWithin(args)
    const targets = hits.filter((h) => isTargetId(h.id))
    if (targets.length) return targets
    const items = hits.filter((h) => !isContainerId(h.id))
    if (items.length) return items
    const list = hits.find((h) => isContainerId(h.id))
    // Between lists the pointer is over nothing. Falling back to the closest
    // list here made the lifted item jump between two lists as each one
    // reflowed, until React gave up ("Maximum update depth", D38 step 6).
    if (!list) return []
    // In a gap inside a list: the nearest item of that list, or the list if it's empty.
    const containerId = unprefix(list.id, CONTAINER)
    const own = args.droppableContainers.filter((d) => d.data.current?.sortable?.containerId === containerId)
    return own.length ? closestCenter({ ...args, droppableContainers: own }) : [list]
  }

  /**
   * A hit on an item that stays last becomes the item above it (the last one
   * that isn't), or the list itself when there's none, so the placeholder
   * shows where the drop really lands (DEV pass 2, A).
   */
  const aboveLast = (args: Parameters<CollisionDetection>[0], hits: ReturnType<CollisionDetection>) => {
    const hit = hits[0]
    if (!hit || isTargetId(hit.id) || isContainerId(hit.id) || !staysLast(String(hit.id))) return hits
    const lists = drag?.preview ?? containers
    const containerId = containerOf(lists, String(hit.id))
    if (!containerId) return hits
    const ids = lists.find((c) => c.id === containerId)!.itemIds
    const active = String(args.active.id)
    const above = ids.slice(0, ids.indexOf(String(hit.id))).filter((i) => i !== active && !staysLast(i)).at(-1)
    const id = above ?? containerDropId(containerId)
    const droppable = args.droppableContainers.find((d) => d.id === id)
    return droppable ? [{ id, data: { droppableContainer: droppable, value: 0 } }] : hits
  }

  /** Where the dragged item would land for `overId`: [container, index]. */
  const landing = (lists: ListContainer[], event: DragOverEvent | DragEndEvent): [string, number] | null => {
    const { active, over } = event
    if (!over || isTargetId(over.id)) return null
    // The keyboard finds its next spot without the collision check, so this guards it too.
    const from = containerOf(drag?.original ?? containers, String(active.id))
    const allowed = (id: string) => from !== null && canLand(from, id, canMoveTo)
    if (isContainerId(over.id)) {
      const id = unprefix(over.id, CONTAINER)
      const list = lists.find((c) => c.id === id)
      if (!list || !allowed(id)) return null
      const rest = list.itemIds.filter((i) => i !== active.id)
      const firstLast = rest.findIndex(staysLast)
      return [id, firstLast < 0 ? rest.length : firstLast]
    }
    const overId = String(over.id)
    const id = containerOf(lists, overId)
    if (!id || !allowed(id)) return null
    const ids = lists.find((c) => c.id === id)!.itemIds
    const index = ids.indexOf(overId)
    if (id === containerOf(lists, String(active.id))) return [id, index]
    // Entering another list: before the item under it, or after it from its lower half.
    const dragged = active.rect.current.translated
    const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
    return [id, below ? index + 1 : index]
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDrag({ itemId: String(active.id), original: containers, preview: containers })
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!drag) return
    const spot = landing(drag.preview, event)
    if (!spot) return
    const [to, index] = spot
    // Within a list the sortable strategy shows the gap; only cross-list moves change the preview.
    if (to === containerOf(drag.preview, drag.itemId)) return
    const preview = placeAt(drag.preview, drag.itemId, to, index)
    if (preview !== drag.preview) setDrag({ ...drag, preview })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const current = drag
    setDrag(null)
    if (!current || !event.over) return
    if (isTargetId(event.over.id)) {
      dropHandlers.get(unprefix(event.over.id, TARGET))?.onDrop(current.itemId)
      return
    }
    const spot = landing(current.preview, event)
    const final = spot ? placeAt(current.preview, current.itemId, spot[0], spot[1]) : current.preview
    const move = moveBetween(current.original, final, current.itemId)
    if (move) onMove(move)
  }

  const where = (lists: ListContainer[], itemId: string) => {
    const id = containerOf(lists, itemId)
    if (!id) return ''
    const ids = lists.find((c) => c.id === id)!.itemIds
    return `${containerLabel(id)}, position ${ids.indexOf(itemId) + 1} of ${ids.length}`
  }

  const overWords = (overId: UniqueIdentifier) => {
    if (isTargetId(overId)) return `over ${dropHandlers.get(unprefix(overId, TARGET))?.label ?? 'a drop zone'}`
    if (isContainerId(overId)) return `at the end of ${containerLabel(unprefix(overId, CONTAINER))}`
    return where(shownRef.current, String(overId))
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${itemLabel(String(active.id))}. ${where(shownRef.current, String(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${itemLabel(String(active.id))}: ${overWords(over.id)}.`
        : `${itemLabel(String(active.id))} is not over a list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${itemLabel(String(active.id))}, ${overWords(over.id)}.`
        : `Dropped ${itemLabel(String(active.id))}. It stays where it was.`,
    onDragCancel: ({ active }) => `Cancelled. ${itemLabel(String(active.id))} goes back where it was.`,
  }

  const lists: Record<string, ReactNode> = {}
  for (const container of shown) {
    lists[container.id] = (
      <SortableList
        key={container.id}
        container={container}
        renderContainer={renderContainer}
        renderItem={renderItem}
        isLocked={isLocked}
        onItemActivate={onItemActivate}
      />
    )
  }

  return (
    <DropTargetsContext.Provider value={dropHandlers}>
      <DragActiveContext.Provider value={drag !== null}>
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          autoScroll
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'To pick up an item, press Space. Use the arrow keys to move it, Space to drop it, or Escape to cancel.',
            },
          }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDrag(null)}
        >
          {children ? children(lists) : shown.map((c) => lists[c.id])}
          <DragOverlay>
            {drag ? renderItem(drag.itemId, { dragging: false, overlay: true, locked: false }) : null}
          </DragOverlay>
        </DndContext>
      </DragActiveContext.Provider>
    </DropTargetsContext.Provider>
  )
}

/** The drop spots in the lists the dragged item may move to (and any DropTargets). */
function allowedOnly(
  args: Parameters<CollisionDetection>[0],
  from: string,
  canMoveTo: (fromList: string, toList: string) => boolean,
): Parameters<CollisionDetection>[0] {
  const droppableContainers = args.droppableContainers.filter((d) => {
    if (isTargetId(d.id)) return true
    const list = isContainerId(d.id) ? unprefix(d.id, CONTAINER) : (d.data.current?.sortable?.containerId as string | undefined)
    return list !== undefined && canLand(from, list, canMoveTo)
  })
  return { ...args, droppableContainers }
}

interface ListProps {
  container: ListContainer
  renderContainer: Props['renderContainer']
  renderItem: Props['renderItem']
  isLocked: (itemId: string) => boolean
  onItemActivate?: Props['onItemActivate']
}

function SortableList({ container, renderContainer, renderItem, isLocked, onItemActivate }: ListProps) {
  const { setNodeRef, isOver, over } = useDroppable({ id: containerDropId(container.id) })
  const overItem = over ? container.itemIds.includes(String(over.id)) : false
  const items = (
    <SortableContext id={container.id} items={container.itemIds} strategy={verticalListSortingStrategy}>
      {container.itemIds.map((id) => (
        <SortableItem key={id} id={id} locked={isLocked(id)} renderItem={renderItem} onActivate={onItemActivate} />
      ))}
    </SortableContext>
  )
  return <>{renderContainer(container, { setNodeRef, isOver: isOver || overItem, items })}</>
}

interface ItemProps {
  id: string
  locked: boolean
  renderItem: Props['renderItem']
  onActivate?: Props['onItemActivate']
}

function SortableItem({ id, locked, renderItem, onActivate }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    // A locked item stays put but still marks a place to drop next to.
    disabled: { draggable: locked, droppable: false },
  })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    touchAction: 'manipulation',
    // A long press picks the item up; don't let it select text or open the callout menu.
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(event)
    if (event.key === 'Enter' && !isDragging && onActivate) {
      event.preventDefault()
      onActivate(id, event.currentTarget)
    }
  }
  return (
    // A locked item can't be dragged but can still be activated, so it isn't aria-disabled.
    <div ref={setNodeRef} style={style} {...attributes} aria-disabled={undefined} {...listeners} onKeyDown={onKeyDown}>
      {renderItem(id, { dragging: isDragging, overlay: false, locked })}
    </div>
  )
}
