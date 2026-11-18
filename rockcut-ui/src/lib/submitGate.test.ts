import { describe, expect, it } from 'vitest'
import { SubmitGate } from './submitGate'

describe('SubmitGate (D60 gap 6)', () => {
  it('drops a second submit while the first is in flight, then takes the next one', async () => {
    const gate = new SubmitGate()
    let calls = 0
    let finish: () => void = () => {}
    const save = () => {
      calls += 1
      return new Promise<void>((resolve) => (finish = resolve))
    }
    const first = gate.run(save)
    const second = gate.run(save)
    expect(gate.inFlight).toBe(true)
    expect(await second).toBe(false)
    finish()
    expect(await first).toBe(true)
    expect(calls).toBe(1)
    expect(gate.inFlight).toBe(false)
    const third = gate.run(save)
    finish()
    expect(await third).toBe(true)
    expect(calls).toBe(2)
  })

  it('opens again after a save that fails', async () => {
    const gate = new SubmitGate()
    await expect(gate.run(() => Promise.reject(new Error('422')))).rejects.toThrow('422')
    expect(gate.inFlight).toBe(false)
    expect(await gate.run(() => undefined)).toBe(true)
  })
})
