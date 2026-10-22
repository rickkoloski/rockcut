import { describe, expect, it } from 'vitest'
import { localInputToUtc, utcToLocalInput } from './datetime'

describe('localInputToUtc', () => {
  it('converts an ordinary MDT and MST time', () => {
    expect(localInputToUtc('2026-10-22T06:00')).toBe('2026-10-22T12:00:00.000Z')
    expect(localInputToUtc('2026-12-01T06:00')).toBe('2026-12-01T13:00:00.000Z')
  })

  // The offset has to be the one at the converted instant, not at the wall
  // time read as UTC: on a switch day those fall on different sides of 2am.
  it('keeps the typed time on the day DST ends (Nov 1 2026)', () => {
    for (const hhmm of ['00:30', '03:00', '06:00', '07:59', '08:00', '10:00', '23:00']) {
      expect(utcToLocalInput(localInputToUtc(`2026-11-01T${hhmm}`))).toBe(`2026-11-01T${hhmm}`)
    }
    expect(localInputToUtc('2026-11-01T06:00')).toBe('2026-11-01T13:00:00.000Z')
  })

  it('keeps the typed time on the day DST starts (Mar 14 2027)', () => {
    for (const hhmm of ['00:30', '01:59', '03:00', '06:00', '08:59', '09:00', '23:00']) {
      expect(utcToLocalInput(localInputToUtc(`2027-03-14T${hhmm}`))).toBe(`2027-03-14T${hhmm}`)
    }
    expect(localInputToUtc('2027-03-14T06:00')).toBe('2027-03-14T12:00:00.000Z')
  })
})
