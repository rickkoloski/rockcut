import axios from 'axios'

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
    if (error.response?.status === 401 && !isLogin) {
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default api
