import parseApiError from './parseApiError'
import { TZ, addDaysKey, localDayKey } from './datetime'
import type { DayHeaderData, HeaderShift, TaskCardData } from './types'

// D38: Brewery task board helpers shared by the board, its dialogs and the specs.

/** The longest range the board shows (spec §3.6). */
export const MAX_RANGE_DAYS = 31

export type Span = 7 | 14
export type TaskFilter = 'all' | 'mine' | 'unassigned'

/** Container ids beside the day dates. */
export const UNFINISHED = 'unfinished'
export const FUTURE = 'future'

/** Today in Colorado as YYYY-MM-DD. The server's `today` wins once the board loads. */
export const coloradoToday = () => localDayKey(new Date().toISOString())

/** Days from `from` to `to`, both included (0 or less when `to` is before `from`). */
export function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1
}

/** A valid "YYYY-MM-DD" date key. */
export function isDateKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
}

/** Why a From–To pair can't be shown, or null when it can. */
export function rangeError(from: string, to: string): string | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'Pick both dates'
  if (to < from) return 'To must be on or after From'
  if (dayCount(from, to) > MAX_RANGE_DAYS) return `Up to ${MAX_RANGE_DAYS} days`
  return null
}

export const spanEnd = (from: string, span: number) => addDaysKey(from, span - 1)

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' })

/** "Mon 10/12" for a date key. */
export function formatTaskDay(key: string): string {
  return dayFmt.format(new Date(`${key}T12:00:00Z`)).replace(',', '')
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })

/** "7:00a" / "3:30p" in Colorado time. */
export function shortTime(iso: string): string {
  return timeFmt.format(new Date(iso)).replace(/\s?([AP])M$/i, (_, m: string) => m.toLowerCase())
}

const shortRange = (s: { starts_at: string; ends_at: string }) => `${shortTime(s.starts_at)}–${shortTime(s.ends_at)}`

const hoursLabel = (hours: number) => `${Math.round(hours * 100) / 100}h`

/**
 * "Jake Brewer · Brewer · 7:00a–3:00p · 8h". Two shifts share the line:
 * "· Brewer · 6:00a–10:00a, 2:00p–6:00p · 8h", or each with its position when
 * they differ.
 */
export function personLine(p: DayHeaderData['people'][number]): string {
  const positions = [...new Set(p.shifts.map((s) => s.position_name))]
  const shifts =
    positions.length === 1
      ? `${positions[0]} · ${p.shifts.map(shortRange).join(', ')}`
      : p.shifts.map((s) => `${s.position_name} ${shortRange(s)}`).join(', ')
  return `${p.name} · ${shifts} · ${hoursLabel(p.hours)}`
}

export const openShiftLine = (s: HeaderShift) => `Open · ${s.position_name} · ${shortRange(s)}`

export const eventLine = (e: DayHeaderData['events'][number]) =>
  `${e.title} · ${e.all_day ? 'All day' : shortRange(e)}`

/** "JB" for "Jake Brewer". */
export function initials(name: string | null): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? ''

/** Does the card pass the toolbar's filter and Hide completed? */
export function cardShown(card: TaskCardData, filter: TaskFilter, hideCompleted: boolean, userId: number | undefined) {
  if (hideCompleted && card.done) return false
  if (filter === 'mine') return card.assignee_id != null && card.assignee_id === userId
  if (filter === 'unassigned') return card.assignee_id == null
  return true
}

/** A refused board write as a sentence: the API's `message`, else the usual parse. */
export function taskError(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message ?? parseApiError(err)
}

/** The most active Daily items (the API's cap). */
export const MAX_DAILY_ITEMS = 12

/**
 * A refused Daily items change in the dialog's words (spec S31): "Up to 12
 * items", or the name's own error ("Already on the list", too long).
 */
export function dailyItemError(err: unknown): string {
  const data = (err as { response?: { data?: { error?: string; errors?: Record<string, string[]> } } })?.response?.data
  if (data?.error === 'too_many_items') return `Up to ${MAX_DAILY_ITEMS} items`
  const name = data?.errors?.name
  if (name?.length) return name[0].replace(/^./, (c) => c.toUpperCase())
  return taskError(err)
}

// ── Per-browser preferences (spec §3.8). Storage can be missing or throw. ──

const SPAN_KEY = 'rockcut.breweryTasks.span'
const HIDE_KEY = 'rockcut.breweryTasks.hideCompleted'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered in this browser; the board still works.
  }
}

/** The default span: 2 weeks until someone picks. */
export const readSpan = (): Span => (read(SPAN_KEY) === '7' ? 7 : 14)
export const writeSpan = (span: Span) => write(SPAN_KEY, String(span))
export const readHideCompleted = () => read(HIDE_KEY) === 'true'
export const writeHideCompleted = (on: boolean) => write(HIDE_KEY, String(on))
