import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SLOW_START_MS, loadingNotice, watchSlowStart } from './startup'

describe('watchSlowStart (D58 §3.10)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says start-up is slow after 4 seconds, not before', () => {
    const onSlow = vi.fn()
    watchSlowStart(onSlow)
    vi.advanceTimersByTime(SLOW_START_MS - 1)
    expect(onSlow).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onSlow).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(onSlow).toHaveBeenCalledTimes(1)
  })

  it('says nothing once /api/me has answered (cancelled)', () => {
    const onSlow = vi.fn()
    const cancel = watchSlowStart(onSlow)
    vi.advanceTimersByTime(3_000)
    cancel()
    vi.advanceTimersByTime(10_000)
    expect(onSlow).not.toHaveBeenCalled()
  })
})

describe('loadingNotice (D58 §3.10)', () => {
  it('keeps the unreachable banner first, then Still connecting', () => {
    expect(loadingNotice(false, false)).toBeNull()
    expect(loadingNotice(true, false)).toBe('slow')
    expect(loadingNotice(false, true)).toBe('unreachable')
    expect(loadingNotice(true, true)).toBe('unreachable')
  })
})
