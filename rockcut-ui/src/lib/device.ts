// Shared tablets (D33). A paired tablet signs in with a `dev_` token stored in
// the normal `rockcut_token` slot. When a staff member signs in personally on
// the tablet, the device token is set aside under DEVICE_TOKEN_KEY and put
// back when they sign out or after PERSONAL_IDLE_MS without activity.

export const TOKEN_KEY = 'rockcut_token'
export const DEVICE_TOKEN_KEY = 'rockcut_device_token'
/** Wall-clock time (ms) of the last activity during a personal sign-in on a tablet. */
export const PERSONAL_ACTIVITY_KEY = 'rockcut_personal_last_activity'

/** Set when a tablet's pairing ended (revoked, deactivated): the login screen opens on setup (DEV G7). */
export const UNPAIRED_KEY = 'rockcut_device_unpaired'

/** Idle time before a personal sign-in on a tablet returns to the device session (spec Q1: 5 minutes). */
export const PERSONAL_IDLE_MS = 5 * 60 * 1000

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The device token set aside during a personal sign-in, if any. */
export function asideDeviceToken(): string | null {
  return readStorage(DEVICE_TOKEN_KEY)
}

/** Move the current (device) token aside so a person can sign in. */
export function setDeviceTokenAside(): void {
  const token = readStorage(TOKEN_KEY)
  if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
}

/**
 * Drop the personal token and put the device token back. Returns false when
 * there was no device token to restore. Callers reload the page so no
 * personal data stays in memory.
 */
export function restoreDeviceToken(): boolean {
  const device = asideDeviceToken()
  if (!device) return false
  localStorage.setItem(TOKEN_KEY, device)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
  return true
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

/** How long ending a personal session waits for the server's revoke (D34 §3.3). */
export const REVOKE_TIMEOUT_MS = 3_000

/**
 * End the person's own session on the server before the tablet forgets it
 * (D34). The tablet waits at most REVOKE_TIMEOUT_MS; a sign-out that doesn't
 * get through is retried later (D36-H), and the server lets an unrevoked
 * tablet sign-in lapse after 15 idle minutes anyway. Plain fetch, so a 401
 * here can't trigger the app's sign-out handling.
 */
export async function revokePersonalToken(): Promise<void> {
  const token = readStorage(TOKEN_KEY)
  if (!token || isDeviceToken(token)) return
  // D36-H: if it can't get through, it's retried later (flushSignOuts); the
  // tablet doesn't wait longer than REVOKE_TIMEOUT_MS for it.
  await Promise.race([signOutOnServer(token), new Promise((done) => setTimeout(done, REVOKE_TIMEOUT_MS))])
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
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
  localStorage.removeItem('rockcut_email')
  localStorage.setItem(UNPAIRED_KEY, '1')
}

export function clearUnpaired(): void {
  localStorage.removeItem(UNPAIRED_KEY)
}

