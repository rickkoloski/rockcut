import { describe, expect, it } from 'vitest'
import { archivedMatching, boardUrl, cardShown, describeIdeaEvent, ideaBoardTarget, ideaBoardTitle, isCardMissing, isPastDue, lockHolder, parseCardId, sentChipText, sentFaceChip } from './ideas'
import type { IdeaCardFace, IdeaEvent, IdeaSentTask } from './types'

const card = (over: Partial<IdeaCardFace> = {}): IdeaCardFace => ({
  id: 1,
  list_id: 1,
  title: 'Taproom remodel',
  due_on: null,
  position: 1,
  locked: false,
  locked_at: null,
  locked_by: null,
  archived_at: null,
  label_ids: [],
  assignee_ids: [],
  assignees: [],
  checklist: { done: 0, total: 0 },
  note_count: 0,
  watching: false,
  sent_tasks: [],
  ...over,
})

const chip = (over: Partial<IdeaSentTask>): IdeaSentTask => ({
  id: 1,
  state: 'on_list',
  task_id: 1,
  task_series_id: null,
  task_title: 'Taproom remodel',
  department: { key: 'bar', name: 'Taproom' },
  due_on: '2026-11-12',
  completed_on: null,
  series: null,
  sent_at: '2026-11-08T12:00:00Z',
  ...over,
})

describe('ideaBoardTarget (S227, S238)', () => {
  const boards = [{ key: 'bar' }, { key: 'company' }]
  it('opens a board the person has, else their first', () => {
    expect(ideaBoardTarget(boards, 'company', null)).toBe('company')
    expect(ideaBoardTarget(boards, 'brewery', 'company')).toBe('bar')
    expect(ideaBoardTarget([{ key: 'company' }], 'bar', null)).toBe('company')
  })
  it('/boards opens the remembered board when it can', () => {
    expect(ideaBoardTarget(boards, null, 'company')).toBe('company')
    expect(ideaBoardTarget(boards, null, 'office')).toBe('bar')
    expect(ideaBoardTarget([], null, 'bar')).toBeNull()
  })
})

describe('cardShown', () => {
  it('filters by mine, watching and label', () => {
    const c = card({ assignee_ids: [7], label_ids: [3], watching: true })
    expect(cardShown(c, 'all', 1)).toBe(true)
    expect(cardShown(c, 'mine', 7)).toBe(true)
    expect(cardShown(c, 'mine', 8)).toBe(false)
    expect(cardShown(c, 'watching', 1)).toBe(true)
    expect(cardShown(card(), 'watching', 1)).toBe(false)
    expect(cardShown(c, 'label:3', 1)).toBe(true)
    expect(cardShown(c, 'label:4', 1)).toBe(false)
  })
})

describe('sentChipText (§4.7)', () => {
  it('reads each state', () => {
    expect(sentChipText(chip({}))).toBe('On the Taproom task list · Nov 12')
    expect(sentChipText(chip({ due_on: null }))).toBe('On the Taproom task list · Future')
    expect(sentChipText(chip({ state: 'done', completed_on: '2026-11-13' }))).toBe('✓ Done Nov 13')
    expect(sentChipText(chip({ state: 'removed' }))).toBe('Removed')
    expect(sentChipText(chip({ state: 'repeating', series: { frequency: 'weekly', interval: 1 } }))).toBe(
      'Repeats weekly on the Taproom task list',
    )
    expect(sentChipText(chip({ state: 'repeating', series: { frequency: 'monthly', interval: 2 } }))).toBe(
      'Repeats every 2 monthly on the Taproom task list',
    )
  })
})

describe('sentFaceChip (fix cycle 1 gap 5)', () => {
  it('says what is still on the list before Removed', () => {
    const removed = chip({ id: 2, state: 'removed', task_id: null })
    expect(sentFaceChip([])).toBeNull()
    // Per item, one of two deleted: still on the list, not "Removed".
    expect(sentFaceChip([chip({}), removed])?.text).toBe('On the task list')
    expect(sentFaceChip([chip({}), chip({ id: 3 }), removed])?.text).toBe('2 on the task list')
    expect(sentFaceChip([chip({ state: 'repeating' })])?.text).toBe('Repeats on the task list')
    expect(sentFaceChip([chip({ state: 'done', completed_on: '2026-11-13' }), removed])?.text).toBe('✓ Done Nov 13')
    expect(sentFaceChip([removed, chip({ id: 3, state: 'removed' })])?.text).toBe('Removed from the task list')
  })
})

describe('isPastDue', () => {
  it('compares with today', () => {
    expect(isPastDue('2026-11-07', '2026-11-08')).toBe(true)
    expect(isPastDue('2026-11-08', '2026-11-08')).toBe(false)
    expect(isPastDue(null, '2026-11-08')).toBe(false)
  })
})

