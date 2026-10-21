import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignTracks,
  badgeText,
  buildParts,
  clampRange,
  dayLabel,
  dayWidth,
  daysBetween,
  dotState,
  dragHint,
  flagChip,
  layoutRows,
  monthLabels,
  partDots,
  partFlags,
  partLabel,
  phaseAt,
  rangeAroundToday,
  readPrefs,
  segments,
  shiftRange,
  showInitials,
  STEP_ROW_H,
  TRACK_H,
  writePref,
} from './gantt'
import type { Flag, SchedBatch, SchedStep, Tank } from './production'

const step = (s: Partial<SchedStep>): SchedStep => ({
  id: 0,
  batch_id: 1,
  tank_id: null,
  step_type_id: 1,
  marker: false,
  name: 'x',
  type_name: 'x',
  full_name: null,
  behavior: 'plain',
  first_brew: false,
  phase_id: null,
  vessel_index: 0,
  detail: null,
  temperature: null,
  split_method: null,
  package_partial: false,
  notes: null,
  on_task_list: true,
  position: 1,
  due_on: '2026-10-21',
  done_on: null,
  done_by: null,
  assignee_id: null,
  assignee: null,
  added: false,
  ...s,
})

const batch = (b: Partial<SchedBatch>): SchedBatch => ({
  id: 1,
  brand_id: 1,
  brand_name: 'Fest',
  batch_number: '38',
  p_number: null,
  label: 'Fest #38',
  status: 'fermenting',
  volume_bbl: 20,
  template_id: 1,
  template_name: 'Lager',
  brew_two_days: false,
  vessels: [{ vessel_index: 0, tank_id: 7 }],
  steps: [],
  links: [],
  ...b,
})

const tank = (id: number, name: string): Tank => ({
  id,
  name,
  kind: 'unitank',
  capacity_bbl: 20,
  location: 'brewhouse',
  position: id,
  notes: null,
  retired_at: null,
  outages: [],
})

// Fest: brewed Oct 1 in FV7 (Brew day phase 10), Fermentation (11) from a
// marker Oct 3, Transfer into Serving 2 on Oct 20 with FV7's CIP that day,
// Carb (12) Oct 22, Package and CIP Oct 25 in Serving 2.
const fest = batch({
  vessels: [
    { vessel_index: 0, tank_id: 7 },
    { vessel_index: 1, tank_id: 9 },
  ],
  steps: [
    step({ id: 1, behavior: 'brew', name: 'Brew day', due_on: '2026-10-01', done_on: '2026-10-01', phase_id: 10, first_brew: true }),
    step({ id: 2, marker: true, step_type_id: null, behavior: null, name: 'Fermentation', due_on: '2026-10-03', phase_id: 11, on_task_list: false }),
    step({ id: 3, behavior: 'transfer', name: 'Transfer', due_on: '2026-10-20', vessel_index: 1 }),
    step({ id: 4, behavior: 'cip', name: 'CIP & Sanitize', due_on: '2026-10-20', vessel_index: 0, position: 2 }),
    step({ id: 5, name: 'Carb', due_on: '2026-10-22', vessel_index: 1, phase_id: 12 }),
    step({ id: 6, behavior: 'package', name: 'Package', due_on: '2026-10-25', vessel_index: 1 }),
    step({ id: 7, behavior: 'cip', name: 'CIP & Sanitize', due_on: '2026-10-25', vessel_index: 1, position: 2 }),
  ],
})

describe('days', () => {
  it('counts, labels and finds the months', () => {
    expect(daysBetween('2026-10-21', '2026-11-02')).toBe(12)
    expect(daysBetween('2026-11-02', '2026-10-21')).toBe(-12)
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2) // across the DST change
    expect(dayLabel('2026-10-27')).toBe('Tue Oct 27')
    expect(monthLabels('2026-10-28', 40)).toEqual([
      { index: 0, label: 'Oct 2026' },
      { index: 4, label: 'Nov' },
      { index: 34, label: 'Dec' },
    ])
    expect(monthLabels('2026-12-30', 3).map((m) => m.label)).toEqual(['Dec 2026', 'Jan 2027'])
  })
})

