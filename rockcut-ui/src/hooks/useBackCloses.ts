import { useEffect, useRef } from 'react'

// D38 (DEV pass 2, B): Android's back gesture closes an open sheet instead of
// leaving the page. While `open`, a history entry for the same URL sits on
// top; back pops it and calls `onClose`. Closed any other way, the entry is
// taken off again, so the next back leaves the page in one press.

const KEY = 'rockcutBackCloses'
let nextId = 1

export function useBackCloses(open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  // One entry per opening, kept across StrictMode's effect re-run.
  const id = useRef<number | null>(null)
  const pendingBack = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (pendingBack.current) {
      // StrictMode re-ran the effect: the entry is still there.
      clearTimeout(pendingBack.current)
      pendingBack.current = null
    }
    if (id.current === null || window.history.state?.[KEY] !== id.current) {
      id.current = nextId++
      // Keeps the router's state, so the location doesn't change.
      window.history.pushState({ ...window.history.state, [KEY]: id.current }, '')
    }
    const mine = id.current
    const onPop = () => {
      if (window.history.state?.[KEY] === mine) return
      id.current = null
      close.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // After this tick, so a re-run can keep the entry.
      pendingBack.current = setTimeout(() => {
        pendingBack.current = null
        id.current = null
        if (window.history.state?.[KEY] === mine) window.history.back()
      })
    }
  }, [open])
}
