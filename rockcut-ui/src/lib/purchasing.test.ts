import { describe, expect, it } from 'vitest'
import { contractPriceChanges, contractYear, contractYears, lineForError, lotChoiceLabel, money, parsePacks, previousLot, receivableLots, runningTotal, packsFigure, splitSummary, targetProgress, toOrder } from './purchasing'

describe('money', () => {
  it('dollars with separators; nothing is a dash', () => {
    expect(money('1512')).toBe('$1,512.00')
    expect(money(0)).toBe('$0.00')
    expect(money(null)).toBe('—')
    expect(money('0.8', 4)).toBe('$0.8000')
  })
})

describe('parsePacks (decision 24: whole sacks)', () => {
  it('takes whole numbers at or above the minimum', () => {
    expect(parsePacks('30')).toBe(30)
    expect(parsePacks(' 4 ')).toBe(4)
    expect(parsePacks('0')).toBeNull()
    expect(parsePacks('0', 0)).toBe(0)
    for (const bad of ['1.5', '-1', '', 'x', '1e2', '1,23', '12,34', '1,234.5', ',123']) expect(parsePacks(bad), bad).toBeNull()
  })

  it('takes thousands separators like the other number boxes (gap 10)', () => {
    expect(parsePacks('1,234')).toBe(1234)
    expect(parsePacks(' 12,345,678 ')).toBe(12345678)
    expect(parsePacks('1,000', 0)).toBe(1000)
  })
})

describe('running total and target (§3.2, decision 48)', () => {
  it('"36 sacks · 1,980 lb · $1,512.00"; a line without packs or offer adds nothing', () => {
    const t = runningTotal([
      { packs: 30, packSize: 55, packName: 'sack', price: 42 },
      { packs: 6, packSize: 55, packName: 'sack', price: 42 },
      { packs: null, packSize: 55, packName: 'sack', price: 42 },
      { packs: 3, packSize: null, packName: 'sack', price: 1 },
    ])
    expect(t.text).toBe('36 sacks · 1,980 lb · $1,512.00')
    expect(runningTotal([{ packs: 1, packSize: 50, packName: 'sack', price: null }]).text).toBe('1 sack · 50 lb · $0.00')
    expect(runningTotal([{ packs: 3, packSize: 55, packName: 'sack', price: 48.15 }]).dollars).toBe(144.45)
    expect(runningTotal([]).text).toBe('0 sacks · 0 lb · $0.00')
  })

  it('D62: mixed packs say packs; quantities per unit, never added', () => {
    const t = runningTotal([
      { packs: 30, packSize: 55, packName: 'sack', unit: 'lb', price: 40 },
      { packs: 6, packSize: 11, packName: 'box', unit: 'lb', price: 165 },
      { packs: 2, packSize: 5, packName: 'pail', unit: 'gal', price: 100 },
    ])
    expect(t.text).toBe('38 packs · 10 gal · 1,716 lb · $2,390.00')
    expect(t.byUnit).toEqual([
      { unit: 'gal', quantity: '10' },
      { unit: 'lb', quantity: '1716' },
    ])
  })

  it('progress to the next multiple of the target', () => {
    expect(targetProgress(36, 40)).toBe('36 of 40 sacks')
    expect(targetProgress(40, 40)).toBe('40 of 40 sacks')
    expect(targetProgress(44, 40)).toBe('44 of 80 sacks')
    expect(targetProgress(0, 40)).toBe('0 of 40 sacks')
    expect(targetProgress(36, null)).toBeNull()
    // D62 A5: every pack counts; mixed packs say packs.
    expect(targetProgress(36, 40, null)).toBe('36 of 40 packs')
    expect(targetProgress(36, 40, 'box')).toBe('36 of 40 boxes')
  })
})

describe('previous lot (A3) and the lots a receipt can go into', () => {
  const lots = [
    { id: 1, status: 'available', received_date: '2026-10-01', pack_size: '55' },
    { id: 2, status: 'depleted', received_date: '2026-10-05', pack_size: '55' },
    { id: 3, status: 'expired', received_date: '2026-11-01', pack_size: '55' },
    { id: 4, status: 'available', received_date: '2026-11-02', pack_size: '50' },
    { id: 5, status: 'available', received_date: '2026-10-05', pack_size: '55.00' },
  ]
  it('most recently received, not expired, same pack size, then highest id', () => {
    expect(previousLot(lots, '55')?.id).toBe(5)
    expect(previousLot(lots, 50)?.id).toBe(4)
    expect(previousLot(lots, '25')).toBeNull()
    expect(receivableLots(lots, '55').map((l) => l.id)).toEqual([5, 2, 1])
  })

  it('labels a lot with its received date and on hand', () => {
    const lot = { id: 9, lot_number: 'W123', received_date: '2026-10-02', on_hand: '440', pack_name: 'sack', pack_size: '55', unit: 'lb' }
    expect(lotChoiceLabel(lot, 'packs')).toBe('Lot W123 · received 2026-10-02 · 8 sacks on hand')
    expect(lotChoiceLabel({ ...lot, lot_number: null }, 'lb')).toBe('Lot #9 · received 2026-10-02 · 440 lb on hand')
  })
})