describe('range and zoom', () => {
  it('keeps 7–730 days, moves by 4 weeks, goes back to today', () => {
    expect(clampRange({ from: '2026-10-21', to: '2026-10-22' })).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(clampRange({ from: '2026-01-01', to: '2029-01-01' })).toEqual({ from: '2026-01-01', to: '2027-12-31' })
    expect(shiftRange({ from: '2026-10-14', to: '2027-01-06' }, -28)).toEqual({ from: '2026-09-16', to: '2026-12-09' })
    expect(rangeAroundToday({ from: '2026-01-01', to: '2026-01-31' }, '2026-10-21')).toEqual({ from: '2026-10-14', to: '2026-11-13' })
  })

  it('fits the zoom’s weeks into the width; initials need 14 px', () => {
    expect(dayWidth(840, 6)).toBe(20)
    expect(dayWidth(840, 12)).toBe(10)
    expect(dayWidth(300, 12)).toBe(10)
    expect(showInitials(13)).toBe(false)
    expect(showInitials(14)).toBe(true)
  })
})

describe('parts', () => {
  it('a transfer makes two parts; each runs from its fill to its CIP', () => {
    const [first, second] = buildParts(fest)
    expect(first).toMatchObject({ key: '1.0', tankId: 7, start: '2026-10-01', end: '2026-10-20', planned: false })
    expect(first.exit?.id).toBe(3)
    expect(first.cip?.id).toBe(4)
    expect(second).toMatchObject({ key: '1.1', tankId: 9, start: '2026-10-20', end: '2026-10-25' })
    expect(second.fill?.id).toBe(3)
    expect(second.exit?.id).toBe(6)
    expect(partLabel(first)).toBe('Fest #38 · 20 bbl')
    expect(partLabel(second)).toBe('Fest #38 · 20 bbl · after transfer')
  })

  it('a partial Package isn’t the exit', () => {
    const b = batch({
      steps: [
        step({ id: 1, behavior: 'brew', due_on: '2026-10-01' }),
        step({ id: 2, behavior: 'package', package_partial: true, due_on: '2026-10-10' }),
        step({ id: 3, behavior: 'package', due_on: '2026-10-20' }),
      ],
    })
    expect(buildParts(b)[0].exit?.id).toBe(3)
  })

  it('colors each day by the phase in force, CIP days hatched, clipped to the view', () => {
    const [first, second] = buildParts(fest)
    const at = phaseAt(fest)
    expect(at('2026-10-02')).toBe(10)
    expect(at('2026-10-03')).toBe(11)
    expect(at('2026-10-23')).toBe(12)
    // View from Oct 15 for 10 days.
    expect(segments(first, '2026-10-15', 10, at)).toEqual([
      { from: 0, to: 4, fill: 11 },
      { from: 5, to: 5, fill: 'cip' },
    ])
    expect(segments(second, '2026-10-15', 10, at)).toEqual([
      { from: 5, to: 6, fill: 11 },
      { from: 7, to: 9, fill: 12 },
    ])
  })

  it('dots: task-list steps and CIPs, side by side on one day; states', () => {
    const [first] = buildParts(fest)
    expect(partDots(first).map((d) => [d.step.id, d.slot, d.of])).toEqual([
      [1, 0, 1],
      [3, 0, 2],
      [4, 1, 2],
    ])
    expect(dotState(step({ done_on: '2026-10-20' }), '2026-10-21')).toBe('done')
    expect(dotState(step({ due_on: '2026-10-20' }), '2026-10-21')).toBe('late')
    expect(dotState(step({ due_on: '2026-10-21' }), '2026-10-21')).toBe('today')
    expect(dotState(step({ due_on: '2026-10-22' }), '2026-10-21')).toBe('planned')
  })
})