describe('describeIdeaEvent', () => {
  const ev = (action: string, detail: Record<string, unknown> = {}, title = 'Taproom remodel'): IdeaEvent => ({
    id: 1,
    card_id: 1,
    list_id: 1,
    action,
    title,
    actor_id: 1,
    actor_name: 'Casey Tap',
    detail,
    inserted_at: '2026-11-08T12:00:00Z',
  })
  it('reads moves, edits, people leaving and sends', () => {
    expect(describeIdeaEvent(ev('card_moved', { from_list: { name: 'Ideas' }, to_list: { name: 'Doing' } }))).toBe(
      'Moved Taproom remodel from Ideas to Doing',
    )
    expect(
      describeIdeaEvent(ev('card_edited', { fields: { due_on: { from: null, to: '2026-11-12' }, assignee_ids: { from: [], to: [5] } } }), {
        '5': 'Alex Draft',
      }),
    ).toBe('Taproom remodel: changed the due date, set the people to Alex Draft')
    expect(describeIdeaEvent(ev('card_unassigned', { from: [5, 6], to: [6], reason: 'deactivated' }), { '5': 'Alex Draft' })).toBe(
      'Took Alex Draft off Taproom remodel (deactivated)',
    )
    // Fix cycle 1 gap 9: the department's name, never its key.
    const left = ev('card_unassigned', { from: [5], to: [], reason: 'left_bar' })
    expect(describeIdeaEvent(left, { '5': 'Alex Draft' }, { key: 'bar', name: 'Taproom' })).toBe('Took Alex Draft off Taproom remodel (left the Taproom)')
    expect(describeIdeaEvent(left, { '5': 'Alex Draft' })).toBe('Took Alex Draft off Taproom remodel (left the department)')
    expect(describeIdeaEvent(ev('card_sent', { department: 'Taproom', count: 3 }))).toBe(
      'Sent Taproom remodel to the Taproom task list (3 tasks)',
    )
    expect(describeIdeaEvent(ev('list_renamed', { from: 'Ideas', to: 'Someday' }, 'Someday'))).toBe('Renamed the list Ideas to Someday')
  })
})

describe('Boards (Matt, 2026-11-08)', () => {
  it('titles and URLs', () => {
    expect(ideaBoardTitle({ name: 'Taproom' })).toBe('Taproom board')
    expect(boardUrl('bar')).toBe('/boards/bar')
    expect(boardUrl('bar', 42)).toBe('/boards/bar/cards/42')
  })

  it('Archived search: list name, card title or description, ignoring case', () => {
    const archived = {
      lists: [{ id: 1, name: 'Fall releases', card_count: 2 }],
      cards: [
        { id: 2, title: 'Shelved stout', description: 'Too dark for summer', archived_at: '', list: { id: 3, name: 'Ideas' } },
        { id: 4, title: 'Patio heaters', description: null, archived_at: '', list: { id: 3, name: 'Ideas' } },
      ],
    } as unknown as Parameters<typeof archivedMatching>[0]
    expect(archivedMatching(archived, '  ')).toBe(archived)
    expect(archivedMatching(archived, 'FALL').lists.map((l) => l.id)).toEqual([1])
    expect(archivedMatching(archived, 'fall').cards).toEqual([])
    expect(archivedMatching(archived, 'too DARK').cards.map((c) => c.id)).toEqual([2])
    expect(archivedMatching(archived, 'patio').cards.map((c) => c.id)).toEqual([4])
    expect(archivedMatching(archived, 'nope')).toEqual({ lists: [], cards: [] })
  })
})

// D59 lead decisions 2: no one manages an owners-only board.
describe('lockHolder', () => {
  it('says an owner on an owners-only board, a manager elsewhere', () => {
    expect(lockHolder({ owners_only: true })).toBe('an owner')
    expect(lockHolder({ owners_only: false })).toBe('a manager')
    expect(lockHolder({})).toBe('a manager')
  })
})

describe('parseCardId (D58 §3.9)', () => {
  it('reads a card id, none, or a bad one', () => {
    expect(parseCardId(undefined)).toBeNull()
    expect(parseCardId('42')).toBe(42)
    expect(parseCardId('abc')).toBe('bad')
    expect(parseCardId('0')).toBe('bad')
    expect(parseCardId('-3')).toBe('bad')
    expect(parseCardId('1.5')).toBe('bad')
    expect(parseCardId('99999999999999999999')).toBe('bad')
  })

  it('a 404 is a missing card; other failures aren’t', () => {
    expect(isCardMissing({ response: { status: 404 } })).toBe(true)
    expect(isCardMissing({ response: { status: 500 } })).toBe(false)
    expect(isCardMissing(new Error('Network Error'))).toBe(false)
  })
})
