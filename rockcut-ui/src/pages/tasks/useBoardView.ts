import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery, useTheme } from '@mui/material'
import { addDaysKey } from '../../lib/datetime'
import {
  FUTURE,
  coloradoToday,
  dayCount,
  isDateKey,
  rangeError,
  rangeForDay,
  readHideCompleted,
  readPhoneView,
  readSpan,
  spanEnd,
  writeHideCompleted,
  writePhoneView,
  writeSpan,
  type PhoneView,
  type Span,
} from '../../lib/tasks'

const WIDE_BOARD_PX = 1200

/**
 * The view a task board and the All departments view share (D38 §3.8, D41
 * §3.6): the range in the URL (`?from=&to=`), 1 week / 2 weeks, Hide
 * completed, the phone view, and whether the board is wide enough for nine
 * columns. Attach `setBoardEl` to the board's outer element.
 *
 * D41: `?day=<YYYY-MM-DD>` (or `?day=future`) moves the range to hold that
 * day (`rangeForDay`) and drops the param; `focus` is that day until the
 * board has scrolled to it (`clearFocus`).
 */
export function useBoardView() {
  const [params, setParams] = useSearchParams()
  const [span, setSpan] = useState<Span>(readSpan)
  const [hideCompleted, setHideCompleted] = useState(readHideCompleted)
  // D39: at phone width, every day stacked (the default) or one at a time.
  const [phoneView, setPhoneViewState] = useState<PhoneView>(readPhoneView)
  // Nine columns (Unfinished, seven days, Future) need about 1,200px of board,
  // which a 1280px screen beside the nav doesn't have (spec §3.8).
  const [boardEl, setBoardEl] = useState<HTMLElement | null>(null)
  const [boardWidth, setBoardWidth] = useState(0)
  useEffect(() => {
    if (!boardEl) return
    const observer = new ResizeObserver(([entry]) => setBoardWidth(entry.contentRect.width))
    observer.observe(boardEl)
    return () => observer.disconnect()
  }, [boardEl])
  const wide = boardWidth >= WIDE_BOARD_PX
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true })

  // The range lives in the URL; without a valid one it's today plus the default span.
  const urlFrom = params.get('from') ?? ''
  const urlTo = params.get('to') ?? ''
  const urlValid = rangeError(urlFrom, urlTo) === null
  const from = urlValid ? urlFrom : coloradoToday()
  const to = urlValid ? urlTo : spanEnd(from, span)
  const length = dayCount(from, to)
  const highlighted: Span | null = urlValid ? (length === 7 || length === 14 ? length : null) : span

  // `?day=`: the range that holds it, then the param goes (replace).
  const [focus, setFocus] = useState<string | null>(null)
  const clearFocus = useCallback(() => setFocus(null), [])
  const day = params.get('day')
  useEffect(() => {
    if (day === null) return
    const next = new URLSearchParams(params)
    next.delete('day')
    if (day === FUTURE || isDateKey(day)) {
      setFocus(day)
      const range = rangeForDay(day, from, to, highlighted ?? span)
      // The default range stays out of the URL, as Today leaves it.
      if (urlValid || range.from !== from) {
        next.set('from', range.from)
        next.set('to', range.to)
      }
    }
    setParams(next, { replace: true })
    // Once per `?day=`; the range it reads is the one showing when it arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  const showRange = (f: string, t: string) => setParams({ from: f, to: t })
  /**
   * Previous / Next by the range's own length. They read the address bar, not
   * this render's range: the URL changes before the board re-renders, and a
   * quick second click mustn't step from the old range.
   */
  const step = (direction: 1 | -1) => {
    const now = new URLSearchParams(window.location.search)
    const [f, t] = rangeError(now.get('from') ?? '', now.get('to') ?? '') === null ? [now.get('from')!, now.get('to')!] : [from, to]
    const n = dayCount(f, t) * direction
    showRange(addDaysKey(f, n), addDaysKey(t, n))
  }
  const pickSpan = (s: Span) => {
    writeSpan(s)
    setSpan(s)
    showRange(from, spanEnd(from, s))
  }
  const toggleHide = (on: boolean) => {
    writeHideCompleted(on)
    setHideCompleted(on)
  }
  const setPhoneView = (view: PhoneView) => {
    writePhoneView(view)
    setPhoneViewState(view)
  }

  return {
    from,
    to,
    highlighted,
    hideCompleted,
    phoneView,
    phone,
    wide,
    setBoardEl,
    focus,
    clearFocus,
    showRange,
    step,
    pickSpan,
    toggleHide,
    setPhoneView,
    /** Today: the default range (the URL loses its range). */
    showToday: () => setParams({}),
  }
}

/** Scroll a day's column (or the Future list) into view, if it's on the page. */
export function scrollToStop(stop: string) {
  const testId = stop === FUTURE ? 'future-list' : `day-${stop}`
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ block: 'start', inline: 'center' })
}
