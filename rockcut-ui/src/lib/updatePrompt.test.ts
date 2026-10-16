import { describe, expect, it } from 'vitest'
import { TABLET_RECHECK_MS, TABLET_RELOAD_DELAY_MS, UPDATE_CHECK_MS, tabletMayReload, type TabletState } from './updatePrompt'

// D45 Q1: a shared tablet reloads into a new build by itself only when idle
// on its shared screen; anyone using it gets the prompt instead.
describe('the shared tablet idle rule', () => {
  const idle: TabletState = { isDevice: true, personalSession: false, acting: false, dialogOpen: false, typing: false }

  it('reloads a tablet idle on its shared screen', () => expect(tabletMayReload(idle)).toBe(true))

  it.each([
    ['a person (not a tablet)', { isDevice: false }],
    ['"Sign in as me"', { personalSession: true }],
    ['an "Acting as" window or the staff-code dialog', { acting: true }],
    ['an open dialog or menu', { dialogOpen: true }],
    ['a message being typed', { typing: true }],
  ] as [string, Partial<TabletState>][])('waits with %s', (_, blocker) => expect(tabletMayReload({ ...idle, ...blocker })).toBe(false))
})

describe('the timings', () => {
  it('checks once a day (Q2)', () => expect(UPDATE_CHECK_MS).toBe(86_400_000))
  it('reloads an idle tablet after 10 s, and looks again every 30 s', () => {
    expect(TABLET_RELOAD_DELAY_MS).toBe(10_000)
    expect(TABLET_RECHECK_MS).toBe(30_000)
  })
})
