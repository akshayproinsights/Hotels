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
  CheckCircle2,
  Wallet,
  X,
} from 'lucide-react'
import { getUnpaidDues, UnpaidDuesResponse } from '../api/dues'
import BookingDetailSheet from '../components/BookingDetailSheet'
import { useLanguage } from '../context/LanguageContext'
import { getCustomerNameDisplay, cleanPhoneDisplay } from '../utils/customer'
import { shortenLongName, formatNameByLanguage } from '../utils/nameHelper'
import useLongPress from '../hooks/useLongPress'
import { cancelBooking, restoreBooking } from '../api/bookings'
import toast from 'react-hot-toast'

export interface CustomerDueGroup {
  groupKey: string
  customerName: string
  customerPhone: string
  isDeleted: boolean
  bookings: UnpaidDuesResponse[]
  totalDue: number
  mostUrgentCheckout: string
  hasAnyOverdue: boolean
  hasAnyToday: boolean
}

function groupDuesByCustomer(dues: UnpaidDuesResponse[]): CustomerDueGroup[] {
  const map = new Map<string, UnpaidDuesResponse[]>()

  for (const due of dues) {
    const rawPhone = due.customers?.phone ?? ''
    const cleanPhone = cleanPhoneDisplay(rawPhone)
    const rawName = due.customers?.name ?? ''
    const groupKey = cleanPhone || rawName || due.id

    if (!map.has(groupKey)) map.set(groupKey, [])
    map.get(groupKey)!.push(due)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const groups: CustomerDueGroup[] = []

  for (const [groupKey, bookings] of map.entries()) {
    const sorted = [...bookings].sort((a, b) => a.check_out.localeCompare(b.check_out))

    const totalDue = sorted.reduce((sum, b) => sum + (b.total_amount - b.paid_amount), 0)
    const mostUrgentCheckout = sorted[0].check_out
    
    const rawName = sorted[0].customers?.name ?? ''
    const { isDeleted } = getCustomerNameDisplay(rawName)

    const hasAnyOverdue = sorted.some(b => isBefore(parseISO(b.check_out), today))
    const hasAnyToday   = sorted.some(b => isToday(parseISO(b.check_out)))

    groups.push({
      groupKey,
      customerName: rawName,
      customerPhone: sorted[0].customers?.phone ?? '',
      isDeleted,
      bookings: sorted,
      totalDue,
      mostUrgentCheckout,
      hasAnyOverdue,
      hasAnyToday,
    })
  }

  return groups
}

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

  const handleDueLongPress = (due: any) => {
    setQuickActionDue(due)
  }

  // Group the unpaid dues by customer
  const allGroups = unpaidData ? groupDuesByCustomer(unpaidData) : []

  // Sort groups: most urgent checkout first, then by total due amount descending
  const groupedData = [...allGroups].sort((a, b) => {
    const dateCompare = a.mostUrgentCheckout.localeCompare(b.mostUrgentCheckout)
    if (dateCompare !== 0) {
      return dateCompare
    }
    return b.totalDue - a.totalDue
  })

  const handleCardClick = (bookingId: string) => {
    setSelectedBookingId(bookingId)
  }

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
    const label = language === 'mr' ? `चेकआउट: ${format(coDate, 'dd MMM, hh:mm a')}` : `Checkout: ${format(coDate, 'dd MMM, hh:mm a')}`
    return { label, color: 'text-slate-400', bg: 'bg-slate-800/40 border-slate-700/30', icon: 'normal' }
  }

  function getStatusLabel(paymentStatus: string, paymentMode?: string | null, bookingStatus?: string) {
    const isCheckoutPending = bookingStatus === 'checked_out' && paymentMode === 'Pending'
    if (isCheckoutPending) {
      return {
        label: language === 'mr' ? 'चेकआऊट · पेमेंट प्रलंबित' : 'Checked Out · Pay Later',
        color: 'bg-orange-500/15 text-orange-400 border-orange-500/25'
      }
    }
    switch (paymentStatus) {
      case 'unpaid': return { label: language === 'mr' ? 'पेमेंट केले नाही' : 'Not Paid', color: 'bg-rose-500/15 text-rose-400 border-rose-500/25' }
      case 'partial': return { label: language === 'mr' ? 'अंशतः पेमेंट' : 'Partly Paid', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' }
      case 'reserved': return { label: language === 'mr' ? 'आरक्षित' : 'Reserved', color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
      default:       return { label: paymentStatus, color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
    }
  }

  const todayDateObj = new Date()
  todayDateObj.setHours(0, 0, 0, 0)

  // Filtering groups based on active filter
  const urgentGroups = groupedData.filter(g => g.hasAnyOverdue || g.hasAnyToday)
  const futureGroups = groupedData.filter(g => !g.hasAnyOverdue && !g.hasAnyToday)

  // Counts of bookings/rooms for filter tabs and counts badge
  const totalBookingsCount = groupedData.reduce((acc, g) => acc + g.bookings.length, 0)
  const urgentBookingsCount = urgentGroups.reduce((acc, g) => acc + g.bookings.length, 0)
  const futureBookingsCount = futureGroups.reduce((acc, g) => acc + g.bookings.length, 0)

  const renderGroup = (group: CustomerDueGroup) => {
    return (
      <CustomerDueGroupCard
        key={group.groupKey}
        group={group}
        onCollect={handleCardClick}
        onLongPress={handleDueLongPress}
        language={language}
        getStatusLabel={(status: string, mode?: string | null, bStatus?: string) => getStatusLabel(status, mode, bStatus)}
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
            {totalBookingsCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-black px-2.5 py-0.5 rounded-xl animate-fade-in">
                {totalBookingsCount} {language === 'mr' ? 'खोल्या' : totalBookingsCount === 1 ? 'Room' : 'Rooms'}
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{language === 'mr' ? 'पेमेंट गोळा करण्यासाठी कार्डवर टॅप करा' : 'Tap any card to open and collect payment'}</p>
        </div>

        <button
          onClick={() => unpaidRefetch()}
          disabled={unpaidRefetching}
          className="p-2.5 rounded-xl bg-slate-955 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
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
          {totalBookingsCount > 0 && (
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
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'all' ? 'bg-slate-955/20 text-slate-955' : 'bg-slate-800 text-slate-400'}`}>
                  {totalBookingsCount}
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
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'today' ? 'bg-slate-955/20 text-slate-955' : 'bg-amber-500/20 text-amber-400'}`}>
                  {urgentBookingsCount}
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
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activeFilter === 'future' ? 'bg-slate-955/20 text-slate-955' : 'bg-slate-800 text-slate-400'}`}>
                  {futureBookingsCount}
                </span>
              </button>
            </div>
          )}

          {/* Guest Cards */}
          {totalBookingsCount === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'सर्व पेमेंट पूर्ण!' : 'All Clear!'}</p>
              <p className="text-slate-500 text-xs">{t('no_pending_payments')}</p>
            </div>
          ) : activeFilter === 'today' && urgentBookingsCount === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'आज कोणतीही थकीत रक्कम नाही!' : 'No dues today!'}</p>
              <p className="text-slate-500 text-xs">{language === 'mr' ? 'आज किंवा मागील थकबाकी असलेले कोणतेही खाते नाही' : 'There are no accounts due today or overdue'}</p>
            </div>
          ) : activeFilter === 'future' && futureBookingsCount === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'भविष्यातील कोणतीही बाकी नाही' : 'No future dues!'}</p>
              <p className="text-slate-500 text-xs">{language === 'mr' ? 'भविष्यात चेकआउट होणारे कोणतेही थकीत खाते नाही' : 'There are no future checkouts with pending dues'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              
              {/* Group 1: Urgent Dues (Checkout Today & Overdue) */}
              {(activeFilter === 'all' || activeFilter === 'today') && urgentGroups.length > 0 && (
                <div className="flex flex-col gap-3.5">
                  {activeFilter === 'all' && (
                    <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      <h2 className="text-xs font-black uppercase tracking-wider text-amber-400">
                        {language === 'mr' ? 'आज आणि मागील थकीत रक्कम' : 'Collect Today & Overdue'} ({urgentBookingsCount})
                      </h2>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {urgentGroups.map((group) => renderGroup(group))}
                  </div>
                </div>
              )}

              {/* Group 2: Future Dues */}
              {(activeFilter === 'all' || activeFilter === 'future') && futureGroups.length > 0 && (
                <div className="flex flex-col gap-3.5">
                  {activeFilter === 'all' && (
                    <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                      <span className="h-2 w-2 rounded-full bg-slate-600" />
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                        {language === 'mr' ? 'भविष्यातील थकबाकी' : 'Future Dues'} ({futureBookingsCount})
                      </h2>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {futureGroups.map((group) => renderGroup(group))}
                  </div>
                </div>
              )}

            </div>
          )}

          {totalBookingsCount > 0 && (
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
              <p className="text-xs text-slate-455 mt-1 font-semibold flex items-center gap-1">
                👤 {(() => {
                  const { name: dName, isDeleted } = getCustomerNameDisplay(quickActionDue.customers?.name);
                  const displayName = formatNameByLanguage(dName, language);
                  return (
                    <>
                      <span>{displayName}</span>
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
                  setSelectedBookingId(quickActionDue.id)
                  setQuickActionDue(null)
                }}
                className="w-full py-3.5 px-4 bg-slate-950 hover:bg-slate-855 text-slate-200 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-slate-855"
              >
                📋 {language === 'mr' ? 'तपशील पहा (View Details)' : 'View Booking Details'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmBooking({
                    id: quickActionDue.id,
                    roomNumber: String(quickActionDue.rooms.number),
                    customerName: formatNameByLanguage(getCustomerNameDisplay(quickActionDue.customers?.name).name, language) || ""
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

interface CustomerDueGroupCardProps {
  group: CustomerDueGroup
  onCollect: (bookingId: string) => void
  onLongPress: (due: any) => void
  language: string
  getStatusLabel: (status: string, paymentMode?: string | null, bookingStatus?: string) => any
  getCheckoutUrgency: (checkOut: string) => any
}

function CustomerDueGroupCard({
  group,
  onCollect,
  onLongPress,
  language,
  getStatusLabel,
  getCheckoutUrgency,
}: CustomerDueGroupCardProps) {
  const urgency = getCheckoutUrgency(group.mostUrgentCheckout)
  const displayName = shortenLongName(formatNameByLanguage(group.customerName, language))

  // ── SINGLE ROOM: compact 2-row card (same feel as before) ──────────────
  if (group.bookings.length === 1) {
    const booking = group.bookings[0]
    const pending = booking.total_amount - booking.paid_amount
    const isFullyUnpaid = booking.paid_amount === 0
    const effectiveStatus = (booking.payment_status === 'unpaid' && booking.paid_amount > 0) ? 'partial' : booking.payment_status
    const statusInfo = getStatusLabel(effectiveStatus, booking.payment_mode, booking.status)

    return (
      <SingleRoomCard
        booking={booking}
        displayName={displayName}
        isDeleted={group.isDeleted}
        phone={group.customerPhone}
        pending={pending}
        isFullyUnpaid={isFullyUnpaid}
        statusInfo={statusInfo}
        urgency={urgency}
        onCollect={onCollect}
        onLongPress={onLongPress}
        language={language}
      />
    )
  }

  // ── MULTI-ROOM: full grouped breakdown ──────────────────────────────────
  return (
    <div className="px-4 py-3.5 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex flex-col gap-3 transition duration-200">
      
      {/* Group Header Row 1: Customer Name & Room Badges & Total Due */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-100 font-extrabold text-sm tracking-tight flex items-center gap-1.5">
              👤 {displayName}
              {group.isDeleted && (
                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 whitespace-nowrap shrink-0">
                  {language === 'mr' ? 'डिलीट' : 'Del'}
                </span>
              )}
            </span>
            {/* Room number badges — all rooms for this person */}
            <div className="flex gap-1 flex-wrap items-center">
              {group.bookings.map(b => (
                <span key={b.id} className="bg-slate-800/60 border border-slate-700/50 px-1.5 py-0.5 rounded-[6px] text-[9px] text-slate-400 font-extrabold">
                  {b.rooms.number}
                </span>
              ))}
            </div>
          </div>

          {/* Row 2: Phone tap-to-call + urgency */}
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            {group.customerPhone && (
              <a
                href={`tel:${cleanPhoneDisplay(group.customerPhone)}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-400 font-medium transition shrink-0"
              >
                <Phone className="h-3 w-3 shrink-0" />
                {cleanPhoneDisplay(group.customerPhone)}
              </a>
            )}
            <span className={`flex items-center gap-1 text-[10px] font-extrabold shrink-0 ${urgency.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                urgency.icon === 'overdue' ? 'bg-rose-400 animate-pulse' :
                urgency.icon === 'today' ? 'bg-amber-400 animate-pulse' :
                urgency.icon === 'soon' ? 'bg-yellow-400' : 'bg-slate-500'
              }`} />
              {urgency.label}
            </span>
          </div>
        </div>

        {/* Total due (sum across all rooms) */}
        <div className="text-right shrink-0 flex flex-col items-end">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
            {language === 'mr' ? 'एकूण बाकी' : 'Total Due'}
          </span>
          <span className={`text-base font-black tracking-tight ${group.hasAnyOverdue ? 'text-rose-400' : 'text-amber-300'}`}>
            ₹{Math.round(group.totalDue).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Divider */}
      <hr className="border-slate-800/60" />

      {/* One row per room */}
      <div className="flex flex-col gap-2">
        {group.bookings.map((booking) => (
          <RoomRow
            key={booking.id}
            booking={booking}
            onCollect={onCollect}
            onLongPress={onLongPress}
            language={language}
            getStatusLabel={getStatusLabel}
            getCheckoutUrgency={getCheckoutUrgency}
          />
        ))}
      </div>
    </div>
  )
}

// Compact card for single-room guests — same 2-row layout as before
interface SingleRoomCardProps {
  booking: any
  displayName: string
  isDeleted: boolean
  phone: string
  pending: number
  isFullyUnpaid: boolean
  statusInfo: any
  urgency: any
  onCollect: (bookingId: string) => void
  onLongPress: (due: any) => void
  language: string
}

function SingleRoomCard({
  booking,
  displayName,
  isDeleted,
  phone,
  pending,
  isFullyUnpaid,
  statusInfo,
  urgency,
  onCollect,
  onLongPress,
  language,
}: SingleRoomCardProps) {
  const longPressHandlers = useLongPress(
    () => onLongPress(booking),
    () => onCollect(booking.id)
  )

  const dateStr = `${format(parseISO(booking.check_in), 'dd MMM')} → ${format(parseISO(booking.check_out), 'dd MMM')}`

  return (
    <div
      {...longPressHandlers}
      className="px-3.5 py-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex flex-col gap-2 cursor-pointer hover:border-emerald-500/40 hover:bg-slate-900/50 transition duration-200 group active:scale-[0.99]"
    >
      {/* Row 1: Name + Room badge + Date + Status */}
      <div className="flex justify-between items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-slate-100 font-extrabold text-sm group-hover:text-emerald-400 transition truncate flex items-center gap-1.5">
            <span className="truncate">{displayName}</span>
            {isDeleted && (
              <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 whitespace-nowrap shrink-0">
                {language === 'mr' ? 'डिलीट' : 'Del'}
              </span>
            )}
          </span>
          <span className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-bold shrink-0 whitespace-nowrap">
            {booking.rooms.number}
          </span>
          {/* Date sits right after room number — clean, no clutter */}
          <span className="text-[10px] text-slate-500 font-medium shrink-0 whitespace-nowrap">
            {dateStr}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Row 2: Phone | Urgency | Amount + Collect */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {phone && (
            <a
              href={`tel:${cleanPhoneDisplay(phone)}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-400 font-medium transition shrink-0"
            >
              <Phone className="h-3 w-3 shrink-0" />
              {cleanPhoneDisplay(phone)}
            </a>
          )}
          <span className={`flex items-center gap-1 text-[10px] font-bold shrink-0 ${urgency.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              urgency.icon === 'overdue' ? 'bg-rose-400 animate-pulse' :
              urgency.icon === 'today' ? 'bg-amber-400 animate-pulse' :
              urgency.icon === 'soon' ? 'bg-yellow-400' : 'bg-slate-500'
            }`} />
            {urgency.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-black ${isFullyUnpaid ? 'text-rose-400' : 'text-amber-300'}`}>
            ₹{Math.round(pending).toLocaleString()}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onCollect(booking.id) }}
            className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl transition active:scale-95"
          >
            <Wallet className="h-3 w-3" />
            {language === 'mr' ? 'गोळा करा' : 'Collect'}
          </button>
        </div>
      </div>

    </div>
  )
}

interface RoomRowProps {
  booking: any
  onCollect: (bookingId: string) => void
  onLongPress: (due: any) => void
  language: string
  getStatusLabel: (status: string, paymentMode?: string | null, bookingStatus?: string) => any
  getCheckoutUrgency: (checkOut: string) => any
}

function RoomRow({
  booking,
  onCollect,
  onLongPress,
  language,
  getStatusLabel,
  getCheckoutUrgency,
}: RoomRowProps) {
  const longPressHandlers = useLongPress(
    () => onLongPress(booking),
    () => onCollect(booking.id)
  )

  const pending = booking.total_amount - booking.paid_amount
  const isFullyUnpaid = booking.paid_amount === 0
  const effectiveStatus = (booking.payment_status === 'unpaid' && booking.paid_amount > 0) ? 'partial' : booking.payment_status
  const statusInfo = getStatusLabel(effectiveStatus, booking.payment_mode, booking.status)
  
  const checkInDate = parseISO(booking.check_in)
  const checkOutDate = parseISO(booking.check_out)
  const dateStr = `${format(checkInDate, 'dd MMM')} → ${format(checkOutDate, 'dd MMM')}`

  const roomUrgency = getCheckoutUrgency(booking.check_out)

  return (
    <div
      {...longPressHandlers}
      className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/60 rounded-xl cursor-pointer transition hover:border-emerald-500/20 active:scale-[0.99] group/row"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-lg text-xs font-black text-slate-350 shrink-0">
          {booking.rooms.number}
        </span>
        
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold text-slate-300 tracking-tight whitespace-nowrap">
            {dateStr}
          </span>
          <span className={`flex items-center gap-1 text-[9px] font-bold mt-0.5 ${roomUrgency.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              roomUrgency.icon === 'overdue' ? 'bg-rose-400 animate-pulse' :
              roomUrgency.icon === 'today' ? 'bg-amber-400 animate-pulse' :
              roomUrgency.icon === 'soon' ? 'bg-yellow-400' : 'bg-slate-500'
            }`} />
            {roomUrgency.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-extrabold border shrink-0 ${statusInfo.color}`}>
          {statusInfo.label}
        </span>

        <span className={`text-xs font-black ${isFullyUnpaid ? 'text-rose-400' : 'text-amber-300'}`}>
          ₹{Math.round(pending).toLocaleString()}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); onCollect(booking.id) }}
          className="flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-1 rounded-lg transition active:scale-95 group-hover/row:border-emerald-500/40"
        >
          <Wallet className="h-2.5 w-2.5" />
          {language === 'mr' ? 'गोळा करा' : 'Collect'}
        </button>
      </div>
    </div>
  )
}

