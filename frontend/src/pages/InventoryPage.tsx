import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Layers, ShieldAlert, Loader2, X } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import RoomCard from '../components/RoomCard'
import BlockRoomSheet from '../components/BlockRoomSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cancelBooking, restoreBooking } from '../api/bookings'
import { getCustomerNameDisplay } from '../utils/customer'
import { formatIST_AMPM } from '../utils/istTime'

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const { language, t } = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [briefTab, setBriefTab] = useState<'arrivals' | 'checkouts' | 'staying'>('arrivals')
  const [quickActionRoom, setQuickActionRoom] = useState<InventoryRoom | null>(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<{ id: string; roomNumber: string; customerName: string } | null>(null)

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      
      toast((t) => (
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">
            {language === 'mr' ? 'बुकिंग रद्द केले' : 'Booking cancelled'}
          </span>
          <button
            onClick={async () => {
              toast.dismiss(t.id)
              const restoreToast = toast.loading(language === 'mr' ? 'पुनर्संचयित करत आहे...' : 'Restoring booking...')
              try {
                await restoreBooking(bookingId)
                queryClient.invalidateQueries({ queryKey: ['inventory'] })
                queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
                queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
                toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored!', { id: restoreToast })
              } catch (err) {
                toast.error(language === 'mr' ? 'पुनर्संचयित करण्यात अयशस्वी' : 'Failed to restore booking', { id: restoreToast })
              }
            }}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-3 py-1.5 rounded-lg transition"
          >
            {language === 'mr' ? 'पूर्वतयारी' : 'Undo'}
          </button>
        </div>
      ), {
        duration: 7000,
        position: 'bottom-center',
        style: {
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: '16px',
        }
      })
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.detail || (language === 'mr' ? 'बुकिंग रद्द करण्यात अडचण आली' : 'Failed to cancel booking')
      toast.error(errorMsg)
    }
  })

  const handleRoomLongPress = (room: InventoryRoom) => {
    if (room.room_status !== 'vacant' && room.booking) {
      setQuickActionRoom(room)
    }
  }

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

  const { data, isLoading, isError, refetch } = useInventory(selectedDate)

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
    const monthsMrCompact = ['जाने', 'फेब्रु', 'मार्च', 'एप्रि', 'मे', 'जून', 'जुलै', 'ऑग', 'सप्टें', 'ऑक्टो', 'नोव्हें', 'डिसें']
    const dayName = compact ? daysMrCompact[parsed.getDay()] : daysMr[parsed.getDay()]
    const monthName = monthsMr[parsed.getMonth()]
    return compact 
      ? `${dayName}, ${parsed.getDate()} ${monthsMrCompact[parsed.getMonth()]}`
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
      {/* Today's / Historical Front Desk Brief Card */}
      {(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const isViewingToday = selectedDate === todayStr

        const dailyBookings = data.daily_bookings || []

        // Arrivals: check_in is on selected Date
        const arrivals = dailyBookings
          .filter(b => b.check_in.startsWith(selectedDate))
          .sort((a, b) => a.check_in.localeCompare(b.check_in))
        // Pending arrivals = not yet checked in (and must be active)
        const arrivalsPending = arrivals.filter(b => b.status === 'active' && !b.is_checked_in)

        // Checkouts: check_out is on selected Date
        const checkouts = dailyBookings
          .filter(b => b.check_out.startsWith(selectedDate))
          .sort((a, b) => b.check_out.localeCompare(a.check_out))
        // Pending checkouts = still active and not yet checked out
        const checkoutsPending = checkouts.filter(b => b.status === 'active')
        // Done checkouts = already checked out (room freed)
        const checkoutsDone = checkouts.filter(b => b.status === 'checked_out')


        // Total In-House — read from data.rooms which is already deduplicated per room by backend.
        // Rooms with room_status 'occupied' or 'unpaid' are physically occupied by a checked-in guest.
        // This prevents showing Room 101 twice when two bookings overlap (one departing, one arriving).
        const inHouseBookings = (data.rooms || [])
          .filter((r: any) => r.room_status === 'occupied' || r.room_status === 'unpaid')
          .map((r: any) => r.booking)
          .filter(Boolean)
        // Badge count from backend summary (always equals inHouseBookings.length now)
        const inHouseCount = data.summary.occupied

        const hasActivity = arrivals.length > 0 || checkouts.length > 0 || inHouseCount > 0
        if (!hasActivity) return null

        // Smart: auto-highlight the tab with most pending work
        const arrivalsPendingCount = arrivalsPending.length
        const checkoutsPendingCount = checkoutsPending.length

        // Helper: render a customer action row
        const CustomerRow = ({ b, variant }: { b: typeof arrivals[0], variant: 'arrival' | 'checkout' | 'staying' }) => {
          const isDone =
            variant === 'arrival' ? b.is_checked_in :
            variant === 'checkout' ? b.status === 'checked_out' :
            false

          const colorSet = {
            arrival: { pending: 'bg-amber-500/8 border-amber-500/20', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-amber-500 text-slate-955', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-amber-500/10 text-amber-400 border-amber-500/25', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
            checkout: { pending: 'bg-rose-500/8 border-rose-500/20', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-rose-500 text-white', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-rose-500/10 text-rose-400 border-rose-500/25', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
            staying: { pending: 'bg-emerald-500/5 border-emerald-800/40', done: 'bg-slate-800/30 border-slate-700/30', badge_pending: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', badge_done: 'bg-slate-700/60 text-slate-400', room_pending: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', room_done: 'bg-slate-800 text-slate-500 border-slate-700/30' },
          }[variant]

          const badgeLabel = variant === 'arrival'
            ? (isDone ? (language === 'mr' ? '✓ हजर' : '✓ In') : formatIST_AMPM(b.check_in))
            : variant === 'checkout'
            ? (isDone ? (language === 'mr' ? '✓ गेले' : '✓ Out') : formatIST_AMPM(b.check_out))
            : (language === 'mr' ? 'मुक्काम' : 'Staying')

          const subtitleLabel = variant === 'arrival'
            ? (language === 'mr' ? (isViewingToday ? 'आगमन आज' : 'आगमन') : (isViewingToday ? 'Check-In Today' : 'Check-In'))
            : variant === 'checkout'
            ? (language === 'mr' ? (isViewingToday ? 'प्रस्थान आज' : 'प्रस्थान') : (isViewingToday ? 'Check-Out Today' : 'Check-Out'))
            : (language === 'mr' ? 'मुक्कामी ग्राहक' : 'In-House Customer')

          return (
            <div
              key={b.id}
              onClick={() => setSelectedBookingId(b.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left cursor-pointer select-none ${
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
                  <p className={`text-xs font-black truncate flex items-center gap-1 ${isDone ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                    {(() => {
                      const { name: dName, isDeleted } = getCustomerNameDisplay(b.customers?.name);
                      return (
                        <>
                          <span className="truncate">{dName}</span>
                          {isDeleted && (
                            <span className="bg-rose-500/10 text-rose-455 px-1 rounded text-[8px] font-black border border-rose-500/20 shrink-0 whitespace-nowrap">
                              {language === 'mr' ? 'डिलीट' : 'Deleted'}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </p>
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
            </div>
          )
        }

        return (
          <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-4 shadow-lg">
            {/* Title / Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                  {isViewingToday
                    ? (language === 'mr' ? 'आजचा फ्रंट डेस्क सारांश' : "Today's Front Desk Brief")
                    : (language === 'mr' ? `${formattedDateCompact} फ्रंट डेस्क सारांश` : `${formattedDateCompact} Front Desk Brief`)}
                </h3>
              </div>
              {/* Live urgency indicator */}
              {(arrivalsPendingCount > 0 || checkoutsPendingCount > 0) ? (
                <span className="text-[9px] font-black text-amber-955 bg-amber-400 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
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
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-slate-955 text-[8px] font-black rounded-full flex items-center justify-center">
                    {arrivalsPendingCount}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <span>🚌</span>
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
                  {inHouseCount} {language === 'mr' ? 'खोल्या' : 'Rooms'}
                </span>
              </button>
            </div>

            {/* List for the selected tab */}
            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
              {briefTab === 'arrivals' && (
                <>
                  {arrivals.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' 
                        ? (isViewingToday ? '🌙 आज कोणतेही आगमन नियोजित नाही.' : '🌙 या दिवशी कोणतेही आगमन नियोजित नाही.') 
                        : (isViewingToday ? '🌙 No arrivals scheduled for today.' : '🌙 No arrivals scheduled for this day.')}
                    </div>
                  ) : arrivalsPending.length === 0 ? (
                    // All arrivals done — celebration
                    <div className="text-center py-3 text-xs font-bold text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                      🎉 {language === 'mr' ? 'सर्व ग्राहक आले! खोल्या Occupied आहेत.' : 'All customers checked in! Rooms are now Occupied.'}
                    </div>
                  ) : (
                    // Pending only
                    arrivalsPending.map(b => <CustomerRow key={b.id} b={b} variant="arrival" />)
                  )}
                </>
              )}

              {briefTab === 'checkouts' && (
                <>
                  {checkouts.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' 
                        ? (isViewingToday ? '🌙 आज कोणतेही प्रस्थान नियोजित नाही.' : '🌙 या दिवशी कोणतेही प्रस्थान नियोजित नाही.') 
                        : (isViewingToday ? '🌙 No departures scheduled for today.' : '🌙 No departures scheduled for this day.')}
                    </div>
                  ) : checkoutsPending.length === 0 ? (
                    // All checkouts done — rooms freed
                    <>
                      <div className="text-center py-3 text-xs font-bold text-emerald-400 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                        🎉 {language === 'mr' ? 'सर्व ग्राहक निघाले! खोल्या आता Free आहेत.' : 'All customers checked out! Rooms are now Free.'}
                      </div>
                      {checkoutsDone.map(b => <CustomerRow key={b.id} b={b} variant="checkout" />)}
                    </>
                  ) : (
                    // Pending first (urgent), done dimmed below
                    <>
                      {checkoutsPending.map(b => <CustomerRow key={b.id} b={b} variant="checkout" />)}
                      {checkoutsDone.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-1">
                            <div className="flex-1 h-px bg-slate-800"/>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                              {language === 'mr' ? '✓ निघाले • खोली Free' : '✓ Checked Out • Room Free'}
                            </span>
                            <div className="flex-1 h-px bg-slate-800"/>
                          </div>
                          {checkoutsDone.map(b => <CustomerRow key={b.id} b={b} variant="checkout" />)}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {briefTab === 'staying' && (
                <>
                  {inHouseBookings.length === 0 ? (
                    <div className="text-center py-5 text-xs text-slate-500 italic bg-slate-955/20 rounded-xl border border-slate-850/60 border-dashed">
                      {language === 'mr' ? 'सध्या हॉटेलात इतर मुक्कामी ग्राहक नाहीत.' : 'No other staying customers.'}
                    </div>
                  ) : (
                    inHouseBookings.map(b => <CustomerRow key={b.id} b={b} variant="staying" />)
                  )}
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Date Navigation Bar */}
      <div className="glass-panel rounded-2xl p-2.5 sm:p-4 flex justify-center bg-slate-900/40">
        {/* Primary Date Switcher */}
        <div className="flex items-center justify-between gap-3 w-full max-w-md">
          <button
            onClick={handlePrevDay}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-955 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition active:scale-95 flex-shrink-0"
            title={language === 'mr' ? 'पूर्वीचा दिवस' : 'Previous Day'}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <div className="flex items-center gap-2 flex-1 justify-center">
            <button
              onClick={() => navigate(`/?date=${selectedDate}`)}
              className="flex items-center gap-2 hover:bg-slate-850/60 bg-slate-955/40 border border-slate-850 px-3 py-2.5 rounded-xl transition active:scale-95 text-left"
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
              className="px-3 py-2.5 bg-slate-955 border border-slate-850 rounded-xl hover:bg-slate-900 text-xs font-black text-emerald-400 active:scale-95 transition"
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
            <span className="truncate">{language === 'mr' ? 'आरक्षित' : 'Reserved'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.reserved}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-rose-500/5 border-rose-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-rose-500 flex items-center gap-1 sm:gap-1.5">
            <span>⚠️</span>
            <span className="truncate">{language === 'mr' ? 'बाकी' : 'Unpaid'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.unpaid}</span>
        </div>
      </div>

      {/* Floors Room Layout */}
      <div className="flex flex-col gap-8">
        {sortedFloors.map((floor) => {
          const rooms = roomsByFloor[floor]

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
              </div>
              
              {/* Grid Cards Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onClick={handleRoomClick}
                    onLongPress={handleRoomLongPress}
                  />
                ))}
              </div>
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

      {/* Quick Action Context Menu Modal */}
      {quickActionRoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl relative">
            <button
              onClick={() => setQuickActionRoom(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition animate-pulse"
            >
              <X className="h-4.5 w-4.5" />
            </button>
            <div className="text-left mt-2">
              <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider">
                {language === 'mr' ? `खोली ${quickActionRoom.number} - त्वरित कृती` : `Room ${quickActionRoom.number} - Quick Action`}
              </h3>
              <p className="text-xs text-slate-450 mt-1 font-semibold flex items-center gap-1">
                👤 {(() => {
                  const { name: dName, isDeleted } = getCustomerNameDisplay(quickActionRoom.booking?.customers?.name);
                  return (
                    <>
                      <span>{dName}</span>
                      {isDeleted && (
                        <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1">
                          {language === 'mr' ? 'डिलीट केलेला' : 'Deleted'}
                        </span>
                      )}
                    </>
                  );
                })()} ({language === 'mr' ? 'ग्राहक' : 'Customer'})
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBookingId(quickActionRoom.booking!.id)
                  setQuickActionRoom(null)
                }}
                className="w-full py-3.5 px-4 bg-slate-955 hover:bg-slate-850 text-slate-200 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-slate-850"
              >
                📋 {language === 'mr' ? 'तपशील पहा (View Details)' : 'View Booking Details'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmBooking({
                    id: quickActionRoom.booking!.id,
                    roomNumber: String(quickActionRoom.number),
                    customerName: getCustomerNameDisplay(quickActionRoom.booking!.customers?.name).name || ""
                  })
                  setQuickActionRoom(null)
                }}
                className="w-full py-3.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-rose-500/25"
              >
                ❌ {language === 'mr' ? 'बुकिंग रद्द करा (Cancel Booking)' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelConfirmBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-400 border-rose-500/25">
              <X className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'बुकिंग रद्द करण्याची खात्री करा' : 'Confirm Cancellation'}
              </h3>
              <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
                {language === 'mr' ? (
                  <>खोली क्रमांक <span className="font-extrabold text-slate-200">{cancelConfirmBooking.roomNumber}</span> मधील ग्राहक <span className="font-extrabold text-slate-200">{cancelConfirmBooking.customerName}</span> यांचे बुकिंग रद्द करायचे आहे का? हे आपण नंतर Settings मधून पुनर्संचयित करू शकता.</>
                ) : (
                  <>Cancel the booking for <span className="font-extrabold text-slate-200">{cancelConfirmBooking.customerName}</span> in Room <span className="font-extrabold text-slate-200">{cancelConfirmBooking.roomNumber}</span>? You can restore this later from Settings.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                type="button"
                onClick={() => setCancelConfirmBooking(null)}
                className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelMutation.mutate(cancelConfirmBooking.id)
                  setCancelConfirmBooking(null)
                }}
                disabled={cancelMutation.isPending}
                className="py-2.5 px-4 text-white text-xs font-black rounded-xl transition shadow-lg bg-rose-500 hover:bg-rose-400 active:bg-rose-500 shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, रद्द करा' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
