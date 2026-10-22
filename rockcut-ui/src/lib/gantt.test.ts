import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignTracks,
  badgeText,
  buildParts,
  clampRange,
  dayLabel,
  dayWidth,
  daysBetween,
  defaultRange,
  dotState,
  dragHint,
  expandMode,
  flagChip,
  layoutRows,
  monthLabels,
  partDots,
  partFlags,
  partLabel,
  phaseAt,
  rangeForZoom,
  readPrefs,
  segments,
  shiftRange,
  showInitials,
  STEP_ROW_H,
  STEP_ROW_H_FINE,
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
  ramp_group: null,
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
  split_parent_id: null,
  part_number: null,
  split_step_id: null,
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
  })

  it('Today: a week back plus the zoom’s weeks; a new zoom keeps the start (P118)', () => {
    expect(defaultRange('2026-10-21', 6)).toEqual({ from: '2026-10-14', to: '2026-12-02' })
    expect(defaultRange('2026-10-21', 2)).toEqual({ from: '2026-10-14', to: '2026-11-04' })
    expect(defaultRange('2026-10-21', 12)).toEqual({ from: '2026-10-14', to: '2027-01-13' })
    // The same as Today after switching: start kept, a week plus the zoom.
    expect(rangeForZoom(defaultRange('2026-10-21', 6), 2)).toEqual(defaultRange('2026-10-21', 2))
    expect(rangeForZoom({ from: '2026-09-01', to: '2026-09-10' }, 12)).toEqual({ from: '2026-09-01', to: '2026-12-01' })
  })

  it('the expand switch follows the open rows (P119)', () => {
    const keys = ['7', '9', 'unassigned']
    expect(expandMode(keys, new Set())).toBe('collapse')
    expect(expandMode(keys, new Set(['7']))).toBe('mine')
    expect(expandMode(keys, new Set(['7', '9', 'unassigned']))).toBe('expand')
    // A retired tank's key left in the set doesn't count.
    expect(expandMode(keys, new Set(['42']))).toBe('collapse')
    expect(expandMode([], new Set())).toBe('collapse')
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

  it('the bar ends at the exit; later unfinished steps are stranded, red; the leftover CIP holds no lane (N4)', () => {
    const second = buildParts(early)[1]
    expect(second.end).toBe('2026-10-21')
    expect([...second.stranded]).toEqual([5])
    expect(second.reach).toBe('2026-10-22')
    const carb = second.steps.find((s) => s.id === 5)!
    expect(dotState(carb, '2026-10-21', second)).toBe('stranded')
    expect(dotState(carb, '2026-10-21')).toBe('planned')
    expect(segments(second, '2026-10-20', 6, phaseAt(early))).toEqual([{ from: 0, to: 1, fill: 11 }])
    // The CIP (Oct 25) is still a dot on its day.
    expect(partDots(second).map((d) => d.step.id)).toContain(7)
    // Without the stranded Carb, the next batch from Oct 23 shares the lane despite the leftover CIP on Oct 25.
    const plain = buildParts(batch({ ...early, steps: early.steps.filter((s) => s.id !== 5) }))[1]
    expect(plain.reach).toBe('2026-10-21')
    const next = buildParts(batch({ id: 2, vessels: [{ vessel_index: 0, tank_id: 9 }], steps: [step({ id: 20, batch_id: 2, behavior: 'brew', due_on: '2026-10-23' })] }))[0]
    expect(layoutRows([tank(9, 'Serving 2')], [plain, next], [], new Set())[0].tracks).toBe(1)
  })

  it('with its CIP done the bar still ends at the exit; stranded steps reach past it', () => {
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

  it('a completed part holds its tank only to its exit: no overlap for a batch before its leftover CIP (N4)', () => {
    // Fest's Package done Oct 21 in Serving 2, its CIP still planned Oct 25; Enos dragged to Oct 23.
    const done = buildParts(batch({ ...fest, status: 'completed', steps: fest.steps.filter((s) => s.id !== 5).map((s) => (s.id === 3 ? { ...s, done_on: s.due_on } : s.id === 6 ? { ...s, due_on: '2026-10-21', done_on: '2026-10-21' } : s)) }))
    const enos = buildParts(batch({ id: 2, label: 'Enos P1', vessels: [{ vessel_index: 0, tank_id: 9 }], steps: [step({ id: 30, batch_id: 2, behavior: 'brew', due_on: '2026-10-20' }), step({ id: 31, batch_id: 2, due_on: '2026-10-30' })] }))[0]
    expect(dragHint({ ...base, parts: [...done, enos], kind: 'bar', days: 3, part: enos })).toEqual({ text: 'Fri Oct 23 · +3 days', warn: false })
    // Before the exit, it does overlap.
    expect(dragHint({ ...base, parts: [...done, enos], kind: 'bar', days: -1, part: enos })!.text).toMatch(/overlaps Fest #38 in Serving 2$/)
  })

  it('a fill or exit dot checks the new stay; any other dot its own day (N6)', () => {
    // FV7 holds Fest's first part Oct 1–20; FV7 out Oct 22–24.
    const fv7out = { ...fv7, outages: [{ id: 2, tank_id: 7, starts_on: '2026-10-22', ends_on: '2026-10-24', reason: null, state: 'coming', label: '' }] } as Tank
    const t = { ...base, tanks: [fv6, fv7out, s2] }
    const transfer = first.exit!
    // The exit 5 days later (Oct 25): the day is past the outage, but the stay now covers it.
    // Transfer → Carb is "move all", the default: being after Carb only matters if moved alone, a neutral note.
    expect(dragHint({ ...t, kind: 'dot', days: 5, part: first, step: transfer })).toEqual({
      text: 'Sun Oct 25 · +5 days · FV7 is out of service Oct 22–24',
      warn: true,
      note: 'If you move only this step: after Carb, which follows it',
    })
    // Another step (the CIP on Oct 20, a dot of this part) only its own day.
    const cip = first.steps.find((s) => s.id === 4)!
    expect(dragHint({ ...t, kind: 'dot', days: 5, part: first, step: cip })).toEqual({ text: 'Sun Oct 25 · +5 days', warn: false })
  })

  it('a fill dot checks the stay as the default answer leaves it (lead decisions 6)', () => {
    // FV7: Fest's first part Oct 1–20 (Brew day Oct 1 → the marker, "move all"); out Oct 21–22, just after it.
    const out = { ...fv7, outages: [{ id: 3, tank_id: 7, starts_on: '2026-10-21', ends_on: '2026-10-22', reason: null, state: 'coming', label: '' }] } as Tank
    const all = buildParts(batch({ ...fest, links: [{ id: 9, from_step_id: 1, to_step_id: 2, default_answer: 'move_all' }] }))[0]
    const brew = all.fill!
    // Move all (the default): the whole stay shifts to Oct 3–22, into the outage: red.
    expect(dragHint({ ...base, tanks: [out], parts: [all], kind: 'dot', days: 2, part: all, step: brew })).toEqual({ text: 'Sat Oct 3 · +2 days · FV7 is out of service Oct 21–22', warn: true })
    // Move only by default: only the start moves (Oct 3–20): clear.
    const only = buildParts(batch({ ...fest, links: [{ id: 9, from_step_id: 1, to_step_id: 2, default_answer: 'move_only' }] }))[0]
    expect(dragHint({ ...base, tanks: [out], parts: [only], kind: 'dot', days: 2, part: only, step: only.fill! })).toEqual({ text: 'Sat Oct 3 · +2 days', warn: false })
  })

  it('a dot before the step it follows, or past one that follows it', () => {
    const carb = second.steps.find((s) => s.id === 5)!
    expect(dragHint({ ...base, kind: 'dot', days: -3, part: second, step: carb })).toEqual({ text: 'Mon Oct 19 · −3 days · before Transfer, the step it follows', warn: true })
    // Carb → Package is "move only", the default: past Package is a problem with it, red.
    expect(dragHint({ ...base, kind: 'dot', days: 4, part: second, step: carb })).toEqual({ text: 'Mon Oct 26 · +4 days · after Package, which follows it', warn: true })
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
    // With a mouse, step rows are 20 px (P121).
    const fine = layoutRows([tank(7, 'FV7'), tank(9, 'Serving 2')], [...parts, ...unassigned], [cip], new Set(['7']), STEP_ROW_H_FINE)
    expect(fine[0].height).toBe(TRACK_H + 4 * 20)
    expect(fine[1].top).toBe(TRACK_H + 4 * 20)
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
    expect(readPrefs(4, false)).toEqual({ range: null, zoom: 6, collapsed: false, expanded: [], mix: [] })
    expect(readPrefs(4, true).collapsed).toBe(true)
    writePref(4, 'zoom', 12)
    writePref(4, 'collapsed', false)
    writePref(4, 'range', { from: '2026-10-01', to: '2026-10-02' })
    writePref(4, 'expanded', ['7', 'unassigned'])
    writePref(4, 'mix', ['7'])
    expect(store.get('rockcut.production.4.zoom')).toBe('12')
    expect(readPrefs(4, true)).toEqual({ range: { from: '2026-10-01', to: '2026-10-07' }, zoom: 12, collapsed: false, expanded: ['7', 'unassigned'], mix: ['7'] })
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
