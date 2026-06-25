import * as React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { LogOut } from 'lucide-react'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import InventoryPage from './pages/InventoryPage'
import CalendarPage from './pages/CalendarPage'
import ReportsPage from './pages/ReportsPage'
import BottomNav from './components/BottomNav'
import { useAuth } from './hooks/useAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Authentication Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

// Layout wrapper including bottom navigation
function AppLayout() {
  const { logout, user } = useAuth()

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Header */}
      <header className="glass-panel sticky top-0 z-40 border-b border-slate-800/40 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-lg text-slate-100 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Santosh Palace
          </span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">PWA</span>
        </div>
        
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">{user.email}</span>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          {/* Phase 3: Calendar view is now live */}
          <Route path="/" element={<CalendarPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* Catch-all redirects */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          />
        </Routes>
      </BrowserRouter>
      {/* Toast provider notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'glass-panel text-slate-200 border-slate-800/40 rounded-xl',
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          },
        }}
      />
    </QueryClientProvider>
  )
}
