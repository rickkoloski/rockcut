// D65 Stop 0 (D62 lead decisions 5, Add lot supplier): the supplier a new lot starts with.
import { describe, expect, it } from 'vitest'
import { defaultLotSupplier } from './purchasing'

const offer = (id: number, supplier: number, at: string) => ({ id, supplier_party_id: supplier, inserted_at: at })

describe('Add lot supplier: the default', () => {
  const offers = [offer(1, 10, '2026-01-01T00:00:00Z'), offer(2, 20, '2026-06-01T00:00:00Z'), offer(3, 30, '2026-03-01T00:00:00Z')]

  it("is the reorder offer's supplier", () => {
    expect(defaultLotSupplier(offers, 3)).toBe(30)
    expect(defaultLotSupplier(offers, 1)).toBe(10)
  })

  it("else the most recent offer's (with two offers, not empty)", () => {
    expect(defaultLotSupplier(offers, null)).toBe(20)
    expect(defaultLotSupplier(offers, undefined)).toBe(20)
    // A reorder offer that isn't among the active offers doesn't count.
    expect(defaultLotSupplier(offers, 99)).toBe(20)
    // Same time: the higher id is the newer.
    expect(defaultLotSupplier([offer(4, 40, '2026-01-01T00:00:00Z'), offer(5, 50, '2026-01-01T00:00:00Z')], null)).toBe(50)
  })

  it('is none with no offers (today\'s behavior)', () => {
    expect(defaultLotSupplier([], null)).toBeNull()
    expect(defaultLotSupplier([], 3)).toBeNull()
  })
})
