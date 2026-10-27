import { describe, expect, it } from 'vitest'
import { contrastRatio } from './colors'
import {
  GONE_MESSAGE,
  PHASE_PALETTE,
  existingTanks,
  headlineOutage,
  newTankFor,
  prodError,
  rampPlan,
  reachable,
  phaseFill,
  previewBars,
  rampTemperatures,
  shortPeriod,
  transferOrderError,
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
    split_method: null,
    cip_method: null,
    package_partial: false,
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

  it('runs a bar past a partial Package to the full one (D47, P111)', () => {
    const t = {
      steps: [
        step({ id: 1, behavior: 'brew', name: 'Brew day', phase_id: 10 }),
        step({ id: 2, behavior: 'package', name: 'Package - Partial', day_offset: 3, package_partial: true }),
        step({ id: 3, behavior: 'package', name: 'Package', day_offset: 6 }),
      ],
      links: [],
    } as unknown as Template
    const [bar] = previewBars(t)
    expect(bar).toMatchObject({ vessel: 0, start: 0, end: 6 })
    expect(bar.dots.map((d) => d.name)).toEqual(['Brew day', 'Package - Partial', 'Package'])
  })
})

describe('tanks in a template (QA M1)', () => {
  const s = (id: number, day: number, vessel: number, behavior: TemplateStep['behavior'] = 'plain') =>
    ({ id, day_offset: day, vessel_index: vessel, behavior }) as TemplateStep
  const t = {
    steps: [s(1, 0, 0, 'brew'), s(2, 35, 1, 'transfer'), s(3, 35, 0, 'cip'), s(4, 36, 1)],
    links: [
      { id: 1, from_step_id: 1, to_step_id: 2, default_answer: 'move_all' },
      { id: 2, from_step_id: 2, to_step_id: 4, default_answer: 'move_all' },
    ],
  } as unknown as Template

  it('a transfer goes into the next new tank, from its day', () => {
    expect(newTankFor(t, 39)).toBe(2)
    expect(newTankFor(t, 35, 2)).toBe(1) // the transfer itself, being edited
    expect(newTankFor(t, 20)).toBe(1)
    // a second transfer the same day goes one further
    expect(newTankFor(t, 35)).toBe(2)
  })

  it('other entries go in the first tank or one a transfer starts', () => {
    expect(existingTanks(t)).toEqual([0, 1])
    expect(existingTanks(t, 2)).toEqual([0])
  })

  it('reachable follows links down or up', () => {
    expect([...reachable(t, 1, 'down')].sort()).toEqual([2, 4])
    expect([...reachable(t, 4, 'up')].sort()).toEqual([1, 2])
  })
})

describe('transferOrderError (D47 task 0, N1)', () => {
  const s = (id: number, day: number, vessel: number, behavior: TemplateStep['behavior'] = 'plain') =>
    ({ id, day_offset: day, vessel_index: vessel, behavior }) as TemplateStep
  const steps = [s(1, 0, 0, 'brew'), s(2, 20, 1, 'transfer'), s(3, 25, 2, 'transfer'), s(4, 28, 3, 'transfer')]
  const t = { steps, links: [] } as unknown as Template

  it('a new transfer goes after the existing ones', () => {
    expect(transferOrderError(t, 22)).toBe('Transfers stay in day order: this one would come before the transfer on day 25.')
    expect(transferOrderError(t, 10)).toBe('Transfers stay in day order: this one would come before the transfer on day 20.')
    expect(transferOrderError(t, 28)).toBeNull()
    expect(transferOrderError(t, 30)).toBeNull()
    expect(transferOrderError(t, null)).toBeNull()
  })

  it('an edited transfer stays between its neighbours', () => {
    expect(transferOrderError(t, 27, steps[1])).toBe('Transfers stay in day order: this one would come after the transfer on day 25.')
    expect(transferOrderError(t, 22, steps[3])).toBe('Transfers stay in day order: this one would come before the transfer on day 25.')
    expect(transferOrderError(t, 24, steps[2])).toBeNull()
  })
})

describe('rampPlan (QA minor 5)', () => {
  it('lists the temperatures, or says why not', () => {
    expect(rampPlan('58', '32', '10')).toEqual({ temps: [58, 48, 38, 32] })
    expect(rampPlan('90', '20', '10')).toEqual({ error: 'Start and target are whole degrees from 28 to 80°F.' })
    expect(rampPlan('58', '32', '0.5')).toEqual({ error: 'The change per day is a whole number of degrees, at least 1.' })
    expect(rampPlan('58', '32.5', '5')).toHaveProperty('error')
    expect(rampPlan('40', '40', '5')).toEqual({ error: 'The start and target temperatures are the same.' })
    // D47 task 0 (N3): at most the gap between start and target.
    expect(rampPlan('80', '28', '100')).toEqual({ error: 'The change per day can be at most 52°, the gap between start and target.' })
    expect(rampPlan('80', '28', '52')).toEqual({ temps: [80, 28] })
  })
})

describe('prodError', () => {
  it('a 404 says someone else removed it (QA minor 3)', () => {
    expect(prodError({ response: { status: 404, data: { error: 'not_found', message: 'Not found' } } })).toBe(GONE_MESSAGE)
    expect(prodError({ response: { status: 422, data: { error: 'x', message: 'A transfer moves the beer into a new tank.' } } })).toBe(
      'A transfer moves the beer into a new tank.',
    )
  })
})
