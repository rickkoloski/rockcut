// D53 Part 2: Idea Boards ("Boards" to the people using them, Matt 2026-11-08).
// Paths, the remembered board, label colors, the
// filter, and the words for chips and History. No React here.
import parseApiError from './parseApiError'
import { coloradoToday } from './tasks'
import { TZ } from './datetime'
import type { IdeaArchived, IdeaBoardEntry, IdeaCardFace, IdeaEvent, IdeaSentTask } from './types'

export const IDEA_BOARD_KEY = 'idea-board'
export const IDEA_CARD_KEY = 'idea-card'
export const COMPANY = 'company'

/** `/api/idea_boards/<board>/<parts…>`. */
export const ideaPath = (board: string, ...parts: (string | number | undefined)[]) =>
  ['/api/idea_boards', board, ...parts.filter((p) => p !== undefined)].join('/')

/** "Taproom board", "Company board": a board's title. */
export const ideaBoardTitle = (board: Pick<IdeaBoardEntry, 'name'>) => `${board.name} board`

/** The page's URL: `/boards/<board>`, or a card open on it (`/boards/<board>/cards/<id>`). */
export const boardUrl = (board: string, cardId?: number) => (cardId === undefined ? `/boards/${board}` : `/boards/${board}/cards/${cardId}`)

// The board last opened: `/boards` opens it.
const BOARD_KEY = 'rockcut.ideas.board'

export function readIdeaBoard(): string | null {
  try {
    return localStorage.getItem(BOARD_KEY)
  } catch {
    return null
  }
}

export function writeIdeaBoard(key: string) {
  try {
    localStorage.setItem(BOARD_KEY, key)
  } catch {
    // Not remembered in this browser; the boards still work.
  }
}

/**
 * The board an Ideas URL should show (§4.4): the one asked for if this
 * person can open it; for `/boards`, the remembered one; else their first
 * department's board, else Company (S227, S238). Null with no boards.
 */
export function ideaBoardTarget(boards: Pick<IdeaBoardEntry, 'key'>[], wanted: string | null, remembered: string | null): string | null {
  const open = (key: string | null) => !!key && boards.some((b) => b.key === key)
  if (open(wanted)) return wanted
  if (wanted === null && open(remembered)) return remembered
  return boards[0]?.key ?? null
}

/**
 * Label colors (the API's palette keys), one per theme: strong enough for a
 * 6 px bar and a chip's fill, each with readable text on it.
 */
export const LABEL_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  green: { light: '#4E8A3A', dark: '#7DBA62', label: 'Green' },
  lime: { light: '#8AA62C', dark: '#B5CF55', label: 'Lime' },
  yellow: { light: '#C9A227', dark: '#E2C255', label: 'Yellow' },
  orange: { light: '#D9822B', dark: '#EFA05A', label: 'Orange' },
  red: { light: '#C2453B', dark: '#E8776D', label: 'Red' },
  pink: { light: '#C2508A', dark: '#E583B6', label: 'Pink' },
  purple: { light: '#7A52B3', dark: '#A98BD9', label: 'Purple' },
  blue: { light: '#3A6FB8', dark: '#74A2E3', label: 'Blue' },
  sky: { light: '#2C93B0', dark: '#62C0DA', label: 'Sky' },
  grey: { light: '#6F7570', dark: '#A3A9A4', label: 'Grey' },
}
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS)

export const labelColor = (key: string, mode: 'light' | 'dark') => (LABEL_COLORS[key] ?? LABEL_COLORS.grey)[mode]

/** The board's filter (§4.4): All, My cards, Watching, or one label. */
export type IdeaFilter = 'all' | 'mine' | 'watching' | `label:${number}`

export function cardShown(card: IdeaCardFace, filter: IdeaFilter, userId: number | undefined): boolean {
  if (filter === 'all') return true
  if (filter === 'mine') return userId !== undefined && card.assignee_ids.includes(userId)
  if (filter === 'watching') return card.watching
  return card.label_ids.includes(Number(filter.slice('label:'.length)))
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dateOnlyFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })

/** "Nov 12" for a date key. */
export const formatIdeaDay = (key: string) => dayFmt.format(new Date(`${key}T12:00:00Z`))

