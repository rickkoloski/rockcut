import { create } from 'zustand'
import api from '../lib/api'
import type { Me, User, Capabilities } from '../lib/types'

interface AuthState {
  token: string | null
  user: User | null
  capabilities: Capabilities | null
  isAuthenticated: boolean
  bootstrapped: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
}

const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('rockcut_token'),
  user: null,
  capabilities: null,
  isAuthenticated: !!localStorage.getItem('rockcut_token'),
  bootstrapped: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post<{ token: string }>('/api/session', { email, password })
      localStorage.setItem('rockcut_token', data.token)
      set({ token: data.token, isAuthenticated: true })
      await get().loadMe()
      set({ isLoading: false, bootstrapped: true })
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { error?: string } } }).response?.data?.error || 'Login failed'
          : 'Login failed'
      set({ error: message, isLoading: false })
    }
  },

  logout: () => {
    const { token } = get()
    if (token) {
      api.delete('/api/session').catch(() => {})
    }
    localStorage.removeItem('rockcut_token')
    set({ token: null, user: null, capabilities: null, isAuthenticated: false })
  },

  loadMe: async () => {
    const { token } = get()
    if (!token) {
      set({ bootstrapped: true })
      return
    }
    try {
      const { data } = await api.get<Me>('/api/me')
      set({ user: data.user, capabilities: data.capabilities, isAuthenticated: true, bootstrapped: true })
    } catch {
      // 401 is handled by the axios interceptor; clear local state for anything else.
      localStorage.removeItem('rockcut_token')
      set({ token: null, user: null, capabilities: null, isAuthenticated: false, bootstrapped: true })
    }
  },
}))

export default useAuth
