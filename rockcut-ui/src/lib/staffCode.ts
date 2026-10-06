import parseApiError from './parseApiError'

/** D37: a staff-code 422 (`{errors: {code: [msg]}}`) reads as just `msg`. */
export function staffCodeError(err: unknown): string {
  const e = err as { response?: { data?: { errors?: { code?: string[] } } } }
  return e?.response?.data?.errors?.code?.[0] ?? parseApiError(err)
}
