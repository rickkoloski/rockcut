import { useEffect, useRef } from 'react'
import { useMediaQuery, useTheme } from '@mui/material'

// D38 (DEV pass 2, B): Android's back gesture closes an open sheet instead of
// leaving the page. While `open`, a history entry for the same URL sits on
// top; back pops it and calls `onClose`. Closed any other way, the entry is
// taken off again, so the next back leaves the page in one press.
//
// D39 (S76): one thing closing as another opens (a sheet's action opening a
// dialog) hands the entry over instead of stacking a second one: the entry of
// something that just closed waits one tick, and whatever opens in that tick
// takes it (replaceState). So one back closes the dialog and the next leaves
// the page; there's no dead press in between. Things that open on top of an
// open one (a confirm over a dialog) still stack, and back closes the top one.
// If two close together, the one underneath may be left with an entry nothing
// owns: back landing on such an entry steps back again, so it's never a dead press.

const KEY = 'rockcutBackCloses'
let nextId = 1
/** The entry of something that just closed, taken off after this tick unless handed over. */
let releasing: { id: number; timer: ReturnType<typeof setTimeout> } | null = null
/** Entries whose owner is open, with whether back may close it now. */
const owned = new Map<number, () => boolean>()
let listening = false

function skipOrphans() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    // D63 (6260): something that can't close now puts its own entry back (below).
    if ([...owned.values()].some((blocked) => blocked())) return
    const entry = window.history.state?.[KEY]
    if (typeof entry === 'number' && !owned.has(entry) && releasing?.id !== entry) window.history.back()
  })
}

/**
 * D63 (6260): runs `fn` once back's entries are off the top, for a close that
 * then navigates: an entry comes off with `history.back()` a tick after its
 * owner closes, and a `navigate(-1)` or replace in between would spend itself
 * on that entry. With no entry on top (desktop) it runs at once. The caller
 * closes every owner of an entry, or it never runs.
 */
export function afterBackCloses(fn: () => void) {
  if (window.history.state?.[KEY] == null) return fn()
  const onPop = () => {
    if (window.history.state?.[KEY] != null) return
    window.removeEventListener('popstate', onPop)
    fn()
  }
  window.addEventListener('popstate', onPop)
}

/** `blocked`: read when back is pressed; while true, back does nothing (the entry is put back). */
export function useBackCloses(open: boolean, onClose: () => void, blocked?: () => boolean) {
  const close = useRef(onClose)
  const block = useRef(blocked)
  useEffect(() => {
    close.current = onClose
    block.current = blocked
  })
  // One entry per opening, kept across StrictMode's effect re-run.
  const id = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    skipOrphans()
    const top = window.history.state?.[KEY]
    if (releasing && top === releasing.id) {
      clearTimeout(releasing.timer)
      const entry = releasing.id
      releasing = null
      if (id.current !== entry) {
        // Something else just closed: take over its entry (the same URL).
        id.current = nextId++
        window.history.replaceState({ ...window.history.state, [KEY]: id.current }, '')
      }
      // Otherwise StrictMode re-ran the effect: the entry is still ours.
    } else if (id.current === null || top !== id.current) {
      id.current = nextId++
      // Keeps the router's state, so the location doesn't change.
      window.history.pushState({ ...window.history.state, [KEY]: id.current }, '')
    }
    const mine = id.current
    const href = window.location.href
    const isBlocked = () => !!block.current?.()
    owned.set(mine, isBlocked)
    // The entry landed on, not the top now: a blocked one above may have put its own back already.
    const onPop = (e: PopStateEvent) => {
      if (e.state?.[KEY] === mine) return
      if (isBlocked() && window.location.href === href) {
        window.history.pushState({ ...window.history.state, [KEY]: mine }, '')
        return
      }
      id.current = null
      close.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      owned.delete(mine)
      // After this tick, so a re-run (or whatever opens next) can keep the entry.
      const timer = setTimeout(() => {
        if (releasing?.id === mine) releasing = null
        if (id.current === mine) id.current = null
        if (window.history.state?.[KEY] === mine) window.history.back()
      })
      releasing = { id: mine, timer }
    }
  }, [open])
}

/** `useBackCloses` at phone width only (S76): the phone dialogs, as the task sheet does. */
export function usePhoneBackCloses(open: boolean, onClose: () => void, blocked?: () => boolean) {
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true })
  useBackCloses(open && phone, onClose, blocked)
}
