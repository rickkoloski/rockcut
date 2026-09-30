import axios from 'axios'
import { restoreDeviceToken } from './device'

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

// On 401, clear token so the UI shows the login page. A failed sign-in is also a
// 401 — skip the reload there so the login form can show the error message.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.method === 'post' && error.config?.url === '/api/session'
    // Only a 401 for the token in use now means "signed out". A request sent
    // with an older token, or with none (e.g. still in flight when a tablet's
    // token was set aside for "Sign in as me"), must not reset the session (D33).
    const sentWith = error.config?.headers?.Authorization
    const current = localStorage.getItem('rockcut_token')
    const forCurrentToken = !!current && sentWith === `Bearer ${current}`
    if (error.response?.status === 401 && !isLogin && forCurrentToken) {
      // D33: a personal sign-in on a shared tablet falls back to the tablet's
      // own session instead of the login screen.
      if (!restoreDeviceToken()) {
        localStorage.removeItem('rockcut_token')
        localStorage.removeItem('rockcut_email')
      }
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default api
