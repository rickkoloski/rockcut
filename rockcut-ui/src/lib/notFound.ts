// D55 §2.6 / lead decisions 6 (gap 10): a detail page whose API row doesn't
// exist (an old bookmark, a deleted item, a bad link) says "not found"
// instead of spinning while react-query retries.

import parseApiError from './parseApiError'

/** The HTTP status of a failed request, if it got an answer. */
export const httpStatus = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } } | null)?.response?.status

/** Retry a detail query once, but not after a 404: that won't change. */
export const retryUnless404 = (count: number, err: unknown) => httpStatus(err) !== 404 && count < 1

/** D64 lead decisions 9 (gap 25): why a write was refused; `gone` when its row isn't there any more (404). */
export const goneOr = (err: unknown, gone: string) => (httpStatus(err) === 404 ? gone : parseApiError(err))
