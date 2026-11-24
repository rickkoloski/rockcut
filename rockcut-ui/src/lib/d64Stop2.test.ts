// D64 Stop 2: the Brinks tab's words (state, co-ferment, the count in effect and
// "before the harvest", sources, the empty weight beside an lb box) and its lb boxes.
import { describe, expect, it } from 'vitest'
import { brinkStateText, countText, emptyWeightText, lbText, readLb, shortDate, sourcesText, strainsText, yeastText } from './yeast'
import type { YeastContents } from './types'

const yeast = (over: Partial<YeastContents> = {}): YeastContents => ({
  harvest_id: 1,
  lock_version: 1,
  on_hand_lb: '42',
  generation: 2,
  coferment: false,
  product_ids: [1],
  strains: ['US-05'],
  harvested_on: '2026-11-20',
  first_harvested_on: '2026-11-20',
  sources: [{ batch_id: 41, batch: 'Galactic #41', generation: 2, strains: ['US-05'], lb: '42', occurred_on: '2026-11-20' }],
  count: null,
  ...over,
})

describe('a brink as the tab says it', () => {
  it('empty, empty and dirty since 11/20, or its yeast', () => {
    expect(brinkStateText({ name: 'YB1', dirty: false, dirty_since: null, yeast: null })).toBe('YB1 · empty')
    expect(brinkStateText({ name: 'YB3', dirty: true, dirty_since: '2026-11-20', yeast: null })).toBe('YB3 · empty · dirty since 11/20')
    expect(brinkStateText({ name: 'YB2', dirty: false, dirty_since: null, yeast: yeast() })).toBe('YB2 · 42 lb US-05 gen 2')
  })

  it('a co-ferment lists every strain', () => {
    const co = yeast({ coferment: true, generation: 1, strains: ['US-05', 'WLP002'] })
    expect(strainsText(co)).toBe('Co-ferment: US-05 + WLP002')
    expect(yeastText(co)).toBe('Co-ferment: US-05 + WLP002 · gen 1')
    expect(strainsText(yeast())).toBe('US-05')
  })

  it('the count in effect, marked when it is from before the latest harvest; none: Not counted', () => {
    expect(countText(yeast())).toBe('Not counted')
    const c = { id: 1, counted_on: '2026-11-18', viable_millions_per_ml: '1200.0', viability_pct: '92.0', before_harvest_on: null }
    expect(countText(yeast({ count: c }))).toBe('1,200 M/mL · 92% · counted 11/18')
    expect(countText(yeast({ count: { ...c, before_harvest_on: '2026-11-20' } }))).toBe('1,200 M/mL · 92% · counted 11/18 · before the 11/20 harvest')
  })

  it('sources: "From #41 (gen 2) and #44 (gen 3)"; a co-ferment names the strains', () => {
    const two = yeast({
      sources: [
        { batch_id: 41, batch: '#41', generation: 2, strains: ['US-05'], lb: '30', occurred_on: '2026-11-20' },
        { batch_id: 44, batch: '#44', generation: 3, strains: ['US-05'], lb: '12', occurred_on: '2026-11-22' },
      ],
    })
    expect(sourcesText(two)).toBe('From #41 (gen 2) and #44 (gen 3)')
    const co = yeast({ coferment: true, sources: [{ batch_id: 48, batch: '#48', generation: 1, strains: ['WLP002'], lb: '5', occurred_on: '2026-11-22' }] })
    expect(sourcesText(co)).toBe('From #48 (WLP002 gen 1)')
  })

  it('the empty weight beside an lb field: "YB2 empty: 148 lb"; none without one', () => {
    expect(emptyWeightText({ name: 'YB2', empty_weight_lb: '148.00' })).toBe('YB2 empty: 148 lb')
    expect(emptyWeightText({ name: 'YB2', empty_weight_lb: null })).toBeNull()
    expect(lbText('42.50')).toBe('42.5 lb')
    expect(shortDate('2026-01-05')).toBe('1/5')
  })
})

describe('lb boxes', () => {
  it('Pitch: more than 0, at most on hand (as the API says it), 2 places', () => {
    expect(readLb('24', { max: 42, brink: 'YB2' })).toEqual({ lb: '24', error: null })
    expect(readLb('43', { max: 42, brink: 'YB2' }).error).toBe('YB2 has 42 lb')
    expect(readLb('0').error).toBe('Enter more than 0 lb')
    expect(readLb('1.234').error).toMatch(/2 decimals/)
    expect(readLb('')).toEqual({ lb: null, error: null })
  })

  it('Adjust: 0 is allowed (it empties the brink); a minus is not', () => {
    expect(readLb('0', { zeroOk: true })).toEqual({ lb: '0', error: null })
    expect(readLb('-1', { zeroOk: true }).error).not.toBeNull()
  })
})
