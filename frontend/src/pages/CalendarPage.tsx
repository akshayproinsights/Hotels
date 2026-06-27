import { useState, useEffect } from 'react'
import { format, parseISO, isToday, isBefore } from 'date-fns'
import { ChevronDown, RefreshCw, Loader2, ShieldAlert } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useCalendar } from '../hooks/useCalendar'
import CalendarGrid from '../components/CalendarGrid'
import { useLanguage } from '../context/LanguageContext'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { getUnpaidDues } from '../api/dues'

const SHORT_MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

const SHORT_MONTH_NAMES_MR = [
  "जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून",
  "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"
]

interface MonthCalendarSectionProps {
  month: number
  year: number
  onDayClick: (dateStr: string) => void
}

function MonthCalendarSection({ month, year, onDayClick }: MonthCalendarSectionProps) {
  const { data, isLoading, isError, refetch, isRefetching } = useCalendar(month, year)
  const { language } = useLanguage()

  const monthNames = language === 'mr' ? SHORT_MONTH_NAMES_MR : SHORT_MONTH_NAMES_EN

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-4 bg-slate-900/20 flex flex-col items-center justify-center min-h-[180px]">
        <Loader2 className="h-6 w-6 text-emerald-400 animate-spin mb-2" />
        <p className="text-slate-400 font-semibold text-xs animate-pulse">
          {language === 'mr' 
            ? `${monthNames[month - 1]} ${year} लोड होत आहे...` 
            : `Loading ${monthNames[month - 1]} ${year}...`}
        </p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="glass-panel rounded-2xl p-4 bg-slate-900/20 flex flex-col items-center justify-center min-h-[180px] text-center">
        <ShieldAlert className="h-8 w-8 text-rose-500/80 mb-2" />
        <h3 className="text-xs font-bold text-slate-200">
          {language === 'mr' ? 'लोड करण्यात अक्षम' : 'Failed to load month'}
        </h3>
        <p className="text-slate-500 text-[10px] mt-0.5">
          {monthNames[month - 1]} {year}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-[10px] font-bold"
        >
          {language === 'mr' ? 'पुन्हा प्रयत्न करा' : 'Try Again'}
        </button>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 bg-slate-900/20 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-800/40 pb-2">
        <span className="text-sm font-extrabold text-slate-200 tracking-tight">
          {monthNames[month - 1]} {year}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition"
          title={language === 'mr' ? 'अपडेट करा' : 'Refresh month'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <CalendarGrid
        year={year}
        month={month}
        daysData={data.days}
        onDayClick={onDayClick}
      />
    </div>
  )
}

