// D64 Stop 3: the Harvest dialog's start, checks, body and questions, and the batch page's lines.
import { describe, expect, it } from 'vitest'
import { brinkAnswer, brinkOption, harvestBody, harvestDoneText, harvestError, harvestQuestion, initialHarvest, pitchedText, pullText, readGeneration, type HarvestForm, type HarvestPreview } from './harvest'
import type { YeastBrink } from './types'

const brink = (over: Partial<YeastBrink> = {}): YeastBrink => ({
  id: 1,
  name: 'YB1',
  empty_weight_lb: null,
  position: 1,
  active: true,
  dirty: false,
  dirty_since: null,
  has_history: false,
  recount_due: false,
  clean_due: false,
  yeast: null,
  ...over,
})

const yb2 = brink({
  id: 2,
  name: 'YB2',
  yeast: {
    harvest_id: 9,
    lock_version: 1,
    on_hand_lb: '42',
    generation: 2,
    coferment: false,
    product_ids: [5],
    strains: ['US-05'],
    harvested_on: '2026-11-20',
    first_harvested_on: '2026-11-20',
    sources: [],
    count: null,
  },
})

const pre = (over: Partial<HarvestPreview> = {}): HarvestPreview => ({
  brinks: [brink(), yb2],
  default_brink_id: null,
  defaults: null,
  products: [{ id: 5, code: 'US-05', label: 'Chico Ale US-05 · Fermentis' }],
  ...over,
})

const form = (over: Partial<HarvestForm> = {}): HarvestForm => ({ outcome: 'harvested', brinkId: 1, lb: '30', productIds: [5], generation: '1', note: '', ...over })

describe('initialHarvest', () => {
  it('starts on Harvest yeast with the defaults from the pitches and the default brink', () => {
    expect(initialHarvest(pre({ default_brink_id: 2, defaults: { product_ids: [5], generation: 3, coferment: false } }))).toEqual({
      outcome: 'harvested',
      brinkId: 2,
      lb: '',
      productIds: [5],
      generation: '3',
      note: '',
    })
  })

  it('with nothing pitched (A5): no strain, gen 1, no brink', () => {
    expect(initialHarvest(pre())).toMatchObject({ brinkId: '', productIds: [], generation: '1' })
  })
})

describe('brinkOption', () => {
  it('reads "YB1 · empty", "YB2 · 42 lb US-05 gen 2", "YB3 · dirty"', () => {
    expect(brinkOption(brink())).toBe('YB1 · empty')
    expect(brinkOption(yb2)).toBe('YB2 · 42 lb US-05 gen 2')
    expect(brinkOption(brink({ name: 'YB3', dirty: true, dirty_since: '2026-11-20' }))).toBe('YB3 · dirty')
  })
})

describe('readGeneration', () => {
  it('takes whole numbers 1–999 only', () => {
    expect(readGeneration('1')).toBe(1)
    expect(readGeneration(' 12 ')).toBe(12)
    for (const bad of ['0', '-1', '1.5', '', 'two', '1000']) expect(readGeneration(bad)).toBeNull()
  })
})

describe('harvestError', () => {
  it('asks for the brink, the weight, the strain and the generation, in that order', () => {
    expect(harvestError(form({ brinkId: '' }))).toBe('Pick the brink')
    expect(harvestError(form({ lb: '' }))).toBe('Enter the yeast weight in lb')
    expect(harvestError(form({ lb: '0' }))).toBe('Enter more than 0 lb')
    expect(harvestError(form({ productIds: [] }))).toBe('Pick the strain')
    expect(harvestError(form({ generation: '0' }))).toMatch(/whole number/)
    expect(harvestError(form())).toBeNull()
  })

  it('Yeast dumped needs nothing but may have a note', () => {
    expect(harvestError(form({ outcome: 'dumped', brinkId: '', lb: '', productIds: [] }))).toBeNull()
  })
})

