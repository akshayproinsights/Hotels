import * as React from 'react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Phone, CheckCircle, LogOut, FileText, Camera, Upload, Loader2, Copy } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { getBooking, updateBooking } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload, listGuestDocs } from '../api/documents'
import { useLanguage } from '../context/LanguageContext'
import CalendarCard from './CalendarCard'


interface BookingDetailSheetProps {
  bookingId: string
  onClose: () => void
  onSuccess: (action?: 'checkout' | 'update') => void
}

export default function BookingDetailSheet({ bookingId, onClose, onSuccess }: BookingDetailSheetProps) {
  const { language, t } = useLanguage()

  const formatDateTime = (isoString: string) => {
    if (!isoString) return ''
    const d = parseISO(isoString)
    if (language !== 'mr') return format(d, 'dd MMM yyyy, hh:mm a')
    const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
    const hr = d.getHours()
    const min = String(d.getMinutes()).padStart(2, '0')
    const ampm = hr >= 12 ? 'PM' : 'AM'
    const displayHr = hr % 12 || 12
    return `${d.getDate()} ${monthsMr[d.getMonth()]} ${d.getFullYear()}, ${displayHr}:${min} ${ampm}`
  }

  const queryClient = useQueryClient()
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'Cash' | 'UPI'>('Cash')
  const [editingTotal, setEditingTotal] = useState<string | number>('')
  const [editingPaid, setEditingPaid] = useState<string | number>('')
  const [showRefDetails, setShowRefDetails] = useState(false)
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)

  // NOTE: No body scroll lock needed.
  // In PWA standalone mode the body is already non-scrollable (height = 100dvh).
  // Any attempt to lock the body (overflow:hidden OR position:fixed) kills
  // -webkit-overflow-scrolling inside fixed-position overlays on iOS — that is
  // exactly what was preventing the sheet from scrolling.


  // Fetch full details of the booking
  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
  })

  // Fetch all documents for this guest (including prior stays)
  const { data: guestDocs, refetch: refetchGuestDocs } = useQuery({
    queryKey: ['guestDocs', booking?.guest_id],
    queryFn: () => listGuestDocs(booking?.guest_id || ''),
    enabled: !!booking?.guest_id,
  })

  // Sync editingTotal and editingPaid with database value when booking loads or updates
  useEffect(() => {
    if (booking) {
      setEditingTotal(booking.total_amount)
      setEditingPaid(booking.paid_amount)
    }
  }, [booking])

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateBooking>[1]) => updateBooking(bookingId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      toast.success(language === 'mr' ? 'बुकिंग यशस्वीरित्या अपडेट झाले' : 'Booking updated successfully')
      refetch()
      const isCheckout = variables?.status === 'checked_out'
      onSuccess(isCheckout ? 'checkout' : 'update')
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.detail || (language === 'mr' ? 'बुकिंग अपडेट करण्यात अडचण आली' : 'Failed to update booking')
      toast.error(errorMsg)
    },
  })



  if (isLoading || !booking) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="glass-panel relative w-full max-w-lg rounded-t-3xl bg-slate-900 shadow-2xl p-6 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
          <span className="text-sm text-slate-400 font-semibold mt-4">{language === 'mr' ? 'बुकिंगचे तपशील लोड होत आहेत...' : 'Loading booking details...'}</span>
        </div>
      </div>,
      document.body
    )
  }

  const guestPhotoDoc = guestDocs?.find(d => d.doc_type === 'guest_photo') || booking?.documents?.find(d => d.doc_type === 'guest_photo')

  const handleMarkAsPaid = () => {
    const updates: Parameters<typeof updateBooking>[1] = {
      payment_status: 'paid',
      paid_amount: booking.total_amount,
    }
    if (booking.payment_mode === 'Pending') {
      updates.payment_mode = selectedPaymentMode
    }
    updateMutation.mutate(updates)
  }

  const handleCheckOut = () => {
    const updates: Parameters<typeof updateBooking>[1] = { status: 'checked_out' }
    const dues = Math.max(0, booking.total_amount - booking.paid_amount)
    if (dues > 0) {
      updates.payment_status = 'paid'
      updates.paid_amount = booking.total_amount
      if (booking.payment_mode === 'Pending') {
        updates.payment_mode = selectedPaymentMode
      }
    }
    updateMutation.mutate(updates)
  }


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      setIsUploading(true)
      const uploadToast = toast.loading(language === 'mr' ? `${files.length} ओळखपत्रे अपलोड होत आहेत...` : `Uploading ${files.length} document(s)...`)
      try {
        for (const file of files) {
          const { upload_url, document_id } = await getUploadUrl(booking.id, booking.guest_id, file.name, file.type)
          await uploadFileToR2(upload_url, file)
          await confirmUpload(document_id)
        }
        toast.success(language === 'mr' ? 'ओळखपत्रे यशस्वीरित्या जोडली गेली' : 'Documents added successfully', { id: uploadToast })
        refetch()
        refetchGuestDocs()
      } catch (err) {
        console.error(err)
        toast.error(language === 'mr' ? 'काही ओळखपत्रे अपलोड करण्यात अडचण आली' : 'Failed to upload one or more documents', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleGuestPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setIsUploading(true)
      const uploadToast = toast.loading(language === 'mr' ? 'फोटो अपलोड होत आहे...' : 'Uploading photo...')
      try {
        const { upload_url, document_id } = await getUploadUrl(booking.id, booking.guest_id, file.name || 'guest_photo.jpg', file.type || 'image/jpeg', 'guest_photo')
        await uploadFileToR2(upload_url, file)
        await confirmUpload(document_id)
        toast.success(language === 'mr' ? 'फोटो यशस्वीरित्या अपलोड झाला' : 'Photo uploaded successfully', { id: uploadToast })
        refetch()
        refetchGuestDocs()
      } catch (err) {
        console.error(err)
        toast.error(language === 'mr' ? 'फोटो अपलोड करण्यात अडचण आली' : 'Failed to upload photo', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  const effectivePaymentStatus = booking
    ? ((booking.payment_status === 'unpaid' && booking.paid_amount > 0) ? 'partial' : booking.payment_status)
    : 'unpaid'

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case 'hold':
      case 'partial':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
      case 'unpaid':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
      case 'paid':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    }
  }

  const liveTotal = editingTotal === '' ? 0 : Number(editingTotal)
  const livePaid = editingPaid === '' ? 0 : Number(editingPaid)
  const livePendingAmount = Math.max(0, liveTotal - livePaid)

  const nights = (() => {
    if (!booking.check_in || !booking.check_out) return 1
    const s = new Date(booking.check_in.slice(0, 10))
    const e = new Date(booking.check_out.slice(0, 10))
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
  })()
  const extraBedTotal = booking.extra_beds * 500

  const handleSaveTotalAmount = () => {
    const newTotal = editingTotal === '' ? 0 : Number(editingTotal)
    if (newTotal === booking.total_amount) return
    updateMutation.mutate({ total_amount: newTotal })
  }

  const handleSavePaidAmount = () => {
    const newPaid = editingPaid === '' ? 0 : Number(editingPaid)
    if (newPaid === booking.paid_amount) return
    const isNowFullyPaid = newPaid >= booking.total_amount
    const updates: Parameters<typeof updateBooking>[1] = {
      paid_amount: newPaid,
      payment_status: isNowFullyPaid ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid'),
    }
    if (booking.payment_mode === 'Pending' && newPaid > 0) {
      updates.payment_mode = selectedPaymentMode
    }
    updateMutation.mutate(updates)
  }

  const handleSavePaymentMode = (newMode: 'Cash' | 'UPI' | 'Pending') => {
    if (newMode === booking.payment_mode) return
    const currentPaid = editingPaid === '' ? 0 : Number(editingPaid)
    const currentTotal = editingTotal === '' ? 0 : Number(editingTotal)
    const updates: Parameters<typeof updateBooking>[1] = { payment_mode: newMode }
    const isNowFullyPaid = currentPaid >= currentTotal
    updates.payment_status = isNowFullyPaid ? 'paid' : (currentPaid > 0 ? 'partial' : 'unpaid')
    updateMutation.mutate(updates)
  }

  // ─── Shared input style for amount fields ───
  const amountInputCls = "bg-transparent outline-none text-2xl font-black text-right w-28 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

  return createPortal(
    // onClick on the outer overlay closes the sheet when tapping the dark backdrop.
    // The sheet itself calls e.stopPropagation() so taps inside never bubble up here.
    // This eliminates the need for an absolute inset-0 backdrop div that would
    // intercept touch events destined for the inner scroll container on iOS.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* ── Main Drawer ──
           h-[92dvh]: dynamic viewport height — accounts for mobile browser chrome.
           stopPropagation prevents taps inside the sheet from triggering onClose.
      */}
      <div
        className="glass-panel relative w-full max-w-lg h-[92dvh] flex flex-col rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl animate-fade-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-800/80 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-xl text-sm font-extrabold border border-slate-700">
                {language === 'mr' ? `खोली ${booking.rooms?.number}` : `Room ${booking.rooms?.number}`}
              </span>
              {t('booking_details')}
            </h2>
            <div>
              <button
                type="button"
                onClick={() => setShowRefDetails(!showRefDetails)}
                className="text-[11px] text-slate-500 hover:text-slate-400 font-bold mt-1 inline-flex items-center gap-0.5 select-none focus:outline-none"
              >
                {language === 'mr' ? 'तपशील' : 'Details'} {showRefDetails ? '▾' : '▸'}
              </button>
              {showRefDetails && (
                <div className="text-[10px] text-slate-500 mt-1 font-medium bg-slate-955/20 px-2 py-1 rounded-lg border border-slate-850/60 max-w-fit">
                  {language === 'mr' ? 'बुकिंग संदर्भ क्रमांक:' : 'Booking Ref:'} <span className="text-slate-450 font-bold">{booking.booking_number}</span> • <span className="text-slate-450 font-bold">{booking.room_type || booking.rooms?.room_type}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ──
            overflow-y-scroll  : force scroll always on (not 'auto') — required on iOS.
            touch-action: pan-y : tells iOS the element accepts vertical swipe gestures.
            -webkit-overflow-scrolling: touch : enables momentum scroll on iOS Safari/PWA.
            min-h-0            : gives flex-1 a definite height so overflow kicks in.
            NO overscroll-contain — that CSS property is unsupported on iOS WebKit and
            breaks scroll initiation inside fixed-position containers.
        */}
        <div
          className="flex-1 min-h-0 overflow-y-scroll px-4 py-4 flex flex-col gap-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          } as React.CSSProperties}
        >

          {/* ── Guest Summary Card ── */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3 bg-slate-955/40">

            {/* Row 1: Photo + Name + Status Badge */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {guestPhotoDoc ? (
                  <div className="relative group w-12 h-12 flex-shrink-0">
                    <img
                      src={guestPhotoDoc.public_url}
                      alt="Guest Photo"
                      className="w-full h-full rounded-xl object-cover border border-slate-700 cursor-pointer hover:border-emerald-500 transition"
                    />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center cursor-pointer transition">
                      <Camera className="h-4.5 w-4.5 text-slate-300" />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleGuestPhotoUpload} />
                    </label>
                  </div>
                ) : (
                  <label className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 flex items-center justify-center flex-shrink-0 text-slate-500 cursor-pointer transition group">
                    <Camera className="h-5 w-5 group-hover:text-emerald-400 transition" />
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleGuestPhotoUpload} />
                  </label>
                )}
                <div>
                  <div className="text-slate-200 font-extrabold text-base">{booking.guests?.name}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {language === 'mr' ? 'पाहुण्यांचा फोटो' : 'Guest Photo'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {booking.status !== 'active' && (
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0 ${
                    booking.status === 'checked_out'
                      ? 'bg-slate-800 text-slate-400 border border-slate-700/50'
                      : 'bg-rose-550/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {booking.status === 'checked_out'
                      ? (language === 'mr' ? 'चेकआऊट झाले' : 'Checked Out')
                      : (language === 'mr' ? 'रद्द केले' : 'Cancelled')}
                  </span>
                )}
                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0 ${getStatusBadgeStyles(effectivePaymentStatus)}`}>
                  {effectivePaymentStatus === 'hold'
                    ? (language === 'mr' ? 'होल्डवर' : 'On Hold')
                    : effectivePaymentStatus === 'unpaid'
                      ? (language === 'mr' ? 'पेमेंट केले नाही' : 'Unpaid')
                      : effectivePaymentStatus === 'partial'
                        ? (language === 'mr' ? 'अंशतः पेमेंट' : 'Partial')
                        : (language === 'mr' ? 'पूर्ण भरले' : 'Paid')}
                </span>
              </div>
            </div>

            {/* Row 2: Phone */}
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5">
              <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <span className="flex-1 text-sm font-bold text-slate-200 tracking-wide">{booking.guests?.phone}</span>
              <a
                href={`tel:${booking.guests?.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-955 text-xs font-black rounded-lg transition shadow-sm shadow-emerald-500/20"
              >
                <Phone className="h-3 w-3" />
                {language === 'mr' ? 'कॉल करा' : 'Call'}
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(booking.guests?.phone ?? '').then(() => {
                    toast.success(language === 'mr' ? 'नंबर कॉपी केला!' : 'Number copied!')
                  }).catch(() => {
                    toast.error(language === 'mr' ? 'नंबर कॉपी करू शकलो नाही' : 'Could not copy number')
                  })
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 text-xs font-bold rounded-lg transition"
              >
                <Copy className="h-3 w-3" />
                {language === 'mr' ? 'कॉपी' : 'Copy'}
              </button>
            </div>

            {/* Occupation */}
            {booking.occupation && (
              <div className="text-xs text-slate-500">
                <span className="font-bold">{language === 'mr' ? 'व्यवसाय:' : 'Occupation:'}</span> {booking.occupation}
              </div>
            )}
          </div>

          {/* ── Check-in / Check-out dates ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-slate-955/60 border border-slate-800 rounded-2xl">
              <CalendarCard dateStr={booking.check_in} type="check-in" size="md" language={language} />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'चेक-इन' : 'Check-in'}</span>
                <span className="text-xs font-bold text-slate-200 mt-0.5">{formatDateTime(booking.check_in)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-955/60 border border-slate-800 rounded-2xl">
              <CalendarCard dateStr={booking.check_out} type="check-out" size="md" language={language} />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'चेक-आउट' : 'Check-out'}</span>
                <span className="text-xs font-bold text-slate-200 mt-0.5">{formatDateTime(booking.check_out)}</span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              PAYMENT CARD — spacious, clear, mobile-first
              Designed for non-technical hotel staff on a phone
          ══════════════════════════════════════════════════ */}
          <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 shadow-lg">

            {/* ── Header ── */}
            <div className="px-5 py-3.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                {language === 'mr' ? '💰 पेमेंट' : '💰 Payment'}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {language === 'mr'
                  ? `₹${booking.room_price} × ${nights} रात्र${booking.extra_beds > 0 ? ` + बेड ₹${extraBedTotal}` : ''}`
                  : `₹${booking.room_price} × ${nights} night${nights !== 1 ? 's' : ''}${booking.extra_beds > 0 ? ` + bed ₹${extraBedTotal}` : ''}`}
              </span>
            </div>

            {/* ── Total Bill ── */}
            <div className="px-5 py-5 flex items-center justify-between border-b border-slate-800">
              <div>
                <div className="text-sm font-bold text-slate-300">
                  {language === 'mr' ? 'एकूण बिल' : 'Total Bill'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'mr' ? 'टॅप करून बदला' : 'Tap to edit'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                  <span className="text-slate-400 text-lg font-black leading-none">₹</span>
                  <input
                    id="input-total-amount"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingTotal}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') { setEditingTotal('') }
                      else { const c = v.replace(/^0+/, ''); setEditingTotal(c === '' ? '0' : c) }
                    }}
                    onBlur={handleSaveTotalAmount}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleSaveTotalAmount(); e.currentTarget.blur() } }}
                    className={`${amountInputCls} text-slate-100`}
                  />
                </div>
                {editingTotal !== booking.total_amount && (
                  <button
                    onClick={handleSaveTotalAmount}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition shadow-md shadow-emerald-500/20"
                  >
                    {language === 'mr' ? 'जतन' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Amount Paid ── */}
            <div className="px-5 py-5 flex items-center justify-between border-b border-slate-800">
              <div>
                <div className="text-sm font-bold text-emerald-400">
                  {language === 'mr' ? 'जमा केलेली रक्कम' : 'Amount Paid'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'mr' ? 'टॅप करून बदला' : 'Tap to edit'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                  <span className="text-emerald-400 text-lg font-black leading-none">₹</span>
                  <input
                    id="input-paid-amount"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingPaid}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') { setEditingPaid('') }
                      else { const c = v.replace(/^0+/, ''); setEditingPaid(c === '' ? '0' : c) }
                    }}
                    onBlur={handleSavePaidAmount}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleSavePaidAmount(); e.currentTarget.blur() } }}
                    className={`${amountInputCls} text-emerald-300`}
                  />
                </div>
                {String(editingPaid) !== String(booking.paid_amount) && (
                  <button
                    onClick={handleSavePaidAmount}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition shadow-md shadow-emerald-500/20"
                  >
                    {language === 'mr' ? 'जतन' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Progress Bar ── */}
            {(() => {
              const pct = liveTotal > 0 ? Math.min(100, (livePaid / liveTotal) * 100) : 0
              return (
                <div className="px-5 py-3 bg-slate-900/60 border-b border-slate-800">
                  <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-700'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-slate-500 font-bold">
                      {Math.round(pct)}% {language === 'mr' ? 'भरले' : 'paid'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">
                      {language === 'mr' ? 'एकूण' : 'Total'}: ₹{liveTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* ── BALANCE DUE — THE MOST IMPORTANT ROW ── */}
            <div className={`px-5 py-5 flex items-center justify-between ${
              livePendingAmount > 0
                ? 'bg-rose-500/10 border-b border-rose-500/20'
                : 'bg-emerald-500/10 border-b border-emerald-500/20'
            }`}>
              <div>
                <div className={`text-base font-black ${livePendingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {livePendingAmount > 0
                    ? (language === 'mr' ? '⚠️ बाकी रक्कम' : '⚠️ Balance Due')
                    : (language === 'mr' ? '✅ पूर्ण भरले' : '✅ Fully Paid')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {livePendingAmount > 0
                    ? (language === 'mr' ? 'पाहुण्यांकडून आता घ्या' : 'Collect from guest now')
                    : (language === 'mr' ? 'कोणतीही बाकी नाही' : 'No balance remaining')}
                </div>
              </div>
              <span className={`text-4xl font-black tabular-nums ${livePendingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ₹{(livePendingAmount > 0 ? livePendingAmount : 0).toLocaleString('en-IN')}
              </span>
            </div>

            {/* ── Payment Method ── */}
            <div className="px-5 py-3.5 flex items-center justify-between bg-slate-900/30">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {language === 'mr' ? 'पेमेंट पद्धत:' : 'Payment via:'}
              </span>
              <div className="flex gap-2">
                {(['Cash', 'UPI', 'Pending'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSavePaymentMode(mode)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                      booking.payment_mode === mode
                        ? mode === 'Cash'
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : mode === 'UPI'
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                          : 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'Cash' ? '💵 Cash' : mode === 'UPI' ? '📱 UPI' : '⏳ Pending'}
                  </button>
                ))}
              </div>
            </div>

          </div>
          {/* ════════════════════════════════════════════════ */}

          {/* ── Notes ── */}
          {booking.notes && (
            <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-xs text-slate-400">
              <span className="font-bold text-slate-500 block mb-1">{language === 'mr' ? 'नोंद (तपशील)' : 'NOTES'}</span>
              {booking.notes}
            </div>
          )}

          {/* ── Guest ID Proofs (always open) ── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 overflow-hidden">

            {/* Static Header */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-800/60">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {language === 'mr' ? 'पाहुण्यांचे ओळखपत्र' : 'Guest ID Proofs'}
              </span>
            </div>

            {/* Always-visible Content */}
            <div className="px-4 pb-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 pt-3">
                {(() => {
                  const idDocsOnly = guestDocs ? guestDocs.filter(d => d.doc_type !== 'guest_photo') : []
                  const bookingDocsOnly = booking.documents ? booking.documents.filter(d => d.doc_type !== 'guest_photo') : []
                  const docs = idDocsOnly.length > 0 ? idDocsOnly : bookingDocsOnly
                  if (docs.length > 0) {
                    return docs.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition"
                      >
                        {doc.file_name.toLowerCase().endsWith('.pdf')
                          ? <FileText className="h-6 w-6 text-slate-400" />
                          : <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />}
                        <span className="absolute bottom-0 inset-x-0 bg-slate-955/80 text-[8px] text-slate-400 font-bold px-1 py-0.5 truncate text-center">
                          {doc.file_name}
                        </span>
                      </a>
                    ))
                  }
                  return <div className="text-xs text-slate-500 italic">{language === 'mr' ? 'अद्याप कोणतेही ओळखपत्र जोडलेले नाही.' : 'No documents uploaded yet.'}</div>
                })()}
              </div>

              {/* Upload Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-800 transition text-xs font-semibold text-slate-400">
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फोटो काढा' : 'Capture'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} disabled={isUploading} multiple />
                </label>
                <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-800 transition text-xs font-semibold text-slate-400">
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फाईल निवडा' : 'Upload File'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} multiple />
                </label>
              </div>
            </div>
          </div>

        </div>
        {/* ── end scrollable body ── */}


        {/* ── Floating Footer Buttons ── */}
        <div className="px-5 py-4 border-t border-slate-800/60 bg-slate-955/80 backdrop-blur-md flex flex-col gap-3 flex-shrink-0">
          {booking.status === 'checked_out' ? (
            <>
              <div className="py-3.5 px-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-2xl text-center">
                {language === 'mr'
                  ? `✅ पाहुणे यशस्वीरित्या चेकआऊट झाले (वेळ: ${formatDateTime(booking.actual_checkout_time || booking.updated_at)})`
                  : `✅ Guest Checked Out on ${formatDateTime(booking.actual_checkout_time || booking.updated_at)}`}
              </div>
              {livePendingAmount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAsPaid}
                  className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/15"
                >
                  <CheckCircle className="h-4 w-4" />
                  {language === 'mr' ? 'बाकी रक्कम जमा करा (पेमेंट नोंदवा)' : 'Record Dues Payment'}
                </button>
              )}
            </>
          ) : booking.status === 'cancelled' ? (
            <div className="py-3.5 px-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-2xl text-center">
              {language === 'mr' ? '❌ बुकिंग रद्द केले गेले आहे' : '❌ Booking Cancelled'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {livePendingAmount > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={handleMarkAsPaid}
                    className="py-3.5 px-3 bg-slate-950 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 text-slate-300 hover:text-emerald-400 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {language === 'mr' ? 'फक्त पेमेंट नोंदवा' : 'Collect Payment Only'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCheckoutConfirm(true)}
                    className="py-3.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    {language === 'mr' ? 'पेमेंट + चेकआऊट करा' : 'Collect & Checkout'}
                  </button>
                </>
              ) : (
                <>
                  <div className="py-3.5 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-extrabold rounded-2xl flex items-center justify-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    {language === 'mr' ? 'पूर्ण जमा (देय नाही)' : 'Paid In Full'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCheckoutConfirm(true)}
                    className="py-3.5 px-3 bg-slate-950 hover:bg-red-500/10 border border-slate-850 hover:border-red-500/20 text-slate-300 hover:text-red-400 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="h-4 w-4 text-slate-500 hover:text-red-400" />
                    {language === 'mr' ? 'चेकआऊट करा' : 'Checkout Guest'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Checkout Confirmation Modal ── */}
        {showCheckoutConfirm && (() => {
          const dues = Math.max(0, booking.total_amount - booking.paid_amount)
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
              <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
                <div className={`h-11 w-11 rounded-full flex items-center justify-center mx-auto border ${
                  dues > 0
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                }`}>
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">
                    {dues > 0
                      ? (language === 'mr' ? 'पेमेंट आणि चेकआऊट' : 'Collect & Checkout')
                      : (language === 'mr' ? 'चेकआऊटची खात्री करा' : 'Confirm Checkout')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {language === 'mr' ? (
                      <>पाहुणे <span className="font-extrabold text-slate-200">{booking.guests?.name}</span> यांना खोली क्रमांक <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span> मधून चेकआऊट करायचे आहे का?</>
                    ) : (
                      <>Check out <span className="font-extrabold text-slate-200">{booking.guests?.name}</span> from Room <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span>?</>
                    )}
                  </p>

                  {dues > 0 && (
                    <div className="mt-3 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl text-xs font-black text-rose-350 flex flex-col gap-1 items-center justify-center">
                      <span>{language === 'mr' ? `⚠️ प्रलंबित रक्कम: ₹${dues.toLocaleString()}` : `⚠️ Dues Pending: ₹${dues.toLocaleString()}`}</span>
                      {booking.payment_mode !== 'Pending' && (
                        <span className="text-[10px] text-rose-400/80 font-medium">
                          {language === 'mr' ? `पेमेंट मोड: ${booking.payment_mode === 'Cash' ? 'कॅश' : 'UPI'}` : `Payment Mode: ${booking.payment_mode}`}
                        </span>
                      )}
                    </div>
                  )}

                  {dues > 0 && booking.payment_mode === 'Pending' && (
                    <div className="flex flex-col gap-2 mt-3.5 text-left bg-slate-950/40 p-3 rounded-2xl border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center block">
                        {language === 'mr' ? 'पेमेंट मोड निवडा:' : 'Select Payment Mode:'}
                      </span>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {(['Cash', 'UPI'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSelectedPaymentMode(mode)}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                              selectedPaymentMode === mode
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-350'
                            }`}
                          >
                            {mode === 'Cash' ? (language === 'mr' ? '💵 कॅश' : '💵 Cash') : (language === 'mr' ? '📱 UPI' : '📱 UPI')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {dues <= 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                      {language === 'mr' ? '✅ सर्व पेमेंट पूर्ण (काही बाकी नाही)' : '✅ Settled (No Dues)'}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowCheckoutConfirm(false)}
                    className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
                  >
                    {language === 'mr' ? 'रद्द करा' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCheckoutConfirm(false); handleCheckOut() }}
                    className={`py-2.5 px-4 text-slate-955 text-xs font-black rounded-xl transition shadow-lg ${
                      dues > 0
                        ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 shadow-emerald-500/15'
                        : 'bg-rose-500 hover:bg-rose-400 active:bg-rose-500 shadow-rose-500/15'
                    }`}
                  >
                    {language === 'mr' ? 'निश्चित करा' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </div>,
    document.body
  )
}
