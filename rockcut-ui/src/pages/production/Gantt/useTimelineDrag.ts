import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// D47 plan decision 7: one pointer-event hook for the Gantt's drags. A mouse
// drags at once (after a few pixels, so a click stays a click); touch drags
// after a 450 ms long-press, and a plain swipe scrolls the grid. Drops snap
// to whole days (and to rows, which the caller works out from `y`).

export const LONG_PRESS_MS = 450
const MOUSE_SLOP = 4
const TOUCH_SLOP = 8
/** After a press in a dialog or menu, a click on the grid this soon and this near is the rest of a double-click. */
const CLICK_THROUGH_MS = 500
const CLICK_THROUGH_PX = 6

export interface DragState {
  key: string
  /** Pixels moved since the press. */
  dx: number
  dy: number
  /** Where the pointer is (client coordinates), for the drop row. */
  x: number
  y: number
  /** A finger: the drag hint goes above it. */
  touch: boolean
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
 * mustn't open the element's dialog. Given the click, it's also true for
 * the second click of a double-click whose first closed a dialog or menu
 * (QA minor 4: double-clicking Apply mustn't open the bar under it): the
 * same spot, within half a second. A click elsewhere is a click.
 */
export function useTimelineDrag() {
  const [active, setActive] = useState<DragState | null>(null)
  // Hover tooltips stay hidden from a drag's start until the pointer moves after it ends (N2).
  const [quiet, setQuiet] = useState(false)
  const quietRef = useRef(false)
  const pending = useRef<Pending | null>(null)
  const justDragged = useRef(false)
  // An Escape-cancelled drag: the button is still down, and its release would click what's under it.
  const cancelledDown = useRef<number | null>(null)
  const modalPress = useRef({ at: 0, x: 0, y: 0 })
  const throughModal = (e?: { clientX: number; clientY: number }) => {
    const m = modalPress.current
    return !!e && performance.now() - m.at < CLICK_THROUGH_MS && Math.hypot(e.clientX - m.x, e.clientY - m.y) <= CLICK_THROUGH_PX
  }

  const hush = useCallback((on: boolean) => {
    if (quietRef.current === on) return
    quietRef.current = on
    setQuiet(on)
  }, [])

  const clear = useCallback(() => {
    const p = pending.current
    if (p?.timer) window.clearTimeout(p.timer)
    pending.current = null
    setActive(null)
  }, [])

  // The click after a drag (dropped, cancelled, or back where it began)
  // mustn't open anything (N5, N7).
  const swallowClick = () => {
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
  }

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
      if (!p) {
        if (cancelledDown.current == null) hush(false)
        return
      }
      if (e.pointerId !== p.pointerId) return
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
      hush(true)
      setActive({ key: p.key, dx, dy, x: e.clientX, y: e.clientY, touch: p.touch })
    }
    const up = (e: PointerEvent) => {
      if (cancelledDown.current === e.pointerId) {
        cancelledDown.current = null
        swallowClick()
        return
      }
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      // A drag that began always ends as a drag: released within half a day
      // of its start it snaps to no move, and opens nothing (N7).
      if (p.armed) {
        swallowClick()
        p.onDrop({ dx: e.clientX - p.startX, dy: e.clientY - p.startY, x: e.clientX, y: e.clientY })
      }
      clear()
    }
    const cancel = (e: PointerEvent) => {
      if (cancelledDown.current === e.pointerId) cancelledDown.current = null
      if (pending.current && e.pointerId === pending.current.pointerId) clear()
    }
    // Escape: the drag is over, but the button's still down; its release is swallowed too (N5).
    const key = (e: KeyboardEvent) => {
      const p = pending.current
      if (e.key !== 'Escape' || !p) return
      if (p.armed) cancelledDown.current = p.pointerId
      clear()
    }
    const pressInModal = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('.MuiModal-root')) modalPress.current = { at: performance.now(), x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointerup', pressInModal, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerup', pressInModal, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
  }, [clear, hush])

  const bind = useCallback(
    (key: string, onDrop: (d: DropInfo) => void) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0 || pending.current) return
        cancelledDown.current = null
        if (throughModal(e)) return
        e.stopPropagation()
        const touch = e.pointerType !== 'mouse'
        const p: Pending = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, touch, armed: false, timer: null, onDrop }
        if (touch) {
          p.timer = window.setTimeout(() => {
            p.armed = true
            hush(true)
            navigator.vibrate?.(10)
            setActive({ key, dx: 0, dy: 0, x: p.startX, y: p.startY, touch: true })
          }, LONG_PRESS_MS)
        }
        pending.current = p
      },
      // The long-press callout and text selection would get in the way.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [hush],
  )

  const consumeClick = useCallback((e?: { clientX: number; clientY: number }) => justDragged.current || throughModal(e), [])

  return { active, bind, consumeClick, quiet }
}
