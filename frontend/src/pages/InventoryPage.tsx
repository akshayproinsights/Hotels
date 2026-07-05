import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Layers, ShieldAlert, Loader2, X, ChevronDown, ChevronUp, CheckCircle, LogOut } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import RoomCard from '../components/RoomCard'
import BlockRoomSheet from '../components/BlockRoomSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import type { InventoryRoom } from '../types'
import NumericKeypad from '../components/NumericKeypad'
import { useLanguage } from '../context/LanguageContext'
import { formatNameByLanguage } from '../utils/nameHelper'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cancelBooking, restoreBooking, updateBooking } from '../api/bookings'
import { getCustomerNameDisplay } from '../utils/customer'
import { formatIST_AMPM, formatIST_Date } from '../utils/istTime'

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const { language, t } = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [autoCheckoutMode, setAutoCheckoutMode] = useState(false)
  const [bookingCheckInISO, setBookingCheckInISO] = useState<string | undefined>(undefined)
  const [briefTab, setBriefTab] = useState<'arrivals' | 'checkouts' | 'staying'>('arrivals')
  const [isBriefExpanded, setIsBriefExpanded] = useState<boolean>(false)
  const [quickActionRoom, setQuickActionRoom] = useState<InventoryRoom | null>(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<{ id: string; roomNumber: string; customerName: string } | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'vacant' | 'due-out' | 'stayover' | 'unpaid' | 'arrivals'>('all')

  // Quick action inline confirm state
  const [quickConfirm, setQuickConfirm] = useState<{
    bookingId: string
    action: 'checkin' | 'checkout'
    customerName: string
    dues: number
    totalAmount: number
    paidAmount: number
    paymentMode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
    isPaidAmountModified?: boolean
  } | null>(null)
  const [quickPaymentMode, setQuickPaymentMode] = useState<'Cash' | 'UPI' | 'IDFC'>('IDFC')
  const [activeKeypad, setActiveKeypad] = useState<'total' | 'paid' | null>(null)

  // Check-in mutation (fires directly from Quick Action sheet)
  const quickCheckInMutation = useMutation({
    mutationFn: ({ bookingId, totalAmount, paidAmount, paymentMode }: { bookingId: string; totalAmount: number; paidAmount: number; paymentMode: 'Cash' | 'UPI' | 'IDFC' | 'Pending' }) => {
      const updates: Parameters<typeof updateBooking>[1] = {
        is_checked_in: true,
        total_amount: totalAmount,
        paid_amount: paidAmount,
      }
      // Always save the selected payment mode — never silently discard it.
      // Only payment_status depends on how much was actually paid.
      updates.payment_mode = paymentMode
      if (paidAmount > 0) {
        if (paidAmount >= totalAmount && totalAmount > 0) {
          updates.payment_status = 'paid'
        } else {
          updates.payment_status = 'partial'
        }
      } else {
        updates.payment_status = 'unpaid'
      }
      return updateBooking(bookingId, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      toast.success(language === 'mr' ? '✅ चेक-इन यशस्वी!' : '✅ Checked in successfully!')
      setQuickConfirm(null)
      setQuickActionRoom(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || (language === 'mr' ? 'चेक-इन अयशस्वी' : 'Check-in failed'))
    }
  })

  // Check-out mutation (fires directly from Quick Action sheet)
  const quickCheckOutMutation = useMutation({
    mutationFn: ({
      bookingId,
      paymentMode,
      totalAmount,
      paidAmount,
      duesWasCollected,
      previousMode,
      previousPaid,
      previousNotes,
    }: {
      bookingId: string
      paymentMode: 'Cash' | 'UPI' | 'IDFC'
      totalAmount: number
      paidAmount: number
      duesWasCollected: boolean
      previousMode: string
      previousPaid: number
      previousNotes?: string | null
    }) => {
      const finalPaid = duesWasCollected ? totalAmount : paidAmount
      const updates: Parameters<typeof updateBooking>[1] = {
        status: 'checked_out',
        total_amount: totalAmount,
        paid_amount: finalPaid,
        payment_mode: paymentMode,
      }
      if (finalPaid >= totalAmount) {
        updates.payment_status = 'paid'
      } else if (finalPaid > 0) {
        updates.payment_status = 'partial'
      } else {
        updates.payment_status = 'unpaid'
      }
      // Detect split payment: previous partial payment used a different mode
      const additionalPaid = finalPaid - previousPaid
      if (
        previousPaid > 0 &&
        additionalPaid > 0 &&
        previousMode &&
        previousMode !== 'Pending' &&
        previousMode !== paymentMode
      ) {
        const splitNote = `Paid via ${previousMode}: ₹${Math.round(previousPaid).toLocaleString('en-IN')} + ${paymentMode}: ₹${Math.round(additionalPaid).toLocaleString('en-IN')}`
        updates.notes = previousNotes ? `${previousNotes} | ${splitNote}` : splitNote
      }
      return updateBooking(bookingId, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      toast.success(language === 'mr' ? '🚪 चेकआऊट यशस्वी!' : '🚪 Checked out successfully!')
      setQuickConfirm(null)
      setQuickActionRoom(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || (language === 'mr' ? 'चेकआऊट अयशस्वी' : 'Checkout failed'))
    }
  })

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      
      toast((t) => (
        <div className="flex items-center gap-3 text-white">
          <span className="text-sm font-semibold text-white">
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
        position: 'bottom-left',
        style: {
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          borderRadius: '16px',
          minWidth: 'fit-content',
          marginBottom: '4.5rem',
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

  // Lock body scroll when quick action sheet is open so the page doesn't jump
  useEffect(() => {
    if (quickActionRoom) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [quickActionRoom])

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
      setQuickActionRoom(room)
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

  const dailyBookingsAll = data.daily_bookings || []

  // --- Operational stats (front-desk language, matching Front Desk Brief) ---
  // VACANT: rooms with no active booking today
  const vacantCount = data.summary.vacant

  // DUE OUT: active bookings whose checkout date is TODAY (guest still in room)
  const dueOutBookings = dailyBookingsAll.filter(
    (b: any) => b.status === 'active' && formatIST_Date(b.check_out) === selectedDate
  )
  const dueOutCount = dueOutBookings.length

  // UNPAID: any checked-in guest (due out or stayover) with unpaid/partial balance
  const unpaidCount = data.summary.unpaid

  // STAYOVERS: all checked-in guests who are NOT checking out today
  const stayoverCount = dailyBookingsAll.filter(
    (b: any) => b.status === 'active' && b.is_checked_in && formatIST_Date(b.check_out) !== selectedDate
  ).length


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
          .sort((a, b) => a.check_out.localeCompare(b.check_out))
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
                          <span className="truncate">{formatNameByLanguage(dName, language)}</span>
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
            <div
              onClick={() => setIsBriefExpanded(!isBriefExpanded)}
              className="flex items-center justify-between border-b border-slate-800/80 pb-3 cursor-pointer select-none hover:opacity-85 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                  {isViewingToday
                    ? (language === 'mr' ? 'आजचा फ्रंट डेस्क सारांश' : "Today's Front Desk Brief")
                    : (language === 'mr' ? `${formattedDateCompact} फ्रंट डेस्क सारांश` : `${formattedDateCompact} Front Desk Brief`)}
                </h3>
                {isBriefExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
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
                onClick={() => {
                  if (briefTab === 'arrivals') {
                    setIsBriefExpanded(!isBriefExpanded)
                  } else {
                    setBriefTab('arrivals')
                    setIsBriefExpanded(true)
                  }
                }}
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
                onClick={() => {
                  if (briefTab === 'checkouts') {
                    setIsBriefExpanded(!isBriefExpanded)
                  } else {
                    setBriefTab('checkouts')
                    setIsBriefExpanded(true)
                  }
                }}
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
                onClick={() => {
                  if (briefTab === 'staying') {
                    setIsBriefExpanded(!isBriefExpanded)
                  } else {
                    setBriefTab('staying')
                    setIsBriefExpanded(true)
                  }
                }}
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
            {isBriefExpanded && (
              <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1 animate-fade-in">
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
            )}
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

      {/* Operational Room Stats — click to filter the room grid */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {/* VACANT */}
        <button
          onClick={() => setActiveFilter(activeFilter === 'vacant' ? 'all' : 'vacant')}
          className={`glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 transition-all duration-200 active:scale-95 ${
            activeFilter === 'vacant'
              ? 'bg-emerald-500/20 border-emerald-400/60 ring-1 ring-emerald-400/40 shadow-lg shadow-emerald-500/10'
              : 'bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10'
          }`}
        >
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1 sm:gap-1.5">
            <span>🟢</span>
            <span className="truncate">{language === 'mr' ? 'रिकामी' : 'Vacant'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2 tabular-nums">{vacantCount}</span>
        </button>

        {/* DUE OUT */}
        <button
          onClick={() => setActiveFilter(activeFilter === 'due-out' ? 'all' : 'due-out')}
          className={`glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 transition-all duration-200 active:scale-95 ${
            activeFilter === 'due-out'
              ? 'bg-orange-500/20 border-orange-400/60 ring-1 ring-orange-400/40 shadow-lg shadow-orange-500/10'
              : dueOutCount > 0 ? 'bg-orange-500/10 border-orange-500/25 hover:bg-orange-500/15' : 'bg-slate-500/5 border-slate-800 hover:bg-slate-500/10'
          }`}
        >
          <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 sm:gap-1.5 ${
            dueOutCount > 0 ? 'text-orange-400' : 'text-slate-500'
          }`}>
            <span>🚪</span>
            <span className="truncate">{language === 'mr' ? 'निघतात' : 'Due Out'}</span>
          </span>
          <span className={`text-xs sm:text-2xl font-black mt-0.5 sm:mt-2 tabular-nums ${
            dueOutCount > 0 ? 'text-orange-300' : 'text-slate-500'
          }`}>{dueOutCount}</span>
        </button>

        {/* STAYOVERS */}
        <button
          onClick={() => setActiveFilter(activeFilter === 'stayover' ? 'all' : 'stayover')}
          className={`glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 transition-all duration-200 active:scale-95 ${
            activeFilter === 'stayover'
              ? 'bg-sky-500/20 border-sky-400/60 ring-1 ring-sky-400/40 shadow-lg shadow-sky-500/10'
              : stayoverCount > 0 ? 'bg-sky-500/8 border-sky-500/20 hover:bg-sky-500/12' : 'bg-slate-500/5 border-slate-800 hover:bg-slate-500/10'
          }`}
        >
          <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 sm:gap-1.5 ${
            stayoverCount > 0 ? 'text-sky-400' : 'text-slate-500'
          }`}>
            <span>🏨</span>
            <span className="truncate">{language === 'mr' ? 'मुक्काम' : 'Stayovers'}</span>
          </span>
          <span className={`text-xs sm:text-2xl font-black mt-0.5 sm:mt-2 tabular-nums ${
            stayoverCount > 0 ? 'text-sky-300' : 'text-slate-500'
          }`}>{stayoverCount}</span>
        </button>

        {/* UNPAID */}
        <button
          onClick={() => setActiveFilter(activeFilter === 'unpaid' ? 'all' : 'unpaid')}
          className={`glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 transition-all duration-200 active:scale-95 ${
            activeFilter === 'unpaid'
              ? 'bg-rose-500/20 border-rose-400/60 ring-1 ring-rose-400/40 shadow-lg shadow-rose-500/10'
              : unpaidCount > 0 ? 'bg-rose-500/8 border-rose-500/15 hover:bg-rose-500/12' : 'bg-slate-500/5 border-slate-800 hover:bg-slate-500/10'
          }`}
        >
          <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 sm:gap-1.5 ${
            unpaidCount > 0 ? 'text-rose-400' : 'text-slate-500'
          }`}>
            <span>⚠️</span>
            <span className="truncate">{language === 'mr' ? 'बाकी' : 'Unpaid'}</span>
          </span>
          <span className={`text-xs sm:text-2xl font-black mt-0.5 sm:mt-2 tabular-nums ${
            unpaidCount > 0 ? 'text-rose-300' : 'text-slate-500'
          }`}>{unpaidCount}</span>
        </button>
      </div>

      {/* Active filter label */}
      {activeFilter !== 'all' && (
        <div className="flex items-center gap-2 animate-fade-in">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {language === 'mr' ? 'फिल्टर:' : 'Filtering:'}
          </span>
          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg ${
            activeFilter === 'vacant' ? 'bg-emerald-500/15 text-emerald-400' :
            activeFilter === 'due-out' ? 'bg-amber-500/15 text-amber-400' :
            activeFilter === 'stayover' ? 'bg-sky-500/15 text-sky-400' :
            activeFilter === 'unpaid' ? 'bg-rose-500/15 text-rose-400' : ''
          }`}>
            {activeFilter === 'vacant' ? (language === 'mr' ? 'रिकाम्या खोल्या' : 'Vacant Rooms') :
             activeFilter === 'due-out' ? (language === 'mr' ? 'आज निघणारे' : 'Due Out Today') :
             activeFilter === 'stayover' ? (language === 'mr' ? 'मुक्कामी ग्राहक' : 'Stayovers') :
             activeFilter === 'unpaid' ? (language === 'mr' ? 'बाकी रक्कम' : 'Unpaid Dues') : ''}
          </span>
          <button
            onClick={() => setActiveFilter('all')}
            className="text-[10px] font-bold text-slate-600 hover:text-slate-400 transition underline"
          >
            {language === 'mr' ? 'सर्व दाखवा' : 'Show all'}
          </button>
        </div>
      )}



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
                {rooms.map((room) => {
                  // Determine if this room matches the active filter.
                  // Use filter()+some() instead of find() so handoff rooms
                  // (which have BOTH a checkout AND an arrival booking active
                  // on the same day) correctly match whichever filter is active.
                  let matchesFilter = true
                  if (activeFilter !== 'all') {
                    const roomBookings = (data.daily_bookings || []).filter(
                      (b: any) => b.room_id === room.id && b.status === 'active'
                    )
                    if (activeFilter === 'vacant') {
                      matchesFilter = roomBookings.length === 0
                    } else if (activeFilter === 'due-out') {
                      matchesFilter = roomBookings.some((b: any) => formatIST_Date(b.check_out) === selectedDate)
                    } else if (activeFilter === 'stayover') {
                      matchesFilter = roomBookings.some((b: any) => b.is_checked_in && formatIST_Date(b.check_out) !== selectedDate)
                    } else if (activeFilter === 'unpaid') {
                      matchesFilter = roomBookings.some((b: any) => b.is_checked_in && ['unpaid', 'partial'].includes(b.payment_status))
                    }
                  }
                  return (
                    <div
                      key={room.id}
                      className={`transition-all duration-300 ${
                        !matchesFilter ? 'opacity-25 scale-[0.97] pointer-events-none' : ''
                      }`}
                    >
                      <RoomCard
                        room={room}
                        onClick={handleRoomClick}
                        onLongPress={handleRoomLongPress}
                        dailyBookings={data.daily_bookings}
                        selectedDate={selectedDate}
                      />
                    </div>
                  )
                })}
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
          initialCheckInISO={bookingCheckInISO}
          onClose={() => {
            setSelectedRoomForBooking(null)
            setBookingCheckInISO(undefined)
          }}
          onSuccess={() => {
            setSelectedRoomForBooking(null)
            setBookingCheckInISO(undefined)
            refetch()
          }}
        />
      )}

      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          autoCheckout={autoCheckoutMode}
          onClose={() => { setSelectedBookingId(null); setAutoCheckoutMode(false) }}
          onSuccess={(action) => {
            if (action === 'checkout') {
              setSelectedBookingId(null)
              setAutoCheckoutMode(false)
            }
            refetch()
          }}
        />
      )}

      {/* Quick Action Context Menu Modal */}
      {quickActionRoom && (() => {
        const dailyBookings = data.daily_bookings || []
        const roomBookings = dailyBookings.filter(
          (b: any) => b.room_id === quickActionRoom.id && (b.status === 'active' || b.status === 'checked_out')
        ).sort((a: any, b: any) => a.check_in.localeCompare(b.check_in))


        return createPortal(
          <div 
            className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6"
            onClick={() => { setQuickActionRoom(null); setQuickConfirm(null) }}
          >
            <div 
              className="glass-panel w-full md:max-w-sm rounded-t-[32px] md:rounded-3xl bg-slate-900 border-t md:border border-slate-800/80 p-5 pt-3 md:pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-5 flex flex-col gap-4 text-left shadow-2xl relative animate-slide-up md:animate-fade-in"
              onClick={e => e.stopPropagation()}
            >
              {/* Sleek Drag Handle for Mobile PWA */}
              <div className="md:hidden mx-auto w-12 h-1 bg-slate-800 rounded-full mb-1 cursor-pointer" onClick={() => { setQuickActionRoom(null); setQuickConfirm(null) }} />

              {/* Header */}
              <div className="flex justify-between items-center mt-1">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider">
                    {language === 'mr' ? `खोली ${quickActionRoom.number}` : `Room ${quickActionRoom.number}`}
                  </h3>
                  <p className="text-[10px] text-slate-550 font-bold uppercase mt-1">
                    {language === 'mr' ? 'टॅप करा — तपशील उघडेल' : 'Tap card to open full details'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setQuickActionRoom(null); setQuickConfirm(null) }}
                  className="p-1.5 rounded-xl bg-slate-850 border border-slate-800/40 text-slate-400 hover:text-slate-200 transition"
                  title={language === 'mr' ? 'बंद करा' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-0.5">
                {roomBookings.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 italic text-center">
                    {language === 'mr' ? 'कोणतेही बुकिंग नाही' : 'No bookings found'}
                  </p>
                ) : (
                  roomBookings.map((b: any) => {
                    const { name: dName, isDeleted } = getCustomerNameDisplay(b.customers?.name);
                    const isCheckedOut = b.status === 'checked_out';
                    const isCheckedIn = b.is_checked_in;
                    const dues = Math.max(0, (b.total_amount || 0) - (b.paid_amount || 0));
                    const isPaid = dues <= 0;

                    // ID indicator: based on actual uploaded documents from the backend
                    const hasIdProof = Array.isArray(b.documents) && b.documents.length > 0

                    // Format dates into separate date + time for the 2-col block
                    const formatQuickDate = (iso: string) => {
                      const istDate = formatIST_Date(iso)
                      const d = new Date(istDate + 'T00:00:00')
                      const months = language === 'mr'
                        ? ['जाने','फेब्रु','मार्च','एप्रि','मे','जून','जुलै','ऑग','सप्टें','ऑक्टो','नोव्हें','डिसें']
                        : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                      return `${d.getDate()} ${months[d.getMonth()]}`
                    }

                    const inDate = formatQuickDate(b.check_in)
                    const outDate = formatQuickDate(b.check_out)
                    const inTime = formatIST_AMPM(b.check_in)
                    const outTime = formatIST_AMPM(b.check_out)

                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedBookingId(b.id)
                          setQuickActionRoom(null)
                        }}
                        className={`text-left border rounded-2xl flex flex-col gap-0 transition cursor-pointer active:scale-[0.985] overflow-hidden select-none ${
                          isCheckedOut
                            ? 'bg-slate-900/60 border-slate-800/60 opacity-60'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* ── Guest name + status badge ── */}
                        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
                          <span className="text-[13px] font-black text-slate-100 flex items-center gap-1.5 truncate leading-tight">
                            👤 {formatNameByLanguage(dName, language)}
                            {isDeleted && (
                              <span className="bg-rose-500/10 text-rose-400 px-1 py-0.5 rounded text-[8px] font-black border border-rose-500/20 shrink-0">
                                {language === 'mr' ? 'डिलीट' : 'Del'}
                              </span>
                            )}
                          </span>
                          <span className={`text-[9px] px-2.5 py-1 rounded-full font-black border uppercase tracking-wider shrink-0 ml-2 ${
                            isCheckedOut
                              ? 'bg-slate-800/40 text-slate-550 border-slate-750/30'
                              : isCheckedIn
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                          }`}>
                            {isCheckedOut
                              ? (language === 'mr' ? 'चेकआऊट' : 'Checked Out')
                              : isCheckedIn
                                ? (language === 'mr' ? 'आत आहेत' : 'Checked In')
                                : (language === 'mr' ? 'आरक्षित' : 'Reserved')}
                          </span>
                        </div>

                        {/* ── In / Out 2-col date+time block ── */}
                        <div className="grid grid-cols-2 mx-3.5 mb-3 rounded-xl overflow-hidden border border-slate-800/70">
                          <div className="flex flex-col items-start px-3 py-2.5 bg-sky-500/6 border-r border-slate-800/70">
                            <span className="text-[8px] font-black uppercase tracking-widest text-sky-400 mb-1">
                              {language === 'mr' ? '🚌 आगमन' : '🚌 In'}
                            </span>
                            <span className="text-[15px] font-black text-slate-100 leading-none tabular-nums">{inTime}</span>
                            <span className="text-[10px] font-bold text-slate-400 mt-1">{inDate}</span>
                          </div>
                          <div className="flex flex-col items-start px-3 py-2.5 bg-orange-500/5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-orange-400 mb-1">
                              {language === 'mr' ? '🚪 प्रस्थान' : '🚪 Out'}
                            </span>
                            <span className="text-[15px] font-black text-slate-100 leading-none tabular-nums">{outTime}</span>
                            <span className="text-[10px] font-bold text-slate-400 mt-1">{outDate}</span>
                          </div>
                        </div>

                        {/* ── Payment + ID status chips ── */}
                        <div className="flex items-center gap-2 px-3.5 pb-3">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                              ✅ {language === 'mr' ? 'पेमेंट पूर्ण' : 'Paid'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                              ⚠️ {language === 'mr' ? `₹${Math.round(dues).toLocaleString()} बाकी` : `₹${Math.round(dues).toLocaleString()} Due`}
                            </span>
                          )}
                          {hasIdProof ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                              🪪 {language === 'mr' ? 'ID ✓' : 'ID ✓'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
                              🪪 {language === 'mr' ? 'ID ✗' : 'ID ✗'}
                            </span>
                          )}
                        </div>

                        {/* ── Single primary action: Check In OR Check Out ── */}
                        {!isCheckedOut && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isCheckedIn) {
                                // Check In: just open booking detail sheet
                                setSelectedBookingId(b.id)
                                setAutoCheckoutMode(false)
                                setQuickActionRoom(null)
                                return
                              }
                              // Check Out: open booking detail sheet
                              setSelectedBookingId(b.id)
                              setAutoCheckoutMode(false)
                              setQuickActionRoom(null)
                            }}
                            className={`w-full py-3 text-[11px] font-black flex items-center justify-center gap-2 transition-all active:brightness-90 ${
                              isCheckedIn
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            }`}
                          >
                            {isCheckedIn ? (
                              <><LogOut className="h-3.5 w-3.5" /> {language === 'mr' ? 'चेकआऊट करा' : 'Check Out'}</>
                            ) : (
                              <><CheckCircle className="h-3.5 w-3.5" /> {language === 'mr' ? 'चेक-इन करा' : 'Check In'}</>
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* ── Inline Quick Confirm Overlay ── */}
              {quickConfirm && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-t-[32px] md:rounded-3xl p-3 animate-fade-in"
                  onClick={() => setQuickConfirm(null)}
                >
                  <div
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-full max-w-sm flex flex-col gap-3 shadow-2xl overflow-y-auto max-h-[80vh]"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Icon + Title compact row */}
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center border ${
                        quickConfirm.action === 'checkin'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                          : quickConfirm.dues > 0
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                      }`}>
                        {quickConfirm.action === 'checkin'
                          ? <CheckCircle className="h-4 w-4" />
                          : <LogOut className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-100 leading-tight">
                          {quickConfirm.action === 'checkin'
                            ? (language === 'mr' ? 'चेक-इन निश्चित करा' : 'Confirm Check-In')
                            : quickConfirm.dues > 0
                              ? (language === 'mr' ? 'पेमेंट घेऊन चेकआऊट' : 'Collect & Checkout')
                              : (language === 'mr' ? 'चेकआऊट निश्चित करा' : 'Confirm Checkout')}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          <span className="font-extrabold text-slate-300">{quickConfirm.customerName}</span>
                          {' · '}{language === 'mr' ? 'खोली' : 'Room'}{' '}
                          <span className="font-extrabold text-slate-300">{quickActionRoom?.number}</span>
                        </p>
                      </div>
                    </div>

                    {/* ── Payment breakdown + mode picker ── */}
                    {(quickConfirm.action === 'checkout' || quickConfirm.action === 'checkin') && (
                      <>
                        {/* Payment breakdown — compact 3-row table */}
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                          <div className="flex justify-between items-center px-3 py-2 border-b border-slate-800/60">
                            <span className="text-[11px] text-slate-400 font-semibold">
                              {language === 'mr' ? 'एकूण बिल' : 'Total Bill'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveKeypad('total')}
                              className="flex items-center gap-1.5 bg-slate-850 hover:bg-slate-800 active:scale-[0.98] border border-slate-750 px-2.5 py-1 rounded-lg text-slate-200 transition"
                            >
                              <span className="text-xs text-slate-400 font-black">₹</span>
                              <span className="text-sm font-black tabular-nums">{Math.round(quickConfirm.totalAmount).toLocaleString('en-IN')}</span>
                            </button>
                          </div>
                          <div className="flex justify-between items-center px-3 py-2 border-b border-slate-800/60">
                            <span className="text-[11px] text-slate-400 font-semibold">
                              {language === 'mr' ? 'आधीच दिले' : 'Already Paid'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveKeypad('paid')}
                              className="flex items-center gap-1.5 bg-slate-850 hover:bg-slate-800 active:scale-[0.98] border border-slate-750 px-2.5 py-1 rounded-lg text-emerald-400 transition"
                            >
                              <span className="text-xs text-emerald-550 font-black">₹</span>
                              <span className="text-sm font-black tabular-nums">{Math.round(quickConfirm.paidAmount).toLocaleString('en-IN')}</span>
                            </button>
                          </div>
                          <div className="flex justify-between items-center px-3 py-2.5">
                            <span className={`text-[11px] font-black uppercase tracking-wide ${
                              quickConfirm.dues > 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              {quickConfirm.dues > 0
                                ? (language === 'mr' ? '⚠️ बाकी रक्कम' : '⚠️ Balance Due')
                                : (language === 'mr' ? '✅ सर्व पूर्ण' : '✅ All Settled')}
                            </span>
                            <span className={`text-base font-black ${
                              quickConfirm.dues > 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              ₹{Math.round(quickConfirm.dues).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Quick Fully Paid Button */}
                        {quickConfirm.dues > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickConfirm(prev => {
                                if (!prev) return null
                                return {
                                  ...prev,
                                  paidAmount: prev.totalAmount,
                                  dues: 0,
                                  isPaidAmountModified: true,
                                }
                              })
                            }}
                            className="w-full py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] border border-emerald-500/30 text-emerald-400 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                          >
                            ⚡ {language === 'mr' ? `पूर्ण भरले (₹${Math.round(quickConfirm.dues)})` : `Mark Fully Paid (₹${Math.round(quickConfirm.dues).toLocaleString()})`}
                          </button>
                        )}

                        {/* Payment mode picker — single-line horizontal buttons */}
                        {(quickConfirm.dues > 0 || quickConfirm.paidAmount > 0) && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">
                              {language === 'mr' ? 'पेमेंट कसे?' : 'Payment via'}
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {(['Cash', 'UPI', 'IDFC'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setQuickPaymentMode(mode)}
                                  className={`py-2 px-2 rounded-xl border text-[11px] font-black transition flex items-center justify-center gap-1.5 ${
                                    quickPaymentMode === mode
                                      ? mode === 'Cash'
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                                        : mode === 'UPI'
                                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                        : 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                                      : 'bg-slate-800/60 border-slate-700 text-slate-400'
                                  }`}
                                >
                                  {mode === 'Cash' ? '💵' : mode === 'UPI' ? '📱' : '🏦'}
                                  <span>{mode === 'Cash' ? (language === 'mr' ? 'कॅश' : 'Cash') : mode}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setQuickConfirm(null)}
                        className="py-2.5 px-3 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-xl transition hover:bg-slate-700"
                      >
                        {language === 'mr' ? 'परत' : 'Back'}
                      </button>
                      <button
                        type="button"
                        disabled={quickCheckInMutation.isPending || quickCheckOutMutation.isPending}
                        onClick={() => {
                          if (quickConfirm.action === 'checkin') {
                            quickCheckInMutation.mutate({
                              bookingId: quickConfirm.bookingId,
                              totalAmount: quickConfirm.totalAmount,
                              paidAmount: quickConfirm.paidAmount,
                              paymentMode: quickPaymentMode,  // always use selected mode
                            })
                          } else {
                            const duesWasCollected = !quickConfirm.isPaidAmountModified && quickConfirm.dues > 0;
                            // Find the booking object so we can pass previous payment info
                            const bkg = roomBookings.find((rb: any) => rb.id === quickConfirm.bookingId)
                            quickCheckOutMutation.mutate({
                              bookingId: quickConfirm.bookingId,
                              paymentMode: quickPaymentMode,
                              totalAmount: quickConfirm.totalAmount,
                              paidAmount: quickConfirm.paidAmount,
                              duesWasCollected,
                              previousMode: bkg?.payment_mode || 'Pending',
                              previousPaid: bkg?.paid_amount || 0,
                              previousNotes: bkg?.notes || null,
                            })
                          }
                        }}
                        className={`py-2.5 px-3 text-slate-950 text-xs font-black rounded-xl transition shadow-lg disabled:opacity-60 flex items-center justify-center gap-1.5 whitespace-nowrap ${
                          quickConfirm.action === 'checkin'
                            ? 'bg-amber-500 hover:bg-amber-400'
                            : 'bg-emerald-500 hover:bg-emerald-400'
                        }`}
                      >
                        {(quickCheckInMutation.isPending || quickCheckOutMutation.isPending) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : quickConfirm.action === 'checkin' ? (
                          <><CheckCircle className="h-3.5 w-3.5" /> {language === 'mr' ? 'चेक-इन करा' : 'Confirm Check-In'}</>
                        ) : quickConfirm.dues > 0 ? (
                          <><LogOut className="h-3.5 w-3.5" /> {language === 'mr' ? 'Collect & Checkout' : 'Collect & Checkout'}</>
                        ) : (
                          <><LogOut className="h-3.5 w-3.5" /> {language === 'mr' ? 'चेकआऊट करा' : 'Checkout'}</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeKeypad !== null && quickConfirm && (
                <NumericKeypad
                  value={
                    activeKeypad === 'total'
                      ? quickConfirm.totalAmount
                      : activeKeypad === 'paid'
                      ? quickConfirm.paidAmount
                      : ''
                  }
                  onDone={(val) => {
                    const numVal = Number(val) || 0
                    if (activeKeypad === 'total') {
                      setQuickConfirm((prev) => {
                        if (!prev) return null
                        const newTotal = numVal
                        const newDues = Math.max(0, newTotal - prev.paidAmount)
                        return {
                          ...prev,
                          totalAmount: newTotal,
                          dues: newDues,
                        }
                      })
                    } else if (activeKeypad === 'paid') {
                      setQuickConfirm((prev) => {
                        if (!prev) return null
                        const newPaid = numVal
                        const newDues = Math.max(0, prev.totalAmount - newPaid)
                        return {
                          ...prev,
                          paidAmount: newPaid,
                          dues: newDues,
                          isPaidAmountModified: true,
                        }
                      })
                    }
                    setActiveKeypad(null)
                  }}
                  onClose={() => setActiveKeypad(null)}
                  label={
                    activeKeypad === 'total'
                      ? (language === 'mr' ? 'एकूण बिल टाका' : 'Enter Total Bill')
                      : (language === 'mr' ? 'भरलेली रक्कम टाका' : 'Enter Amount Paid')
                  }
                  language={language}
                  keypadType="currency"
                />
              )}
            </div>
          </div>
        , document.body)
      })()}

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