describe('split rows (§3.3)', () => {
  it('"6 + 4 = 10 of 10", ok only when they add up and each is a sack or more', () => {
    expect(splitSummary([6, 4], 10)).toEqual({ text: '6 + 4 = 10 of 10', ok: true })
    expect(splitSummary([6, 3], 10)).toEqual({ text: '6 + 3 = 9 of 10', ok: false })
    expect(splitSummary([10, null], 10).ok).toBe(false)
    expect(splitSummary([10, 0], 10).ok).toBe(false)
  })
})

describe('lineForError', () => {
  const lines = [
    { id: 1, offer: { label: 'Rahr - Standard 2-row (milled)', product: { display_name: 'Rahr 2-Row' } } },
    { id: 2, offer: { label: 'Weyermann Pilsner', product: { display_name: 'Weyermann Pilsner' } } },
  ]
  it('the line whose product or offer the message names', () => {
    expect(lineForError(lines, 'Enter a lot number for Weyermann Pilsner')).toBe(2)
    expect(lineForError(lines, 'Enter whole sacks (0 or more) for Rahr - Standard 2-row (milled)')).toBe(1)
    expect(lineForError(lines, 'The received date can\'t be after today')).toBeNull()
  })

  it('a lot the message names, in any case; the only line when there is one', () => {
    expect(lineForError(lines, 'Lot W123 is expired; use a new lot number', { 1: [''], 2: ['w123'] })).toBe(2)
    expect(lineForError(lines, 'Lot W123 is expired; use a new lot number', { 1: ['W12'] })).toBeNull()
    expect(lineForError([lines[0]], 'Lot W123 is expired; use a new lot number')).toBe(1)
  })
})

describe('contract price changes (decision 23, A2, decision 40)', () => {
  const lines = [
    { product: 'Rahr 2-Row', price: '42', changed: true },
    { product: 'Weyermann Pilsner', price: '55.00', changed: false },
  ]
  it('from Jan 1 of a future year, today in this year, nothing in a year over; unchanged lines left out', () => {
    expect(contractPriceChanges(lines, 'BSG', 2027, '2026-11-18')).toEqual(['BSG Rahr 2-Row price becomes $42.00 from 2027-01-01'])
    expect(contractPriceChanges(lines, 'BSG', 2026, '2026-11-18')).toEqual(['BSG Rahr 2-Row price becomes $42.00 from 2026-11-18'])
    expect(contractPriceChanges(lines, 'BSG', 2025, '2026-11-18')).toEqual([])
  })
})

describe('to order with a chosen offer (§3.5)', () => {
  it('⌈minimum − on hand − on order⌉, never below 0', () => {
    expect(toOrder(3, 110, 55, 0)).toEqual({ onHandPacks: 2, onOrderPacks: 0, toOrder: 1 })
    expect(toOrder(3, 110, 50, 0)).toEqual({ onHandPacks: 2.2, onOrderPacks: 0, toOrder: 1 })
    expect(toOrder(3, 110, 55, 4 * 55)).toEqual({ onHandPacks: 2, onOrderPacks: 4, toOrder: 0 })
    // Item 20: 2 × 50 lb + 2 × 55 lb on order = 210 lb = 4.2 of a 50 lb offer's sacks.
    expect(toOrder(10, 0, 50, 210)).toEqual({ onHandPacks: 0, onOrderPacks: 4.2, toOrder: 6 })
    expect(toOrder(5, 0, 55, 0).toOrder).toBe(5)
    expect(toOrder(3, 165, 55, 0).toOrder).toBe(0)
  })
})

describe('packsFigure (amendment 17a: part sacks by weight)', () => {
  it('shows 2 decimals at most and whole numbers without them', () => {
    expect(packsFigure(10.5)).toBe('10.5')
    expect(packsFigure(6)).toBe('6')
    expect(packsFigure(4.4 + 0.2)).toBe('4.6')
    expect(packsFigure(1234.256)).toBe('1,234.26')
    expect(packsFigure(0)).toBe('0')
  })
})

describe('contract years (lead decisions 2, gap 3)', () => {
  it('lists every year with a contract, this year ±2 and the year shown, ascending', () => {
    expect(contractYears(2026, [], 2026)).toEqual([2024, 2025, 2026, 2027, 2028])
    expect(contractYears(2026, [2029, 2001, 2026], 2026)).toEqual([2001, 2024, 2025, 2026, 2027, 2028, 2029])
    expect(contractYears(2026, [], 2040)).toEqual([2024, 2025, 2026, 2027, 2028, 2040])
  })

  it("the Year box takes a whole year 2000–2100 and nothing else", () => {
    expect(contractYear(' 2029 ')).toBe(2029)
    expect(contractYear('2000')).toBe(2000)
    expect(contractYear('2100')).toBe(2100)
    for (const bad of ['1999', '2101', '20271', '2027.5', '27', '', 'abcd']) expect(contractYear(bad)).toBeNull()
  })
})
