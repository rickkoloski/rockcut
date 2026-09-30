import type { AxiosError } from 'axios'

/**
 * Extract a human-readable message from an API error response.
 * Phoenix returns `{ errors: { field: ["msg", ...] } }` on 422.
 */
export default function parseApiError(err: unknown): string {
  const axErr = err as AxiosError<{ errors?: Record<string, string[]>; error?: string }>
  const errors = axErr?.response?.data?.errors
  if (errors) {
    return Object.entries(errors)
      .map(([field, msgs]) => `${field.replace(/_/g, ' ')}: ${msgs.join(', ')}`)
      .join('; ')
  }
  // Plain `{ error: "..." }` bodies (401/403/429).
  const single = axErr?.response?.data?.error
  if (typeof single === 'string' && single) return single
  return axErr?.message ?? 'An unexpected error occurred'
}
