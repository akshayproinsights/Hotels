import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'lucide-react'
import { getUnpaidDues } from '../api/reports'
import BookingDetailSheet from '../components/BookingDetailSheet'
import { useLanguage } from '../context/LanguageContext'

export default function UnpaidDuesPage() {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const { language, t } = useLanguage()

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
      case 'hold':   return { label: language === 'mr' ? 'होल्डवर' : 'On Hold', color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
      default:       return { label: status, color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' }
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28 animate-fade-in">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-100">
            💰 {t('pending_payments')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('tap_guest_card')}</p>
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


          {/* Guest Cards */}
          {sortedData.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center gap-3 border-slate-800/40 bg-slate-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-slate-300 font-bold text-base">{language === 'mr' ? 'सर्व पेमेंट पूर्ण!' : 'All Clear!'}</p>
              <p className="text-slate-500 text-xs">{t('no_pending_payments')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedData.map((due) => {
                const pending = due.total_amount - due.paid_amount
                const isFullyUnpaid = due.paid_amount === 0
                const paidPct = Math.round((due.paid_amount / due.total_amount) * 100)
                const effectiveStatus = (due.payment_status === 'unpaid' && due.paid_amount > 0) ? 'partial' : due.payment_status
                const statusInfo = getStatusLabel(effectiveStatus)
                const urgency = getCheckoutUrgency(due.check_out)

                return (
                  <div
                    key={due.id}
                    onClick={() => handleCardClick(due.id)}
                    className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex flex-col gap-3 cursor-pointer hover:border-emerald-500/40 hover:bg-slate-900/50 transition duration-200 group active:scale-[0.99]"
                  >
                    {/* Row 1: Guest name + Room + Status badge */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="text-slate-100 font-extrabold text-base group-hover:text-emerald-400 transition flex items-center gap-2 flex-wrap">
                          <span className="truncate">{due.guests.name}</span>
                          <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md text-[10px] text-slate-300 font-bold shrink-0">
                            {language === 'mr' ? 'खोली' : 'Room'} {due.rooms.number}
                          </span>
                        </div>

                        {/* Tap-to-call phone */}
                        <a
                          href={`tel:${due.guests.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 font-medium mt-0.5 transition w-fit"
                        >
                          <Phone className="h-3 w-3 shrink-0" />
                          {due.guests.phone}
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
                        onClick={(e) => { e.stopPropagation(); handleCardClick(due.id) }}
                        className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-extrabold px-3 py-1.5 rounded-xl transition active:scale-95"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        {language === 'mr' ? 'पेमेंट गोळा करा' : 'Collect'}
                        <ChevronRight className="h-3 w-3 opacity-60" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {sortedData.length > 0 && (
            <p className="text-center text-[10px] text-slate-600 pt-1">
              <IndianRupee className="inline h-3 w-3 mr-0.5" />
              {language === 'mr' 
                ? 'चेकआउट तारीख (लवकर असणारे आधी) आणि जास्त बाकी रक्कमेनुसार क्रमवारी लावली आहे · कार्डवर टॅप करा'
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
          onSuccess={(action) => {
            if (action === 'checkout') {
              setSelectedBookingId(null)
            }
            unpaidRefetch()
          }}
        />
      )}

    </div>
  )
}
