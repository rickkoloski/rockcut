// D45: "New version available" (spec §3.1). The timings and the shared
// tablet's idle rule, kept apart from the component so they can be tested.

/** An open app asks the browser for a new build this often (Q2: once a day), and whenever it comes back into view. */
export const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000

/** A shared tablet idle on its shared screen reloads this long after a new build is found. */
export const TABLET_RELOAD_DELAY_MS = 10 * 1000

/** While someone is using the tablet, it looks again this often. */
export const TABLET_RECHECK_MS = 30 * 1000

export interface TabletState {
  /** The session is a shared tablet's own (not a person's). */
  isDevice: boolean
  /** "Sign in as me": a person's session, or its sign-in form, with the tablet's token set aside. */
  personalSession: boolean
  /** An "Acting as" window, or the staff-code dialog asking for a code. */
  acting: boolean
  /** A dialog, menu or drawer is open. */
  dialogOpen: boolean
  /** Text typed into a field that has focus (a message being written). */
  typing: boolean
}

/** Q1: a shared tablet reloads by itself only when nobody is using it. */
export const tabletMayReload = (s: TabletState) => s.isDevice && !s.personalSession && !s.acting && !s.dialogOpen && !s.typing

/** An open MUI modal (Dialog, Menu, Drawer, bottom sheet); closed kept-mounted ones are hidden. */
export function dialogOpen(doc: Document = document): boolean {
  return !!doc.querySelector('.MuiModal-root:not(.MuiModal-hidden), [role="dialog"]:not([aria-hidden="true"])')
}

/** A focused text field with something typed in it. */
export function typing(doc: Document = document): boolean {
  const el = doc.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim() !== ''
  return el instanceof HTMLElement && el.isContentEditable && (el.textContent ?? '').trim() !== ''
}
