import { describe, expect, it } from 'vitest'
import { SETTING_FIELDS, draftOf, fieldShown, fieldText, isEquation, lastChanged, limitsText, mergeDraft, parseField, readDraft, settingsError, type BrewerySettings, type NumberField } from './brewerySettings'

// D63 Stop 3 (spec §6): the settings' boxes.

const START: BrewerySettings = {
  boil_temp_f: '202', ibu_equation_hold: 'rc_2026', ibu_equation_print: 'rc_2026', ibu_tolerance: '2', pellet_factor: '1.1',
  hop_stand_temp_f: '170', hop_stand_cooling_min: '15', hop_stand_whirl_min: '20', hop_stand_rest_min: '20',
  whirlpool_whirl_min: '20', whirlpool_rest_min: '20', evaporation_bbl_per_hr: '0.23', kettle_loss_bbl: '0.21', fermenter_loss_bbl: '0.5',
  whirlfloc_tablets_per_bbl: '2', clarity_ferm_ml_per_plato_bbl: '1.3333', zinc_g_per_bbl: '0.09375', pitch_rate: '1.5',
  water_ca_ppm: '20', water_mg_ppm: '3', water_na_ppm: '4', water_co3_ppm: '0', water_hco3_ppm: '18', water_so4_ppm: '2', water_cl_ppm: '3',
  source_water_name: 'Estes Summer', lock_version: 1, updated_by: null, updated_at: '2026-11-25T08:00:00Z',
}
const number = (key: string) => SETTING_FIELDS.find((f) => f.key === key) as NumberField
const zinc = number('zinc_g_per_bbl')
const draft = (over: Record<string, string> = {}) => ({ ...draftOf(START), ...over })

describe('zinc', () => {
  it('is shown and typed per 8 bbl and stored per bbl', () => {
    expect(fieldShown(zinc, fieldText(zinc, START))).toBe('0.75 g per 8 bbl')
    expect(parseField(zinc, '0.75')).toEqual({ ok: true, stored: '0.09375' })
    expect(parseField(zinc, '0.8')).toEqual({ ok: true, stored: '0.1' })
    expect(parseField(zinc, '0.01')).toEqual({ ok: true, stored: '0.00125' })
  })
  it("limits are the stored value's, named per 8 bbl", () => {
    expect(parseField(zinc, '0').ok).toBe(true)
    expect(parseField(zinc, '40')).toEqual({ ok: true, stored: '5' })
    expect(parseField(zinc, '40.01')).toEqual({ ok: false, error: 'Zinc (kettle volume) must be between 0 and 40 g per 8 bbl.' })
  })
  it("a value stored finer than the box isn't touched, sent or refused", () => {
    const odd = { ...START, zinc_g_per_bbl: '0.09376' }
    expect(fieldText(zinc, odd)).toBe('0.75008')
    expect(readDraft(draftOf(odd), odd)).toEqual({ changes: {}, errors: {} })
    expect(readDraft({ ...draftOf(odd), boil_temp_f: '203' }, odd)).toEqual({ changes: { boil_temp_f: '203' }, errors: {} })
  })
})

describe('limits', () => {
  it('are inclusive on every number', () => {
    for (const f of SETTING_FIELDS) {
      if (isEquation(f)) continue
      const s = f.scale ?? 1
      const step = 10 ** -f.decimals
      for (const v of [f.min * s, f.max * s]) expect(parseField(f, String(v)).ok, `${f.key} ${v}`).toBe(true)
      const above = (f.max * s + step).toFixed(f.decimals)
      const below = (f.min * s - step).toFixed(f.decimals)
      for (const v of [above, below]) expect(parseField(f, v), `${f.key} ${v}`).toMatchObject({ ok: false, error: expect.stringContaining(limitsText(f)) })
    }
  })
  it('empty, text and a comma decimal are refused with them', () => {
    const boil = number('boil_temp_f')
    for (const bad of ['', '  ', 'hot', '200,5', '2e2', '202.25'])
      expect(parseField(boil, bad)).toMatchObject({ ok: false, error: expect.stringContaining('Boil temperature must be between 180 and 212 °F.') })
    expect(limitsText(number('water_ca_ppm'))).toBe('Calcium (Ca) must be between 0 and 2,000 ppm')
    expect(limitsText(number('pellet_factor'))).toBe('Pellet factor (T90, Cryo) must be between 1 and 1.5')
    expect(parseField(number('water_ca_ppm'), '1,500')).toEqual({ ok: true, stored: '1500' })
  })
})

describe('readDraft', () => {
  it('sends only what differs', () => {
    expect(readDraft(draft(), START)).toEqual({ changes: {}, errors: {} })
    expect(readDraft(draft({ ibu_tolerance: ' 1.5 ', boil_temp_f: '202.0', ibu_equation_print: 'tinseth' }), START).changes).toEqual({
      ibu_tolerance: '1.5',
      ibu_equation_print: 'tinseth',
    })
    expect(Object.keys(readDraft(draft({ ibu_tolerance: '', pitch_rate: 'x' }), START).errors)).toEqual(['ibu_tolerance', 'pitch_rate'])
  })
})

describe('mergeDraft', () => {
  it('keeps what was typed, beside the current value, and takes the rest', () => {
    const current = { ...START, ibu_tolerance: '1.5', boil_temp_f: '204', zinc_g_per_bbl: '0.1', lock_version: 2 }
    const m = mergeDraft(draft({ ibu_tolerance: '3', zinc_g_per_bbl: '0.9', pitch_rate: '1' }), START, current)
    expect(m.draft).toMatchObject({ ibu_tolerance: '3', zinc_g_per_bbl: '0.9', pitch_rate: '1', boil_temp_f: '204' })
    expect(m.now).toEqual({ ibu_tolerance: '1.5 IBU', zinc_g_per_bbl: '0.8 g per 8 bbl' })
    expect(readDraft(m.draft, current).changes).toEqual({ ibu_tolerance: '3', zinc_g_per_bbl: '0.1125', pitch_rate: '1' })
  })
})

describe('words', () => {
  it('Last changed: the Colorado day, and none before anyone has', () => {
    expect(lastChanged(START)).toBeNull()
    expect(lastChanged({ ...START, updated_by: { id: 1, name: 'Morgan Mash' }, updated_at: '2026-11-25T05:00:00Z' })).toBe('Last changed by Morgan Mash on Nov 24, 2026')
  })
  it('the API’s refusal without field keys', () => {
    const boil = 'Boil temperature must be between 180 and 212 °F'
    expect(settingsError({ response: { status: 422, data: { errors: { boil_temp_f: [boil] } } } })).toBe(boil)
    expect(settingsError({ response: { status: 409, data: { errors: { base: ['Changed.'] } } } })).toBe('Changed.')
    expect(settingsError({ response: { status: 403, data: { error: 'Forbidden' } } })).toBe('Forbidden')
  })
})
