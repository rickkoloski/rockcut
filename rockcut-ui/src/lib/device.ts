// Shared tablets (D33). A paired tablet signs in with a `dev_` token stored in
// the normal `rockcut_token` slot. It takes no personal sign-ins (D54): people
// use their own phone or computer.

export const TOKEN_KEY = 'rockcut_token'

/** Set when a tablet's pairing ended (revoked, deactivated): the login screen opens on setup (DEV G7). */
export const UNPAIRED_KEY = 'rockcut_device_unpaired'

/** D54: what the login form says on a paired tablet (the API's 403 says the same). */
export const SHARED_DEVICE_LOGIN_REFUSED = 'This device is already set as a shared device. Personal logins not accepted.'

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// ── Sign-outs that couldn't reach the server (D36-H, task 4051) ──────

/** Session tokens whose sign-out hasn't reached the server yet. */
export const PENDING_SIGNOUTS_KEY = 'rockcut_pending_signouts'

function pendingSignOuts(): string[] {
  try {
    const v = JSON.parse(readStorage(PENDING_SIGNOUTS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

function setPendingSignOuts(tokens: string[]): void {
  try {
    if (tokens.length) localStorage.setItem(PENDING_SIGNOUTS_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(PENDING_SIGNOUTS_KEY)
  } catch {
    // Storage unavailable: the server's own expiry still applies.
  }
}

/**
 * End `token`'s session on the server. Recorded first, so a sign-out that
 * fails (offline) or never completes (the tab closed) is retried by
 * `flushSignOuts` at the next start or reconnect. `keepalive` lets the request
 * outlive a page that closes right away. Resolves true once the server has it.
 */
export async function signOutOnServer(token: string): Promise<boolean> {
  setPendingSignOuts([...new Set([...pendingSignOuts(), token])])
  return sendSignOut(token)
}

async function sendSignOut(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/session`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    })
    // 401: already ended (revoked, expired or deactivated). Either way, done.
    if (res.ok || res.status === 401) {
      setPendingSignOuts(pendingSignOuts().filter((t) => t !== token))
      return true
    }
  } catch {
    // Offline: stays pending.
  }
  return false
}

/** Retry sign-outs that didn't reach the server. */
export async function flushSignOuts(): Promise<void> {
  for (const token of pendingSignOuts()) await sendSignOut(token)
}

/** True for a shared tablet's token (D33 tokens start with `dev_`). */
export function isDeviceToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith('dev_')
}

/**
 * Forget a tablet whose pairing ended and remember why, so the login screen
 * opens on "Set up as a shared device" with an explanation (DEV G7).
 */
export function markUnpaired(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('rockcut_email')
  localStorage.setItem(UNPAIRED_KEY, '1')
}

export function clearUnpaired(): void {
  localStorage.removeItem(UNPAIRED_KEY)
}

