// D56 §3.7 (4950): the schedule's Undo snackbar over dialogs. Ctrl/Cmd+Z
// runs the live Undo (A); with a dialog open the snackbar stays until its
// Undo runs out (B) and sits at the bottom, clear of the dialog's title (C).

/** The parts of a keydown the shortcut looks at. */
export interface UndoKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  target: EventTarget | null
}

/** Typing in a field keeps the field's own undo. */
export function inTextField(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null
  if (!el?.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  // Checkboxes, radios and buttons have no text to undo.
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((el.type ?? 'text').toLowerCase())
}

/** Ctrl+Z (Cmd+Z on a Mac), no Shift (that's redo) or Alt, outside a text field. */
export const isUndoShortcut = (e: UndoKey) =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !inTextField(e.target)

/**
 * How long the snackbar shows (ms; null: until its Undo runs out, which
 * closes it). A refused Undo stays while its token lasts; over a dialog an
 * Undo stays too; otherwise 6 seconds, as before.
 */
export function snackAutoHide(s: { token: string | null; expiresAt: number; refused?: boolean }, dialogOpen: boolean, now: number): number | null {
  if (s.refused) return Math.max(s.expiresAt - now, 0)
  if (dialogOpen && s.token) return null
  return 6000
}

/** "Ctrl+Z" / "⌘Z" on a device with a keyboard and a mouse; nothing on a touch screen. */
export function undoHint(finePointer: boolean, mac: boolean): string {
  if (!finePointer) return ''
  return mac ? '⌘Z' : 'Ctrl+Z'
}

/**
 * DEV gap 1: an open menu or popover kept above the snackbar. `rect` is the
 * paper's place on screen, `limit` the y it must end above (the snackbar's
 * top less a gap). Null when it already does; otherwise its new top (moved
 * up, not past `margin`, never down) and a max height that ends at `limit` (the list
 * scrolls).
 */
export function fitAbove(rect: { top: number; height: number }, limit: number, margin = 16): { top: number; maxHeight: number } | null {
  if (rect.top + rect.height <= limit) return null
  const top = Math.max(Math.min(margin, rect.top), Math.min(rect.top, limit - rect.height))
  return { top, maxHeight: Math.max(limit - top, 0) }
}
