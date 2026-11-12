import parseApiError from './parseApiError'
import { summaryFromDetail } from './repeat'
import { TZ, addDaysKey, localDayKey } from './datetime'
import type { AllBoardCard, RosterEntry, DailyCount, DayHeaderData, HeaderShift, TaskBoardData, TaskBoardEntry, TaskCardData, TaskEvent, TaskEventPage, TaskPerson } from './types'

// D38: task board helpers shared by the board, its dialogs and the specs.
// D41: one board per department, under `/api/boards/<dept>`.

/** A board's API path: `boardPath('brewery', 'tasks', 12, 'move')` → `/api/boards/brewery/tasks/12/move`. */
export function boardPath(dept: string, ...segments: (string | number | undefined)[]): string {
  return ['/api/boards', dept, ...segments.map(String)].join('/')
}

/** The query key of every board read (`[BOARD_QUERY_KEY, dept, from, to]`); the dashboard card's too. */
export const BOARD_QUERY_KEY = 'task-board'

/**
 * D49 §3.12: a linked task's step as the schedule's prompts name it ("FDH",
 * "Galactic P1"; no batch for a standalone CIP), from the API, never the
 * title (lead decisions 8.2). Null for the board's own tasks.
 */
export function linkedStep(card: Pick<TaskCardData, 'production'>) {
  if (!card.production) return null
  return {
    id: card.production.step_id,
    batch_id: card.production.batch_id,
    name: card.production.step_name,
    batchLabel: card.production.batch_label,
  }
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
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  // A date the calendar has: 2026-02-30 would roll over to March 2 (DEV QA gap 4).
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Why a From–To pair can't be shown, or null when it can. */
export function rangeError(from: string, to: string): string | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'Pick both dates'
  if (to < from) return 'To must be on or after From'
  if (dayCount(from, to) > MAX_RANGE_DAYS) return `Up to ${MAX_RANGE_DAYS} days`
  return null
}

export const spanEnd = (from: string, span: number) => addDaysKey(from, span - 1)

/**
 * D58 §3.2: why a board URL's range was corrected: more than 31 days, or
 * (lead decisions 1) a range that wasn't valid.
 */
export type RangeNotice = 'clamped' | 'invalid'

/**
 * D58 §3.2: the range a board shows for the URL's `from`/`to`. No range is the
 * `fallback` (the default), as before. Over 31 days shows `from` plus 30
 * (`clamped`); an invalid one (a bad date or one the calendar doesn't have,
 * To before From, one of the two missing) shows the fallback (`invalid`).
 * `fix` is what the URL should become, replaced not pushed: the clamped
 * range, or no range for an invalid one (the default, as Today leaves it);
 * null when the URL is fine.
 */
export function boardRange(
  urlFrom: string,
  urlTo: string,
  fallback: { from: string; to: string },
): { from: string; to: string; inUrl: boolean; clamped: boolean; invalid: boolean; fix: { from: string; to: string } | null } {
  if (!urlFrom && !urlTo) return { ...fallback, inUrl: false, clamped: false, invalid: false, fix: null }
  if (isDateKey(urlFrom) && isDateKey(urlTo) && urlTo >= urlFrom) {
    if (dayCount(urlFrom, urlTo) <= MAX_RANGE_DAYS) return { from: urlFrom, to: urlTo, inUrl: true, clamped: false, invalid: false, fix: null }
    const to = spanEnd(urlFrom, MAX_RANGE_DAYS)
    return { from: urlFrom, to, inUrl: true, clamped: true, invalid: false, fix: { from: urlFrom, to } }
  }
  // Garbage, a date the calendar doesn't have, reversed, or half a range
  // (lead decisions 1, DEV QA gaps 4, 5): the default, with a notice.
  return { ...fallback, inUrl: false, clamped: false, invalid: true, fix: { from: '', to: '' } }
}

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

/**
 * D53: everyone on a task, first first. A rolled-back API sends only the one
 * person (spec §3.1), so the board keeps working on that too.
 */
