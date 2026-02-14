import type { AxiosError } from 'axios'

/**
 * Extract a human-readable message from an API error response.
 * Phoenix returns `{ errors: { field: ["msg", ...] } }` on 422.
 */
export default function parseApiError(err: unknown): string {
  const axErr = err as AxiosError<{ errors?: Record<string, string[]> }>
  const errors = axErr?.response?.data?.errors
  if (errors) {
    return Object.entries(errors)
      .map(([field, msgs]) => `${field.replace(/_/g, ' ')}: ${msgs.join(', ')}`)
      .join('; ')
  }
  return axErr?.message ?? 'An unexpected error occurred'
}
