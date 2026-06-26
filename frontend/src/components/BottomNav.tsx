import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Hotel, Clock, MoreHorizontal, BarChart2, Settings, X } from 'lucide-react'
import { getUnpaidDues } from '../api/reports'
import { useLanguage } from '../context/LanguageContext'

export default function BottomNav() {
  const location = useLocation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const { language, t } = useLanguage()

  // Query unpaid dues to show the badge count
  const { data: unpaidData } = useQuery({
    queryKey: ['unpaidDues'],
    queryFn: getUnpaidDues,
  })

  const unpaidCount = unpaidData?.length ?? 0
  const activePath = location.pathname
  const isMoreActive = ['/reports', '/settings'].includes(activePath)

  return (
    <>
      <nav className="glass-panel nav-safe fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/40 px-4 py-2 flex justify-around items-center">
        {/* Bookings Tab */}
        <Link
          to="/"
          onClick={() => setIsMoreOpen(false)}
          className={`flex flex-col items-center py-1 px-3 rounded-2xl transition duration-200 ${
            activePath === '/' && !isMoreOpen
              ? 'text-emerald-400 bg-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1 tracking-wider uppercase">{t('bookings')}</span>
        </Link>

        {/* Rooms Tab */}
        <Link
          to="/inventory"
          onClick={() => setIsMoreOpen(false)}
          className={`flex flex-col items-center py-1 px-3 rounded-2xl transition duration-200 ${
            activePath === '/inventory' && !isMoreOpen
              ? 'text-emerald-400 bg-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Hotel className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1 tracking-wider uppercase">{t('rooms')}</span>
        </Link>

        {/* Dues Tab with Badge */}
        <Link
          to="/unpaid"
          onClick={() => setIsMoreOpen(false)}
          className={`flex flex-col items-center py-1 px-3 rounded-2xl transition duration-200 relative ${
            activePath === '/unpaid' && !isMoreOpen
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
          <span className="text-[10px] font-bold mt-1 tracking-wider uppercase">{t('dues')}</span>
        </Link>

        {/* More Tab */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`flex flex-col items-center py-1 px-3 rounded-2xl transition duration-200 ${
            isMoreOpen || isMoreActive
              ? 'text-emerald-400 bg-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1 tracking-wider uppercase">{t('more')}</span>
        </button>
      </nav>

      {/* Slide-up panel menu for "More" */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          {/* Backdrop click closes the panel */}
          <div className="absolute inset-0" onClick={() => setIsMoreOpen(false)} />
          
          <div className="glass-panel relative w-full max-w-lg rounded-t-3xl bg-slate-900/95 border-t border-slate-800 p-6 pb-28 flex flex-col gap-4 shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400">
                {t('more')}
              </h3>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Link
                to="/reports"
                onClick={() => setIsMoreOpen(false)}
                className={`p-4 rounded-2xl border flex flex-col gap-2 transition duration-200 ${
                  activePath === '/reports'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-950/60 border-slate-850 hover:bg-slate-900 text-slate-300 hover:text-slate-200'
                }`}
              >
                <BarChart2 className="h-6 w-6" />
                <span className="text-xs font-black">{t('reports_insights')}</span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {language === 'mr' ? 'कमाई आणि खोल्यांची उपलब्धता पहा' : 'View revenue & occupancies'}
                </span>
              </Link>

              <Link
                to="/settings"
                onClick={() => setIsMoreOpen(false)}
                className={`p-4 rounded-2xl border flex flex-col gap-2 transition duration-200 ${
                  activePath === '/settings'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-950/60 border-slate-850 hover:bg-slate-900 text-slate-300 hover:text-slate-200'
                }`}
              >
                <Settings className="h-6 w-6" />
                <span className="text-xs font-black">{t('app_settings')}</span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {language === 'mr' ? 'खोल्या व्यवस्थापित करा' : 'Manage rooms & search history'}
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
