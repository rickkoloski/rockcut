import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

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
/** D48: within this many pixels of the grid's edge a drag scrolls it, faster the closer it gets. */
export const EDGE_PX = 40
const EDGE_MAX_SPEED = 18
/** A drag that starts in an edge zone doesn't scroll until it has moved this far toward that edge. */
const EDGE_INTENT_PX = 12

/** D48: the grid that scrolls under a drag, and the parts of it that stay put (sticky header and tank column). */
export interface AutoScroll {
  scroller: RefObject<HTMLElement | null>
  insets: () => { top: number; left: number }
}

/** Pixels to scroll this frame for a pointer `d` pixels inside an edge (negative = past it). */
const edgeSpeed = (d: number) => (d >= EDGE_PX ? 0 : Math.ceil(EDGE_MAX_SPEED * Math.min(1, (EDGE_PX - d) / EDGE_PX)))

export interface DragState {
  key: string
  /** Pixels moved since the press, over the content (the grid's scrolling counts: D48). */
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
  /** Shift held at the release: "move only this step" (D48, P113). */
  shift: boolean
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
  /** A long-press let go without moving (touch): D48 selection mode. */
  onHold?: () => void
  /** The pointer now, and the grid's scroll at the press. */
  x: number
  y: number
  scrollLeft: number
  scrollTop: number
  /** The page's scroll at the press (it can scroll too: D48 DEV, the Pixel). */
  pageX: number
  pageY: number
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
export function useTimelineDrag(auto?: AutoScroll) {
  const [active, setActive] = useState<DragState | null>(null)
  // Hover tooltips stay hidden from a drag's start until the pointer moves after it ends (N2).
  const [quiet, setQuiet] = useState(false)
  const quietRef = useRef(false)
  const pending = useRef<Pending | null>(null)
  const autoRef = useRef(auto)
  // The latest insets (the tank column's width changes with names-only).
  useEffect(() => {
    autoRef.current = auto
  })
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

  // Where the drag is over the content: the pointer's move plus the grid's scroll since the press.
  const where = useCallback((p: Pending): DragState => {
    const el = autoRef.current?.scroller.current
    const sx = (el ? el.scrollLeft - p.scrollLeft : 0) + window.scrollX - p.pageX
    const sy = (el ? el.scrollTop - p.scrollTop : 0) + window.scrollY - p.pageY
    return { key: p.key, dx: p.x - p.startX + sx, dy: p.y - p.startY + sy, x: p.x, y: p.y, touch: p.touch }
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

  // D48: near an edge of the grid a live drag scrolls it (mouse and touch),
  // and the drag state follows, so the lifted element, the hint and the
  // drop row stay under the pointer.
  const dragging = !!active
  useEffect(() => {
    if (!dragging) return
    let frame = 0
    const tick = () => {
      const p = pending.current
      const a = autoRef.current
      const el = a?.scroller.current
      if (p?.armed && a && el) {
        // The part of the grid on screen: on a phone the grid runs on below
        // the screen, so its own bottom edge is out of reach (Matt, Pixel).
        const box = el.getBoundingClientRect()
        const vv = window.visualViewport
        const r = {
          top: Math.max(box.top, vv?.offsetTop ?? 0),
          bottom: Math.min(box.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight),
          left: Math.max(box.left, vv?.offsetLeft ?? 0),
          right: Math.min(box.right, vv ? vv.offsetLeft + vv.width : window.innerWidth),
        }
        const inset = a.insets()
        // Only toward an edge the pointer has moved toward: a press near the
        // bottom row mustn't scroll the grid out from under it.
        const [mx, my] = [p.x - p.startX, p.y - p.startY]
        const vx =
          (mx > EDGE_INTENT_PX ? edgeSpeed(r.right - p.x) : 0) - (mx < -EDGE_INTENT_PX ? edgeSpeed(p.x - (r.left + inset.left)) : 0)
        const vy =
          (my > EDGE_INTENT_PX ? edgeSpeed(r.bottom - p.y) : 0) - (my < -EDGE_INTENT_PX ? edgeSpeed(p.y - (r.top + inset.top)) : 0)
        const before = [el.scrollLeft, el.scrollTop, window.scrollX, window.scrollY]
        if (vx || vy) el.scrollBy(vx, vy)
        // At the grid's own end, the page scrolls instead (when it can).
        if (vy && el.scrollTop === before[1]) window.scrollBy(0, vy)
        if (el.scrollLeft !== before[0] || el.scrollTop !== before[1] || window.scrollX !== before[2] || window.scrollY !== before[3]) setActive(where(p))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [dragging, where])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current
      if (!p) {
        if (cancelledDown.current == null) hush(false)
        return
      }
      if (e.pointerId !== p.pointerId) return
      p.x = e.clientX
      p.y = e.clientY
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
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
      setActive(where(p))
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
        p.x = e.clientX
        p.y = e.clientY
        const { dx, dy, x, y } = where(p)
        if (p.touch && p.onHold && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < TOUCH_SLOP) p.onHold()
        else p.onDrop({ dx, dy, x, y, shift: e.shiftKey })
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
  }, [clear, hush, where])

  const bind = useCallback(
    (key: string, onDrop: (d: DropInfo) => void, onHold?: () => void) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0 || pending.current) return
        cancelledDown.current = null
        if (throughModal(e)) return
        e.stopPropagation()
        const touch = e.pointerType !== 'mouse'
        const el = autoRef.current?.scroller.current
        const p: Pending = {
          key,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          touch,
          armed: false,
          timer: null,
          onDrop,
          onHold,
          x: e.clientX,
          y: e.clientY,
          scrollLeft: el?.scrollLeft ?? 0,
          scrollTop: el?.scrollTop ?? 0,
          pageX: window.scrollX,
          pageY: window.scrollY,
        }
        if (touch) {
          p.timer = window.setTimeout(() => {
            p.armed = true
            hush(true)
            navigator.vibrate?.(10)
            setActive(where(p))
          }, LONG_PRESS_MS)
        }
        pending.current = p
      },
      // The long-press callout and text selection would get in the way.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [hush, where],
  )

  const consumeClick = useCallback((e?: { clientX: number; clientY: number }) => justDragged.current || throughModal(e), [])

  return { active, bind, consumeClick, quiet }
}