export function cardPeople(card: Pick<TaskCardData, 'assignees' | 'assignee_id' | 'assignee_name'>): TaskPerson[] {
  if (card.assignees) return card.assignees
  return card.assignee_id ? [{ id: card.assignee_id, name: card.assignee_name ?? 'Unknown' }] : []
}

/** D53: the same people, whatever the order: another order isn't a change. */
export function samePeople(a: number[], b: number[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/** Does the card pass the toolbar's filter and Hide completed? */
export function cardShown(card: TaskCardData, filter: TaskFilter, hideCompleted: boolean, userId: number | undefined) {
  if (hideCompleted && card.done) return false
  if (filter === 'mine') return cardPeople(card).some((p) => p.id === userId)
  if (filter === 'unassigned') return cardPeople(card).length === 0
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
 * (S105). D53: a task's refusal names the person ("Riley Wort must be a Taproom
 * member"); the single wording stays for a linked task's step.
 */
export function taskSaveError(err: unknown, board: Pick<TaskBoardEntry, 'name'>): string {
  const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
  if (errors?.assignee_ids?.length) return errors.assignee_ids.join('; ')
  if (errors?.assignee_id) return `Only members of the ${board.name} can be assigned`
  // D53 §4.8 (recheck 2, observation 2): a repeat's refusal reads as a
  // sentence ("The series already has 3 dates…"), not "count: the series…".
  const repeat = errors ? REPEAT_ERROR_FIELDS.flatMap((f) => errors[f] ?? []) : []
  if (repeat.length) return repeat.map((m) => m.replace(/^./, (c) => c.toUpperCase())).join('; ')
  return taskError(err)
}

/** The series fields whose errors the Repeat field explains (D39 `TaskSeries`). */
const REPEAT_ERROR_FIELDS = ['repeat', 'count', 'until_date', 'interval', 'weekdays', 'day_of_month', 'week_of_month', 'weekday', 'month_rule', 'start_date']

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
  `removed ${Number(d.removed ?? 0)}${Number(d.removed_with_notes ?? 0) > 0 ? ` (${Number(d.removed_with_notes)} with their own notes)` : ''}${Number(d.kept ?? 0) > 0 ? `, kept ${Number(d.kept)}` : ''}`

/** D53 §4.8 gap 5: a series' row when someone left ("(12 occurrences)"). */
const occurrences = (d: Record<string, unknown>) => (Number(d.count ?? 0) > 1 ? ` (${Number(d.count)} occurrences)` : '')

/**
 * One change-log entry in plain words, old → new: "Moved Package FV6 from
 * Mon 10/12 to Wed 10/14", "Completed Carb FV3 on Wed 10/14, shown on both
 * days", "Ticked Temps for Sun 10/11". D39 adds the recurring-task wording:
 * "Created recurring task Keg Wash on Wed 10/14 (Repeats every week on
 * Wed)", "… (this and following)", "Deleted … this and following (removed
 * 40, kept 2)", "Stopped repeating … (removed 40)", "… to Future (no longer
 * repeats)", "Made Keg Wash repeat from Wed 10/14 (Repeats every week on Wed)".
 *
 * D53: events since multiple assignees store id lists (`assignee_ids`, or
 * `from`/`to` as lists): "Assigned Riley Wort, Jordan Float to Keg Wash",
 * "Removed Jake Brewer from Keg Wash". Older events keep their one-person
 * wording.
 */
export function describeEvent(ev: TaskEvent, names: TaskEventPage['names'], board?: Pick<TaskBoardEntry, 'key' | 'name'>): string {
  const d = ev.detail
  const t = ev.title
  const person = (id: unknown) => (id == null ? null : (names.users[String(id)] ?? 'someone no longer here'))
  const people = (ids: unknown[]) => ids.map(person).join(', ')
  const listChange = (from: unknown, to: unknown) => {
    const was = (from ?? []) as unknown[]
    const now = (to ?? []) as unknown[]
    const added = now.filter((id) => !was.includes(id))
    const removed = was.filter((id) => !now.includes(id))
    if (added.length && removed.length) return `Assigned ${people(added)} to ${t}; removed ${people(removed)}`
    if (added.length) return `Assigned ${people(added)} to ${t}`
    if (removed.length) return `Removed ${people(removed)} from ${t}`
    return `Edited ${t}`
  }
  switch (ev.action) {
    case 'created': {
      const who = Array.isArray(d.assignee_ids) ? people(d.assignee_ids) : person(d.assignee_id)
      const assigned = who ? `, assigned to ${who}` : ''
      if (d.repeat)
        return `Created recurring task ${t} on ${dayOrFuture(d.due_on)}${assigned} (${summaryFromDetail(d.repeat as Record<string, unknown>, d.due_on as string)})`
      return `Added ${t} to ${dayOrFuture(d.due_on)}${assigned}`
    }
    case 'edited': {
      const scope = scopeNote(d.scope)
      const rule = d.repeat as { from?: Record<string, unknown>; to?: Record<string, unknown> } | undefined
      const from = (d.from ?? {}) as { title?: string; notes?: string | null; assignee_ids?: number[] }
      const to = (d.to ?? {}) as { title?: string; notes?: string | null; assignee_id?: number | null; assignee_ids?: number[] }
      const parts: string[] = []
      if ('title' in to) parts.push(`Renamed ${from.title} to ${to.title}`)
      if ('notes' in to) parts.push(`${to.notes ? (from.notes ? 'Changed' : 'Added') : 'Removed'} the notes on ${t}`)
      // D53 §4.8 gap 4: a following edit says who it took off (and put on)
      // across every occurrence it reached, not only the edited one.
      const across = d.people as { added?: number[]; removed?: number[] } | undefined
      // `listChange(was, now)` with was = removed and now = added (they don't overlap).
      if (across && 'assignee_ids' in to) parts.push(listChange(across.removed ?? [], across.added ?? []))
      else if ('assignee_ids' in to) parts.push(listChange(from.assignee_ids, to.assignee_ids))
      if ('assignee_id' in to) {
        const who = person(to.assignee_id)
        parts.push(who ? `Assigned ${t} to ${who}` : `Unassigned ${t}`)
      }
      if (rule?.to) {
        const removed = Number(d.removed ?? 0) + Number(d.kept ?? 0) > 0 ? `; ${removedNote(d)}` : ''
        const also = parts.length ? `; ${parts.join('; ')}` : ''
        return `Changed how ${t} repeats${scope}: ${summaryFromDetail(rule.to, null)}${removed}${also}`
      }
      return (parts.join('; ') || `Edited ${t}`) + scope
    }
    case 'assigned': {
      const scope = scopeNote(d.scope)
      if (Array.isArray(d.to)) return `${listChange(d.from, d.to)}${scope}`
      const from = person(d.from)
      const to = person(d.to)
      if (from && to) return `Reassigned ${t} from ${from} to ${to}${scope}`
      if (to) return `Assigned ${t} to ${to}${scope}`
      return `Unassigned ${t}${from ? ` (was ${from})` : ''}${scope}`
    }
    case 'made_repeating': {
      const from = (d.from ?? {}) as { title?: string }
      const to = (d.to ?? {}) as { title?: string; notes?: string | null; assignee_id?: number | null; assignee_ids?: number[] }
      const parts = [`Made ${t} repeat from ${dayOrFuture(d.due_on)} (${summaryFromDetail(d.repeat as Record<string, unknown>, d.due_on as string)})`]
      if ('title' in to) parts.push(`renamed from ${from.title}`)
      if ('notes' in to) parts.push(to.notes ? 'notes changed' : 'notes removed')
      if (to.assignee_ids) parts.push(to.assignee_ids.length ? `assigned to ${people(to.assignee_ids)}` : 'unassigned')
      if ('assignee_id' in to) {
        const who = person(to.assignee_id)
        parts.push(who ? `assigned to ${who}` : 'unassigned')
      }
      return parts.join('; ')
    }
    case 'stopped_repeating':
      return `Stopped repeating ${t} after ${dayOrFuture(d.series_date)} (${removedNote(d)})`
    case 'unassigned': {
      // D41: `left_<key>`, logged on that department's board.
      // D53 §4.8 gap 9: deactivation says so.
      const left =
        d.reason === 'deactivated' ? ' (deactivated)' : board && d.reason === `left_${board.key}` ? ` (left the ${board.name})` : ''
      if (Array.isArray(d.from)) {
        const stay = (d.to ?? []) as unknown[]
        return `Removed ${people(d.from.filter((id) => !stay.includes(id)))} from ${t}${left}${occurrences(d)}`
      }
      return `Unassigned ${t} from ${person(d.from) ?? 'someone'}${left}`
    }
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

/** D39 phone width: every day stacked (`vertical`, the default) or one day at a time. */
export type PhoneView = 'vertical' | 'day'

// ── Board settings (D58 §3.1): per account on the server ──

/**
 * A board's settings (`/api/me`'s `board_settings[<board>]`, a department key
 * or `all`). The server stores only what someone changed; `boardSettings`
 * fills in the rest.
 */
export interface BoardSettings {
  span: Span
  hide_completed: boolean
  hide_shifts: boolean
  first_day: FirstDay
  view: TaskFilter
  phone_view: PhoneView
}

/** 2 weeks, nothing hidden, Today, All, every day stacked. */
export const BOARD_DEFAULTS: BoardSettings = {
  span: 14,
  hide_completed: false,
  hide_shifts: false,
  first_day: 'today',
  view: 'all',
  phone_view: 'vertical',
}

/** The settings in `raw` that are valid, as the API takes them; anything else is dropped. */
export function cleanSettings(raw: unknown): Partial<BoardSettings> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Partial<BoardSettings> = {}
  if (r.span === 7 || r.span === 14) out.span = r.span
  if (typeof r.hide_completed === 'boolean') out.hide_completed = r.hide_completed
  if (typeof r.hide_shifts === 'boolean') out.hide_shifts = r.hide_shifts
  if (r.first_day === 'today' || r.first_day === 'sunday' || r.first_day === 'monday') out.first_day = r.first_day
  if (r.view === 'all' || r.view === 'mine' || r.view === 'unassigned') out.view = r.view
  if (r.phone_view === 'vertical' || r.phone_view === 'day') out.phone_view = r.phone_view
  return out
}

/** A board's settings: the stored ones over the defaults. */
export const boardSettings = (stored: unknown): BoardSettings => ({ ...BOARD_DEFAULTS, ...cleanSettings(stored) })

// ── Before D58: per browser (D41/D42/D45). Read once for the carry-over. Storage can be missing or throw. ──

const SPAN_KEY = 'rockcut.tasks.span'
const PHONE_VIEW_KEY = 'rockcut.tasks.phoneView'
const HIDE_KEY = 'rockcut.tasks.hideCompleted'
// D45: per board only (`<key>.<board>`); there's no shared value before it.
const HIDE_SHIFTS_KEY = 'rockcut.tasks.hideShifts'
// D42: no shared value before it; Today until someone picks.
const FIRST_DAY_KEY = 'rockcut.tasks.firstDay'
// D41: the board last opened (no old key: there was one board). Still per browser (D58).
const BOARD_KEY = 'rockcut.tasks.board'
// D41: the keys before the rename (one board then: the Brewery's).
const OLD_PREFIX = 'rockcut.breweryTasks.'

function get(key: string): string | null {
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
    // Not remembered in this browser.
  }
}

/**
 * A board's local choice as D42 read it: its own (`<key>.<board>`), else the
 * browser's shared value (D41's key, or the one before the rename).
 */
function readFor(key: string, board: string): string | null {
  return get(`${key}.${board}`) ?? get(key) ?? get(OLD_PREFIX + key.slice('rockcut.tasks.'.length))
}

/**
 * D58 carry-over: this browser's old local settings for `board`, as the API
 * takes them, or null when it has none. The View filter was never kept.
 */
export function readLocalSettings(board: string): Partial<BoardSettings> | null {
  const span = readFor(SPAN_KEY, board)
  const hide = readFor(HIDE_KEY, board)
  // D45 never had a shared value.
  const hideShifts = get(`${HIDE_SHIFTS_KEY}.${board}`)
  const first = readFor(FIRST_DAY_KEY, board)
  const phone = readFor(PHONE_VIEW_KEY, board)
  if ([span, hide, hideShifts, first, phone].every((v) => v === null)) return null
  return cleanSettings({
    span: span === null ? undefined : span === '7' ? 7 : 14,
    hide_completed: hide === null ? undefined : hide === 'true',
    hide_shifts: hideShifts === null ? undefined : hideShifts === 'true',
    first_day: first === 'sunday' || first === 'monday' ? first : first === null ? undefined : 'today',
    phone_view: phone === null ? undefined : phone === 'day' ? 'day' : 'vertical',
  })
}

/**
 * Remove `board`'s own local keys once the server has them. The shared and
 * pre-rename values stay: they still stand for boards not carried over yet.
 */
export function clearLocalSettings(board: string) {
  for (const key of [SPAN_KEY, HIDE_KEY, HIDE_SHIFTS_KEY, FIRST_DAY_KEY, PHONE_VIEW_KEY]) {
    try {
      localStorage.removeItem(`${key}.${board}`)
    } catch {
      // Nothing to clear.
    }
  }
}

/**
 * This browser's old local settings for `board` that the server's entry
 * (`stored`, undefined when it has none) lacks: what the carry-over may
 * still save. Null when the browser has none at all.
 */
export function missingLocalSettings(board: string, stored: unknown): Partial<BoardSettings> | null {
  const local = readLocalSettings(board)
  if (!local) return null
  const have = cleanSettings(stored)
  return Object.fromEntries(Object.entries(local).filter(([key]) => !(key in have))) as Partial<BoardSettings>
}

/**
 * D58 §3.1 carry-over, once per board: `save` this browser's old local
 * values for `board` that the server's entry (`stored`) lacks, never one it
 * has (lead decisions 1, DEV QA gap 1: a partial entry), then clear the
 * board's local keys. Only after the save succeeds: a failed one keeps them
 * for next time. With nothing missing, they're cleared without a save.
 * Answers what it did.
 */
export async function carryOver(
  board: string,
  stored: unknown,
  save: (settings: Partial<BoardSettings>) => Promise<unknown>,
): Promise<'server' | 'none' | 'saved' | 'failed'> {
  const missing = missingLocalSettings(board, stored)
  if (!missing) return 'none'
  if (Object.keys(missing).length === 0) {
    clearLocalSettings(board)
    return 'server'
  }
  try {
    await save(missing)
  } catch {
    return 'failed'
  }
  clearLocalSettings(board)
  return 'saved'
}

export const readBoard = () => get(BOARD_KEY)
export const writeBoard = (key: string) => write(BOARD_KEY, key)

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

/** D40 (spec §3.8, S50): how many of today's open tasks the dashboard card lists. */
export const DASHBOARD_TASKS = 5

/**
 * D40: the Brewery Dashboard's Today's tasks card, from the board's read of
 * today: the Daily count with its unticked items, today's open tasks (planned
 * today, board order) — the first DASHBOARD_TASKS and how many more — and
 * the Unfinished count.
 */
export function todaysTasks(board: TaskBoardData, showPlanned = true) {
  const day = board.days.find((d) => d.date === board.today)
  // D49 QA 3: "Show planned batches" off hides planned batches' tasks here too.
  const open = (day?.cards ?? []).filter((c) => !c.done && c.due_on === board.today && (showPlanned || !c.production?.planned))
  return {
    daily: day ? { done: day.daily.done, total: day.daily.total, unticked: day.daily.items.filter((i) => !i.checked) } : null,
    tasks: open.slice(0, DASHBOARD_TASKS),
    more: Math.max(open.length - DASHBOARD_TASKS, 0),
    unfinished: board.unfinished.length,
  }
}

/**
 * The people a task on `dept`'s board can be assigned to: its members, in
 * roster order, then the board's `owners` (D59: an owners-only board's; empty
 * elsewhere) who aren't members, by name as the API sends them.
 */
export function boardMembers(roster: RosterEntry[], dept: string, owners: { id: number; name: string }[] = []): RosterEntry[] {
  const members = roster.filter((r) => r.departments.includes(dept))
  const extra = owners.filter((o) => !members.some((m) => m.id === o.id)).map((o) => ({ id: o.id, name: o.name, departments: [] }))
  return [...members, ...extra]
}
