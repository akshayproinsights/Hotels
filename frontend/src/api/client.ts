import axios from 'axios'

// TODO(security): Store authentication tokens in secure HttpOnly cookies rather than localStorage to mitigate XSS risk.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Inject the access token into the header of every request if available
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle API token expiration or invalidation (401 Unauthorized)
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token')
      // Redirecting triggers clean client-side state
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
