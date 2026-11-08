/** D55 §2.5 (task 4981): what shows when the server's answer says nothing usable. */
export const SERVER_ERROR_MESSAGE = 'Something went wrong on the server. Please try again.'
const GENERAL_MESSAGE = 'An unexpected error occurred'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A field's messages: `["msg", ...]` or a lone string; anything else says nothing. */
function messages(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((m) => typeof m === 'string' && m).join(', ')
  return ''
}

/**
 * Extract a human-readable message from an API error response.
 * Phoenix returns `{ errors: { field: ["msg", ...] } }` on 422, and
 * `{ errors: { detail: "Bad Request" } }` from its own error pages.
 * Never throws, whatever the body (D55: a 500, HTML, empty).
 */
export default function parseApiError(err: unknown): string {
  const response = isRecord(err) && isRecord(err.response) ? err.response : undefined
  const status = typeof response?.status === 'number' ? response.status : 0
  const data = response?.data
  if (isRecord(data) && status < 500) {
    if (isRecord(data.errors)) {
      const parts = Object.entries(data.errors).flatMap(([field, msgs]) => {
        const text = messages(msgs)
        if (!text) return []
        return field === 'detail' ? [text] : [`${field.replace(/_/g, ' ')}: ${text}`]
      })
      if (parts.length) return parts.join('; ')
    }
    // Plain `{ error: "..." }` bodies (401/403/429).
    if (typeof data.error === 'string' && data.error) return data.error
  }
  if (status >= 500) return SERVER_ERROR_MESSAGE
  const message = isRecord(err) ? err.message : undefined
  return typeof message === 'string' && message ? message : GENERAL_MESSAGE
}
