import { describe, expect, it } from 'vitest'
import { formatDayKeyHeading, formatWeekRange, localInputToUtc, utcToLocalInput, yearSuffix } from './datetime'

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

// D44 DEV fix cycle 2, N2: the year on dates outside this (Colorado) year.
describe('the year on day headings and week labels', () => {
  const today = '2026-11-17'

  it('this year: no year', () => {
    expect(yearSuffix('2026-01-01', today)).toBe('')
    expect(formatDayKeyHeading('2026-11-24', today)).toBe('Tuesday, Nov 24')
    expect(formatWeekRange('2026-09-21', today)).toBe('Sep 21 – 27')
    expect(formatWeekRange('2026-09-28', today)).toBe('Sep 28 – Oct 4')
  })

  it('next year (and last): the year', () => {
    expect(formatDayKeyHeading('2027-01-05', today)).toBe('Tuesday, Jan 5, 2027')
    expect(formatDayKeyHeading('2025-12-31', today)).toBe('Wednesday, Dec 31, 2025')
    expect(formatWeekRange('2027-01-04', today)).toBe('Jan 4 – 10, 2027')
    expect(formatWeekRange('2027-03-29', today)).toBe('Mar 29 – Apr 4, 2027')
  })

  it('across New Year: both years', () => {
    expect(formatWeekRange('2026-12-28', today)).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(formatWeekRange('2026-12-28', '2027-01-02')).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(formatWeekRange('2025-12-29', today)).toBe('Dec 29, 2025 – Jan 4, 2026')
  })
})
