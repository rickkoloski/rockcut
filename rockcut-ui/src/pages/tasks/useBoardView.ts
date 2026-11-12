import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery, useTheme } from '@mui/material'
import useAuth from '../../hooks/useAuth'
import { addDaysKey } from '../../lib/datetime'
import {
  FUTURE,
  boardRange,
  boardSettings,
  carryOver,
  clearLocalSettings,
  coloradoToday,
  dayCount,
  defaultRange,
  isDateKey,
  rangeError,
  rangeForDay,
  readLocalSettings,
  spanEnd,
  type BoardSettings,
  type FirstDay,
  type PhoneView,
  type Span,
  type TaskFilter,
} from '../../lib/tasks'

const WIDE_BOARD_PX = 1200

// D58: the boards whose carry-over this page has started (`<user>:<board>`), so it runs once.
const carried = new Set<string>()

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
 * D42: the choices are per board (`board`: a department key, or `all`), and
 * the range starts on the first day (Today, Sunday or Monday) of the week
 * holding today.
 *
 * D58: the choices, the View filter with them, are saved on the server per
 * account (`/api/me`'s `board_settings`); a failed save keeps the change for
 * this page and sets `notSaved`. A board this account has nothing saved for
 * takes this browser's old local choices, saved once (`carryOver`). A URL
 * range over 31 days shows 31 (`clampNotice`), and the URL is corrected.
 */
export function useBoardView(board: string) {
  const [params, setParams] = useSearchParams()
  const userId = useAuth((s) => s.user?.id)
  const stored = useAuth((s) => s.boardSettings[board])
  const saveBoardSettings = useAuth((s) => s.saveBoardSettings)
  // Until the server has the board, this browser's old choices show (D58 carry-over).
  const hasStored = stored !== undefined
  const local = useMemo(() => (hasStored ? null : readLocalSettings(board)), [board, hasStored])
  const settings = boardSettings(stored ?? local)
  const { span, hide_completed: hideCompleted, hide_shifts: hideShifts, phone_view: phoneView, first_day: firstDay, view } = settings
  const [notSaved, setNotSaved] = useState(false)

  useEffect(() => {
    if (userId === undefined || carried.has(`${userId}:${board}`)) return
    carried.add(`${userId}:${board}`)
    void carryOver(board, useAuth.getState().boardSettings[board], (s) => useAuth.getState().saveBoardSettings(board, s))
  }, [userId, board])

  /** Save some settings; a board not on the server yet takes its local ones along. */
  const save = (changes: Partial<BoardSettings>) => {
    const carry = hasStored ? null : readLocalSettings(board)
    saveBoardSettings(board, { ...carry, ...changes })
      .then(() => carry && clearLocalSettings(board))
      .catch(() => setNotSaved(true))
  }

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
  // from the first day of the week holding today. Over 31 days, 31.
  const urlFrom = params.get('from') ?? ''
  const urlTo = params.get('to') ?? ''
  const range = boardRange(urlFrom, urlTo, defaultRange(coloradoToday(), span, firstDay))
  const { from, to, inUrl: urlValid } = range
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

  // D58 §3.2: a range over 31 days, or an invalid one, is corrected in the
  // URL (replace). `?day=` goes first: it sets its own range.
  const [clamped, setClamped] = useState<string | null>(null)
  useEffect(() => {
    if (day !== null || !range.fix) return
    const next = new URLSearchParams(params)
    if (range.fix.from) {
      next.set('from', range.fix.from)
      next.set('to', range.fix.to)
    } else {
      next.delete('from')
      next.delete('to')
    }
    if (range.clamped) setClamped(`${range.fix.from}/${range.fix.to}`)
    setParams(next, { replace: true })
    // Once per URL range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFrom, urlTo, day])
  /** "Showing 31 days (the most a board shows)", while the clamped range shows. */
  const clampNotice = clamped === `${from}/${to}`

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
    save({ span: s })
    showRange(from, spanEnd(from, s))
  }
  /** D42: a new first day shows the week holding today from it (the default range). */
  const pickFirstDay = (first: FirstDay) => {
    save({ first_day: first })
    setParams({})
  }

  return {
    from,
    to,
    highlighted,
    firstDay,
    hideCompleted,
    hideShifts,
    phoneView,
    /** D58: the View filter (All / My tasks / Unassigned), saved with the rest. */
    view,
    phone,
    wide,
    setBoardEl,
    focus,
    clearFocus,
    showRange,
    step,
    pickSpan,
    pickFirstDay,
    toggleHide: (on: boolean) => save({ hide_completed: on }),
    toggleHideShifts: (on: boolean) => save({ hide_shifts: on }),
    setPhoneView: (v: PhoneView) => save({ phone_view: v }),
    setView: (v: TaskFilter) => save({ view: v }),
    clampNotice,
    /** D58: a setting didn't save (it stays for this page): a quiet "Not saved". */
    notSaved,
    clearNotSaved: () => setNotSaved(false),
    /** Today: the default range, the week holding today (the URL loses its range). */
    showToday: () => setParams({}),
  }
}

/** Scroll a day's column (or the Future list) into view, if it's on the page. */
export function scrollToStop(stop: string) {
  const testId = stop === FUTURE ? 'future-list' : `day-${stop}`
  document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ block: 'start', inline: 'center' })
}
