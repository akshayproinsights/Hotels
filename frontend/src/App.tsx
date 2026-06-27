import * as React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { LogOut, Plus, WifiOff } from 'lucide-react'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import InventoryPage from './pages/InventoryPage'
import CalendarPage from './pages/CalendarPage'
import UnpaidDuesPage from './pages/UnpaidDuesPage'

import BottomNav from './components/BottomNav'
import { useAuth } from './hooks/useAuth'
import { useLanguage } from './context/LanguageContext'
import BlockRoomSheet from './components/BlockRoomSheet'

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
  const { language, setLanguage, t } = useLanguage()
  const [isBookSheetOpen, setIsBookSheetOpen] = React.useState(false)
  const [isOnline, setIsOnline] = React.useState(navigator.onLine)

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Top Header */}
      <header className="glass-panel sticky top-0 z-40 border-b border-slate-800/40 px-3 py-2 sm:px-4 sm:py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-base sm:text-lg text-slate-100 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            {t('portal_title')}
          </span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">{t('pwa')}</span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Switcher */}
          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[10px] font-bold">
            <button
              onClick={() => setLanguage('en')}
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all ${
                language === 'en'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('mr')}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg transition-all ${
                language === 'mr'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              मराठी
            </button>
          </div>

          {user && (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">{user.email}</span>
              <button
                onClick={logout}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                title={t('logout')}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 animate-fade-in text-amber-400 text-xs font-bold z-30">
          <WifiOff className="h-4 w-4" />
          <span>{t('offline_alert')}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          {/* Phase 3: Calendar view is now live */}
          <Route path="/" element={<CalendarPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/unpaid" element={<UnpaidDuesPage />} />
          {/* Catch-all redirects */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Floating Action Button (FAB) for Walk-in Booking */}
      <button
        onClick={() => setIsBookSheetOpen(true)}
        className="fixed bottom-20 right-4 z-40 p-3.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 hover:scale-110 active:scale-95 transition-all duration-200"
        title={t('quick_book')}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Global Booking Drawer */}
      {isBookSheetOpen && (
        <BlockRoomSheet
          onClose={() => setIsBookSheetOpen(false)}
          onSuccess={() => setIsBookSheetOpen(false)}
        />
      )}

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
