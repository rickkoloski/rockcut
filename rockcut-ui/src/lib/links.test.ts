import { describe, expect, it } from 'vitest'
import { linkChoices, pickedLinks, type Behavior, type SchedBatch, type SchedStep } from './production'
import { splitTree } from './gantt'
import { stepStatus } from '../pages/production/Gantt/scheduleText'

// D50 §2.6–§2.7: the Links pickers (templates and batch steps), what Save
// links, a split's tree, and "· on Brewhouse".

type S = { id: number; behavior: Behavior | null; day: number }
const s = (id: number, day: number, behavior: Behavior | null = 'plain'): S => ({ id, behavior, day })
const ids = (list: { id: number }[]) => list.map((x) => x.id)

// Brew 1 (day 0) → FDH 2 (7) → Carb 3 (14) → Package 4 (20); a loose step 5 on day 12.
const steps = [s(1, 0, 'brew'), s(2, 7), s(3, 14), s(4, 20), s(5, 12)]
const links = [
  { from_step_id: 1, to_step_id: 2 },
  { from_step_id: 2, to_step_id: 3 },
  { from_step_id: 3, to_step_id: 4 },
]
const choose = (id: number, l = links) => linkChoices(steps, l, steps.find((x) => x.id === id)!, (x) => x.day)

describe('linkChoices', () => {
  it('comes after: earlier or the same day, not linked yet, never something that follows it', () => {
    // Carb: Brew is earlier and doesn't follow it; FDH is already linked; Package and the loose step come later.
    expect(ids(choose(3).after)).toEqual([1, 5])
    // FDH: only Brew is earlier, and it's linked; nothing is offered.
    expect(ids(choose(2).after)).toEqual([])
  })

  it('leads to: later or the same day, never Brew day, never something it follows (a loop)', () => {
    expect(ids(choose(2).leads)).toEqual([4, 5])
    expect(ids(choose(5).leads)).toEqual([3, 4])
    // Package follows the loose step's chain once it leads to Carb: no loop back from Package.
    const withLoose = [...links, { from_step_id: 5, to_step_id: 3 }]
    expect(ids(choose(4, withLoose).after)).toEqual([1, 2, 5])
    expect(ids(choose(4, withLoose).leads)).toEqual([])
  })

  it('works on ISO dates (a batch) as on day offsets (a template)', () => {
    const dated = [
      { id: 1, behavior: 'brew' as Behavior, due_on: '2026-11-02' },
      { id: 2, behavior: 'plain' as Behavior, due_on: '2026-11-09' },
      { id: 3, behavior: 'plain' as Behavior, due_on: '2026-11-16' },
    ]
    const c = linkChoices(dated, [], dated[1], (x) => x.due_on)
    expect(ids(c.after)).toEqual([1])
    expect(ids(c.leads)).toEqual([3])
  })
})

describe('pickedLinks (§2.6: Save links what the pickers hold)', () => {
  const choices = { after: [{ id: 1 }], leads: [{ id: 4 }, { id: 5 }] }

  it('a comes-after pick links into the entry; a leads-to pick out of it', () => {
    expect(pickedLinks(2, 1, 5, choices)).toEqual([
      { from_step_id: 1, to_step_id: 2 },
      { from_step_id: 2, to_step_id: 5 },
    ])
  })

  it('nothing picked, or a pick no longer offered, links nothing', () => {
    expect(pickedLinks(2, '', '', choices)).toEqual([])
    expect(pickedLinks(2, 3, 9, choices)).toEqual([])
  })
})

const batch = (b: Partial<SchedBatch>) => ({ id: 1, split_parent_id: null, steps: [], links: [], ...b }) as unknown as SchedBatch

describe('splitTree (§2.7: a step links within its split)', () => {
  const all = [batch({ id: 1 }), batch({ id: 2, split_parent_id: 1 }), batch({ id: 3, split_parent_id: 1 }), batch({ id: 4 })]

  it('a part brings its parent and the other parts; a parent its parts', () => {
    expect(ids(splitTree(all, 3))).toEqual([1, 2, 3])
    expect(ids(splitTree(all, 1))).toEqual([1, 2, 3])
  })

  it('a batch that isn’t split is itself; a standalone CIP nothing', () => {
    expect(ids(splitTree(all, 4))).toEqual([4])
    expect(splitTree(all, null)).toEqual([])
  })
})

describe('stepStatus (D50: the device beside the person)', () => {
  const done = { done_on: '2026-11-10', due_on: '2026-11-10', done_by: { id: 3, name: 'Jake Brewer' } } as SchedStep

  it('names the shared device a step was checked off on', () => {
    expect(stepStatus({ ...done, done_on_device: { id: 9, name: 'Brewhouse' } }, '2026-11-11')).toBe('Done Tue Nov 10 by Jake Brewer · on Brewhouse')
    expect(stepStatus(done, '2026-11-11')).toBe('Done Tue Nov 10 by Jake Brewer')
  })
})
