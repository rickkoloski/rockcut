import { TOKEN_KEY, isDeviceToken, signOutOnServer } from './device'

// D54: a tablet that had someone signed in with "Sign in as me" when the
// release went out still has its own token set aside under these keys. Put
// it back before anything reads the session, so the tablet opens on its
// shared screen (S249), or, if that token was revoked meanwhile, on "This
// tablet was unpaired" from the first /api/me (task 4988, S251).
// Remove after D54 + one release.

const DEVICE_TOKEN_KEY = 'rockcut_device_token'
const PERSONAL_ACTIVITY_KEY = 'rockcut_personal_last_activity'

export function settleLeftoverTabletSession(): void {
  try {
    const device = localStorage.getItem(DEVICE_TOKEN_KEY)
    if (!device) return
    const personal = localStorage.getItem(TOKEN_KEY)
    // The release revoked it already; best effort, retried by flushSignOuts.
    if (personal && !isDeviceToken(personal)) void signOutOnServer(personal)
    if (isDeviceToken(device)) localStorage.setItem(TOKEN_KEY, device)
    else localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(DEVICE_TOKEN_KEY)
    localStorage.removeItem(PERSONAL_ACTIVITY_KEY)
    localStorage.removeItem('rockcut_email')
  } catch {
    // Storage unavailable: nothing was set aside.
  }
}

// Runs once at start-up: main.tsx imports this first, ahead of the auth store.
if (typeof localStorage !== 'undefined') settleLeftoverTabletSession()
