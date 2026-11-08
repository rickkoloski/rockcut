import { describe, expect, it } from 'vitest'
import parseApiError, { SERVER_ERROR_MESSAGE } from './parseApiError'

// D55 §2.5 (task 4981): any error body gives a message; nothing throws.
const fail = (status: number, data: unknown, message = `Request failed with status code ${status}`) => ({
  message,
  response: { status, data },
})

describe('parseApiError', () => {
  it('422 field errors, as before', () => {
    expect(parseApiError(fail(422, { errors: { sort_order: ['is invalid'], name: ["can't be blank", 'too short'] } }))).toBe(
      "sort order: is invalid; name: can't be blank, too short",
    )
  })

  it('a plain { error } body, as before', () => {
    expect(parseApiError(fail(403, { error: 'Forbidden' }))).toBe('Forbidden')
  })

  it("Phoenix's 500 page ({ errors: { detail } }) gives the general server message", () => {
    expect(parseApiError(fail(500, { errors: { detail: 'Internal Server Error' } }))).toBe(SERVER_ERROR_MESSAGE)
  })

  it("Phoenix's 400 page shows its detail without a field name", () => {
    expect(parseApiError(fail(400, { errors: { detail: 'Bad Request' } }))).toBe('Bad Request')
  })

  for (const [label, data] of [
    ['an HTML page', '<html><body>502 Bad Gateway</body></html>'],
    ['an empty body', ''],
    ['null', null],
    ['an array', ['x']],
  ] as const) {
    it(`a 5xx with ${label} gives the general server message`, () => {
      expect(parseApiError(fail(502, data))).toBe(SERVER_ERROR_MESSAGE)
    })
  }

  it('odd shapes inside errors fall back instead of throwing', () => {
    expect(parseApiError(fail(422, { errors: { detail: { nested: true }, x: [null, 3] } }))).toBe(
      'Request failed with status code 422',
    )
    expect(parseApiError(fail(422, { errors: 'nope' }))).toBe('Request failed with status code 422')
    expect(parseApiError(fail(422, { errors: { name: 'is taken' } }))).toBe('name: is taken')
  })

  it('no response at all (offline) gives the error message', () => {
    expect(parseApiError({ message: 'Network Error' })).toBe('Network Error')
  })

  for (const err of [undefined, null, 'boom', 42, {}]) {
    it(`a non-error value (${JSON.stringify(err)}) gives a general message`, () => {
      expect(parseApiError(err)).toBe('An unexpected error occurred')
    })
  }
})
