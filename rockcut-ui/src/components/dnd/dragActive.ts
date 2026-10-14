import { createContext, useContext } from 'react'

// True while an item is lifted in the surrounding SortableLists. Lets other
// gestures in the lists (a page's swipe, say) stay out of a drag.
export const DragActiveContext = createContext(false)

export const useDragActive = () => useContext(DragActiveContext)