describe('a done exit (D47 QA M3)', () => {
  // Fest's Package done early, Oct 21: Carb (Oct 22) is left after it, the CIP (Oct 25) still to come.
  const early = batch({
    ...fest,
    status: 'completed',
    steps: fest.steps.map((s) => (s.id === 3 ? { ...s, done_on: s.due_on } : s.id === 6 ? { ...s, due_on: '2026-10-21', done_on: '2026-10-21' } : s)),
  })

  it('the bar ends at its CIP still to come; later unfinished steps are stranded, red', () => {
    const second = buildParts(early)[1]
    expect(second.end).toBe('2026-10-25')
    expect([...second.stranded]).toEqual([5])
    expect(second.reach).toBe('2026-10-25')
    const carb = second.steps.find((s) => s.id === 5)!
    expect(dotState(carb, '2026-10-21', second)).toBe('stranded')
    expect(dotState(carb, '2026-10-21')).toBe('planned')
    // After the Package no phase: plain to the CIP.
    expect(segments(second, '2026-10-20', 6, phaseAt(early))).toEqual([
      { from: 0, to: 1, fill: 11 },
      { from: 2, to: 4, fill: null },
      { from: 5, to: 5, fill: 'cip' },
    ])
  })

  it('with its CIP done (or none) the bar ends at the exit; stranded steps still reach past it', () => {
    const cleaned = batch({ ...early, steps: early.steps.map((s) => (s.id === 7 ? { ...s, due_on: '2026-10-21', done_on: '2026-10-21' } : s)) })
    const second = buildParts(cleaned)[1]
    expect(second.end).toBe('2026-10-21')
    expect(second.reach).toBe('2026-10-22')
    // The track is held to the stranded dot: nothing else draws over it.
    const other = buildParts(batch({ id: 2, vessels: [{ vessel_index: 0, tank_id: 9 }], steps: [step({ id: 20, batch_id: 2, behavior: 'brew', due_on: '2026-10-22' })] }))[0]
    expect(layoutRows([tank(9, 'Serving 2')], [second, other], [], new Set())[0].tracks).toBe(2)
  })

  it('not done: as before', () => {
    expect(buildParts(fest)[1]).toMatchObject({ end: '2026-10-25', reach: '2026-10-25' })
    expect(buildParts(fest)[1].stranded.size).toBe(0)
  })
})

describe('drag hint (lead decisions 4, addition)', () => {
  const fv7 = tank(7, 'FV7')
  const s2 = tank(9, 'Serving 2')
  const fv6 = { ...tank(6, 'FV6'), outages: [{ id: 1, tank_id: 6, starts_on: '2026-10-10', ends_on: '2026-10-12', reason: null, state: 'coming', label: '' }] } as Tank
  const linked = batch({ ...fest, links: [{ id: 1, from_step_id: 3, to_step_id: 5, default_answer: 'move_all' }, { id: 2, from_step_id: 5, to_step_id: 6, default_answer: 'move_only' }] })
  const [first, second] = buildParts(linked)
  const other = buildParts(batch({ id: 2, label: 'Enos P1', vessels: [{ vessel_index: 0, tank_id: 6 }], steps: [step({ id: 30, batch_id: 2, behavior: 'brew', due_on: '2026-09-25' }), step({ id: 31, batch_id: 2, due_on: '2026-10-05' })] }))[0]
  const base = { over: true, tanks: [fv6, fv7, s2], parts: [first, second, other] }

  it('outside the chart: release over it', () => {
    expect(dragHint({ ...base, over: false, kind: 'bar', days: 3, part: first })).toEqual({ text: 'Release over the chart to move', warn: true })
  })

  it('sideways: the new first day and the days; nothing yet at 0', () => {
    expect(dragHint({ ...base, kind: 'bar', days: 2, part: first })).toEqual({ text: 'Sat Oct 3 · +2 days', warn: false })
    expect(dragHint({ ...base, kind: 'bar', days: 0, part: first })).toBeNull()
    expect(dragHint({ ...base, kind: 'cip', days: -1, step: step({ id: 40, behavior: 'cip', tank_id: 7, due_on: '2026-10-21' }) })).toEqual({ text: 'Tue Oct 20 · −1 day', warn: false })
  })

  it('another row: its name; red when it is out of service or another batch is in it then', () => {
    expect(dragHint({ ...base, kind: 'bar', days: 0, part: second, toRow: null })).toEqual({ text: '→ Unassigned', warn: false })
    expect(dragHint({ ...base, kind: 'bar', days: 0, part: first, toRow: fv6 })).toEqual({
      text: '→ FV6 · FV6 is out of service Oct 10–12 · overlaps Enos P1 in FV6',
      warn: true,
    })
  })

  it('a dot before the step it follows, or past one that follows it', () => {
    const carb = second.steps.find((s) => s.id === 5)!
    expect(dragHint({ ...base, kind: 'dot', days: -3, part: second, step: carb })).toEqual({ text: 'Mon Oct 19 · −3 days · before Transfer, the step it follows', warn: true })
    expect(dragHint({ ...base, kind: 'dot', days: 4, part: second, step: carb })).toEqual({ text: 'Mon Oct 26 · +4 days · Move only: after Package, which follows it', warn: true })
    expect(dragHint({ ...base, kind: 'dot', days: 1, part: second, step: carb })).toEqual({ text: 'Fri Oct 23 · +1 day', warn: false })
  })
})

