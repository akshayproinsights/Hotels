import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, Calendar as CalendarIcon, Loader2, ShieldAlert } from 'lucide-react'
import { useCalendar } from '../hooks/useCalendar'
import CalendarGrid from '../components/CalendarGrid'
import DayDetailPanel from '../components/DayDetailPanel'

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export default function CalendarPage() {
  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()
  const todayDateStr = format(today, 'yyyy-MM-dd')

  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)

  // Fetch data for the selected month
  const { data, isLoading, isError, refetch, isRefetching } = useCalendar(month, year)

  // Fetch data for the current month (to calculate today's vacancies in the header)
  const { data: todayData } = useCalendar(currentMonth, currentYear)

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(prev => prev - 1)
    } else {
      setMonth(prev => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(prev => prev + 1)
    } else {
      setMonth(prev => prev + 1)
    }
  }

  const handleToday = () => {
    setMonth(currentMonth)
    setYear(currentYear)
  }

  // Calculate stats
  const totalRooms = todayData?.total_rooms ?? data?.total_rooms ?? 0
  const todayDayInfo = todayData?.days?.find(d => d.date === todayDateStr)
  const vacantToday = todayDayInfo ? todayDayInfo.vacant : 0

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-24 animate-fade-in">
      
      {/* Premium Header Status Panel */}
      <div className="glass-panel rounded-2xl p-5 bg-gradient-to-br from-indigo-500/5 to-emerald-500/5 border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span className="bg-emerald-500/10 text-emerald-400 p-2 rounded-xl">
              <CalendarIcon className="h-5 w-5" />
            </span>
            Bookings Calendar
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Monthly vacancy view and occupancy levels
          </p>
        </div>

        <div className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-2">
          <span className="text-sm font-black text-slate-200">{totalRooms || '—'}</span>
          <span className="text-slate-600 font-bold">|</span>
          <span className="text-sm font-black text-emerald-400">{totalRooms ? vacantToday : '—'} Vacant Today</span>
        </div>
      </div>

      {/* Calendar Controller & Legend */}
      <div className="flex flex-col gap-4">
        {/* Navigation Bar */}
        <div className="glass-panel rounded-2xl p-4 flex justify-between items-center bg-slate-900/40 border-slate-800/40">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-900 text-xs font-bold text-slate-300 transition"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-base font-extrabold text-slate-200 tracking-tight">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-400 font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span>5+ Vacant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span>1–4 Vacant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>0 Vacant (Full)</span>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-slate-400 font-semibold text-sm">Loading calendar grid...</p>
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
          <ShieldAlert className="h-12 w-12 text-rose-500/80 mb-4" />
          <h2 className="text-lg font-bold text-slate-200">Failed to load calendar</h2>
          <p className="text-slate-500 text-xs mt-1 max-w-sm">
            Check your network connection or try reloading.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-4 sm:p-6 bg-slate-900/20">
          <CalendarGrid
            year={year}
            month={month}
            daysData={data.days}
            onDayClick={setSelectedDateStr}
          />
        </div>
      )}

      {/* Day details bottom sheet panel */}
      {selectedDateStr && (
        <DayDetailPanel
          dateStr={selectedDateStr}
          onClose={() => setSelectedDateStr(null)}
        />
      )}

    </div>
  )
}
