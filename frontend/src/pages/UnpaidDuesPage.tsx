import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isToday, isBefore, differenceInDays } from 'date-fns'
import { 
  RefreshCw, 
  Loader2, 
  ShieldAlert, 
  IndianRupee,
  Phone,
  CalendarClock,
  XCircle,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Wallet,
  X,
} from 'lucide-react'
import { getUnpaidDues } from '../api/dues'
import BookingDetailSheet from '../components/BookingDetailSheet'
import { useLanguage } from '../context/LanguageContext'
import useLongPress from '../hooks/useLongPress'
import { cancelBooking, restoreBooking } from '../api/bookings'
import toast from 'react-hot-toast'

export default function UnpaidDuesPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeFilter = searchParams.get('filter') || 'all'
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const { language, t } = useLanguage()
  const [quickActionDue, setQuickActionDue] = useState<any | null>(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<{ id: string; roomNumber: string; customerName: string } | null>(null)

  const { 
    data: unpaidData, 
    isLoading: unpaidLoading, 
    isError: unpaidError, 
    refetch: unpaidRefetch,
    isRefetching: unpaidRefetching
  } = useQuery({
    queryKey: ['unpaidDues'],
    queryFn: getUnpaidDues,
  })

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ['unpaidDues'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      
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
                queryClient.invalidateQueries({ queryKey: ['unpaidDues'] })
                queryClient.invalidateQueries({ queryKey: ['inventory'] })
                toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored!', { id: restoreToast })
              } catch (err) {
                toast.error(language === 'mr' ? 'पुनर्संचयित करण्यात अयशस्वी' : 'Failed to restore booking', { id: restoreToast })
              }
            }}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-955 text-xs font-black px-3 py-1.5 rounded-lg transition"
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

  const handleDueLongPress = (due: any) => {
    setQuickActionDue(due)
  }

  // Sort by checkout date (earliest/overdue first), then by highest due amount
  const sortedData = unpaidData
    ? [...unpaidData].sort((a, b) => {
        const dateCompare = a.check_out.localeCompare(b.check_out)
        if (dateCompare !== 0) {
          return dateCompare
        }
        const aDue = a.total_amount - a.paid_amount
        const bDue = b.total_amount - b.paid_amount
        return bDue - aDue
      })
    : []

  const handleCardClick = (bookingId: string) => {
    setSelectedBookingId(bookingId)
  }

  // Helper: get urgency info from checkout date
  function getCheckoutUrgency(checkOut: string) {
    const coDate = parseISO(checkOut)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (isBefore(coDate, today)) {
      const daysOver = differenceInDays(today, coDate)
      const label = language === 'mr' ? `${daysOver} दिवस थकीत` : `Overdue by ${daysOver}d`
      return { label, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', icon: 'overdue' }
    }
    if (isToday(coDate)) {
      const label = language === 'mr' ? 'आज चेकआउट!' : 'Checkout Today!'
      return { label, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20', icon: 'today' }
    }
    const daysLeft = differenceInDays(coDate, today)
    if (daysLeft <= 1) {
      const label = language === 'mr' ? 'उद्या चेकआउट' : 'Checkout Tomorrow'
      return { label, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: 'soon' }
    }
    const label = language === 'mr' ? `चेकआउट: ${format(coDate, 'dd MMM')}` : `Checkout: ${format(coDate, 'dd MMM')}`
    return { label, color: 'text-slate-400', bg: 'bg-slate-800/40 border-slate-700/30', icon: 'normal' }
  }

  // Helper: plain English payment status
  function getStatusLabel(status: string) {
    switch (status) {
      case 'unpaid': return { label: language === 'mr' ? 'पेमेंट केले नाही' : 'Not Paid', color: 'bg-rose-500/15 text-rose-400 border-rose-500/25' }
      case 'partial': return { label: language === 'mr' ? 'अंशतः पेमेंट' : 'Partly Paid', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' }
      case 'reserved': return { label: language === 'mr' ? 'आरक्षित' : 'Reserved', color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
      default:       return { label: status, color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
    }
  }

  const todayDateObj = new Date()
  todayDateObj.setHours(0, 0, 0, 0)

  const urgentDues = sortedData.filter(due => {
    const coDate = parseISO(due.check_out)
    return isBefore(coDate, todayDateObj) || isToday(coDate)
  })

  const futureDues = sortedData.filter(due => {
    const coDate = parseISO(due.check_out)
    return !isBefore(coDate, todayDateObj) && !isToday(coDate)
  })

  const renderDueCard = (due: typeof sortedData[0]) => {
    return (
      <DueCard
        key={due.id}
        due={due}
        onClick={handleCardClick}
        onLongPress={handleDueLongPress}
        language={language}
        getStatusLabel={getStatusLabel}
        getCheckoutUrgency={getCheckoutUrgency}
      />
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28 animate-fade-in">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2 flex-wrap">
            <span>💰 {language === 'mr' ? 'बाकी रक्कम गोळा करा' : 'Dues to Collect'}</span>
            {sortedData.length > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-black px-2.5 py-0.5 rounded-xl animate-fade-in">
                {sortedData.length} {language === 'mr' ? 'खाते' : sortedData.length === 1 ? 'Customer' : 'Customers'}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{language === 'mr' ? 'पेमेंट गोळा करण्यासाठी कार्डवर टॅप करा' : 'Tap any card to open and collect payment'}</p>
        </div>

        <button
          onClick={() => unpaidRefetch()}
          disabled={unpaidRefetching}
          className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${unpaidRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {unpaidLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-slate-400 font-semibold text-sm">{t('fetching_dues')}</p>
        </div>
      ) : unpaidError || !unpaidData ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
          <ShieldAlert className="h-12 w-12 mb-4" />
          <p className="font-semibold">{language === 'mr' ? 'माहिती लोड करण्यात अडचण आली' : 'Error loading payments'}</p>
          <button 
            onClick={() => unpaidRefetch()} 
            className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition"
          >
            {t('try_again')}
          </button>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Filter Tabs */}
          {sortedData.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSearchParams({})}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeFilter === 'all'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <span>{language === 'mr' ? 'सर्व बाकी' : 'All Dues'}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'all' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                  {sortedData.length}
                </span>
              </button>

              <button
                onClick={() => setSearchParams({ filter: 'today' })}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeFilter === 'today'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${activeFilter === 'today' ? 'bg-slate-950 animate-pulse' : 'bg-amber-400'}`} />
                <span>{language === 'mr' ? 'आज देणे / थकीत' : 'Due Today'}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'today' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/20 text-amber-400'}`}>
                  {urgentDues.length}
                </span>
              </button>

              <button
                onClick={() => setSearchParams({ filter: 'future' })}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeFilter === 'future'
                    ? 'bg-slate-200 text-slate-950 shadow-lg shadow-slate-200/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <span>{language === 'mr' ? 'भविष्यातील बाकी' : 'Future Dues'}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'future' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                  {futureDues.length}
                </span>
              </button>
            </div>
          )}

          {/* Guest Cards */}
          {sortedData.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'सर्व पेमेंट पूर्ण!' : 'All Clear!'}</p>
              <p className="text-slate-500 text-xs">{t('no_pending_payments')}</p>
            </div>
          ) : activeFilter === 'today' && urgentDues.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'आज कोणतीही थकीत रक्कम नाही!' : 'No dues today!'}</p>
              <p className="text-slate-500 text-xs">{language === 'mr' ? 'आज किंवा मागील थकबाकी असलेले कोणतेही खाते नाही' : 'There are no accounts due today or overdue'}</p>
            </div>
          ) : activeFilter === 'future' && futureDues.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'भविष्यातील कोणतीही बाकी नाही' : 'No future dues!'}</p>
              <p className="text-slate-500 text-xs">{language === 'mr' ? 'भविष्यात चेकआउट होणारे कोणतेही थकीत खाते नाही' : 'There are no future checkouts with pending dues'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              
              {/* Group 1: Urgent Dues (Checkout Today & Overdue) */}
              {(activeFilter === 'all' || activeFilter === 'today') && urgentDues.length > 0 && (
                <div className="flex flex-col gap-3.5">
                  {activeFilter === 'all' && (
                    <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      <h2 className="text-xs font-black uppercase tracking-wider text-amber-400">
                        {language === 'mr' ? 'आज आणि मागील थकीत रक्कम' : 'Collect Today & Overdue'} ({urgentDues.length})
                      </h2>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {urgentDues.map((due) => renderDueCard(due))}
                  </div>
                </div>
              )}

              {/* Group 2: Future Dues */}
              {(activeFilter === 'all' || activeFilter === 'future') && futureDues.length > 0 && (
                <div className="flex flex-col gap-3.5">
                  {activeFilter === 'all' && (
                    <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                      <span className="h-2 w-2 rounded-full bg-slate-600" />
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                        {language === 'mr' ? 'भविष्यातील थकबाकी' : 'Future Dues'} ({futureDues.length})
                      </h2>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {futureDues.map((due) => renderDueCard(due))}
                  </div>
                </div>
              )}

            </div>
          )}

          {sortedData.length > 0 && (
            <p className="text-center text-[10px] text-slate-600 pt-1">
              <IndianRupee className="inline h-3 w-3 mr-0.5" />
              {language === 'mr' 
                ? 'चेकआऊट तारीख (लवकर असणारे आधी) आणि जास्त बाकी रक्कमेनुसार क्रमवारी लावली आहे · कार्डवर टॅप करा'
                : 'Sorted by checkout date (earliest first) and highest due amount · Tap any card to manage payment'}
            </p>
          )}
        </div>
      )}

      {/* Booking Detail Sheet */}
      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onSuccess={() => unpaidRefetch()}
        />
      )}

      {/* Quick Action Context Menu Modal */}
      {quickActionDue && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl relative">
            <button
              onClick={() => setQuickActionDue(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition animate-pulse"
            >
              <X className="h-4.5 w-4.5" />
            </button>
            <div className="text-left mt-2">
              <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider">
                {language === 'mr' ? `खोली ${quickActionDue.rooms.number} - त्वरित कृती` : `Room ${quickActionDue.rooms.number} - Quick Action`}
              </h3>
              <p className="text-xs text-slate-455 mt-1 font-semibold">
                👤 {quickActionDue.customers?.name} ({language === 'mr' ? 'ग्राहक' : 'Customer'})
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBookingId(quickActionDue.id)
                  setQuickActionDue(null)
                }}
                className="w-full py-3.5 px-4 bg-slate-950 hover:bg-slate-850 text-slate-200 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-slate-855"
              >
                📋 {language === 'mr' ? 'तपशील पहा (View Details)' : 'View Booking Details'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmBooking({
                    id: quickActionDue.id,
                    roomNumber: String(quickActionDue.rooms.number),
                    customerName: quickActionDue.customers?.name || ""
                  })
                  setQuickActionDue(null)
                }}
                className="w-full py-3.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-455 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-rose-500/25"
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
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-455 border-rose-500/25">
              <X className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'बुकिंग रद्द करण्याची खात्री करा' : 'Confirm Cancellation'}
              </h3>
              <p className="text-xs text-slate-455 mt-1.5 leading-relaxed">
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

