import { describe, expect, it } from 'vitest'
import { contrastRatio } from './colors'
import {
  PHASE_PALETTE,
  headlineOutage,
  phaseFill,
  previewBars,
  rampTemperatures,
  shortPeriod,
  type Outage,
  type Tank,
  type Template,
  type TemplateStep,
} from './production'

const outage = (o: Partial<Outage>): Outage => ({
  id: 1,
  tank_id: 1,
  starts_on: '2026-10-27',
  ends_on: '2026-11-02',
  reason: null,
  state: 'coming',
  label: '',
  ...o,
})

describe('shortPeriod', () => {
  it('formats a period for the chip', () => {
    expect(shortPeriod(outage({}))).toBe('Oct 27–Nov 2')
    expect(shortPeriod(outage({ ends_on: '2026-10-30' }))).toBe('Oct 27–30')
    expect(shortPeriod(outage({ ends_on: '2026-10-27' }))).toBe('Oct 27')
    expect(shortPeriod(outage({ starts_on: '2026-10-20', ends_on: null }))).toBe('from Oct 20')
  })
})

describe('headlineOutage', () => {
  it('is the current or next period, with how many more are coming', () => {
    const tank = {
      outages: [
        outage({ id: 1, starts_on: '2026-09-01', ends_on: '2026-09-03', state: 'past' }),
        outage({ id: 3, starts_on: '2026-11-20', ends_on: null, state: 'coming' }),
        outage({ id: 2, starts_on: '2026-10-27', state: 'coming' }),
      ],
    } as Tank
    expect(headlineOutage(tank)).toMatchObject({ outage: { id: 2 }, more: 1 })
    expect(headlineOutage({ outages: [tank.outages[0]] } as Tank)).toBeNull()
  })
})

describe('rampTemperatures', () => {
  it('steps toward the target and ends on it', () => {
    expect(rampTemperatures(58, 32, 10)).toEqual([58, 48, 38, 32])
    expect(rampTemperatures(40, 60, 10)).toEqual([40, 50, 60])
    expect(rampTemperatures(40, 40, 10)).toEqual([])
    expect(rampTemperatures(40, 30, 0)).toEqual([])
  })
})

describe('phaseFill', () => {
  it('has twelve colors whose text reads in both modes', () => {
    expect(PHASE_PALETTE).toHaveLength(12)
    for (const c of PHASE_PALETTE)
      for (const mode of ['light', 'dark'] as const) {
        const { bg, fg } = phaseFill(c.token, mode)
        expect(contrastRatio(bg, fg), `${c.token} ${mode}`).toBeGreaterThanOrEqual(4.5)
      }
  })
})

describe('previewBars', () => {
  const step = (s: Partial<TemplateStep>): TemplateStep => ({
    id: 0,
    step_type_id: 1,
    marker: false,
    name: 'x',
    type_name: 'x',
    full_name: null,
    behavior: 'plain',
    phase_id: null,
    day_offset: 0,
    vessel_index: 0,
    detail: null,
    temperature: null,
    notes: null,
    on_task_list: true,
    position: 1,
    ramp_group: null,
    ...s,
  })

  it('draws a bar per tank, phases carried through the transfer', () => {
    const t = {
      steps: [
        step({ id: 1, behavior: 'brew', name: 'Brew day', phase_id: 10 }),
        step({ id: 2, marker: true, step_type_id: null, behavior: null, day_offset: 2, phase_id: 11, on_task_list: false }),
        step({ id: 3, behavior: 'transfer', name: 'Transfer', day_offset: 4, vessel_index: 1 }),
        step({ id: 4, behavior: 'cip', name: 'CIP', day_offset: 4, vessel_index: 0 }),
        step({ id: 5, behavior: 'package', name: 'Package', day_offset: 6, vessel_index: 1, phase_id: 12 }),
      ],
      links: [],
    } as unknown as Template
    const [first, second] = previewBars(t)
    expect(first).toMatchObject({ vessel: 0, start: 0, end: 4, phases: [10, 10, 11, 11, 11], cipDays: [4] })
    expect(first.dots.map((d) => d.name)).toEqual(['Brew day'])
    expect(second).toMatchObject({ vessel: 1, start: 4, end: 6, phases: [11, 11, 12] })
    expect(second.dots.map((d) => d.name)).toEqual(['Transfer', 'Package'])
  })
})
