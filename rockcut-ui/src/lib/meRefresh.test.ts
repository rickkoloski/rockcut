import { describe, expect, it } from 'vitest'
import { boardKey, mergeRefresh, refreshDue, writeLog, REFRESH_GAP_MS, type Refreshed } from './meRefresh'

describe('the 60 s throttle (D56 §3.4)', () => {
  it('lets the first refresh go, then one a minute', () => {
    const t = 1_000_000
    expect(refreshDue(null, t)).toBe(true)
    expect(refreshDue(t, t + 1_000)).toBe(false)
    expect(refreshDue(t, t + REFRESH_GAP_MS - 1)).toBe(false)
    expect(refreshDue(t, t + REFRESH_GAP_MS)).toBe(true)
  })
})

const local: Refreshed = {
  colorMode: 'light',
  showPlannedBatches: true,
  boardSettings: { brewery: { hide_completed: true, first_day: 'today' } },
}
const server: Refreshed = {
  colorMode: 'dark',
  showPlannedBatches: false,
  boardSettings: { brewery: { hide_completed: false, first_day: 'monday' }, taproom: { hide_shifts: true } },
}

describe('merging what another device saved', () => {
  it('takes the server’s settings when nothing is being saved here', () => {
    const log = writeLog()
    expect(mergeRefresh(local, server, log.since(log.mark()))).toEqual(server)
  })

  it('keeps a setting whose PUT is still in flight', () => {
    const log = writeLog()
    const done = log.begin(boardKey('brewery', 'hide_completed'), 'show_planned_batches')
    const mark = log.mark()
    const merged = mergeRefresh(local, server, log.since(mark))
    expect(merged.boardSettings.brewery).toEqual({ hide_completed: true, first_day: 'monday' })
    expect(merged.showPlannedBatches).toBe(true)
    expect(merged.colorMode).toBe('dark')
    expect(merged.boardSettings.taproom).toEqual({ hide_shifts: true })
    done()
  })

  it('keeps one that started and finished while the read was out', () => {
    const log = writeLog()
    const mark = log.mark()
    log.begin('color_mode')()
    expect(mergeRefresh(local, server, log.since(mark)).colorMode).toBe('light')
  })

  it('takes the server’s once the PUT ended before the read was sent', () => {
    const log = writeLog()
    log.begin('color_mode')()
    expect(mergeRefresh(local, server, log.since(log.mark())).colorMode).toBe('dark')
  })

  it('keeps a failed PUT’s key only while it’s in flight', () => {
    const log = writeLog()
    const done = log.begin(boardKey('brewery', 'first_day'))
    expect(mergeRefresh(local, server, log.since(log.mark())).boardSettings.brewery.first_day).toBe('today')
    done()
    expect(mergeRefresh(local, server, log.since(log.mark())).boardSettings.brewery.first_day).toBe('monday')
  })

  it('takes the Gantt view from another browser, keeping one being saved here (decision 18)', () => {
    const here: Refreshed = { ...local, boardSettings: { production: { expanded: ['7'], label_by: { '7': 1 } } } }
    const there: Refreshed = { ...server, boardSettings: { production: { expanded: ['7', '9'], label_by: { '7': 2 } } } }
    const log = writeLog()
    expect(mergeRefresh(here, there, log.since(log.mark())).boardSettings.production).toEqual({ expanded: ['7', '9'], label_by: { '7': 2 } })
    const done = log.begin(boardKey('production', 'label_by'))
    expect(mergeRefresh(here, there, log.since(log.mark())).boardSettings.production).toEqual({ expanded: ['7', '9'], label_by: { '7': 1 } })
    done()
  })
})
