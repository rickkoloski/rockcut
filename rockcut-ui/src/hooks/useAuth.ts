import { create } from 'zustand'
import api from '../lib/api'
import type { Me, User, Capabilities } from '../lib/types'
import {
  TOKEN_KEY,
  asideDeviceToken,
  clearUnpaired,
  isDeviceToken,
  markUnpaired,
  restoreDeviceToken,
  revokePersonalToken,
  setDeviceTokenAside,
} from '../lib/device'

interface AuthState {
  token: string | null
  user: User | null
  capabilities: Capabilities | null
  sharedDevices: boolean
  isAuthenticated: boolean
  bootstrapped: boolean
  isLoading: boolean
  error: string | null
  /** /api/me failed on the network or with a 5xx: the token is kept and loadMe is retried (DEV pass 1 G1). */
  unreachable: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
  // D33 — shared tablets
  pairDevice: (code: string, name: string) => Promise<void>
  signOutDevice: () => Promise<void>
  startPersonalSignIn: () => void
  endPersonalSession: () => Promise<void>
}

/** True when a request failed without the server answering, or with a 5xx. */
function isTransient(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === undefined || status >= 500
}

// One /api/me at a time per token, so the retries can't pile up.
let loading: { token: string; promise: Promise<void> } | null = null

function errorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err
    ? (err as { response: { data: { error?: string } } }).response?.data?.error || fallback
    : fallback
}

const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  capabilities: null,
  sharedDevices: false,
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  bootstrapped: false,
  isLoading: false,
  error: null,
  unreachable: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      // D34: "Sign in as me" on a paired tablet says so, for the short tablet lifetime.
      const device = asideDeviceToken()
      const { data } = await api.post<{ token: string }>(
        '/api/session',
        { email, password },
        device ? { headers: { 'X-Rockcut-Device': device } } : undefined
      )
      localStorage.setItem(TOKEN_KEY, data.token)
      set({ token: data.token, isAuthenticated: true })
      // loadMe sets bootstrapped, or leaves it unset to retry if the server can't be reached.
      await get().loadMe()
      set({ isLoading: false })
    } catch (err: unknown) {
      set({ error: errorMessage(err, 'Login failed'), isLoading: false })
    }
  },

  logout: () => {
    // A person signed in on a shared tablet goes back to the tablet's session.
    if (asideDeviceToken()) {
      void get().endPersonalSession()
      return
    }
    const { token } = get()
    // DEV G4: a person's Logout never unpairs a tablet. If storage holds a
    // tablet token (another tab already ended this person's session), re-sync.
    if (isDeviceToken(localStorage.getItem(TOKEN_KEY)) || isDeviceToken(token)) {
      window.location.assign('/')
      return
    }
    if (token) {
      // D34: the server revokes this session. Pass the token explicitly: the
      // request interceptor runs after the removeItem below, so it would send none.
      api.delete('/api/session', { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false })
  },

  loadMe: () => {
    const { token } = get()
    if (!token) {
      set({ bootstrapped: true, unreachable: false })
      return Promise.resolve()
    }
    if (loading?.token === token) return loading.promise
    const promise = (async () => {
      try {
        const { data } = await api.get<Me>('/api/me')
        // The token changed while this was in flight (e.g. "Sign in as me" set a
        // tablet's token aside): this answer is for a session that's gone (D33).
        if (localStorage.getItem(TOKEN_KEY) !== token) return
        set({
          user: data.user,
          capabilities: data.capabilities,
          sharedDevices: !!data.shared_devices,
          isAuthenticated: true,
          bootstrapped: true,
          unreachable: false,
        })
      } catch (err) {
        if (localStorage.getItem(TOKEN_KEY) !== token) return
        // DEV pass 1 G1: offline or a server error says nothing about the token.
        // Keep it (on a tablet it may be the pairing itself) and retry; App
        // shows "Can't reach the server". Only a 401 or other refusal signs out
        // (the axios interceptor handles a 401).
        if (isTransient(err)) {
          set({ bootstrapped: false, unreachable: true })
          return
        }
        localStorage.removeItem(TOKEN_KEY)
        set({
          token: null,
          user: null,
          capabilities: null,
          sharedDevices: false,
          isAuthenticated: false,
          bootstrapped: true,
          unreachable: false,
        })
      } finally {
        if (loading?.token === token) loading = null
      }
    })()
    loading = { token, promise }
    return promise
  },

  // Exchange a pairing code for this tablet's token (D33 §3.2).
  pairDevice: async (code: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<{ token: string }>('/api/device_tokens', { code, name })
      localStorage.setItem(TOKEN_KEY, data.token)
      clearUnpaired()
      set({ token: data.token, isAuthenticated: true })
      // loadMe sets bootstrapped, or leaves it unset to retry if the server can't be reached.
      await get().loadMe()
      set({ isLoading: false })
    } catch (err: unknown) {
      set({ error: errorMessage(err, 'Could not set up this tablet'), isLoading: false })
    }
  },

  // Signing out a tablet revokes its token; it needs a new code afterwards.
  // DEV G4: only once the server has revoked it. On any failure the error is
  // rethrown and the tablet keeps its token, so the user can retry. (A 401
  // means it was already revoked: the interceptor shows the setup screen.)
  signOutDevice: async () => {
    await api.delete('/api/session')
    markUnpaired()
    window.location.assign('/')
  },

  // "Sign in as me" on a tablet: keep the device token aside and show the login form.
  startPersonalSignIn: () => {
    setDeviceTokenAside()
    set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false, error: null })
  },

  // Back to the tablet's session: revoke the personal token on the server
  // (D34; best effort), restore the device token and reload so nothing
  // personal stays in memory. Sign out and the idle return both come here.
  endPersonalSession: async () => {
    await revokePersonalToken()
    if (restoreDeviceToken()) window.location.assign('/')
  },
}))

export default useAuth
