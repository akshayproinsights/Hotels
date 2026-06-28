import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw, Layers, ShieldAlert, Loader2, LayoutGrid, Map } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import RoomCard from '../components/RoomCard'
import BlockRoomSheet from '../components/BlockRoomSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const [briefTab, setBriefTab] = useState<'arrivals' | 'checkouts' | 'staying'>('arrivals')
  const { language, t } = useLanguage()

  // Touch gesture state for swipe-to-navigate days
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    // If modal/drawer sheet is open, do not trigger swipe date change
    if (selectedRoomForBooking || selectedBookingId) return
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (selectedRoomForBooking || selectedBookingId) return
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (selectedRoomForBooking || selectedBookingId || !touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const minSwipeDistance = 75 // Minimum pixel movement required

    // Swipe Left (finger moves right to left): Go to next day
    // Swipe Right (finger moves left to right): Go to previous day
    if (distance > minSwipeDistance) {
      handleNextDay()
    } else if (distance < -minSwipeDistance) {
      handlePrevDay()
    }
  }

  // Synchronize state if URL parameter changes
  const urlDate = searchParams.get('date')
  useEffect(() => {
    if (urlDate && urlDate !== selectedDate) {
      setSelectedDate(urlDate)
    }
  }, [urlDate, selectedDate])

  const { data, isLoading, isError, refetch, isRefetching } = useInventory(selectedDate)

  const handlePrevDay = () => {
    const newDate = format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleNextDay = () => {
    const newDate = format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleToday = () => {
    const newDate = format(new Date(), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleRoomClick = (room: InventoryRoom) => {
    if (room.room_status === 'vacant') {
      setSelectedRoomForBooking(room)
    } else if (room.booking) {
      setSelectedBookingId(room.booking.id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
        <p className="text-slate-400 font-semibold text-sm">{t('fetching_inventory')}</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <ShieldAlert className="h-12 w-12 text-rose-500/80 mb-4" />
        <h2 className="text-lg font-bold text-slate-200">{t('failed_load_inventory')}</h2>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">
          {language === 'mr' ? 'कृपया इंटरनेट कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.' : 'Please check your connection or setup and try again.'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold"
        >
          {t('try_again')}
        </button>
      </div>
    )
  }

  // Group rooms by floor
  const roomsByFloor = data.rooms.reduce((acc, room) => {
    const floor = room.floor
    if (!acc[floor]) acc[floor] = []
    acc[floor].push(room)
    return acc;
  }, {} as Record<number, InventoryRoom[]>)

  // Sorted floors
  const sortedFloors = Object.keys(roomsByFloor)
    .map(Number)
    .sort((a, b) => a - b)

  const formatSelectedDate = (dateStr: string, compact = false) => {
    const parsed = parseISO(dateStr)
    if (language !== 'mr') {
      return format(parsed, compact ? 'EEE, d MMM' : 'EEEE, d MMMM yyyy')
    }
    const daysMr = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
    const daysMrCompact = ['रवि', 'सोम', 'मंगळ', 'बुध', 'गुरु', 'शुक्र', 'शनि']
    const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
    const dayName = compact ? daysMrCompact[parsed.getDay()] : daysMr[parsed.getDay()]
    const monthName = monthsMr[parsed.getMonth()]
    return compact 
      ? `${dayName}, ${parsed.getDate()} ${monthName.slice(0, 3)}`
      : `${dayName}, ${parsed.getDate()} ${monthName} ${parsed.getFullYear()}`
  }

  const formattedDate = formatSelectedDate(selectedDate, false)
  const formattedDateCompact = formatSelectedDate(selectedDate, true)

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col gap-4 px-3 py-4 pb-24 animate-fade-in sm:px-4 sm:py-6"
    >
      
      {/* Date Navigation Bar */}
      <div className="glass-panel rounded-2xl p-2.5 sm:p-4 flex flex-col gap-3.5 sm:flex-row sm:justify-between sm:items-center bg-slate-900/40">
        {/* Primary Date Switcher */}
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <button
            onClick={handlePrevDay}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition active:scale-95 flex-shrink-0"
            title={language === 'mr' ? 'पूर्वीचा दिवस' : 'Previous Day'}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <div className="flex items-center gap-2 flex-1 justify-center sm:flex-initial">
            <button
              onClick={() => navigate(`/?date=${selectedDate}`)}
              className="flex items-center gap-2 hover:bg-slate-850/60 bg-slate-950/40 border border-slate-850 px-3 py-2.5 rounded-xl transition active:scale-95 text-left"
              title={language === 'mr' ? 'तारीख बदलण्यासाठी कॅलेंडरवर जा' : 'Go to calendar to change date'}
            >
              <CalendarIcon className="h-4.5 w-4.5 text-emerald-400 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-extrabold text-slate-200 tracking-tight whitespace-nowrap">
                <span className="inline sm:hidden">{formattedDateCompact}</span>
                <span className="hidden sm:inline">{formattedDate}</span>
              </span>
            </button>

            <button
              onClick={handleToday}
              className="px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-xl hover:bg-slate-900 text-xs font-black text-emerald-400 active:scale-95 transition"
            >
              {t('today')}
            </button>
          </div>

          <button
            onClick={handleNextDay}
            className="flex items-center justify-center w-14 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition active:scale-95 flex-shrink-0"
            title={language === 'mr' ? 'पुढील दिवस' : 'Next Day'}
          >
            <ChevronRight className="h-7 w-7 stroke-[3]" />
          </button>
        </div>

        {/* Secondary Controls (Refresh & Layout Toggles) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t border-slate-850/40 pt-3 sm:pt-0 sm:border-t-0">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/40 border border-slate-850 hover:bg-slate-900 text-slate-400 rounded-xl transition disabled:opacity-50 active:scale-95 text-xs font-bold"
            title={language === 'mr' ? 'अपडेट करा' : 'Refresh inventory'}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>{language === 'mr' ? 'रीफ्रेश' : 'Refresh'}</span>
          </button>

          {/* Toggle Layout Segmented Controller */}
          <div className="flex bg-slate-950/60 p-0.5 sm:p-1 border border-slate-800 rounded-xl flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={language === 'mr' ? 'ग्रिड कार्ड व्ह्यू' : 'Grid Card View'}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">{language === 'mr' ? 'ग्रिड' : 'Grid'}</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                viewMode === 'map'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={language === 'mr' ? 'मजला आराखडा मॅप व्ह्यू' : 'Floor Plan Map View'}
            >
              <Map className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">{language === 'mr' ? 'नकाशा' : 'Map'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Occupancy Stats Summary */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-emerald-500/5 border-emerald-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1 sm:gap-1.5">
            <span>✅</span>
            <span className="truncate">{language === 'mr' ? 'रिकामी' : 'Free'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.vacant}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-slate-500/5 border-slate-800">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5">
            <span>👤</span>
            <span className="truncate">{language === 'mr' ? 'भरलेली' : 'Occupied'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.occupied}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-amber-500/5 border-amber-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-amber-500 flex items-center gap-1 sm:gap-1.5">
            <span>🔒</span>
            <span className="truncate">{language === 'mr' ? 'होल्ड' : 'Hold'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.hold}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-rose-500/5 border-rose-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-rose-500 flex items-center gap-1 sm:gap-1.5">
            <span>⚠️</span>
            <span className="truncate">{language === 'mr' ? 'बाकी' : 'Unpaid'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.unpaid}</span>
        </div>
      </div>

      {/* Today's Front Desk Brief Card */}
      {(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const isViewingToday = selectedDate === todayStr
        if (!isViewingToday) return null

        const dailyBookings = data.daily_bookings || []

        // Arrivals: check_in is today
        const arrivals = dailyBookings.filter(b => b.check_in.startsWith(todayStr))
        // Pending arrivals = not yet checked in
        const arrivalsPending = arrivals.filter(b => !b.is_checked_in)
        // Done arrivals = already checked in
        const arrivalsDone = arrivals.filter(b => b.is_checked_in)

        // Checkouts: check_out is today (only those who are still active / not yet checked out)
        const checkouts = dailyBookings.filter(b => b.check_out.startsWith(todayStr))
        // Pending checkouts = still in house (not yet checked out)
        const checkoutsPending = checkouts.filter(b => b.status !== 'checked_out')
        // Done checkouts = already checked out (room freed)
        const checkoutsDone = checkouts.filter(b => b.status === 'checked_out')

        // Staying Over: checked in, not checking out today, not a today arrival
        const stayingOver = dailyBookings.filter(b =>
          b.status === 'active' &&
          b.is_checked_in &&
          !b.check_in.startsWith(todayStr) &&
          !b.check_out.startsWith(todayStr)
        )

        const hasActivity = arrivals.length > 0 || checkouts.length > 0 || stayingOver.length > 0
        if (!hasActivity) return null

        // Smart: auto-highlight the tab with most pending work
        // (this is read-only logic for the badge dot indicator)
        const arrivalsPendingCount = arrivalsPending.length
        const checkoutsPendingCount = checkoutsPending.length

        // Helper: render a guest action row
        const GuestRow = ({ b, variant }: { b: typeof arrivals[0], variant: 'arrival' | 'checkout' | 'staying' }) => {
          const isDone =
            variant === 'arrival' ? b.is_checked_in :
            variant === 'checkout' ? b.status === 'checked_out' :
            false

          const colorSet = {
            arrival: { pending: 'bg-amber-500/8 border-amber-500/20', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-amber-500 text-slate-950', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-amber-500/10 text-amber-400 border-amber-500/25', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
            checkout: { pending: 'bg-rose-500/8 border-rose-500/20', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-rose-500 text-white', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-rose-500/10 text-rose-400 border-rose-500/25', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
            staying: { pending: 'bg-emerald-500/5 border-emerald-800/40', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
          }[variant]

          const badgeLabel = variant === 'arrival'
            ? (isDone ? (language === 'mr' ? '✓ हजर' : '✓ In') : (language === 'mr' ? 'बाकी' : 'Pending'))
            : variant === 'checkout'
            ? (isDone ? (language === 'mr' ? '✓ गेले' : '✓ Out') : (language === 'mr' ? 'बाकी' : 'Pending'))
            : (language === 'mr' ? 'मुक्काम' : 'Staying')

          const subtitleLabel = variant === 'arrival'
            ? (language === 'mr' ? 'आगमन आज' : 'Check-In Today')
            : variant === 'checkout'
            ? (language === 'mr' ? 'प्रस्थान आज' : 'Check-Out Today')
            : (language === 'mr' ? 'मुक्कामी ग्राहक' : 'In-House Guest')

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBookingId(b.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                isDone ? colorSet.done : colorSet.pending
              } ${isDone ? 'opacity-55' : ''}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 border ${
                  isDone ? colorSet.room_done : colorSet.room_pending
                }`}>
                  {b.rooms?.number || b.room_id}
                </span>
                <div className="min-w-0">
                  <p className={`text-xs font-black truncate ${isDone ? 'text-slate-400 line-through' : 'text-slate-200'}`}>{b.guests?.name}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {b.room_type} · {subtitleLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded ${
                  isDone ? colorSet.badge_done : colorSet.badge_pending
                }`}>
                  {badgeLabel}
                </span>
              </div>
            </button>
          )
        }

        return (
          <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-4 shadow-lg">
            {/* Title / Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                  {language === 'mr' ? 'आजचा फ्रंट डेस्क सारांश' : "Today's Front Desk Brief"}
                </h3>
              </div>
              {/* Live urgency indicator */}
              {(arrivalsPendingCount > 0 || checkoutsPendingCount > 0) ? (
                <span className="text-[9px] font-black text-amber-950 bg-amber-400 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                  {arrivalsPendingCount + checkoutsPendingCount} {language === 'mr' ? 'बाकी' : 'Pending'}
                </span>
              ) : (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                  {language === 'mr' ? '✓ सर्व झाले' : '✓ All Done'}
                </span>
              )}
            </div>

            {/* Tabs Row */}
            <div className="grid grid-cols-3 gap-2 bg-slate-955/60 p-1 border border-slate-800/60 rounded-xl">
              {/* Arrivals Tab */}
              <button
                type="button"
                onClick={() => setBriefTab('arrivals')}
                className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all relative ${
                  briefTab === 'arrivals'
                    ? 'bg-amber-500 text-slate-955 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200 font-semibold'
                }`}
              >
                {/* Pending dot indicator */}
                {arrivalsPendingCount > 0 && briefTab !== 'arrivals' && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-slate-950 text-[8px] font-black rounded-full flex items-center justify-center">
                    {arrivalsPendingCount}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <span>🛬</span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold">
                    {language === 'mr' ? 'आगमन' : 'Arrivals'}
                  </span>
                </div>
                <span className={`text-[10px] mt-0.5 font-bold tabular-nums ${
                  briefTab === 'arrivals' ? 'text-slate-900' :
                  arrivalsPendingCount > 0 ? 'text-amber-400' : 'text-slate-500'
                }`}>
                  {arrivals.length === 0
                    ? (language === 'mr' ? 'कोणी नाही' : 'None')
                    : arrivalsPendingCount > 0
                    ? `${arrivalsPendingCount} ${language === 'mr' ? 'बाकी' : 'Pending'}`
                    : `${language === 'mr' ? '✓ सर्व हजर' : '✓ All In'}`
                  }
                </span>
              </button>

              {/* Departures Tab */}
              <button
                type="button"
                onClick={() => setBriefTab('checkouts')}
                className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all relative ${
                  briefTab === 'checkouts'
                    ? 'bg-rose-500 text-white shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200 font-semibold'
                }`}
              >
                {/* Pending dot indicator */}
                {checkoutsPendingCount > 0 && briefTab !== 'checkouts' && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-400 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {checkoutsPendingCount}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <span>🚪</span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold">
                    {language === 'mr' ? 'प्रस्थान' : 'Checkouts'}
                  </span>
                </div>
                <span className={`text-[10px] mt-0.5 font-bold tabular-nums ${
                  briefTab === 'checkouts' ? 'text-white' :
                  checkoutsPendingCount > 0 ? 'text-rose-400' : 'text-slate-500'
                }`}>
                  {checkouts.length === 0
                    ? (language === 'mr' ? 'कोणी नाही' : 'None')
                    : checkoutsPendingCount > 0
                    ? `${checkoutsPendingCount} ${language === 'mr' ? 'बाकी' : 'Pending'}`
                    : `${language === 'mr' ? '✓ सर्व गेले' : '✓ All Out'}`
                  }
                </span>
              </button>

              {/* Staying Tab */}
              <button
                type="button"
                onClick={() => setBriefTab('staying')}
                className={`py-2 px-1 rounded-lg flex flex-col items-center justify-center transition-all ${
                  briefTab === 'staying'
                    ? 'bg-emerald-500 text-slate-955 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200 font-semibold'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>🏨</span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold">
                    {language === 'mr' ? 'मुक्काम' : 'In-House'}
                  </span>
                </div>
                <span className={`text-[10px] mt-0.5 font-bold tabular-nums ${briefTab === 'staying' ? 'text-slate-955 font-black' : 'text-emerald-450'}`}>
                  {stayingOver.length} {language === 'mr' ? 'खोल्या' : 'Rooms'}
                </span>
              </button>
            </div>

            {/* List for the selected tab */}
            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
              {briefTab === 'arrivals' && (
                <>
                  {arrivals.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' ? '🌙 आज कोणतेही आगमन नियोजित नाही.' : '🌙 No arrivals scheduled for today.'}
                    </div>
                  ) : arrivalsPending.length === 0 ? (
                    // All arrivals done — celebration + collapsed done list
                    <>
                      <div className="text-center py-3 text-xs font-bold text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                        🎉 {language === 'mr' ? 'सर्व अतिथी आले! खोल्या Occupied आहेत.' : 'All guests checked in! Rooms are now Occupied.'}
                      </div>
                      {arrivalsDone.map(b => <GuestRow key={b.id} b={b} variant="arrival" />)}
                    </>
                  ) : (
                    // Pending first, then done at bottom dimmed
                    <>
                      {arrivalsPending.map(b => <GuestRow key={b.id} b={b} variant="arrival" />)}
                      {arrivalsDone.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-1">
                            <div className="flex-1 h-px bg-slate-800"/>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                              {language === 'mr' ? '✓ हजर झाले' : '✓ Checked In'}
                            </span>
                            <div className="flex-1 h-px bg-slate-800"/>
                          </div>
                          {arrivalsDone.map(b => <GuestRow key={b.id} b={b} variant="arrival" />)}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {briefTab === 'checkouts' && (
                <>
                  {checkouts.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' ? '🌙 आज कोणतेही प्रस्थान नियोजित नाही.' : '🌙 No departures scheduled for today.'}
                    </div>
                  ) : checkoutsPending.length === 0 ? (
                    // All checkouts done — rooms freed
                    <>
                      <div className="text-center py-3 text-xs font-bold text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                        🎉 {language === 'mr' ? 'सर्व अतिथी निघाले! खोल्या आता Free आहेत.' : 'All guests checked out! Rooms are now Free.'}
                      </div>
                      {checkoutsDone.map(b => <GuestRow key={b.id} b={b} variant="checkout" />)}
                    </>
                  ) : (
                    // Pending first (urgent), done dimmed below
                    <>
                      {checkoutsPending.map(b => <GuestRow key={b.id} b={b} variant="checkout" />)}
                      {checkoutsDone.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-1">
                            <div className="flex-1 h-px bg-slate-800"/>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                              {language === 'mr' ? '✓ निघाले • खोली Free' : '✓ Checked Out • Room Free'}
                            </span>
                            <div className="flex-1 h-px bg-slate-800"/>
                          </div>
                          {checkoutsDone.map(b => <GuestRow key={b.id} b={b} variant="checkout" />)}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {briefTab === 'staying' && (
                <>
                  {stayingOver.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' ? 'सध्या हॉटेलात इतर मुक्कामी ग्राहक नाहीत.' : 'No other staying guests.'}
                    </div>
                  ) : (
                    stayingOver.map(b => <GuestRow key={b.id} b={b} variant="staying" />)
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Floors Room Layout */}
      <div className="flex flex-col gap-8">
        {sortedFloors.map((floor) => {
          const rooms = roomsByFloor[floor]
          const mid = Math.ceil(rooms.length / 2)
          const leftRooms = rooms.slice(0, mid)
          const rightRooms = rooms.slice(mid)

          // Floor text formatting in Marathi / English
          const floorText = floor === 0 
            ? (language === 'mr' ? 'तळमजला (Ground Floor)' : 'Ground Floor')
            : language === 'mr'
              ? `${floor} ${floor === 1 ? 'ला' : floor === 2 ? 'रा' : floor === 3 ? 'रा' : 'था'} मजला`
              : `${floor}${floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor`

          return (
            <section key={floor} className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-slate-500" />
                  <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400">
                    {floorText} — {rooms.length} {language === 'mr' ? 'खोल्या' : 'Rooms'}
                  </h3>
                </div>
                {viewMode === 'map' && (
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                    {language === 'mr' ? 'मजला आराखडा मॅप व्ह्यू' : 'Floor Plan Map View'}
                  </span>
                )}
              </div>
              
              {viewMode === 'map' ? (
                /* Physical Corridor Layout */
                <div className="grid grid-cols-11 gap-2 bg-slate-950/30 border border-slate-800/40 p-4 rounded-3xl relative overflow-hidden min-h-[160px]">
                  {/* Left Side Rooms Corridor */}
                  <div className="col-span-5 flex flex-col gap-3">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 text-center mb-1 block">
                      {language === 'mr' ? 'डावीकडील खोल्या' : 'Left Side Rooms'}
                    </span>
                    {leftRooms.map((room) => (
                      <MiniRoomBox
                        key={room.id}
                        room={room}
                        onClick={handleRoomClick}
                      />
                    ))}
                  </div>

                  {/* Hallway Walkway corridor */}
                  <div className="col-span-1 flex flex-col items-center justify-center border-l border-r border-dashed border-slate-800/80 bg-slate-950/20 relative py-4 select-none rounded-md">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-slate-600 font-extrabold rotate-90 whitespace-nowrap tracking-[0.25em]">
                        {language === 'mr' ? 'कॉरिडॉर' : 'CORRIDOR'}
                      </span>
                    </div>
                  </div>

                  {/* Right Side Rooms Corridor */}
                  <div className="col-span-5 flex flex-col gap-3">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 text-center mb-1 block">
                      {language === 'mr' ? 'उजवीकडील खोल्या' : 'Right Side Rooms'}
                    </span>
                    {rightRooms.map((room) => (
                      <MiniRoomBox
                        key={room.id}
                        room={room}
                        onClick={handleRoomClick}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* Grid Cards Layout */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onClick={handleRoomClick}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Sheets Drawers */}
      {selectedRoomForBooking && (
        <BlockRoomSheet
          room={selectedRoomForBooking}
          initialDate={selectedDate}
          onClose={() => setSelectedRoomForBooking(null)}
          onSuccess={() => {
            setSelectedRoomForBooking(null)
            refetch()
          }}
        />
      )}

      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onSuccess={(action) => {
            if (action === 'checkout') {
              setSelectedBookingId(null)
            }
            refetch()
          }}
        />
      )}

    </div>
  )
}

interface MiniRoomBoxProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
}

function MiniRoomBox({ room, onClick }: MiniRoomBoxProps) {
  const { language } = useLanguage()

  const getStatusBorderColor = () => {
    switch (room.room_status) {
      case 'vacant':
        return 'border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-400 hover:border-emerald-400/50 hover:bg-emerald-500/[0.06]'
      case 'hold':
        return 'border-amber-500/20 bg-amber-500/[0.03] text-amber-400 hover:border-amber-400/50 hover:bg-amber-500/[0.06]'
      case 'unpaid':
        return 'border-rose-500/20 bg-rose-500/[0.03] text-rose-400 hover:border-rose-400/50 hover:bg-rose-500/[0.06]'
      case 'occupied':
      default:
        return 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/30'
    }
  }

  const getStatusText = () => {
    switch (room.room_status) {
      case 'vacant': return language === 'mr' ? 'रिकामी' : 'Free'
      case 'hold': return language === 'mr' ? 'होल्ड' : 'Hold'
      case 'unpaid': return language === 'mr' ? 'बाकी – जमा करा' : 'Dues – Collect'
      case 'occupied': return language === 'mr' ? 'भरलेली' : 'Occupied'
    }
  }

  return (
    <button
      onClick={() => onClick(room)}
      className={`border rounded-2xl p-3 flex justify-between items-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md w-full text-left ${getStatusBorderColor()}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-slate-100">{room.number}</span>
          <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded-md text-slate-400 truncate">
            {room.room_type.replace(' Deluxe', ' DLX').replace(' Standard', ' STD')}
          </span>
        </div>
        {room.booking?.guests?.name ? (
          <span className="text-[11px] font-semibold text-slate-400 truncate block mt-0.5">
            👤 {room.booking.guests.name}
          </span>
        ) : (
          <span className="text-[10px] text-slate-500 font-medium">
            {language === 'mr' ? 'तयार / उपलब्ध' : 'Ready / Available'}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end flex-shrink-0 ml-2">
        <span className="text-[9px] uppercase tracking-widest font-black opacity-80">
          {getStatusText()}
        </span>
        <span className="text-[10px] text-slate-400 font-bold mt-0.5">
          ₹{room.base_price}
        </span>
      </div>
    </button>
  )
}