/** "Nov 6, 2:14 PM" in Colorado time (a note's time). */
export const formatIdeaTime = (iso: string) => dateTimeFmt.format(new Date(iso))

/** "Nov 2" in Colorado time ("Locked by Casey · Nov 2"). */
export const formatIdeaDate = (iso: string) => dateOnlyFmt.format(new Date(iso))

/**
 * Archived's search (Matt, 2026-11-08): what still shows for `q`, ignoring
 * case: lists by name, cards by title or description. A blank `q` keeps all.
 */
export function archivedMatching(archived: IdeaArchived, q: string): IdeaArchived {
  const needle = q.trim().toLowerCase()
  if (!needle) return archived
  const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(needle)
  return {
    lists: archived.lists.filter((l) => has(l.name)),
    cards: archived.cards.filter((c) => has(c.title) || has(c.description)),
  }
}

/** A due date before today (the card face shows it red). */
export const isPastDue = (dueOn: string | null, today = coloradoToday()) => !!dueOn && dueOn < today

const REPEATS: Record<string, string> = { weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'yearly' }

/**
 * A sent task's chip (§4.7): "On the Taproom task list · Nov 12",
 * "✓ Done Nov 12", "Repeats weekly on the Taproom task list", "Removed".
 */
export function sentChipText(chip: IdeaSentTask): string {
  const where = chip.department ? `the ${chip.department.name} task list` : 'the task list'
  switch (chip.state) {
    case 'done':
      return chip.completed_on ? `✓ Done ${formatIdeaDay(chip.completed_on)}` : '✓ Done'
    case 'removed':
      return 'Removed'
    case 'repeating': {
      const every = chip.series && chip.series.interval > 1 ? `every ${chip.series.interval} ` : ''
      const freq = chip.series ? (REPEATS[chip.series.frequency] ?? chip.series.frequency) : ''
      return `Repeats ${every}${freq} on ${where}`.replace(/\s+/g, ' ')
    }
    default:
      return chip.due_on ? `On ${where} · ${formatIdeaDay(chip.due_on)}` : `On ${where} · Future`
  }
}

/**
 * The card face's one chip for everything sent from it (§4.4): what's still
 * on a task list wins ("On the task list", "2 on the task list", "Repeats
 * on the task list"), then the latest "✓ Done"; "Removed from the task
 * list" only when every one is gone (fix cycle 1 gap 5: the dialog lists
 * each).
 */
export function sentFaceChip(sent: IdeaSentTask[]): { text: string; color: 'default' | 'success' | 'info' } | null {
  if (!sent.length) return null
  const live = sent.filter((s) => s.state === 'on_list' || s.state === 'repeating')
  if (live.length) {
    if (live.every((s) => s.state === 'repeating')) return { text: 'Repeats on the task list', color: 'info' }
    return { text: live.length > 1 ? `${live.length} on the task list` : 'On the task list', color: 'info' }
  }
  const done = sent.filter((s) => s.state === 'done').map((s) => s.completed_on)
  if (done.length) {
    const last = done.reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null)
    return { text: last ? `✓ Done ${formatIdeaDay(last)}` : '✓ Done', color: 'success' }
  }
  return { text: 'Removed from the task list', color: 'default' }
}

/** A refused write in plain words: the API's message (423 "Locked by a manager"), else the field errors. */
export function ideaError(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message ?? parseApiError(err)
}

/** "first name" for History and notes' short forms. */
const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? 'Someone'

const FIELD_WORDS: Record<string, string> = {
  title: 'renamed it',
  description: 'changed the description',
  due_on: 'changed the due date',
  assignee_ids: 'changed the people',
  label_ids: 'changed the labels',
}

/**
 * One History row in words: "Moved Taproom remodel from Ideas to Doing".
 * `names` maps user ids in `detail` to names (the API's `names.users`);
 * `board` names the department someone left ("left the Taproom", fix cycle
 * 1 gap 9: never the key), as the task boards' History does.
 */