describe('harvestBody', () => {
  it('sends the flat yeast_* fields', () => {
    expect(harvestBody(form({ lb: '30.5', productIds: [5, 7], generation: '2', note: ' good slurry ' }))).toEqual({
      yeast_outcome: 'harvested',
      yeast_brink_id: 1,
      yeast_lb: '30.5',
      yeast_product_ids: [5, 7],
      yeast_generation: 2,
      yeast_note: 'good slurry',
    })
  })

  it('Yeast dumped sends only the outcome and the note', () => {
    expect(harvestBody(form({ outcome: 'dumped', note: 'too much trub' }))).toEqual({ yeast_outcome: 'dumped', yeast_note: 'too much trub' })
  })
})

describe('harvestQuestion', () => {
  it('reads the 409 yeast_question; anything else is no question', () => {
    expect(harvestQuestion({ code: 'yeast_question', question: 'dirty', message: 'YB2 is marked as dirty, record harvest anyway?' })).toEqual({
      kind: 'dirty',
      message: 'YB2 is marked as dirty, record harvest anyway?',
      state: null,
    })
    expect(harvestQuestion({ code: 'yeast_question', question: 'has_yeast', message: 'm', state: yb2 })).toEqual({ kind: 'has_yeast', message: 'm', state: yb2 })
    expect(harvestQuestion({ error: 'yeast_locked' })).toBeNull()
    expect(harvestQuestion(undefined)).toBeNull()
  })
})

describe('brinkAnswer (lead decisions 7, gap 19)', () => {
  const q = { kind: 'has_yeast' as const, message: 'm', state: yb2 }
  it('carries the record; This brink is empty its version too', () => {
    expect(brinkAnswer('on_top', q)).toEqual({ yeast_brink_answer: 'on_top', yeast_record_id: 9 })
    expect(brinkAnswer('empty', q)).toEqual({ yeast_brink_answer: 'empty', yeast_record_id: 9, yeast_lock_version: 1 })
  })
})

describe('the words', () => {
  it('the snackbar after the check-off', () => {
    expect(harvestDoneText('Yeast harvest', form(), [brink()])).toBe('Yeast harvest done · 30 lb → YB1')
    expect(harvestDoneText('Yeast harvest', form({ outcome: 'dumped' }), [])).toBe('Yeast harvest done · Yeast dumped')
  })

  it('the batch page: one line per pull, and the pitches', () => {
    expect(pullText({ occurred_on: '2026-11-20', lb: '30', brink: 'YB2', on_top: false })).toBe('11/20 · 30 lb → YB2')
    expect(pullText({ occurred_on: '2026-11-22', lb: '12', brink: 'YB2', on_top: true })).toBe('11/22 · 12 lb → YB2 (on top)')
    expect(pitchedText({ source: 'lot', occurred_on: '2026-11-14', quantity: '2', unit: 'bricks', product: 'Chico Ale US-05', lot_number: 'F123', note: null })).toBe(
      '2 bricks Chico Ale US-05, lot F123 · Mother',
    )
    expect(pitchedText({ source: 'lot', occurred_on: '2026-11-14', quantity: '1', unit: 'pitchables', product: 'Vermont Ale Modi WLPMD4000', lot_number: null, note: null })).toBe(
      '1 pitchable Vermont Ale Modi WLPMD4000 · Mother',
    )
    expect(pitchedText({ source: 'brink', occurred_on: '2026-11-14', lb: '38', brink: 'YB2', strains: ['US-05'], generation: 2, coferment: false, note: null })).toBe(
      '38 lb from YB2 · US-05 gen 2',
    )
    // Gap 17: a split's part, pitched into its parent.
    expect(pitchedText({ source: 'lot', into: '#73', occurred_on: '2026-11-14', quantity: '2', unit: 'bricks', product: 'Chico Ale US-05', lot_number: 'F123', note: null })).toBe(
      '2 bricks Chico Ale US-05, lot F123 · Mother · into #73',
    )
    expect(pitchedText({ source: 'brink', occurred_on: '2026-11-14', lb: '20', brink: 'YB3', strains: ['US-05', 'WLP002'], generation: 1, coferment: true, note: null })).toBe(
      '20 lb from YB3 · Co-ferment: US-05 + WLP002 · gen 1',
    )
  })
})
