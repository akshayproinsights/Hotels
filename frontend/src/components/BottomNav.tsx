import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Hotel, Clock, Settings, TrendingUp } from 'lucide-react'
import { getUnpaidDues } from '../api/dues'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../hooks/useAuth'

export default function BottomNav() {
  const location = useLocation()
  const { t } = useLanguage()
  const { user } = useAuth()

  // Query unpaid dues to show the badge count
  const { data: unpaidData } = useQuery({
    queryKey: ['unpaidDues'],
    queryFn: getUnpaidDues,
  })

  const unpaidCount = unpaidData?.length ?? 0
  const activePath = location.pathname

  return (
    <nav className="glass-panel nav-safe fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/40 px-2 py-1.5 flex justify-between items-stretch">
      {/* Bookings Tab */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center py-1.5 px-1 mx-0.5 rounded-xl transition duration-200 flex-1 min-w-0 text-center ${
          activePath === '/'
            ? 'text-emerald-400 bg-emerald-500/5'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Calendar className="h-5 w-5" />
        <span className="text-[10px] font-bold mt-1 tracking-wider uppercase leading-tight">{t('bookings')}</span>
      </Link>

      {/* Rooms Tab */}
      <Link
        to="/inventory"
        className={`flex flex-col items-center justify-center py-1.5 px-1 mx-0.5 rounded-xl transition duration-200 flex-1 min-w-0 text-center ${
          activePath === '/inventory'
            ? 'text-emerald-400 bg-emerald-500/5'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Hotel className="h-5 w-5" />
        <span className="text-[10px] font-bold mt-1 tracking-wider uppercase leading-tight">{t('rooms')}</span>
      </Link>

      {/* Dues Tab with Badge */}
      <Link
        to="/unpaid"
        className={`flex flex-col items-center justify-center py-1.5 px-1 mx-0.5 rounded-xl transition duration-200 flex-1 min-w-0 text-center relative ${
          activePath === '/unpaid'
            ? 'text-emerald-400 bg-emerald-500/5'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <div className="relative">
          <Clock className="h-5 w-5" />
          {unpaidCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-slate-950 font-black text-[9px] h-4 w-4 rounded-full flex items-center justify-center border border-slate-900 shadow-md">
              {unpaidCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold mt-1 tracking-wider uppercase leading-tight">{t('dues')}</span>
      </Link>

      {/* Reports Tab (Admin Only) */}
      {(user?.role === 'admin' || user?.email === 'admin@snapkhata.com') && (
        <Link
          to="/reports"
          className={`flex flex-col items-center justify-center py-1.5 px-1 mx-0.5 rounded-xl transition duration-200 flex-1 min-w-0 text-center ${
            activePath === '/reports'
              ? 'text-emerald-400 bg-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <TrendingUp className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1 tracking-wider uppercase leading-tight">{t('reports_nav')}</span>
        </Link>
      )}

      {/* Settings Tab */}
      <Link
        to="/settings"
        className={`flex flex-col items-center justify-center py-1.5 px-1 mx-0.5 rounded-xl transition duration-200 flex-1 min-w-0 text-center ${
          activePath === '/settings'
            ? 'text-emerald-400 bg-emerald-500/5'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Settings className="h-5 w-5" />
        <span className="text-[10px] font-bold mt-1 tracking-wider uppercase leading-tight">{t('app_settings')}</span>
      </Link>
    </nav>
  )
}
