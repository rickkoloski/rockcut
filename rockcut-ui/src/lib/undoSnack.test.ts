import { describe, expect, it } from 'vitest'
import { fitAbove, inTextField, isUndoShortcut, snackAutoHide, undoHint, type UndoKey } from './undoSnack'

const key = (k: Partial<UndoKey>): UndoKey => ({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null, ...k })
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget

describe('Ctrl/Cmd+Z (D56 §3.7 A)', () => {
  it('is Ctrl+Z or Cmd+Z, not redo or Alt', () => {
    expect(isUndoShortcut(key({}))).toBe(true)
    expect(isUndoShortcut(key({ ctrlKey: false, metaKey: true }))).toBe(true)
    expect(isUndoShortcut(key({ key: 'Z' }))).toBe(true)
    expect(isUndoShortcut(key({ ctrlKey: false }))).toBe(false)
    expect(isUndoShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isUndoShortcut(key({ altKey: true }))).toBe(false)
    expect(isUndoShortcut(key({ key: 'y' }))).toBe(false)
  })

  it('leaves a text field its own undo, but works from a button or a dialog', () => {
    expect(isUndoShortcut(key({ target: el('INPUT', { type: 'text' }) }))).toBe(false)
    expect(isUndoShortcut(key({ target: el('INPUT', { type: 'date' }) }))).toBe(false)
    expect(isUndoShortcut(key({ target: el('TEXTAREA') }))).toBe(false)
    expect(isUndoShortcut(key({ target: el('DIV', { isContentEditable: true }) }))).toBe(false)
    expect(isUndoShortcut(key({ target: el('INPUT', { type: 'checkbox' }) }))).toBe(true)
    expect(isUndoShortcut(key({ target: el('BUTTON') }))).toBe(true)
    expect(isUndoShortcut(key({ target: el('DIV') }))).toBe(true)
    expect(inTextField(null)).toBe(false)
  })
})

describe('how long the snackbar stays (B)', () => {
  const now = 1_000_000
  const undo = { token: 't', expiresAt: now + 90_000 }

  it('stays until its Undo runs out while a dialog is open', () => {
    expect(snackAutoHide(undo, true, now)).toBeNull()
  })

  it('hides after 6 seconds with no dialog, or with nothing to undo', () => {
    expect(snackAutoHide(undo, false, now)).toBe(6000)
    expect(snackAutoHide({ token: null, expiresAt: now + 90_000 }, true, now)).toBe(6000)
  })

  it('keeps a refused Undo while its token lasts (D49 BB1)', () => {
    expect(snackAutoHide({ ...undo, refused: true }, false, now)).toBe(90_000)
    expect(snackAutoHide({ ...undo, refused: true, expiresAt: now - 1 }, true, now)).toBe(0)
  })
})

describe('the hint', () => {
  it('names the shortcut only with a mouse', () => {
    expect(undoHint(true, false)).toBe('Ctrl+Z')
    expect(undoHint(true, true)).toBe('⌘Z')
    expect(undoHint(false, false)).toBe('')
  })
})

describe('a menu over the snackbar (DEV gap 1)', () => {
  it('leaves one that ends above it', () => {
    expect(fitAbove({ top: 100, height: 300 }, 600)).toBeNull()
    expect(fitAbove({ top: 300, height: 300 }, 600)).toBeNull()
  })

  it('moves one up that would reach under it, keeping its height when there is room', () => {
    expect(fitAbove({ top: 400, height: 300 }, 600)).toEqual({ top: 300, maxHeight: 300 })
  })

  it('stops at the margin and shortens it (the list scrolls)', () => {
    expect(fitAbove({ top: 200, height: 700 }, 600)).toEqual({ top: 16, maxHeight: 584 })
    expect(fitAbove({ top: 10, height: 700 }, 600, 16)).toEqual({ top: 10, maxHeight: 590 })
  })
})
