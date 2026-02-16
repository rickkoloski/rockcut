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

// On 401, clear token and redirect to login (once, to avoid reload loops)
let redirecting = false
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !redirecting) {
      redirecting = true
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
      localStorage.removeItem('rockcut_name')
      localStorage.removeItem('rockcut_role')
      window.location.replace('/')
    }
    return Promise.reject(error)
  }
)

export default api
