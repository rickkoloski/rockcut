import { describe, expect, it } from 'vitest'
import { LATER_MOVEMENTS, lotDeleteBlocked, lotDeleteMessage, movementKindLabel, oldestFirstOnHand, recipeLotChoices } from './inventory'

describe('inventory messages (D60 lead decisions 2)', () => {
  const lot = { id: 136, lot_number: 'H-D', sack_size_lb: '50' }
  const received = { id: 1, kind: 'received' as const, quantity_lb: '200' }

  it('gap 9: the lot delete confirm names the stock going with it', () => {
    expect(lotDeleteMessage(lot, [received], 'sacks')).toBe('Delete lot H-D? Its Received 4 sacks (200 lb) goes too.')
    expect(lotDeleteMessage(lot, [received], 'lb')).toBe('Delete lot H-D? Its Received 200 lb goes too.')
    expect(lotDeleteMessage({ ...lot, lot_number: null }, [{ ...received, kind: 'opening', quantity_lb: '30' }], 'sacks')).toBe(
      'Delete lot #136? Its Opening amount 30 lb goes too.',
    )
    expect(lotDeleteMessage(lot, [], 'sacks')).toBe('Delete lot H-D?')
  })

  it('gap 11: a 0 lb count reads "Counted, no change"', () => {
    expect(movementKindLabel({ kind: 'count', quantity_lb: '0' })).toBe('Counted, no change')
    expect(movementKindLabel({ kind: 'count', quantity_lb: '-5' })).toBe('Count adjustment')
    expect(movementKindLabel({ kind: 'used', quantity_lb: '-5' })).toBe('Used in brewing')
  })

  it("gap 1: Oldest first's on-hand is the stock that isn't expired, the expired noted", () => {
    expect(oldestFirstOnHand({ on_hand_lb: '450', expired_lb: '200' }, 50, 'sacks')).toBe('On hand: 5 sacks usable · 4 sacks expired (pick that lot to use it)')
    expect(oldestFirstOnHand({ on_hand_lb: '693', expired_lb: '43' }, 55, 'lb')).toBe('On hand: 650 lb usable · 43 lb expired (pick that lot to use it)')
    expect(oldestFirstOnHand({ on_hand_lb: '485', expired_lb: '0' }, 55, 'sacks')).toBe('On hand: 8 sacks 45 lb')
    expect(oldestFirstOnHand({ on_hand_lb: '485', expired_lb: '0' }, 55, 'lb')).toBe('On hand: 485 lb')
  })
})

describe('the lot dialog\'s Delete (lead decisions 3 gap 15, lead decisions 4)', () => {
  const first = { id: 1 }
  const later = { id: 2 }
  const recipe = "A recipe uses this lot, so it can't be deleted"

  it('is disabled by a later movement in the dialog\'s movements even before the lot refetches', () => {
    expect(lotDeleteBlocked({ delete_blocked: null }, [first, later])).toBe(LATER_MOVEMENTS)
    expect(lotDeleteBlocked({}, [first, later])).toBe(LATER_MOVEMENTS)
  })

  it("is disabled by the lot's own reason even when its movements haven't caught up", () => {
    expect(lotDeleteBlocked({ delete_blocked: LATER_MOVEMENTS }, [first])).toBe(LATER_MOVEMENTS)
    expect(lotDeleteBlocked({ delete_blocked: recipe }, [first, later])).toBe(recipe)
  })

  it('is enabled with only the first movement (or none) and no reason', () => {
    expect(lotDeleteBlocked({ delete_blocked: null }, [first])).toBeNull()
    expect(lotDeleteBlocked({ delete_blocked: null }, [])).toBeNull()
  })
})

describe('recipeLotChoices (D60 gap 8, D61 carry-over 5)', () => {
  const lots = [
    { id: 1, status: 'available' },
    { id: 2, status: 'depleted' },
    { id: 3, status: 'expired' },
  ] as const
  it('leaves out depleted and expired lots', () => {
    expect(recipeLotChoices([...lots]).map((l) => l.id)).toEqual([1])
    expect(recipeLotChoices([...lots], null).map((l) => l.id)).toEqual([1])
  })
  it("keeps the lot the line already uses, expired or depleted", () => {
    expect(recipeLotChoices([...lots], 3).map((l) => l.id)).toEqual([1, 3])
    expect(recipeLotChoices([...lots], 2).map((l) => l.id)).toEqual([1, 2])
  })
})
