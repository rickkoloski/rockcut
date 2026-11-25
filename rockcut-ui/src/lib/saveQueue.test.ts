import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveQueue } from './saveQueue'

// D63 §4.4: two reorders on a slow network.

interface Call {
  ids: number[]
  version: string
  ok: (version: string) => void
  fail: (error: unknown) => void
}

describe('saveQueue', () => {
  let calls: Call[]
  let idle: boolean[]
  const make = () =>
    saveQueue<{ version: string }>(
      (ids, version) => new Promise((resolve, reject) => calls.push({ ids, version, ok: (v) => resolve({ version: v }), fail: reject })),
      (failed) => idle.push(failed),
    )
  const tick = () => vi.advanceTimersByTimeAsync(1)

  beforeEach(() => {
    vi.useFakeTimers()
    calls = []
    idle = []
  })
  afterEach(() => vi.useRealTimers())

  it('saves one at a time; the second sends the version the first answered with, and idle comes once, after both', async () => {
    const q = make()
    const first = q.push([2, 1, 3], 'v1')
    const second = q.push([2, 3, 1], 'v1')
    await tick()
    expect(calls.map((c) => c.version)).toEqual(['v1'])
    calls[0].ok('v2')
    await first
    await tick()
    expect(idle).toEqual([])
    expect(calls[1]).toMatchObject({ ids: [2, 3, 1], version: 'v2' })
    calls[1].ok('v3')
    await second
    await tick()
    expect(idle).toEqual([false])
  })

  it('a failure fails the ones waiting without sending them; the next push starts again from what is shown', async () => {
    const q = make()
    const first = q.push([2, 1], 'v1')
    const second = q.push([1, 2], 'v1')
    const heard = [first, second].map((p) => p.catch((e) => e))
    await tick()
    calls[0].fail('conflict')
    expect(await Promise.all(heard)).toEqual(['conflict', 'conflict'])
    await tick()
    expect(calls).toHaveLength(1)
    expect(idle).toEqual([true])

    const third = q.push([2, 1], 'v9')
    await tick()
    expect(calls[1]).toMatchObject({ version: 'v9' })
    calls[1].ok('v10')
    await third
    await tick()
    expect(idle).toEqual([true, false])
  })

  it('the first saved, the second refused: the first stands and idle says failed', async () => {
    const q = make()
    const first = q.push([2, 1], 'v1')
    const second = q.push([1, 2], 'v1').catch((e) => e)
    await tick()
    calls[0].ok('v2')
    expect(await first).toEqual({ version: 'v2' })
    await tick()
    calls[1].fail('offline')
    expect(await second).toBe('offline')
    await tick()
    expect(idle).toEqual([true])
  })

  it('a push as the last save answers uses its answer, not the version still shown', async () => {
    const q = make()
    const first = q.push([2, 1], 'v1')
    await tick()
    calls[0].ok('v2')
    await first
    void q.push([1, 2], 'v1')
    await tick()
    expect(calls[1].version).toBe('v2')
    expect(idle).toEqual([])
  })
})
