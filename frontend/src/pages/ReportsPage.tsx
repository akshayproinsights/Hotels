import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { 
  IndianRupee, 
  TrendingUp, 
  Clock, 
  Hotel, 
  Search, 
  RefreshCw,
  AlertTriangle,
  Percent,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { getFinancials } from '../api/reports'
import BookingDetailSheet from '../components/BookingDetailSheet'
import { useLanguage } from '../context/LanguageContext'

export default function ReportsPage() {
  const { t, language } = useLanguage()
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'>('month')
  
  // Set initial custom date inputs to current month bounds
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date()
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1)
    return firstDay.toISOString().split('T')[0]
  })
  
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null)

  // Mini Calendar State
  const [currentCalMonth, setCurrentCalMonth] = useState<Date>(new Date())

  // Compute startDate and endDate strings based on filters
  const dateRange = useMemo(() => {
    const today = new Date()
    let start = new Date()
    let end = new Date()

    switch (filterType) {
      case 'today':
        start = today
        end = today
        break
      case 'yesterday':
        const yesterday = new Date()
        yesterday.setDate(today.getDate() - 1)
        start = yesterday
        end = yesterday
        break
      case 'week':
        const last7 = new Date()
        last7.setDate(today.getDate() - 6)
        start = last7
        end = today
        break
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        end = today
        break
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        end = new Date(today.getFullYear(), today.getMonth(), 0)
        break
      case 'custom':
        return { start: customStart, end: customEnd }
    }

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const date = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${date}`
    }

    return { start: formatDateStr(start), end: formatDateStr(end) }
  }, [filterType, customStart, customEnd])

  // Fetch financials report data
  const { 
    data: reportData, 
    isLoading, 
    isError, 
    refetch,
    isRefetching 
  } = useQuery({
    queryKey: ['financials', dateRange.start, dateRange.end],
    queryFn: () => getFinancials(dateRange.start, dateRange.end),
    enabled: filterType !== 'custom' || (!!customStart && !!customEnd)
  })

  // Filter ledger list based on search query
  const filteredLedger = useMemo(() => {
    if (!reportData?.ledger) return []
    if (!searchQuery.trim()) return reportData.ledger

    const q = searchQuery.toLowerCase()
    return reportData.ledger.filter(item => 
      item.booking_number.toLowerCase().includes(q) ||
      item.customer_name.toLowerCase().includes(q) ||
      item.customer_phone.includes(q) ||
      item.room_number.toLowerCase().includes(q) ||
      item.room_type.toLowerCase().includes(q)
    )
  }, [reportData?.ledger, searchQuery])

  // custom SVG Chart Constants & Calculations
  const chartSvg = useMemo(() => {
    if (!reportData?.trend || reportData.trend.length === 0) return null

    const width = 500
    const height = 180
    const paddingLeft = 55
    const paddingRight = 20
    const paddingTop = 25
    const paddingBottom = 30
    
    const chartWidth = width - paddingLeft - paddingRight
    const chartHeight = height - paddingTop - paddingBottom
    
    const maxRevenue = Math.max(...reportData.trend.map(t => t.revenue), 1000)

    const points = reportData.trend.map((item, idx) => {
      const x = paddingLeft + (idx / Math.max(1, reportData.trend.length - 1)) * chartWidth
      const y = paddingTop + chartHeight - (item.revenue / maxRevenue) * chartHeight
      return { x, y, ...item }
    })

    const gridLines = [0, 0.5, 1].map(pct => {
      const y = paddingTop + chartHeight * pct
      const val = Math.round(maxRevenue * (1 - pct))
      return { y, val }
    })

    const linePath = points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : ''

    const areaPath = points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
      : ''

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      points,
      gridLines,
      linePath,
      areaPath
    }
  }, [reportData?.trend])

  // Payment modes calculation list
  const paymentModesList = useMemo(() => {
    if (!reportData?.payment_modes) return []
    const modes = reportData.payment_modes
    const total = Object.values(modes).reduce((sum, val) => sum + val, 0) || 1

    return Object.entries(modes)
      .map(([mode, val]) => ({
        mode,
        value: val,
        percentage: Math.round((val / total) * 100)
      }))
      .sort((a, b) => b.value - a.value)
  }, [reportData?.payment_modes])

  // Room type category calculation list
  const roomTypesList = useMemo(() => {
    if (!reportData?.room_types) return []
    const types = reportData.room_types
    const total = Object.values(types).reduce((sum, val) => sum + val, 0) || 1

    return Object.entries(types)
      .map(([type, val]) => ({
        type,
        value: val,
        percentage: Math.round((val / total) * 100)
      }))
      .sort((a, b) => b.value - a.value)
  }, [reportData?.room_types])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentCalMonth.getFullYear()
    const month = currentCalMonth.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    const startDayOfWeek = firstDay.getDay() // 0 = Sunday, 1 = Monday, etc.
    const totalDays = new Date(year, month + 1, 0).getDate()
    const prevMonthDays = new Date(year, month, 0).getDate()
    
    const daysArray: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = []
    
    // Fill previous month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i)
      daysArray.push({ date: d, isCurrentMonth: false, key: `prev-${prevMonthDays-i}` })
    }
    
    // Fill current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i)
      daysArray.push({ date: d, isCurrentMonth: true, key: `curr-${i}` })
    }
    
    // Fill next month days to make a grid of 6 weeks (42 days)
    const remaining = 42 - daysArray.length
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      daysArray.push({ date: d, isCurrentMonth: false, key: `next-${i}` })
    }
    
    return daysArray
  }, [currentCalMonth])

  // Handle clicking calendar days
  const handleDateClick = (clickedDate: Date) => {
    const dateStr = clickedDate.toISOString().split('T')[0]
    
    if (filterType !== 'custom') {
      setFilterType('custom')
    }
    
    if (!customStart || (customStart && customEnd)) {
      setCustomStart(dateStr)
      setCustomEnd('')
    } else {
      const startD = new Date(customStart)
      if (clickedDate < startD) {
        setCustomStart(dateStr)
        setCustomEnd('')
      } else {
        setCustomEnd(dateStr)
      }
    }
  }

  return (
    <div className="pb-24 pt-4 px-3 max-w-7xl mx-auto space-y-5">
      
      {/* Title Header Section */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          {t('reports_title')}
        </h1>

        {/* Sync Button */}
        <button
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 active:scale-95 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching || isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{language === 'mr' ? 'अपडेट करा' : 'Refresh'}</span>
        </button>
      </div>

      {/* Date Selectors & Conditional Mini Calendar */}
      <div className="glass-panel p-3 border border-slate-800/40 rounded-3xl space-y-3">
        <div>
          <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">
            {language === 'mr' ? 'तारीख निवडा' : 'Filter Period'}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {(['today', 'yesterday', 'week', 'month', 'last_month', 'custom'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => setFilterType(preset)}
                className={`py-2 px-1 rounded-xl text-[10px] sm:text-xs font-black text-center transition-all ${
                  filterType === preset
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border border-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(preset)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Range Inputs & Interactive Calendar (Only visible when custom is selected) */}
        {filterType === 'custom' && (
          <div className="space-y-3 pt-3 border-t border-slate-900 animate-fade-in">
            {/* Inline Date Range inputs (From on Left, To on Right) */}
            <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
              <div className="flex items-center justify-between gap-2 flex-1 bg-slate-950 border border-slate-900 p-2 rounded-xl">
                <span>{t('from')}:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-transparent text-slate-200 outline-none w-28 text-right cursor-pointer text-[11px]"
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-1 bg-slate-950 border border-slate-900 p-2 rounded-xl">
                <span>{t('to')}:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-transparent text-slate-200 outline-none w-28 text-right cursor-pointer text-[11px]"
                />
              </div>
            </div>

            {/* Interactive monthly calendar view */}
            <div className="p-3 bg-slate-950 border border-slate-900 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                  {language === 'mr' ? 'कॅलेंडर तारीख निवड' : 'Interactive Calendar'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="p-1 rounded-lg bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest px-1">
                    {currentCalMonth.toLocaleDateString(language === 'mr' ? 'mr-IN' : 'en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => setCurrentCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="p-1 rounded-lg bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Day of Week Titles */}
              <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-slate-500 uppercase tracking-wider">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                  <div key={i} className="py-1">{d}</div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {calendarDays.map((day) => {
                  const dateStr = day.date.toISOString().split('T')[0]
                  const isSelectedStart = customStart === dateStr
                  const isSelectedEnd = customEnd === dateStr
                  
                  let isInRange = false
                  if (customStart && customEnd) {
                    const cur = day.date
                    const s = new Date(customStart)
                    const e = new Date(customEnd)
                    isInRange = cur >= s && cur <= e
                  }

                  let cellClass = "py-2 rounded-xl text-xs font-bold transition-all relative flex items-center justify-center cursor-pointer "
                  if (!day.isCurrentMonth) {
                    cellClass += "text-slate-800 hover:text-slate-600 "
                  } else {
                    cellClass += "text-slate-350 hover:text-slate-100 "
                  }

                  if (isSelectedStart || isSelectedEnd) {
                    cellClass += "bg-emerald-500 text-slate-950 font-black scale-105 shadow-md shadow-emerald-500/10 "
                  } else if (isInRange) {
                    cellClass += "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 "
                  } else {
                    cellClass += "hover:bg-slate-900 border border-transparent "
                  }

                  const isTodayDate = day.date.toDateString() === new Date().toDateString()

                  return (
                    <div
                      key={day.key}
                      onClick={() => handleDateClick(day.date)}
                      className={cellClass}
                      title={dateStr}
                    >
                      <span>{day.date.getDate()}</span>
                      {isTodayDate && !isSelectedStart && !isSelectedEnd && (
                        <span className="absolute bottom-1 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards Loading / Error / Data */}
      {isLoading ? (
        <div className="h-48 glass-panel border border-slate-850 rounded-3xl flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
          <span className="text-xs font-bold text-slate-400">{t('loading')}</span>
        </div>
      ) : isError ? (
        <div className="h-48 glass-panel border border-rose-950/20 bg-rose-500/5 rounded-3xl flex flex-col items-center justify-center gap-3 text-rose-400">
          <AlertTriangle className="h-8 w-8" />
          <span className="text-xs font-bold">{language === 'mr' ? 'माहिती मिळवणे अयशस्वी झाले' : 'Failed to fetch financial data'}</span>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Earnings */}
            <div className="glass-panel p-3.5 border border-emerald-500/10 bg-emerald-500/[0.02] rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[100px] group hover:border-emerald-500/20 transition-all">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">{t('total_earnings')}</span>
                <IndianRupee className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  ₹{reportData?.summary.total_revenue.toLocaleString('en-IN')}
                </span>
                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">
                  {language === 'mr' ? 'दैनिक एकूण जमा रक्कम' : 'Net received collections'}
                </p>
              </div>
            </div>

            {/* Dues */}
            <div className="glass-panel p-3.5 border border-rose-500/10 bg-rose-500/[0.01] rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[100px] group hover:border-rose-500/20 transition-all">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-rose-400/80 uppercase tracking-wider">{t('outstanding_dues')}</span>
                <TrendingUp className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div className="mt-3">
                <span className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  ₹{reportData?.summary.total_dues.toLocaleString('en-IN')}
                </span>
                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">
                  {language === 'mr' ? 'जमा करायची बाकी रक्कम' : 'Remaining unpaid balance'}
                </p>
              </div>
            </div>

            {/* Occupancy Rate */}
            <div className="glass-panel p-3.5 border border-blue-500/10 bg-blue-500/[0.01] rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[100px] group hover:border-blue-500/20 transition-all">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-blue-400/80 uppercase tracking-wider">{t('occupancy_rate')}</span>
                <Hotel className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div className="mt-3">
                <span className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  {reportData?.summary.occupancy_rate}%
                </span>
                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">
                  {language === 'mr' 
                    ? `${reportData?.summary.occupied_nights} रात्री बुक (${reportData?.summary.total_rooms} खोल्या)`
                    : `${reportData?.summary.occupied_nights} nights sold (${reportData?.summary.total_rooms} active rooms)`}
                </p>
              </div>
            </div>

            {/* Average Booking Value */}
            <div className="glass-panel p-3.5 border border-purple-500/10 bg-purple-500/[0.01] rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[100px] group hover:border-purple-500/20 transition-all">
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-purple-400/80 uppercase tracking-wider">{t('average_booking_value')}</span>
                <Percent className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div className="mt-3">
                <span className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  ₹{reportData?.summary.avg_booking_value.toLocaleString('en-IN')}
                </span>
                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">
                  {language === 'mr' 
                    ? `एकूण ${reportData?.summary.total_bookings} बुकिंगचे मूल्य`
                    : `Average across ${reportData?.summary.total_bookings} bookings`}
                </p>
              </div>
            </div>

          </div>

          {/* Charts & Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Chart Column */}
            <div className="glass-panel p-4 border border-slate-800/40 rounded-3xl relative flex flex-col justify-between h-[270px]">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  {t('revenue_trend')}
                </h3>
              </div>

              {/* SVG Chart area */}
              <div className="flex-1 mt-4 relative">
                {chartSvg && chartSvg.points.length > 1 ? (
                  <div className="w-full h-full relative">
                    <svg
                      viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`}
                      className="w-full h-full"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Render Gridlines */}
                      {chartSvg.gridLines.map((line, idx) => (
                        <g key={idx}>
                          <line
                            x1={chartSvg.paddingLeft}
                            y1={line.y}
                            x2={chartSvg.width - chartSvg.paddingRight}
                            y2={line.y}
                            stroke="#1e293b"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={chartSvg.paddingLeft - 8}
                            y={line.y + 4}
                            fill="#94a3b8"
                            fontSize="11"
                            fontWeight="black"
                            textAnchor="end"
                          >
                            ₹{line.val >= 1000 ? `${(line.val / 1000).toFixed(0)}k` : line.val}
                          </text>
                        </g>
                      ))}

                      {/* Fill area & Draw line */}
                      <path d={chartSvg.areaPath} fill="url(#chartGrad)" />
                      <path
                        d={chartSvg.linePath}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Interactivity elements */}
                      {chartSvg.points.map((p, idx) => (
                        <g key={idx}>
                          {/* Point Indicator */}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={hoveredTrendIdx === idx ? 5.5 : 2}
                            fill={hoveredTrendIdx === idx ? '#34d399' : '#10b981'}
                            stroke="#0b0f19"
                            strokeWidth={hoveredTrendIdx === idx ? 2.5 : 1}
                          />
                          {/* Wide interactive rect zones */}
                          <rect
                            x={p.x - (chartSvg.chartWidth / Math.max(1, chartSvg.points.length)) / 2}
                            y={chartSvg.paddingTop}
                            width={chartSvg.chartWidth / Math.max(1, chartSvg.points.length)}
                            height={chartSvg.chartHeight}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredTrendIdx(idx)}
                            onMouseLeave={() => setHoveredTrendIdx(null)}
                          />
                        </g>
                      ))}
                    </svg>

                    {/* Floating Tooltip HTML Overlay */}
                    {hoveredTrendIdx !== null && chartSvg.points[hoveredTrendIdx] && (
                      <div
                        className="absolute pointer-events-none bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-xl shadow-2xl text-[9px] text-slate-200 z-30 transition-all duration-75 animate-fade-in"
                        style={{
                          left: `${((chartSvg.points[hoveredTrendIdx].x) / chartSvg.width) * 100}%`,
                          top: `${((chartSvg.points[hoveredTrendIdx].y) / chartSvg.height) * 100 - 15}%`,
                          transform: 'translate(-50%, -100%)',
                        }}
                      >
                        <div className="font-extrabold text-slate-400">
                          {format(parseISO(chartSvg.points[hoveredTrendIdx].date), 'dd MMM yyyy')}
                        </div>
                        <div className="text-emerald-400 font-black mt-0.5">
                          ₹{chartSvg.points[hoveredTrendIdx].revenue.toLocaleString('en-IN')}
                        </div>
                        <div className="text-slate-500 font-bold">
                          {chartSvg.points[hoveredTrendIdx].bookings} {language === 'mr' ? 'बुकिंग' : 'Bookings'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-slate-650 text-xs font-bold gap-2">
                    <Calendar className="h-6 w-6" />
                    <span>{t('no_data_found')}</span>
                  </div>
                )}
              </div>

              {/* Time Label bounds */}
              {chartSvg && chartSvg.points.length > 0 && (
                <div className="flex justify-between items-center text-[8px] font-black text-slate-500 uppercase tracking-wider px-2 mt-1">
                  <span>{format(parseISO(chartSvg.points[0].date), 'dd MMM')}</span>
                  <span>{format(parseISO(chartSvg.points[chartSvg.points.length - 1].date), 'dd MMM')}</span>
                </div>
              )}
            </div>

            {/* Splits Column (Payment Modes + Room Types) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Payment Mode Splits */}
              <div className="glass-panel p-4 border border-slate-800/40 rounded-3xl space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <IndianRupee className="h-3.5 w-3.5 text-indigo-400" />
                    {t('payment_modes')}
                  </h3>
                </div>

                <div className="space-y-3 flex-1 flex flex-col justify-center mt-2">
                  {paymentModesList.length > 0 ? (
                    paymentModesList.map((item, idx) => {
                      const colorMap: Record<string, string> = {
                        Cash: 'bg-amber-400',
                        UPI: 'bg-emerald-400',
                        IDFC: 'bg-blue-400',
                        Pending: 'bg-slate-600'
                      }
                      const color = colorMap[item.mode] || 'bg-slate-400'
                      
                      return (
                        <div key={idx} className="space-y-1.5 text-xs font-bold">
                          <div className="flex justify-between text-slate-350">
                            <span className="text-[11px] uppercase tracking-wider font-extrabold">
                              {item.mode === 'Cash' ? t('cash') : item.mode === 'UPI' ? t('upi') : item.mode === 'IDFC' ? t('idfc') : t('pending')}
                            </span>
                            <span className="text-slate-200">
                              ₹{item.value.toLocaleString('en-IN')}{' '}
                              <span className="text-[10px] text-slate-500 font-semibold">({item.percentage}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/20">
                            <div
                              className={`h-full ${color} rounded-full transition-all duration-500`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-slate-600 text-center text-[10px] py-6">{t('no_data_found')}</div>
                  )}
                </div>
              </div>

              {/* Room Type Performance */}
              <div className="glass-panel p-4 border border-slate-800/40 rounded-3xl space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <Hotel className="h-3.5 w-3.5 text-purple-400" />
                    {t('room_category_revenue')}
                  </h3>
                </div>

                <div className="space-y-3 flex-1 flex flex-col justify-center mt-2">
                  {roomTypesList.length > 0 ? (
                    roomTypesList.map((item, idx) => {
                      const colors = ['bg-purple-400', 'bg-indigo-400', 'bg-sky-400', 'bg-teal-400']
                      const barColor = colors[idx % colors.length]
                      
                      return (
                        <div key={idx} className="space-y-1.5 text-xs font-bold">
                          <div className="flex justify-between text-slate-350">
                            <span className="text-[10px] truncate max-w-[120px]">{item.type}</span>
                            <span className="text-slate-200">
                              ₹{item.value.toLocaleString('en-IN')}{' '}
                              <span className="text-[10px] text-slate-500 font-semibold">({item.percentage}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/20">
                            <div
                              className={`h-full ${barColor} rounded-full transition-all duration-500`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-slate-600 text-center text-[10px] py-6">{t('no_data_found')}</div>
                  )}
                </div>
              </div>

            </div>

          </div>

          {/* Historical Transaction Ledger Table Card */}
          <div className="glass-panel border border-slate-800/40 rounded-3xl overflow-hidden">
            
            {/* Control Header */}
            <div className="p-4 border-b border-slate-850/60 bg-slate-950 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-black uppercase text-slate-300 tracking-wider">
                  {language === 'mr' ? 'व्यवहार इतिहास नोंदवही (लेजर)' : 'Transaction Ledger'}
                </h3>
                <span className="bg-slate-900 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-850">
                  {filteredLedger.length}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                
                {/* Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('search_ledger')}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

              </div>
            </div>

            {/* Table Area */}
            <div className="overflow-x-auto w-full">
              {filteredLedger.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-850/50 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-950/40">
                      <th className="py-3 px-4">{language === 'mr' ? 'ग्राहक' : 'Customer'}</th>
                      <th className="py-3 px-4">{language === 'mr' ? 'खोली' : 'Room'}</th>
                      <th className="py-3 px-4">{language === 'mr' ? 'कालावधी' : 'Duration'}</th>
                      <th className="py-3 px-4">{language === 'mr' ? 'मोबाईल नंबर' : 'Mobile Number'}</th>
                      <th className="py-3 px-4 text-right">{language === 'mr' ? 'एकूण बिल' : 'Total Bill'}</th>
                      <th className="py-3 px-4 text-right">{language === 'mr' ? 'अतिरिक्त' : 'Extra'}</th>
                      <th className="py-3 px-4 text-right">{language === 'mr' ? 'भरलेली रक्कम' : 'Paid'}</th>
                      <th className="py-3 px-4 text-center">{language === 'mr' ? 'पेमेंट प्रकार' : 'Pay Mode'}</th>
                      <th className="py-3 px-4 text-center">{t('payment_status')}</th>
                      <th className="py-3 px-4 text-center">{language === 'mr' ? 'बुकिंग क्र.' : 'Booking No'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/40 text-xs font-bold text-slate-300">
                    {filteredLedger.map((item, idx) => {
                      const balance = Math.max(0, item.total_amount - item.paid_amount)
                      const isFullyPaid = item.payment_status === 'paid'
                      const isPartial = item.payment_status === 'partial'
                      const isReserved = item.payment_status === 'reserved'
                      const isCancelled = item.status === 'cancelled'

                      // Row style
                      const rowColor = isCancelled 
                        ? 'opacity-50 hover:bg-slate-900/10 bg-slate-950/5' 
                        : 'hover:bg-slate-900/40 cursor-pointer'

                      return (
                        <tr 
                          key={idx} 
                          className={`${rowColor} transition-colors`}
                          onClick={() => setSelectedBookingId(item.id)}
                        >
                          {/* Customer */}
                          <td className="py-3.5 px-4 truncate max-w-[140px] font-extrabold text-slate-200">
                            <div className="flex items-center gap-1">
                              <span className="truncate">{item.customer_name}</span>
                              {item.customer_is_deleted && (
                                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 whitespace-nowrap">
                                  {language === 'mr' ? 'डिलीट' : 'Deleted'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Room */}
                          <td className="py-3.5 px-4 text-slate-200">
                            <div>{language === 'mr' ? `खोली ${item.room_number}` : `Room ${item.room_number}`}</div>
                            <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{item.room_type}</div>
                          </td>

                          {/* Duration */}
                          <td className="py-3.5 px-4 text-[10px] text-slate-350">
                            <div>{format(parseISO(item.check_in), 'dd MMM, hh:mm a')} - {format(parseISO(item.check_out), 'dd MMM, hh:mm a')}</div>
                            <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{format(parseISO(item.check_in), 'yyyy')}</div>
                          </td>

                          {/* Mobile Number */}
                          <td className="py-3.5 px-4 text-slate-400 font-semibold">
                            {item.customer_phone}
                          </td>

                          {/* Total Bill */}
                          <td className="py-3.5 px-4 text-right font-black text-slate-350">
                            ₹{item.total_amount.toLocaleString('en-IN')}
                          </td>

                          {/* Extra */}
                          <td className="py-3.5 px-4 text-right font-black text-amber-500">
                            ₹{item.extra_bill_amount.toLocaleString('en-IN')}
                          </td>

                          {/* Paid */}
                          <td className="py-3.5 px-4 text-right font-black text-emerald-400">
                            ₹{item.paid_amount.toLocaleString('en-IN')}
                          </td>

                          {/* Payment Mode */}
                          <td className="py-3.5 px-4 text-center">
                            <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-lg border ${
                              item.payment_mode === 'Cash' 
                                ? 'bg-amber-500/5 text-amber-400 border-amber-500/20' 
                                : item.payment_mode === 'UPI'
                                ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20'
                                : item.payment_mode === 'IDFC'
                                ? 'bg-blue-500/5 text-blue-400 border-blue-500/20'
                                : 'bg-slate-900 text-slate-500 border-slate-850'
                            }`}>
                              {item.payment_mode === 'Cash' ? t('cash') : item.payment_mode === 'UPI' ? t('upi') : item.payment_mode === 'IDFC' ? t('idfc') : '-'}
                            </span>
                          </td>

                          {/* Payment Status Badge */}
                          <td className="py-3.5 px-4 text-center">
                            {isFullyPaid && (
                              <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                {t('status_label')}
                              </span>
                            )}
                            {isPartial && (
                              <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                                <Clock className="h-2.5 w-2.5 animate-pulse" />
                                {language === 'mr' ? 'अंशतः' : `Due ₹${balance}`}
                              </span>
                            )}
                            {isReserved && (
                              <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
                                <Clock className="h-2.5 w-2.5" />
                                {t('on_hold')}
                              </span>
                            )}
                            {item.payment_status === 'unpaid' && !isCancelled && (
                              <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 bg-rose-500/10 text-rose-450 border border-rose-500/20 rounded-lg">
                                <XCircle className="h-2.5 w-2.5" />
                                {language === 'mr' ? 'थकीत' : 'Unpaid'}
                              </span>
                            )}
                            {isCancelled && (
                              <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black px-2 py-0.5 bg-slate-800 text-slate-500 border border-slate-700/50 rounded-lg">
                                -
                              </span>
                            )}
                          </td>

                          {/* Booking No (at the end) */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-extrabold text-slate-100 bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-lg text-[10px]">
                              {item.booking_number}
                            </span>
                            {isCancelled && (
                              <span className="ml-1.5 text-[9px] font-extrabold uppercase px-1 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">
                                {t('cancelled')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs font-black gap-2">
                  <Search className="h-6 w-6 text-slate-650" />
                  <span>{t('no_data_found')}</span>
                </div>
              )}
            </div>

          </div>
        </>
      )}

      {/* Drawer Booking detail slide panel */}
      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          onClose={() => {
            setSelectedBookingId(null)
            refetch()
          }}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

    </div>
  )
}
