import parseApiError from './parseApiError'
import { summaryFromDetail } from './repeat'
import { TZ, addDaysKey, localDayKey } from './datetime'
import type { AllBoardCard, DailyCount, DayHeaderData, HeaderShift, TaskBoardEntry, TaskCardData, TaskEvent, TaskEventPage } from './types'

// D38: task board helpers shared by the board, its dialogs and the specs.
// D41: one board per department, under `/api/boards/<dept>`.

/** A board's API path: `boardPath('brewery', 'tasks', 12, 'move')` → `/api/boards/brewery/tasks/12/move`. */
export function boardPath(dept: string, ...segments: (string | number | undefined)[]): string {
  return ['/api/boards', dept, ...segments.map(String)].join('/')
}

/** The query key of a board's Daily items (with the retired ones), with its department. */
export const DAILY_ITEMS_KEY = 'daily-items'

/** D41 §3.6: the All departments view's key in `task_boards` and its URL, `/tasks/all`. */
export const ALL_BOARDS = 'all'

/** "Taproom tasks": a board's title; the All departments view is just "All departments". */
export const boardTitle = (board: Pick<TaskBoardEntry, 'name'> & { key?: string }) =>
  board.key === ALL_BOARDS ? board.name : `${board.name} tasks`

/** The real boards in `task_boards`: everything but the All departments view. */
export const realBoards = <T extends Pick<TaskBoardEntry, 'key'>>(boards: T[]): T[] => boards.filter((b) => b.key !== ALL_BOARDS)

/**
 * The switcher's entries: the boards in department order, then All
 * departments last when the person has it (owners).
 */
export const switcherBoards = <T extends Pick<TaskBoardEntry, 'key'>>(boards: T[]): T[] => [
  ...realBoards(boards),
  ...boards.filter((b) => b.key === ALL_BOARDS),
]

/**
 * D41 §3.5: the board key a Tasks URL should show, or null for Home (no
 * boards). `wanted` is the URL's board (`/tasks/bar`), or null for `/tasks`,
 * which opens the remembered board. A board the person can't open (or a
 * forgotten one) falls back to their first. All departments (owners) opens
 * when asked for or remembered, but it's never the "first board".
 */
export function boardTarget(boards: Pick<TaskBoardEntry, 'key'>[], wanted: string | null, remembered: string | null): string | null {
  const open = (key: string | null) => !!key && boards.some((b) => b.key === key)
  if (open(wanted)) return wanted
  if (wanted === null && open(remembered)) return remembered
  return realBoards(boards)[0]?.key ?? null
}

/** A department's section on a day (or Unfinished, or Future) of the All departments view. */
export interface DepartmentSection {
  board: TaskBoardEntry
  cards: AllBoardCard[]
  daily: DailyCount | null
}

/**
 * D41 §3.6: the All departments view's cards grouped by department, in the
 * boards' order. A department shows when it has a card to show (after the
 * filter and Hide completed) or a Daily count (its board has items that day),
 * even with no tasks; one with neither is left out. Cards keep their board's
 * order.
 */
export function departmentSections(
  boards: TaskBoardEntry[],
  cards: AllBoardCard[],
  dailyCounts: DailyCount[],
  shown: (card: AllBoardCard) => boolean,
): DepartmentSection[] {
  return realBoards(boards)
    .map((board) => ({
      board,
      cards: cards.filter((c) => c.department === board.key && shown(c)),
      daily: dailyCounts.find((d) => d.department === board.key) ?? null,
    }))
    .filter((s) => s.cards.length > 0 || s.daily !== null)
}

/**
 * Where a card on the All departments view opens: its own board, at its day
 * (`?day=`). An Unfinished card opens at today, a Future one at Future.
 */
export function allBoardCardLink(card: AllBoardCard, today: string): string {
  const day = card.day === UNFINISHED ? today : card.day
  return `/tasks/${card.department}?day=${day}`
}

/**
 * The range a board shows for `?day=` (D41 §3.6): the current one when it
 * already holds the day (Future is in every range), else `span` days from
 * the first day of the week holding it (D42 §2.9; with First day = Today,
 * starting on the day itself, as picking that date as From would).
 */
export function rangeForDay(
  day: string,
  from: string,
  to: string,
  span: number,
  first: FirstDay = 'today',
): { from: string; to: string } {
  if (day === FUTURE || (day >= from && day <= to)) return { from, to }
  const start = weekStart(day, first)
  return { from: start, to: spanEnd(start, span) }
}

