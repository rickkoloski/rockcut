import parseApiError from './parseApiError'

/** D37: a staff-code 422 (`{errors: {code: [msg]}}`) reads as just `msg`. */
export function staffCodeError(err: unknown): string {
  const e = err as { response?: { data?: { errors?: { code?: string[] } } } }
  return e?.response?.data?.errors?.code?.[0] ?? parseApiError(err)
}

/**
 * D37: what a staff-code field keeps from typed or pasted text: digits only,
 * then the first 4. (No `maxLength` on the input: the browser would cut a
 * paste like " 1234" or "12-34" before the non-digits are dropped.)
 */
export const staffCodeDigits = (text: string) => text.replace(/\D/g, '').slice(0, 4)

/**
 * Masks a staff-code input with CSS, not type="password": Android keyboards
 * may ignore inputMode on password fields and show letters.
 */
export const maskedCodeSx = { '& input': { WebkitTextSecurity: 'disc' } } as const
