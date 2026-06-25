import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hotel, Mail, Lock, Loader2 } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      localStorage.setItem('access_token', res.data.access_token)
      toast.success(`Welcome back, ${res.data.user.name || 'Staff'}!`)
      navigate('/')
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Invalid email or password'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Background blur effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-8 z-10 animate-fade-in">
        <div className="flex flex-col items-center">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-4 shadow-inner">
            <Hotel className="h-12 w-12 text-emerald-400" />
          </div>
          <h2 className="text-center text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            Santosh Palace
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Hotel Room Management Portal
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-8 shadow-2xl transition duration-300 hover:border-emerald-500/20">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition"
                  placeholder="name@snapkhata.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-5 w-5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition shadow-lg shadow-emerald-500/20"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5 mr-2" />
              ) : null}
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