/** D42 §2.9: where the board's range starts: today, or the week's Sunday or Monday. */
export type FirstDay = 'today' | 'sunday' | 'monday'

/** The first day of the week holding `day` (`day` itself for Today). */
export function weekStart(day: string, first: FirstDay): string {
  if (first === 'today') return day
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDaysKey(day, -(first === 'sunday' ? weekday : (weekday + 6) % 7))
}

/** The range shown without one in the URL: `span` days from the week holding `today`. */
export function defaultRange(today: string, span: Span, first: FirstDay): { from: string; to: string } {
  const from = weekStart(today, first)
  return { from, to: spanEnd(from, span) }
}

/** D42 §2.9: a day before today is dimmed this much (and still works). */
export const PAST_OPACITY = 0.6

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

/**
 * The task behind a stale card is gone: a 410 (someone deleted it, O-1), or a
 * 404 on a task route (an occurrence removed with its series, or any id that's
 * no longer there). Either way the card's id is gone.
 */
export function taskGone(err: unknown): boolean {
  const e = err as { response?: { status?: number }; config?: { url?: string } }
  const status = e?.response?.status
  return status === 410 || (status === 404 && /\/api\/boards\/[^/]+\/tasks\/\d+/.test(e?.config?.url ?? ''))
}

/** A refused board write as a sentence: the API's `message`, else the usual parse. */
export function taskError(err: unknown): string {
  if (taskGone(err)) return 'This task was deleted'
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message ?? parseApiError(err)
}

/**
 * A refused add or edit in the dialog's words. D41: an assignee from outside
 * the board's department reads "Only members of the Taproom can be assigned"
 * (S105).
 */
