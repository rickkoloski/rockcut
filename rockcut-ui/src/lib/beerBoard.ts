import parseApiError from './parseApiError'
import { TZ } from './datetime'
import type { BeerBoardEntry } from './types'

// D37: Buy-a-Beer Board helpers shared by the board, its dialogs and History.

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Oct 5, 2026" in Colorado time. */
export const formatBoardDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '')

/** "Oct 5, 2026, 9:41 PM" in Colorado time. */
export const formatBoardDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))

/** The board's one search box: For or Bought by, case-insensitive substring. */
export function matchesSearch(entry: BeerBoardEntry, q: string): boolean {
  const term = q.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!term) return true
  return (
    entry.recipient_name.toLowerCase().includes(term) || entry.purchaser_name.toLowerCase().includes(term)
  )
}

const STAFF_CODE_ERRORS = ['staff_code_required', 'staff_code_invalid', 'staff_code_locked']

/**
 * A failed board write as the dialogs show it: staff-code problems go under
 * the code field; anything else is the dialog's alert.
 */
export function boardError(err: unknown): { staffCode?: string; message?: string } {
  const e = err as { response?: { data?: { error?: string; message?: string } } }
  const data = e?.response?.data
  if (data?.error && STAFF_CODE_ERRORS.includes(data.error)) return { staffCode: data.message ?? data.error }
  if (data?.message) return { message: data.message }
  return { message: parseApiError(err) }
}

/** Today in Colorado as YYYY-MM-DD, for download file names. */
export const boardFileDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