interface DueCardProps {
  due: any
  onClick: (bookingId: string) => void
  onLongPress: (due: any) => void
  language: string
  getStatusLabel: (status: string) => any
  getCheckoutUrgency: (checkOut: string) => any
}

function DueCard({ due, onClick, onLongPress, language, getStatusLabel, getCheckoutUrgency }: DueCardProps) {
  const longPressHandlers = useLongPress(
    () => onLongPress(due),
    () => onClick(due.id)
  )

  const pending = due.total_amount - due.paid_amount
  const isFullyUnpaid = due.paid_amount === 0
  const paidPct = Math.round((due.paid_amount / due.total_amount) * 100)
  const effectiveStatus = (due.payment_status === 'unpaid' && due.paid_amount > 0) ? 'partial' : due.payment_status
  const statusInfo = getStatusLabel(effectiveStatus)
  const urgency = getCheckoutUrgency(due.check_out)

  return (
    <div
      {...longPressHandlers}
      className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex flex-col gap-3 cursor-pointer hover:border-emerald-500/40 hover:bg-slate-900/50 transition duration-200 group active:scale-[0.99]"
    >
      {/* Row 1: Guest name + Room + Status badge */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-slate-100 font-extrabold text-base group-hover:text-emerald-400 transition flex items-center gap-2 flex-wrap">
            <span className="truncate">{due.customers?.name || due.customers?.phone}</span>
            <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md text-[10px] text-slate-300 font-bold shrink-0">
              {language === 'mr' ? 'खोली' : 'Room'} {due.rooms.number}
            </span>
          </div>

          {/* Tap-to-call phone */}
          <a
            href={`tel:${due.customers?.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 font-medium mt-0.5 transition w-fit"
          >
            <Phone className="h-3 w-3 shrink-0" />
            {due.customers?.phone}
          </a>
        </div>

        {/* Status Badge */}
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border shrink-0 ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Row 2: Progress Bar */}
      <div className="flex flex-col gap-1.5">
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFullyUnpaid
                ? 'w-0'
                : paidPct >= 80
                ? 'bg-emerald-500'
                : 'bg-amber-400'
            }`}
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-500">
            {language === 'mr' ? 'जमा:' : 'Received:'} <span className="text-slate-300 font-bold">₹{due.paid_amount.toLocaleString()}</span>
            <span className="text-slate-600 mx-1">{language === 'mr' ? 'पैकी' : 'of'}</span>
            <span className="text-slate-400 font-bold">₹{due.total_amount.toLocaleString()}</span>
          </span>
          <span className={`font-black ${isFullyUnpaid ? 'text-rose-400' : 'text-amber-300'}`}>
            {language === 'mr' ? 'बाकी:' : 'Due:'} ₹{pending.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Row 3: Checkout urgency + Collect button */}
      <div className="flex justify-between items-center">
        {/* Checkout urgency pill */}
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgency.bg} ${urgency.color}`}>
          {urgency.icon === 'overdue'
            ? <XCircle className="h-3 w-3" />
            : urgency.icon === 'today' || urgency.icon === 'soon'
            ? <Clock3 className="h-3 w-3" />
            : <CalendarClock className="h-3 w-3" />
          }
          {urgency.label}
        </span>

        {/* Collect Payment shortcut */}
        <button
          onClick={(e) => { e.stopPropagation(); onClick(due.id) }}
          className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-extrabold px-3 py-1.5 rounded-xl transition active:scale-95"
        >
          <Wallet className="h-3.5 w-3.5" />
          {language === 'mr' ? 'पेमेंट गोळा करा' : 'Collect'}
          <ChevronRight className="h-3 w-3 opacity-60" />
        </button>
      </div>
    </div>
  )
}
