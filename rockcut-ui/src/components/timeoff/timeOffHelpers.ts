// D44: what the time off dialog, View Schedule's agenda and the Time off page share.
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import useAuth from '../../hooks/useAuth'
import parseApiError from '../../lib/parseApiError'
import { formatDayHeading, formatTime } from '../../lib/datetime'
import { canReviewTimeOff, isPastTimeOff } from '../../lib/timeoff'
import type { TimeOffRequest } from '../../lib/types'

/** The API's limit on the requester's and the reviewer's notes (DEV fix cycle 1, G2). */
export const NOTE_MAX = 2_000

/** The counter shows from here on (D44 DEV fix cycle 2, N1). */
const NOTE_COUNT_FROM = 1_800

/**
 * N1: a note field's counter, "1,950 / 2,000" from 1,800 characters on, and
 * "2,000 / 2,000 · the rest was cut" when a paste or typing hit the cap
 * (`maxLength` drops the rest without a word). Spread onto the TextField.
 */
export function useNoteLimit(value: string) {
  const [cut, setCut] = useState(false)
  // Clears when the text gets shorter. A paste sets it before its text
  // arrives, so it's the change in length that counts (adjusted while
  // rendering, not in an effect).
  const [length, setLength] = useState(value.length)
  if (value.length !== length) {
    setLength(value.length)
    if (value.length < length) setCut(false)
  }
  const room = (el: HTMLInputElement | HTMLTextAreaElement) => NOTE_MAX - el.value.length + Math.abs((el.selectionEnd ?? 0) - (el.selectionStart ?? 0))
  const count = `${value.length.toLocaleString('en-US')} / ${NOTE_MAX.toLocaleString('en-US')}`
  return {
    helperText: value.length < NOTE_COUNT_FROM ? undefined : cut && value.length >= NOTE_MAX ? `${count} · the rest was cut` : count,
    onPaste: (e: ClipboardEvent<HTMLDivElement>) => {
      const el = e.target as HTMLTextAreaElement
      if (e.clipboardData.getData('text').length > room(el)) setCut(true)
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      const typing = (e.key.length === 1 || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey
      if (typing && room(e.target as HTMLTextAreaElement) <= 0) setCut(true)
    },
  }
}

/** A long unbroken note (a pasted URL) wraps instead of widening the page (G2). */
export const WRAP = { overflowWrap: 'anywhere', minWidth: 0 } as const

/** The API's own words for a refusal (403 / 422), else the usual parse. */
export function timeOffError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

/** After any create, review or cancel: every time off list, and the badge. */
export function useTimeOffRefresh() {
  const qc = useQueryClient()
  const refreshCapabilities = useAuth((s) => s.refreshCapabilities)
  return () => {
    void qc.invalidateQueries({ queryKey: ['time_off'] })
    void refreshCapabilities()
  }
}

/** Who may review (the Time off page's rule, `canReviewTimeOff`) for the signed-in person. */
export function useCanReviewTimeOff() {
  const { user, capabilities } = useAuth()
  const who = { isOwner: !!user?.is_owner, managesDepartments: capabilities?.manages_departments ?? [] }
  return (r: TimeOffRequest) => user?.kind !== 'device' && canReviewTimeOff(r, who)
}

/** "Pending", "Approved", …; a past pending request reads "Not reviewed" (§2.4). */
export function timeOffStatusLabel(r: TimeOffRequest): string {
  if (r.status === 'pending' && isPastTimeOff(r)) return 'Not reviewed'
  return r.status.charAt(0).toUpperCase() + r.status.slice(1)
}

export const formatWhen = (iso: string) => `${formatDayHeading(iso)}, ${formatTime(iso)}`
export const personName = (u: { name: string | null; email: string } | null | undefined) => u?.name || u?.email || 'Someone'

/** "Approved by Casey Tap · Mon, Nov 16, 2:05 PM" for a decided request. */
export function reviewedLine(r: TimeOffRequest): string | null {
  if ((r.status !== 'approved' && r.status !== 'denied') || !r.reviewed_by) return null
  const verb = r.status === 'approved' ? 'Approved' : 'Denied'
  return `${verb} by ${personName(r.reviewed_by)}${r.reviewed_at ? ` · ${formatWhen(r.reviewed_at)}` : ''}`
}
