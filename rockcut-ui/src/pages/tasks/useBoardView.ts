import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery, useTheme } from '@mui/material'
import { addDaysKey } from '../../lib/datetime'
import {
  FUTURE,
  coloradoToday,
  dayCount,
  defaultRange,
  isDateKey,
  rangeError,
  rangeForDay,
  readFirstDay,
  readHideCompleted,
  readHideShifts,
  readPhoneView,
  readSpan,
  spanEnd,
  writeFirstDay,
  writeHideCompleted,
  writeHideShifts,
  writePhoneView,
  writeSpan,
  type FirstDay,
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
 *
 * D42: the choices are remembered per board (`board`: a department key, or
 * `all`), and the range starts on the first day (Today, Sunday or Monday) of
 * the week holding today.
 */
export function useBoardView(board: string) {
  const [params, setParams] = useSearchParams()
  const [span, setSpan] = useState<Span>(() => readSpan(board))
  const [hideCompleted, setHideCompleted] = useState(() => readHideCompleted(board))
  // D45: the day headers without who's working and open shifts (events stay).
  const [hideShifts, setHideShifts] = useState(() => readHideShifts(board))
  // D39: at phone width, every day stacked (the default) or one at a time.
  const [phoneView, setPhoneViewState] = useState<PhoneView>(() => readPhoneView(board))
  const [firstDay, setFirstDayState] = useState<FirstDay>(() => readFirstDay(board))
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

  // The range lives in the URL; without a valid one it's the default span
  // from the first day of the week holding today.
  const urlFrom = params.get('from') ?? ''
  const urlTo = params.get('to') ?? ''
  const urlValid = rangeError(urlFrom, urlTo) === null
  const fallback = defaultRange(coloradoToday(), span, firstDay)
  const from = urlValid ? urlFrom : fallback.from
  const to = urlValid ? urlTo : fallback.to
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
      const range = rangeForDay(day, from, to, highlighted ?? span, firstDay)
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
    writeSpan(board, s)
    setSpan(s)
    showRange(from, spanEnd(from, s))
  }
  /** D42: a new first day shows the week holding today from it (the default range). */
  const pickFirstDay = (first: FirstDay) => {
    writeFirstDay(board, first)
    setFirstDayState(first)
    setParams({})
  }
  const toggleHide = (on: boolean) => {
    writeHideCompleted(board, on)
    setHideCompleted(on)
  }
  const toggleHideShifts = (on: boolean) => {
    writeHideShifts(board, on)
    setHideShifts(on)
  }
  const setPhoneView = (view: PhoneView) => {
    writePhoneView(board, view)
    setPhoneViewState(view)
  }

  return {
    from,
    to,
    highlighted,
    firstDay,
    hideCompleted,
    hideShifts,
    phoneView,
    phone,
    wide,
    setBoardEl,
    focus,
    clearFocus,
    showRange,
    step,
    pickSpan,
    pickFirstDay,
    toggleHide,
    toggleHideShifts,
    setPhoneView,
    /** Today: the default range, the week holding today (the URL loses its range). */
    showToday: () => setParams({}),
  }
}

/** Scroll a day's column (or the Future list) into view, if it's on the page. */
export function scrollToStop(stop: string) {
  const testId = stop === FUTURE ? 'future-list' : `day-${stop}`
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ block: 'start', inline: 'center' })
}
