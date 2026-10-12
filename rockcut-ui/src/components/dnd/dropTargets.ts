import { createContext } from 'react'

// DropTarget registers itself here; SortableLists calls onDrop when a drag
// ends over it. Keys are the DropTarget's own (unprefixed) ids.
export type DropHandlers = Map<string, { onDrop: (itemId: string) => void; label: string }>

export const DropTargetsContext = createContext<DropHandlers | null>(null)

// Droppable ids are prefixed so they can't collide with item ids.
export const CONTAINER_PREFIX = 'dnd-container:'
export const TARGET_PREFIX = 'dnd-target:'
export const containerDropId = (id: string) => `${CONTAINER_PREFIX}${id}`
export const targetDropId = (id: string) => `${TARGET_PREFIX}${id}`
