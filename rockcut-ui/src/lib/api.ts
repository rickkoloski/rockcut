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

// On 401, clear token so the UI shows the login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rockcut_token')
      localStorage.removeItem('rockcut_email')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default api