export function describeIdeaEvent(ev: IdeaEvent, names: Record<string, string> = {}, board?: Pick<IdeaBoardEntry, 'key' | 'name'>): string {
  const d = ev.detail as Record<string, unknown>
  const title = ev.title ?? ''
  const people = (ids: unknown) =>
    (Array.isArray(ids) ? ids : [])
      .map((id) => names[String(id)] ?? 'someone')
      .join(', ')
  const text = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : '')
  switch (ev.action) {
    case 'list_created':
      return `Added the list ${title}`
    case 'list_renamed':
      return `Renamed the list ${text('from')} to ${text('to')}`
    case 'list_moved':
      return `Moved the list ${title}`
    case 'list_locked':
      return `Locked the list ${title}`
    case 'list_unlocked':
      return `Unlocked the list ${title}`
    case 'list_archived':
      return `Archived the list ${title}`
    case 'list_restored':
      return `Restored the list ${title}`
    case 'list_deleted':
      return `Deleted the list ${title} for good`
    case 'card_created':
      return `Added ${title} to ${text('list')}`
    case 'card_edited': {
      const fields = (d.fields ?? {}) as Record<string, { from?: unknown; to?: unknown } | true>
      const parts = Object.keys(fields).map((f) => {
        if (f === 'title') {
          const t = fields.title as { from?: unknown }
          return `renamed it from ${String(t.from ?? '')}`
        }
        if (f === 'assignee_ids') {
          const a = fields.assignee_ids as { to?: unknown }
          const to = people(a.to)
          return to ? `set the people to ${to}` : 'took everyone off'
        }
        return FIELD_WORDS[f] ?? `changed ${f}`
      })
      return `${title}: ${parts.join(', ')}`
    }
    case 'card_moved': {
      const from = (d.from_list as { name?: string } | undefined)?.name
      const to = (d.to_list as { name?: string } | undefined)?.name
      return `Moved ${title} from ${from} to ${to}`
    }
    case 'card_locked':
      return `Locked ${title}`
    case 'card_unlocked':
      return `Unlocked ${title}`
    case 'card_archived':
      return `Archived ${title}`
    case 'card_restored':
      return `Restored ${title}`
    case 'card_deleted':
      return `Deleted ${title} for good`
    case 'card_unassigned': {
      const before = Array.isArray(d.from) ? (d.from as number[]) : []
      const after = Array.isArray(d.to) ? (d.to as number[]) : []
      const who = people(before.filter((id) => !after.includes(id)))
      const why =
        d.reason === 'deactivated' ? 'deactivated' : board && d.reason === `left_${board.key}` ? `left the ${board.name}` : 'left the department'
      return `Took ${who} off ${title} (${why})`
    }
    case 'card_sent':
      return `Sent ${title} to the ${text('department')} task list${Number(d.count) > 1 ? ` (${d.count} tasks)` : ''}`
    case 'label_created':
      return `Added the label ${text('name')}`
    case 'label_updated': {
      const from = (d.from as { name?: string } | undefined)?.name
      const to = (d.to as { name?: string } | undefined)?.name
      return from === to ? `Recolored the label ${to}` : `Renamed the label ${from} to ${to}`
    }
    case 'label_deleted':
      return `Deleted the label ${text('name')}${Number(d.cards) ? ` (from ${d.cards} ${Number(d.cards) === 1 ? 'card' : 'cards'})` : ''}`
    case 'checklist_added':
      return `${title}: added "${text('text')}"`
    case 'checklist_edited':
      return `${title}: changed "${text('from')}" to "${text('text')}"`
    case 'checklist_ticked':
      return `${title}: ticked "${text('text')}"`
    case 'checklist_unticked':
      return `${title}: unticked "${text('text')}"`
    case 'checklist_removed':
      return `${title}: removed "${text('text')}"`
    case 'note_added':
      return `${title}: added a note`
    case 'note_edited':
      return `${title}: edited a note`
    case 'note_deleted': {
      const author = names[String(d.author_id)]
      return `${title}: deleted a note${author ? ` by ${first(author)}` : ''}`
    }
    default:
      return `${title}: ${ev.action.replace(/_/g, ' ')}`
  }
}

/** D59: who can change a locked thing on this board ("an owner" on an owners-only board). */
export function lockHolder(board: Pick<IdeaBoardEntry, 'owners_only'>): string {
  return board.owners_only ? 'an owner' : 'a manager'
}