describe('stacking and rows', () => {
  it('overlapping parts take separate tracks; sharing a day counts', () => {
    const a = { start: '2026-10-01', end: '2026-10-10' }
    const b = { start: '2026-10-10', end: '2026-10-20' }
    const c = { start: '2026-10-11', end: '2026-10-12' }
    const { tracks, count } = assignTracks([b, a, c])
    expect([tracks.get(a), tracks.get(b), tracks.get(c)]).toEqual([0, 1, 0])
    expect(count).toBe(2)
  })

  it('tanks in order, then Unassigned; expanded rows add a line per step', () => {
    const parts = buildParts(fest)
    const unassigned = buildParts(batch({ id: 2, label: 'Enos P2', vessels: [{ vessel_index: 0, tank_id: null }], steps: [step({ id: 20, batch_id: 2, behavior: 'brew' })] }))
    const cip = step({ id: 30, batch_id: null, tank_id: 9, behavior: 'cip', due_on: '2026-10-22' })
    const rows = layoutRows([tank(7, 'FV7'), tank(9, 'Serving 2')], [...parts, ...unassigned], [cip], new Set(['7']))
    expect(rows.map((r) => r.tank?.name ?? 'Unassigned')).toEqual(['FV7', 'Serving 2', 'Unassigned'])
    expect(rows[0]).toMatchObject({ tracks: 1, top: 0, height: TRACK_H + 4 * STEP_ROW_H })
    expect(rows[0].stepRows.map((r) => r.step.id)).toEqual([1, 2, 3, 4])
    // Serving 2: the CIP block on Oct 22 overlaps Fest's part there.
    expect(rows[1]).toMatchObject({ tracks: 2, top: TRACK_H + 4 * STEP_ROW_H, height: 2 * TRACK_H })
    expect(rows[2].parts.map((p) => p.key)).toEqual(['2.0'])
  })
})

describe('flags', () => {
  const flag = (f: Partial<Flag>): Flag => ({
    key: 'k',
    kind: 'too_big',
    message: '',
    signature: 's',
    batch_ids: [1],
    tank_id: null,
    signed_off: false,
    was_signed_off: false,
    signoff: null,
    ...f,
  })

  it('a bar shows its batch’s flags about its tank; the chip counts them', () => {
    const [first, second] = buildParts(fest)
    const flags = [flag({ key: 'a', tank_id: 7 }), flag({ key: 'b', tank_id: 9, signed_off: true }), flag({ key: 'c' }), flag({ key: 'd', batch_ids: [2] })]
    expect(partFlags(first, flags).map((f) => f.key)).toEqual(['a', 'c'])
    expect(badgeText(partFlags(first, flags))).toBe('!2')
    expect(badgeText([flags[1]])).toBe('✓')
    expect(badgeText([])).toBeNull()
    expect(badgeText(partFlags(second, flags))).toBe('!')
    expect(flagChip(flags)).toBe('4 flags · 1 signed off')
    expect(flagChip([flags[0]])).toBe('1 flag')
  })
})

describe('remembered per person', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to 6 weeks, names-only on a phone; keeps each user’s own', () => {
    expect(readPrefs(4, false)).toEqual({ range: null, zoom: 6, collapsed: false, expanded: [] })
    expect(readPrefs(4, true).collapsed).toBe(true)
    writePref(4, 'zoom', 12)
    writePref(4, 'collapsed', false)
    writePref(4, 'range', { from: '2026-10-01', to: '2026-10-02' })
    writePref(4, 'expanded', ['7', 'unassigned'])
    expect(store.get('rockcut.production.4.zoom')).toBe('12')
    expect(readPrefs(4, true)).toEqual({ range: { from: '2026-10-01', to: '2026-10-07' }, zoom: 12, collapsed: false, expanded: ['7', 'unassigned'] })
    expect(readPrefs(5, false).zoom).toBe(6)
    store.set('rockcut.production.4.range', 'not json')
    expect(readPrefs(4, false).range).toBeNull()
  })

  it('works without storage (a private window)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(readPrefs(4, false).zoom).toBe(6)
    expect(() => writePref(4, 'zoom', 2)).not.toThrow()
  })
})
