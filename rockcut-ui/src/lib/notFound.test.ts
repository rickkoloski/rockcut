import { describe, expect, it } from 'vitest'
import { httpStatus, retryUnless404 } from './notFound'

// D55 lead decisions 6, gap 10: a detail page stops retrying on a 404, so it
// can say "not found" instead of spinning.
describe('notFound', () => {
  const err = (status?: number) => (status ? { response: { status } } : new Error('Network Error'))

  it('reads the status of an answered request, and nothing otherwise', () => {
    expect(httpStatus(err(404))).toBe(404)
    expect(httpStatus(err())).toBeUndefined()
    expect(httpStatus(null)).toBeUndefined()
  })

  it('never retries a 404', () => {
    expect(retryUnless404(0, err(404))).toBe(false)
  })

  it('retries anything else once', () => {
    for (const e of [err(500), err(503), err()]) {
      expect(retryUnless404(0, e)).toBe(true)
      expect(retryUnless404(1, e)).toBe(false)
    }
  })
})
