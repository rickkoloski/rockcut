import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// D47 plan decision 7: one pointer-event hook for the Gantt's drags. A mouse
// drags at once (after a few pixels, so a click stays a click); touch drags
// after a 450 ms long-press, and a plain swipe scrolls the grid. Drops snap
// to whole days (and to rows, which the caller works out from `y`).

export const LONG_PRESS_MS = 450
const MOUSE_SLOP = 4
const TOUCH_SLOP = 8

export interface DragState {
  key: string
  /** Pixels moved since the press. */
  dx: number
  dy: number
  /** Where the pointer is (client coordinates), for the drop row. */
  x: number
  y: number
}

export interface DropInfo {
  dx: number
  dy: number
  x: number
  y: number
}

interface Pending {
  key: string
  pointerId: number
  startX: number
  startY: number
  touch: boolean
  armed: boolean
  timer: number | null
  onDrop: (d: DropInfo) => void
}

/**
 * `bind(key, onDrop)` gives an element its pointer handlers; `active` is
 * the drag in progress (to draw the lifted element and the drop row).
 * `consumeClick()` is true right after a drag: the click that follows it
 * mustn't open the element's dialog.
 */
export function useTimelineDrag() {
  const [active, setActive] = useState<DragState | null>(null)
  const pending = useRef<Pending | null>(null)
  const justDragged = useRef(false)

  const clear = useCallback(() => {
    const p = pending.current
    if (p?.timer) window.clearTimeout(p.timer)
    pending.current = null
    setActive(null)
  }, [])

  // While a touch drag is live, the page mustn't scroll under it.
  useEffect(() => {
    if (!active) return
    const stop = (e: TouchEvent) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [active])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      const dx = e.clientX - p.startX
      const dy = e.clientY - p.startY
      const dist = Math.hypot(dx, dy)
      if (!p.armed) {
        if (p.touch) {
          // Moving before the long-press is up: it's a swipe, let it scroll.
          if (dist > TOUCH_SLOP) clear()
          return
        }
        if (dist < MOUSE_SLOP) return
        p.armed = true
      }
      setActive({ key: p.key, dx, dy, x: e.clientX, y: e.clientY })
    }
    const up = (e: PointerEvent) => {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      if (p.armed && (Math.abs(e.clientX - p.startX) >= 1 || Math.abs(e.clientY - p.startY) >= 1)) {
        justDragged.current = true
        window.setTimeout(() => (justDragged.current = false), 0)
        p.onDrop({ dx: e.clientX - p.startX, dy: e.clientY - p.startY, x: e.clientX, y: e.clientY })
      }
      clear()
    }
    const cancel = (e: PointerEvent) => {
      if (pending.current && e.pointerId === pending.current.pointerId) clear()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && pending.current && clear()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
  }, [clear])

  const bind = useCallback(
    (key: string, onDrop: (d: DropInfo) => void) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0 || pending.current) return
        e.stopPropagation()
        const touch = e.pointerType !== 'mouse'
        const p: Pending = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, touch, armed: false, timer: null, onDrop }
        if (touch) {
          p.timer = window.setTimeout(() => {
            p.armed = true
            navigator.vibrate?.(10)
            setActive({ key, dx: 0, dy: 0, x: p.startX, y: p.startY })
          }, LONG_PRESS_MS)
        }
        pending.current = p
      },
      // The long-press callout and text selection would get in the way.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [],
  )

  const consumeClick = useCallback(() => justDragged.current, [])

  return { active, bind, consumeClick }
}
