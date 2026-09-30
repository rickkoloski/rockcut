import { create } from 'zustand'
import api from '../lib/api'
import type { Me, User, Capabilities } from '../lib/types'
import { TOKEN_KEY, asideDeviceToken, clearUnpaired, restoreDeviceToken, setDeviceTokenAside } from '../lib/device'

interface AuthState {
  token: string | null
  user: User | null
  capabilities: Capabilities | null
  sharedDevices: boolean
  isAuthenticated: boolean
  bootstrapped: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
  // D33 — shared tablets
  pairDevice: (code: string, name: string) => Promise<void>
  signOutDevice: () => Promise<void>
  startPersonalSignIn: () => void
  endPersonalSession: () => void
}

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

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<{ token: string }>('/api/session', { email, password })
      localStorage.setItem(TOKEN_KEY, data.token)
      set({ token: data.token, isAuthenticated: true })
      await get().loadMe()
      set({ isLoading: false, bootstrapped: true })
    } catch (err: unknown) {
      set({ error: errorMessage(err, 'Login failed'), isLoading: false })
    }
  },

  logout: () => {
    // A person signed in on a shared tablet goes back to the tablet's session.
    if (asideDeviceToken()) {
      get().endPersonalSession()
      return
    }
    const { token } = get()
    if (token) {
      api.delete('/api/session').catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false })
  },

  loadMe: async () => {
    const { token } = get()
    if (!token) {
      set({ bootstrapped: true })
      return
    }
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
      })
    } catch {
      if (localStorage.getItem(TOKEN_KEY) !== token) return
      // 401 is handled by the axios interceptor; clear local state for anything else.
      localStorage.removeItem(TOKEN_KEY)
      set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false, bootstrapped: true })
    }
  },

  // Exchange a pairing code for this tablet's token (D33 §3.2).
  pairDevice: async (code: string, name: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<{ token: string }>('/api/device_tokens', { code, name })
      localStorage.setItem(TOKEN_KEY, data.token)
      clearUnpaired()
      set({ token: data.token, isAuthenticated: true })
      await get().loadMe()
      set({ isLoading: false, bootstrapped: true })
    } catch (err: unknown) {
      set({ error: errorMessage(err, 'Could not set up this tablet'), isLoading: false })
    }
  },

  // Signing out a tablet revokes its token; it needs a new code afterwards.
  signOutDevice: async () => {
    try {
      await api.delete('/api/session')
    } catch {
      // The token is dropped locally either way.
    }
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false })
  },

  // "Sign in as me" on a tablet: keep the device token aside and show the login form.
  startPersonalSignIn: () => {
    setDeviceTokenAside()
    set({ token: null, user: null, capabilities: null, sharedDevices: false, isAuthenticated: false, error: null })
  },

  // Back to the tablet's session: drop the personal token, restore the device
  // token and reload so nothing personal stays in memory.
  endPersonalSession: () => {
    if (restoreDeviceToken()) window.location.assign('/')
  },
}))

export default useAuth
