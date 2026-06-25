import { useState, useEffect } from 'react'
import api from '../api/client'
import { User } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/auth/me')
      .then(res => {
        setUser(res.data)
      })
      .catch(() => {
        setUser(null)
        localStorage.removeItem('access_token')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) {
      // Avoid printing structured objects, simply record success/error status
    } finally {
      localStorage.removeItem('access_token')
      setUser(null)
      // Redirect triggers clean client-side state
      window.location.href = '/login'
    }
  }

  return { user, setUser, loading, logout }
}
