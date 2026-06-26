import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, Loader2, ShieldAlert } from 'lucide-react'
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
  const occupiedToday = todayDayInfo ? todayDayInfo.occupied : 0
  const todayDisplayStr = format(today, 'EEEE, d MMM')

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-24 animate-fade-in">
      
      {/* Calendar Controller & Legend Header */}
      <div className="flex flex-col gap-3">
        {/* Navigation & Status Bar */}
        <div className="glass-panel rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 border-slate-800/40">
          {/* Left Side: Month / Year Display & Refresh */}
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-slate-200 tracking-tight">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition"
              title="Refresh calendar data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Right Side: Navigation Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              title="Previous Month"
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
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Today Summary Bar */}
        <button
          onClick={() => setSelectedDateStr(todayDateStr)}
          className="glass-panel w-full rounded-2xl p-3 px-4 bg-slate-900/60 border-slate-800/60 hover:bg-slate-900/80 active:scale-[0.99] transition duration-200 text-left flex items-center justify-between cursor-pointer"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
              Today's Quick Summary
            </span>
            <span className="text-sm font-bold text-slate-200">
              {todayDisplayStr}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-extrabold text-emerald-400">
                {totalRooms ? `${vacantToday} Vacant` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              <span className="text-xs font-extrabold text-slate-300">
                {totalRooms ? `${occupiedToday} Occupied` : '—'}
              </span>
            </div>
            <span className="text-slate-600 text-base leading-none">›</span>
          </div>
        </button>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center gap-4 px-1 text-[11px] text-slate-400 font-semibold">
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
