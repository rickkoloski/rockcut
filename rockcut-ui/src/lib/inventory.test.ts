import { describe, expect, it } from 'vitest'
import { lotDeleteMessage, movementKindLabel, oldestFirstOnHand } from './inventory'

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
    expect(oldestFirstOnHand({ on_hand_lb: '450', expired_lb: '200' }, 50, 'sacks')).toBe('On hand: 5 sacks · 4 sacks expired (pick that lot to use it)')
    expect(oldestFirstOnHand({ on_hand_lb: '485', expired_lb: '0' }, 55, 'sacks')).toBe('On hand: 8 sacks 45 lb')
    expect(oldestFirstOnHand({ on_hand_lb: '485', expired_lb: '0' }, 55, 'lb')).toBe('On hand: 485 lb')
  })
})
