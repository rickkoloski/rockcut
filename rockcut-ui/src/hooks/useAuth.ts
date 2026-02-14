import { create } from 'zustand'
import api from '../lib/api'

interface AuthState {
  token: string | null
  email: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('rockcut_token'),
  email: localStorage.getItem('rockcut_email'),
  isAuthenticated: !!localStorage.getItem('rockcut_token'),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post('/api/session', { email, password })
      localStorage.setItem('rockcut_token', data.token)
      localStorage.setItem('rockcut_email', data.email)
      set({ token: data.token, email: data.email, isAuthenticated: true, isLoading: false })
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
    localStorage.removeItem('rockcut_email')
    set({ token: null, email: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    const { token } = get()
    if (!token) return
    try {
      const { data } = await api.get('/api/session')
      set({ email: data.email, isAuthenticated: true })
    } catch {
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
      set({ token: null, email: null, isAuthenticated: false })
    }
  },
}))

export default useAuth
