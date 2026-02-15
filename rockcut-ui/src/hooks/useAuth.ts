import { create } from 'zustand'
import api from '../lib/api'

interface AuthState {
  token: string | null
  email: string | null
  name: string | null
  role: string | null
  isAdmin: boolean
  isAuthenticated: boolean
  isLoading: boolean
  mustChangePassword: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  changePassword: (password: string, passwordConfirmation: string) => Promise<void>
}

const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem('rockcut_token'),
  email: localStorage.getItem('rockcut_email'),
  name: localStorage.getItem('rockcut_name'),
  role: localStorage.getItem('rockcut_role'),
  isAdmin: localStorage.getItem('rockcut_role') === 'admin',
  isAuthenticated: !!localStorage.getItem('rockcut_token'),
  isLoading: false,
  mustChangePassword: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.post('/api/session', { email, password })
      localStorage.setItem('rockcut_token', data.token)
      localStorage.setItem('rockcut_email', data.email)
      localStorage.setItem('rockcut_name', data.name)
      localStorage.setItem('rockcut_role', data.role)
      set({
        token: data.token,
        email: data.email,
        name: data.name,
        role: data.role,
        isAdmin: data.role === 'admin',
        isAuthenticated: true,
        isLoading: false,
        mustChangePassword: data.must_change_password ?? false,
      })
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
    localStorage.removeItem('rockcut_name')
    localStorage.removeItem('rockcut_role')
    set({ token: null, email: null, name: null, role: null, isAdmin: false, isAuthenticated: false, mustChangePassword: false })
  },

  checkAuth: async () => {
    const { token } = get()
    if (!token) return
    try {
      const { data } = await api.get('/api/session')
      localStorage.setItem('rockcut_name', data.name)
      localStorage.setItem('rockcut_role', data.role)
      set({
        email: data.email,
        name: data.name,
        role: data.role,
        isAdmin: data.role === 'admin',
        isAuthenticated: true,
        mustChangePassword: data.must_change_password ?? false,
      })
    } catch {
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
      localStorage.removeItem('rockcut_name')
      localStorage.removeItem('rockcut_role')
      set({ token: null, email: null, name: null, role: null, isAdmin: false, isAuthenticated: false, mustChangePassword: false })
    }
  },

  changePassword: async (password: string, passwordConfirmation: string) => {
    await api.put('/api/session/password', { password, password_confirmation: passwordConfirmation })
    set({ mustChangePassword: false })
  },
}))

export default useAuth
