import axios from 'axios'
import { isDeviceToken, markUnpaired } from './device'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

// Attach bearer token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rockcut_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// D55 §2.1 (task 5120): one 401 doesn't prove the token ended — a proxy or
// deploy blip can answer 401 on one route. Ask GET /api/me once with the same
// token; only its 401 ends the session. A burst of 401s shares one check.
let tokenCheck: { token: string; ended: Promise<boolean> } | null = null

const ME_CHECK_TIMEOUT_MS = 10_000

async function askMe(token: string): Promise<boolean> {
  try {
    // fetch, not `api`: the check's own 401 mustn't come back through the interceptor.
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ME_CHECK_TIMEOUT_MS),
    })
    return res.status === 401
  } catch {
    // Network error or timeout: keep the token; the next request will try again.
    return false
  }
}

/** Resolves true when `token` really ended; the sign-out or unpairing is done by then. */
export function checkTokenEnded(token: string): Promise<boolean> {
  if (tokenCheck?.token === token) return tokenCheck.ended
  const ended = askMe(token).then((gone) => {
    tokenCheck = null
    // Signed out (or paired) in the meantime: that newer state stands.
    if (!gone || localStorage.getItem('rockcut_token') !== token) return gone
    if (isDeviceToken(token)) {
      // The tablet's own token was refused: revoked or deactivated (DEV G7).
      markUnpaired()
    } else {
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
    }
    window.location.reload()
    return true
  })
  tokenCheck = { token, ended }
  return ended
}

// A 401 for the current token: check it really ended (above), then the login
// page shows. A failed sign-in is also a 401 — skip it so the login form can
// show the error message.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isLogin = error.config?.method === 'post' && error.config?.url === '/api/session'
    // Only a 401 for the token in use now means "signed out". A request sent
    // with an older token, or with none, must not reset the session (D33).
    const sentWith = error.config?.headers?.Authorization
    const current = localStorage.getItem('rockcut_token')
    const forCurrentToken = !!current && sentWith === `Bearer ${current}`
    // The original request fails with its own error either way.
    if (error.response?.status === 401 && !isLogin && forCurrentToken) await checkTokenEnded(current)
    // D42 §2.1: the server wants a new password first (a tab left open, say):
    // useAuth shows "Set a new password" instead of an error.
    if (error.response?.status === 403 && error.response?.data?.error === 'password_reset_required' && forCurrentToken)
      window.dispatchEvent(new Event(PASSWORD_RESET_EVENT))
    return Promise.reject(error)
  }
)

/** D42: dispatched on `window` when the API answers 403 `password_reset_required`. */
export const PASSWORD_RESET_EVENT = 'rockcut:password-reset-required'

export default api

/**
 * Download a file from an authenticated GET (D37 CSV exports). A plain link
 * can't carry the bearer token, so fetch it as a Blob and save that.
 */
export async function download(path: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