export function taskSaveError(err: unknown, board: Pick<TaskBoardEntry, 'name'>): string {
  const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
  if (errors?.assignee_id) return `Only members of the ${board.name} can be assigned`
  return taskError(err)
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

// ── History (spec §3.8 "Change log") ──

/** "Sun 10/11, 8:12p" in Colorado time. */
export const formatEventTime = (iso: string) => `${formatTaskDay(localDayKey(iso))}, ${shortTime(iso)}`

/** "Kate Kettle", or "Kate Kettle on Shared Device" (D40's tablet). */
export const eventActor = (ev: TaskEvent) => `${ev.actor_name ?? 'Someone'}${ev.on_shared_device ? ' on Shared Device' : ''}`

const dayOrFuture = (key: unknown) => (typeof key === 'string' ? formatTaskDay(key) : 'Future')

/** D39: " (just this one)" / " (this and following)" for a series edit. */
const scopeNote = (scope: unknown) =>
  scope === 'following' ? ' (this and following)' : scope === 'this' ? ' (just this one)' : ''

/** D39: "removed 40, kept 2" (kept only when some were). */
const removedNote = (d: Record<string, unknown>) =>
  `removed ${Number(d.removed ?? 0)}${Number(d.kept ?? 0) > 0 ? `, kept ${Number(d.kept)}` : ''}`

/**
 * One change-log entry in plain words, old → new: "Moved Package FV6 from
 * Mon 10/12 to Wed 10/14", "Completed Carb FV3 on Wed 10/14, shown on both
 * days", "Ticked Temps for Sun 10/11". D39 adds the recurring-task wording:
 * "Created recurring task Keg Wash on Wed 10/14 (Repeats every week on
 * Wed)", "… (this and following)", "Deleted … this and following (removed
 * 40, kept 2)", "Stopped repeating … (removed 40)", "… to Future (no longer
 * repeats)", "Made Keg Wash repeat from Wed 10/14 (Repeats every week on Wed)".
 */
export function describeEvent(ev: TaskEvent, names: TaskEventPage['names'], board?: Pick<TaskBoardEntry, 'key' | 'name'>): string {
  const d = ev.detail
  const t = ev.title
  const person = (id: unknown) => (id == null ? null : (names.users[String(id)] ?? 'someone no longer here'))
  switch (ev.action) {
    case 'created': {
      const who = person(d.assignee_id)
      const assigned = who ? `, assigned to ${who}` : ''
      if (d.repeat)
        return `Created recurring task ${t} on ${dayOrFuture(d.due_on)}${assigned} (${summaryFromDetail(d.repeat as Record<string, unknown>, d.due_on as string)})`
      return `Added ${t} to ${dayOrFuture(d.due_on)}${assigned}`
    }
    case 'edited': {
      const scope = scopeNote(d.scope)
      const rule = d.repeat as { from?: Record<string, unknown>; to?: Record<string, unknown> } | undefined
      if (rule?.to) {
        const removed = Number(d.removed ?? 0) + Number(d.kept ?? 0) > 0 ? `; ${removedNote(d)}` : ''
        return `Changed how ${t} repeats${scope}: ${summaryFromDetail(rule.to, null)}${removed}`
      }
      const from = (d.from ?? {}) as { title?: string; notes?: string | null; assignee_id?: number | null }
      const to = (d.to ?? {}) as { title?: string; notes?: string | null; assignee_id?: number | null }
      const parts: string[] = []
      if ('title' in to) parts.push(`Renamed ${from.title} to ${to.title}`)
      if ('notes' in to) parts.push(`${to.notes ? (from.notes ? 'Changed' : 'Added') : 'Removed'} the notes on ${t}`)
      if ('assignee_id' in to) {
        const who = person(to.assignee_id)
        parts.push(who ? `Assigned ${t} to ${who}` : `Unassigned ${t}`)
      }
      return (parts.join('; ') || `Edited ${t}`) + scope
    }
    case 'assigned': {
      const from = person(d.from)
      const to = person(d.to)
      const scope = scopeNote(d.scope)
      if (from && to) return `Reassigned ${t} from ${from} to ${to}${scope}`
      if (to) return `Assigned ${t} to ${to}${scope}`
      return `Unassigned ${t}${from ? ` (was ${from})` : ''}${scope}`
    }
    case 'made_repeating': {
      const from = (d.from ?? {}) as { title?: string }
      const to = (d.to ?? {}) as { title?: string; notes?: string | null; assignee_id?: number | null }
      const parts = [`Made ${t} repeat from ${dayOrFuture(d.due_on)} (${summaryFromDetail(d.repeat as Record<string, unknown>, d.due_on as string)})`]
      if ('title' in to) parts.push(`renamed from ${from.title}`)
      if ('notes' in to) parts.push(to.notes ? 'notes changed' : 'notes removed')
      if ('assignee_id' in to) {
        const who = person(to.assignee_id)
        parts.push(who ? `assigned to ${who}` : 'unassigned')
      }
      return parts.join('; ')
    }
    case 'stopped_repeating':
      return `Stopped repeating ${t} after ${dayOrFuture(d.series_date)} (${removedNote(d)})`
    case 'unassigned':
      // D41: `left_<key>`, logged on that department's board.
      return `Unassigned ${t} from ${person(d.from) ?? 'someone'}${board && d.reason === `left_${board.key}` ? ` (left the ${board.name})` : ''}`
    case 'moved': {
      const from = (d.from ?? {}) as { due_on?: string | null; position?: number }
      const to = (d.to ?? {}) as { due_on?: string | null; position?: number }
      if (from.due_on !== to.due_on)
        return `Moved ${t} from ${dayOrFuture(from.due_on)} to ${dayOrFuture(to.due_on)}${d.one_off ? ' (no longer repeats)' : ''}`
      return `Moved ${t} from position ${from.position} to ${to.position} on ${dayOrFuture(to.due_on)}`
    }
    case 'completed': {
      const on = dayOrFuture(d.completed_on)
      if (d.due_on == null) return `Completed ${t} from Future, on ${on}`
      if (d.due_on === d.completed_on) return `Completed ${t}`
      if (d.display === 'both') return `Completed ${t} on ${on}, shown on both days`
      if (d.display === 'completed_day') return `Completed ${t}, shown on ${on} (planned ${dayOrFuture(d.due_on)})`
      return `Completed ${t} on ${on}, shown on ${dayOrFuture(d.due_on)}`
    }
    case 'uncompleted':
      return `Marked ${t} not done${d.completed_on ? ` (was done ${dayOrFuture(d.completed_on)})` : ''}`
    case 'deleted':
      if (d.scope === 'following') return `Deleted ${t} (${dayOrFuture(d.due_on)}) this and following (${removedNote(d)})`
      return `Deleted ${t} (${dayOrFuture(d.due_on)}${d.scope === 'this' ? ', just this one' : ''})`
    case 'daily_ticked':
      return `Ticked ${t} for ${dayOrFuture(d.on_date)}`
    case 'daily_unticked':
      return `Unticked ${t} for ${dayOrFuture(d.on_date)}`
    case 'item_added':
      return `Added ${t} to the Daily items`
    case 'item_renamed':
      return `Renamed the Daily item ${d.from} to ${d.to}`
    case 'item_retired':
      return `Retired the Daily item ${t}`
    case 'item_restored':
      return `Restored Daily item ${t}`
    case 'item_deleted':
      return `Deleted the Daily item '${t}'`
    case 'item_reordered': {
      const item = (id: unknown) => names.items[String(id)] ?? '?'
      const list = (ids: unknown) => (Array.isArray(ids) ? ids.map(item).join(', ') : '')
      return `Reordered the Daily items from ${list(d.from)} to ${list(d.to)}`
    }
    default:
      return `${ev.action} ${t}`
  }
}

// ── Per-browser preferences (spec §3.8). Storage can be missing or throw. ──

const SPAN_KEY = 'rockcut.tasks.span'
const PHONE_VIEW_KEY = 'rockcut.tasks.phoneView'
const HIDE_KEY = 'rockcut.tasks.hideCompleted'
// D42: no shared value before it; Today until someone picks.
const FIRST_DAY_KEY = 'rockcut.tasks.firstDay'
// D41: the board last opened (no old key: there was one board).
const BOARD_KEY = 'rockcut.tasks.board'
// D41: the keys before the rename. A choice saved under the old key is read
// once, then kept under the new one.
const OLD_PREFIX = 'rockcut.breweryTasks.'

function read(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    if (value !== null || key === BOARD_KEY) return value
    const old = localStorage.getItem(OLD_PREFIX + key.slice('rockcut.tasks.'.length))
    if (old !== null) write(key, old)
    return old
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

/**
 * D42 §2.8: a board's own choice (`<key>.<board>`, `all` for All
 * departments). A board without one starts from the browser's shared value
 * (D41's key, or the one before it), kept as its own from then on.
 */
function readFor(key: string, board: string): string | null {
  const own = `${key}.${board}`
  try {
    const value = localStorage.getItem(own)
    if (value !== null) return value
  } catch {
    return null
  }
  const shared = read(key)
  if (shared !== null) write(own, shared)
  return shared
}

const writeFor = (key: string, board: string, value: string) => write(`${key}.${board}`, value)

/** The default span: 2 weeks until someone picks. */
export const readSpan = (board: string): Span => (readFor(SPAN_KEY, board) === '7' ? 7 : 14)
export const writeSpan = (board: string, span: Span) => writeFor(SPAN_KEY, board, String(span))
export const readHideCompleted = (board: string) => readFor(HIDE_KEY, board) === 'true'
export const writeHideCompleted = (board: string, on: boolean) => writeFor(HIDE_KEY, board, String(on))
export function readFirstDay(board: string): FirstDay {
  const value = readFor(FIRST_DAY_KEY, board)
  return value === 'sunday' || value === 'monday' ? value : 'today'
}
export const writeFirstDay = (board: string, first: FirstDay) => writeFor(FIRST_DAY_KEY, board, first)

export const readBoard = () => read(BOARD_KEY)
export const writeBoard = (key: string) => write(BOARD_KEY, key)

/** D39 phone width: every day stacked (`vertical`, the default) or one day at a time. */
export type PhoneView = 'vertical' | 'day'
export const readPhoneView = (board: string): PhoneView => (readFor(PHONE_VIEW_KEY, board) === 'day' ? 'day' : 'vertical')
export const writePhoneView = (board: string, view: PhoneView) => writeFor(PHONE_VIEW_KEY, board, view)

/**
 * Where a task may be dragged on the board (any width). Nothing lands on the
 * Unfinished card from elsewhere: it lists open past tasks, it isn't a place.
 * At phone width (spec §3.8 "Phone width"), the vertical view goes anywhere
 * else, as desktop does; the one-day view stays in its list, or goes from the
 * Unfinished card into today when today shows (S73).
 */
export function boardMoveRule(phoneView: PhoneView | null, selected: string, today: string) {
  return (from: string, to: string) => {
    if (from === to) return true
    if (to === UNFINISHED) return false
    if (phoneView !== 'day') return true
    return from === UNFINISHED && to === today && selected === today
  }
}
