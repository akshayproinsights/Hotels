import { Link, useLocation } from 'react-router-dom'
import { Calendar, Hotel, BarChart2, Settings } from 'lucide-react'

const tabs = [
  { label: 'Bookings',  icon: <Calendar  className="h-5 w-5" />, path: '/'          },
  { label: 'Inventory', icon: <Hotel     className="h-5 w-5" />, path: '/inventory' },
  { label: 'Reports',   icon: <BarChart2 className="h-5 w-5" />, path: '/reports'   },
  { label: 'Settings',  icon: <Settings  className="h-5 w-5" />, path: '/settings'  },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav className="glass-panel nav-safe fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/40 px-6 py-2 flex justify-around items-center">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path
        return (
          <Link
            key={tab.label}
            to={tab.path}
            className={`flex flex-col items-center py-1 px-3 rounded-2xl transition duration-200 ${
              isActive
                ? 'text-emerald-400 bg-emerald-500/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-bold mt-1 tracking-wider uppercase">
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
