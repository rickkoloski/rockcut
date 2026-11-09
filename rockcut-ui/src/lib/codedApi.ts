// Kept apart from lib/production.ts, which the Playwright specs import (it
// mustn't load the axios client).

import api from './api'
import { deleteWithCode, withCode } from './acting'

/**
 * D50: the API for one schedule write, with the brewhouse device's staff code
 * in the JSON body (never the URL; D40 DEV qa gap 1). People get `code`
 * undefined and send none. Writes get one from `useActing.run` (the schedule's
 * `flows.write`, the out-of-service dialog).
 */
export const codedApi = (code: string | undefined) => ({
  post: <T = unknown>(url: string, body?: object) => api.post<T>(url, withCode(body ?? {}, code)),
  patch: <T = unknown>(url: string, body?: object) => api.patch<T>(url, withCode(body ?? {}, code)),
  delete: <T = unknown>(url: string) => api.delete<T>(url, deleteWithCode(undefined, code)),
})
export type CodedApi = ReturnType<typeof codedApi>
