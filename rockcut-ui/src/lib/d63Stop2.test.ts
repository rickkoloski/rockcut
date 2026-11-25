// D63 Stop 2 (§4.4): the use order on the screens' side.
import { describe, expect, it } from 'vitest'
import { cleanIngredientSettings, hideUsedUpLots } from './brewingUnits'
import { GRAIN_KEYS, inUseId, inUseOrder, lotChoice, oldestFirst, reorderError, splitUsedUp } from './inventory'

const lot = (id: number, use_position: number | null, received_date: string | null) => ({ id, use_position, received_date })
const ids = (lots: { id: number }[]) => lots.map((l) => l.id)

describe('in use order', () => {
  it('sorts by place, whatever the dates; a lot with none is last, oldest first', () => {
    const lots = [lot(1, 3, '2026-01-01'), lot(2, null, '2026-02-02'), lot(3, 1, '2026-11-01'), lot(4, null, '2026-02-01')]
    expect(ids([...lots].sort(inUseOrder))).toEqual([3, 1, 4, 2])
    expect(ids([...lots].sort(oldestFirst))).toEqual([1, 4, 2, 3])
  })

  it('only a hop reads and sorts so; grain, yeast and the rest keep Oldest first', () => {
    expect(lotChoice('hops')).toMatchObject({ label: 'In use order', sort: inUseOrder })
    expect(lotChoice('hops').helper).toBe("From this product's lots in use order, skipping expired lots")
    expect(lotChoice('hops').short).toBe("Short: off this product's lots in use order, skipping expired lots. Over: onto the newest lot that isn't expired.")
    for (const key of ['grains', 'yeast', 'fruits', 'consumables', null, undefined]) {
      expect(lotChoice(key)).toEqual({
        sort: oldestFirst,
        label: 'Oldest first',
        helper: 'From the oldest lots first, skipping expired lots',
        short: "Short: off the oldest lots that aren't expired. Over: onto the newest lot that isn't expired.",
      })
    }
  })
})

describe('a use list', () => {
  it('used-up lots apart, each in order; Expired with stock is ordered', () => {
    const lots = [
      { id: 1, on_hand: '0.00', status: 'depleted' },
      { id: 2, on_hand: '8.5', status: 'expired' },
      { id: 3, on_hand: '11', status: 'available' },
      { id: 4, on_hand: null, status: 'available' },
    ]
    const { stocked, usedUp } = splitUsedUp(lots)
    expect([ids(stocked), ids(usedUp)]).toEqual([[2, 3], [1, 4]])
    expect(inUseId([2, 3], stocked)).toBe(3)
    expect(inUseId([3, 2], stocked)).toBe(3)
    expect(inUseId([2], stocked)).toBeNull()
    expect(inUseId([], [])).toBeNull()
  })

  it("a list that changed says the API's sentence; anything else says it wasn't saved, and why", () => {
    const conflict = { response: { status: 409, data: { errors: { base: ['The use order changed.'] } } } }
    expect(reorderError(conflict)).toBe('The use order changed.')
    expect(reorderError(new Error('Network Error'))).toBe("The new order wasn't saved, so the old one is back: Network Error.")
    expect(reorderError({ response: { status: 422, data: { errors: { base: ['List every lot with stock'] } } } })).toBe(
      "The new order wasn't saved, so the old one is back: List every lot with stock.",
    )
  })

  it('every stock write refreshes it', () => expect(GRAIN_KEYS).toContainEqual(['hop_use_lists']))
})

describe('Hide used-up lots', () => {
  it('is on until turned off; a stored value that is not a boolean is dropped', () => {
    for (const stored of [undefined, null, {}, { hide_used_up_lots: 'no' }]) expect(hideUsedUpLots(stored)).toBe(true)
    expect(hideUsedUpLots({ hide_used_up_lots: false })).toBe(false)
    expect(cleanIngredientSettings({ quantity_display: 'lb', hide_used_up_lots: false })).toEqual({ quantity_display: 'lb', hide_used_up_lots: false })
    expect(cleanIngredientSettings({ hide_used_up_lots: 1 })).toEqual({})
  })
})
