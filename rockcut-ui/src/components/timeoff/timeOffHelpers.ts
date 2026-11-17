// D44: what the time off dialog, View Schedule's agenda and the Time off page share.
import { useQueryClient } from '@tanstack/react-query'
import useAuth from '../../hooks/useAuth'
import parseApiError from '../../lib/parseApiError'
import { formatDayHeading, formatTime } from '../../lib/datetime'
import { canReviewTimeOff, isPastTimeOff } from '../../lib/timeoff'
import type { TimeOffRequest } from '../../lib/types'

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