export default function CalendarPage() {
  const { language } = useLanguage()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const urlDate = searchParams.get('date')

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()
  const todayDateStr = format(today, 'yyyy-MM-dd')

  const getInitialMonths = (initialDate?: string | null) => {
    const list = []
    let startMonth = currentMonth
    let startYear = currentYear

    if (initialDate) {
      try {
        const parts = initialDate.split('-')
        const parsedYear = parseInt(parts[0], 10)
        const parsedMonth = parseInt(parts[1], 10)
        if (!isNaN(parsedYear) && !isNaN(parsedMonth)) {
          startMonth = parsedMonth
          startYear = parsedYear
        }
      } catch (e) {
        console.error(e)
      }
    }

    let m = startMonth
    let y = startYear
    for (let i = 0; i < 3; i++) {
      list.push({ month: m, year: y })
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
    return list
  }

  const [displayedMonths, setDisplayedMonths] = useState<{ month: number; year: number }[]>(() =>
    getInitialMonths(urlDate)
  )
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(urlDate)
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true)
  // Fetch unpaid dues for the dashboard shortcut
  const { data: unpaidData } = useQuery({
    queryKey: ['unpaidDues'],
    queryFn: getUnpaidDues,
  })

  // Filter urgent dues (checkout today or overdue)
  const todayDateObj = new Date()
  todayDateObj.setHours(0, 0, 0, 0)
  const urgentDues = unpaidData
    ? unpaidData.filter((due) => {
        const coDate = parseISO(due.check_out)
        return isBefore(coDate, todayDateObj) || isToday(coDate)
      })
    : []

  // Synchronize state if URL parameter changes
  useEffect(() => {
    if (urlDate) {
      if (urlDate !== selectedDateStr) {
        setSelectedDateStr(urlDate)
      }
      try {
        const parts = urlDate.split('-')
        const parsedYear = parseInt(parts[0], 10)
        const parsedMonth = parseInt(parts[1], 10)
        if (!isNaN(parsedYear) && !isNaN(parsedMonth)) {
          const isDisplayed = displayedMonths.some(dm => dm.month === parsedMonth && dm.year === parsedYear)
          if (!isDisplayed) {
            setDisplayedMonths(getInitialMonths(urlDate))
          }
        }
      } catch (e) {
        console.error(e)
      }
    } else {
      if (selectedDateStr !== null) {
        setSelectedDateStr(null)
      }
    }
  }, [urlDate, selectedDateStr, displayedMonths])

  // Determine target date for quick summary (selected date or today)
  const targetDateStr = selectedDateStr || todayDateStr
  const targetParts = targetDateStr.split('-')
  const targetYear = parseInt(targetParts[0], 10)
  const targetMonth = parseInt(targetParts[1], 10)

  // Fetch data for the target month (to calculate vacancies/occupied/pending in the header)
  const { data: targetMonthData } = useCalendar(targetMonth, targetYear)

  const handleLoadNextMonth = () => {
    setDisplayedMonths(prev => {
      const last = prev[prev.length - 1]
      let nextMonth = last.month + 1
      let nextYear = last.year
      if (nextMonth > 12) {
        nextMonth = 1
        nextYear += 1
      }
      return [...prev, { month: nextMonth, year: nextYear }]
    })
  }

  const handleToday = () => {
    setDisplayedMonths(getInitialMonths())
    setSelectedDateStr(null)
    setSearchParams({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
    queryClient.invalidateQueries({ queryKey: ['unpaidDues'] })
  }

  // Calculate stats
  const totalRooms = targetMonthData?.total_rooms ?? 0
  const targetDayInfo = targetMonthData?.days?.find(d => d.date === targetDateStr)
  const vacantTarget = targetDayInfo ? targetDayInfo.vacant : 0
  const occupiedTarget = targetDayInfo ? targetDayInfo.occupied : 0
  const pendingTarget = targetDayInfo ? targetDayInfo.pending ?? 0 : 0
  const targetDisplayStr = format(parseISO(targetDateStr), 'EEEE, d MMM')

  const isTargetToday = targetDateStr === todayDateStr
  const summaryTitle = isTargetToday
    ? (language === 'mr' ? 'आजचा अहवाल' : "Today's Summary")
    : (language === 'mr' ? 'निवडलेल्या तारखेचा अहवाल' : "Selected Date's Summary")

  return (
    <div className="flex flex-col gap-3 px-4 py-3 pb-24 animate-fade-in">
      
      {/* Dynamic Summary Dashboard Panel */}
      <div
        onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
        className="glass-panel w-full rounded-3xl p-4 bg-slate-900/60 border-slate-800/60 hover:bg-slate-900/80 active:scale-[0.995] transition-all duration-300 ease-in-out text-left flex flex-col gap-3 cursor-pointer relative group overflow-hidden"
      >
        {/* Ambient glow decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none group-hover:bg-emerald-500/15 transition duration-500" />
        
        {/* Top Header Row: Title & Date + Controls */}
        <div className="flex items-center justify-between z-10 w-full">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <span>{summaryTitle}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span className="text-emerald-400 font-bold normal-case">
                {isSummaryExpanded 
                  ? (language === 'mr' ? 'संकुचित करा' : 'Tap to collapse') 
                  : (language === 'mr' ? 'तपशील पहा' : 'Tap to expand')}
              </span>
            </span>
            <span className="text-base font-extrabold text-slate-100 tracking-tight flex items-center gap-1.5">
              {targetDisplayStr}
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isSummaryExpanded ? 'rotate-180' : ''}`} />
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* Refresh Button */}
            <button
              onClick={handleRefreshAll}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 active:scale-95 transition"
              title={language === 'mr' ? 'रीफ्रेश करा' : 'Refresh data'}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            {/* Go to Today Button */}
            {!isTargetToday && (
              <button
                onClick={handleToday}
                className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-black rounded-lg active:scale-95 transition flex items-center gap-1 shadow-lg shadow-emerald-500/10 animate-fade-in"
              >
                <span>{language === 'mr' ? 'आजवर जा' : 'Today'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsed Badge Row */}
        {!isSummaryExpanded && (
          <div className="flex items-center gap-2 z-10 animate-fade-in mt-2">
            {/* Free Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-extrabold">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>{totalRooms ? vacantTarget : '—'} {language === 'mr' ? 'रिकाम्या' : 'Free'}</span>
            </div>

            {/* Occupied Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-500/10 border border-slate-800 text-slate-300 text-xs font-extrabold">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span>{totalRooms ? occupiedTarget : '—'} {language === 'mr' ? 'बुक' : 'Booked'}</span>
            </div>

            {/* Unpaid Badge */}
            <div 
              onClick={(e) => {
                e.stopPropagation()
                navigate('/unpaid')
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-extrabold cursor-pointer hover:bg-amber-500/20 active:scale-95 transition"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>{totalRooms ? pendingTarget : '—'} {language === 'mr' ? 'बाकी' : 'Unpaid'}</span>
              <span className="opacity-60 ml-0.5">→</span>
            </div>
          </div>
        )}

        {/* Expanded View */}
        {isSummaryExpanded && (
          <div className="flex flex-col gap-2.5 z-10 animate-fade-in mt-1 w-full">
            {/* Metrics Grid — 3 clean KPIs like Little Hotelier / Cloudbeds */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Free Card */}
              <div 
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/inventory?date=${targetDateStr}`)
                }}
                className="glass-panel p-3 rounded-2xl bg-emerald-500/[0.04] border-emerald-500/15 flex flex-col items-center justify-center text-center shadow-inner hover:bg-emerald-500/[0.08] active:scale-95 transition duration-200 cursor-pointer"
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                  {language === 'mr' ? 'रिकाम्या' : 'Free'}
                </span>
                <span className="text-3xl font-black text-emerald-400 tracking-tight">
                  {totalRooms ? vacantTarget : '—'}
                </span>
              </div>

              {/* Occupied Card */}
              <div 
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/inventory?date=${targetDateStr}`)
                }}
                className="glass-panel p-3 rounded-2xl bg-slate-500/[0.04] border-slate-800 flex flex-col items-center justify-center text-center shadow-inner hover:bg-slate-500/[0.08] active:scale-95 transition duration-200 cursor-pointer"
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {language === 'mr' ? 'बुक' : 'Booked'}
                </span>
                <span className="text-3xl font-black text-slate-200 tracking-tight">
                  {totalRooms ? occupiedTarget : '—'}
                </span>
              </div>

              {/* Due Today Card — pulsing dot when urgent, no separate banner needed */}
              <div 
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('/unpaid')
                }}
                className="glass-panel p-3 rounded-2xl bg-amber-500/[0.04] border-amber-500/15 flex flex-col items-center justify-center text-center shadow-inner hover:bg-amber-500/[0.08] active:scale-95 transition duration-200 cursor-pointer relative overflow-hidden"
              >
                {/* Pulsing urgency dot — top-right corner, only when dues exist */}
                {urgentDues.length > 0 && (
                  <span className="absolute top-2 right-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                    </span>
                  </span>
                )}
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                  {language === 'mr' ? 'आज देणे' : 'Due Today'}
                </span>
                <span className="text-3xl font-black text-amber-400 tracking-tight">
                  {urgentDues.length}
                </span>
                {urgentDues.length > 0 && (
                  <span className="text-[8px] text-amber-400/60 font-bold mt-0.5">
                    {language === 'mr' ? 'जमा करा →' : 'Collect →'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>



      {/* Main Grid View List */}
      <div className="flex flex-col gap-4">
        {displayedMonths.map(({ month, year }) => (
          <MonthCalendarSection
            key={`${year}-${month}`}
            month={month}
            year={year}
            onDayClick={(dateStr) => navigate(`/inventory?date=${dateStr}`)}
          />
        ))}
      </div>

      {/* Get Next Month Button */}
      <button
        onClick={handleLoadNextMonth}
        className="w-full py-4 mt-2 bg-slate-900/60 hover:bg-slate-900/80 active:scale-[0.99] border border-slate-800/60 hover:border-slate-800 rounded-2xl text-xs font-extrabold text-emerald-400 hover:text-emerald-300 transition duration-200 flex items-center justify-center gap-2 shadow-lg"
      >
        <ChevronDown className="h-4 w-4" />
        <span>{language === 'mr' ? 'पुढचा महिना दाखवा' : 'Get Next Month'}</span>
      </button>

    </div>
  )
}
