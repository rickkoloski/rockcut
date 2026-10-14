import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// D40: the tablet's acting flow (useActing), with the signed-in account faked.
const auth = vi.hoisted(() => {
  let state = { user: { id: 99, kind: 'device' } as { id: number; kind: string } | null }
  const listeners: ((s: typeof state, prev: typeof state) => void)[] = []
  return {
    getState: () => state,
    subscribe: (fn: (s: typeof state, prev: typeof state) => void) => {
      listeners.push(fn)
      return () => {}
    },
    set(next: typeof state) {
      const prev = state
      state = next
      listeners.forEach((fn) => fn(state, prev))
    },
  }
})
vi.mock('./useAuth', () => ({ default: auth }))

import useActing from './useActing'
import { ACTING_IDLE_MS, ActingCancelled } from '../lib/acting'

const ok = (name = 'Jake Brewer') => ({ data: { data: {}, recorded_as: name } })
const refused = (error: string) => ({ response: { status: 422, data: { error, message: `msg ${error}` } } })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useActing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    auth.set({ user: { id: 99, kind: 'device' } })
    useActing.setState({ session: null, asking: null, submitting: false, waiting: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('people write with no code and are never asked', async () => {
    auth.set({ user: { id: 1, kind: 'person' } })
    const write = vi.fn(async (code?: string) => code)
    await expect(useActing.getState().run(write)).resolves.toBeUndefined()
    expect(useActing.getState().asking).toBeNull()
  })

  it('S9g/S43: the first write asks; the code is then remembered and sent with the next', async () => {
    const codes: (string | undefined)[] = []
    const write = vi.fn(async (code?: string) => {
      codes.push(code)
      return ok()
    })
    const first = useActing.getState().run(write)
    expect(write).not.toHaveBeenCalled()
    expect(useActing.getState().asking).toMatchObject({ error: null })

    await useActing.getState().submit('1111')
    await first
    expect(useActing.getState().asking).toBeNull()
    expect(useActing.getState().session).toMatchObject({ code: '1111', name: 'Jake Brewer' })

    await useActing.getState().run(write)
    expect(codes).toEqual(['1111', '1111'])
  })

  it('S45/S46: a refused code keeps the dialog open with D37’s message; nothing is remembered', async () => {
    const write = vi.fn(async (code?: string) => {
      if (code !== '1111') throw refused('staff_code_invalid')
      return ok()
    })
    const p = useActing.getState().run(write)
    await useActing.getState().submit('2222')
    expect(useActing.getState().asking).toMatchObject({ error: 'msg staff_code_invalid' })
    expect(useActing.getState().session).toBeNull()
    await useActing.getState().submit('1111')
    await expect(p).resolves.toEqual(ok())
  })

  it('a write refused for its remembered code forgets it and asks again', async () => {
    useActing.setState({ session: { code: '1111', name: 'Jake', lastActivity: Date.now() } })
    let calls = 0
    const write = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw refused('staff_code_invalid')
      return ok('Pat')
    })
    const p = useActing.getState().run(write)
    await flush()
    expect(useActing.getState().session).toBeNull()
    expect(useActing.getState().asking).toMatchObject({ error: 'msg staff_code_invalid' })
    await useActing.getState().submit('3333')
    await p
    expect(useActing.getState().session?.name).toBe('Pat')
  })

  it('S44: after 5 idle minutes the next write asks again', async () => {
    const write = vi.fn(async () => ok())
    const p = useActing.getState().run(write)
    await useActing.getState().submit('1111')
    await p
    vi.setSystemTime(Date.now() + ACTING_IDLE_MS)
    void useActing.getState().run(write)
    expect(useActing.getState().asking).toMatchObject({ error: null })
    expect(useActing.getState().session).toBeNull()
  })

  it('activity keeps it; Done ends it', async () => {
    const write = vi.fn(async () => ok())
    const p = useActing.getState().run(write)
    await useActing.getState().submit('1111')
    await p
    vi.setSystemTime(Date.now() + 4 * 60_000)
    useActing.getState().activity()
    vi.setSystemTime(Date.now() + 4 * 60_000)
    useActing.getState().expire()
    expect(useActing.getState().session).not.toBeNull()
    useActing.getState().done()
    expect(useActing.getState().session).toBeNull()
  })

  it('Cancel rejects every waiting write with ActingCancelled; none ran', async () => {
    const write = vi.fn(async () => ok())
    const a = useActing.getState().run(write)
    const b = useActing.getState().run(write)
    useActing.getState().cancel()
    await expect(a).rejects.toBeInstanceOf(ActingCancelled)
    await expect(b).rejects.toBeInstanceOf(ActingCancelled)
    expect(write).not.toHaveBeenCalled()
  })

  it('writes queued behind the dialog go through with the code once it’s right', async () => {
    const codes: (string | undefined)[] = []
    const write = vi.fn(async (code?: string) => {
      codes.push(code)
      return ok()
    })
    const a = useActing.getState().run(write)
    const b = useActing.getState().run(write)
    await useActing.getState().submit('1111')
    await Promise.all([a, b])
    expect(codes).toEqual(['1111', '1111'])
  })

  it('another account signing in forgets the code', () => {
    useActing.setState({ session: { code: '1111', name: 'Jake', lastActivity: Date.now() } })
    auth.set({ user: { id: 5, kind: 'person' } })
    expect(useActing.getState().session).toBeNull()
  })
})
