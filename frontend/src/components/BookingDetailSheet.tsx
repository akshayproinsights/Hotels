import * as React from 'react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Phone, CheckCircle, LogOut, FileText, Camera, Upload, ArrowRight, Loader2, Copy } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { getBooking, updateBooking, checkBookingExtension } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload, listGuestDocs } from '../api/documents'
import { useLanguage } from '../context/LanguageContext'
import CalendarCard from './CalendarCard'

const getDaysDiff = (startStr: string, endStr: string) => {
  if (!startStr || !endStr) return 1
  const s = new Date(startStr.slice(0, 10))
  const e = new Date(endStr.slice(0, 10))
  const diff = e.getTime() - s.getTime()
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)))
}

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
  const [showExtendInput, setShowExtendInput] = useState(false)
  const [newCheckOutDate, setNewCheckOutDate] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'Cash' | 'UPI'>('Cash')
  const [editingTotal, setEditingTotal] = useState<string | number>('')
  const [editingPaid, setEditingPaid] = useState<string | number>('')
  const [showRefDetails, setShowRefDetails] = useState(false)
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)

  // Stay extension state
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [availabilityReason, setAvailabilityReason] = useState('')
  const [shouldAutoUpdateTotal, setShouldAutoUpdateTotal] = useState(true)
  const [calculatedTotal, setCalculatedTotal] = useState<number | null>(null)
  const [calculatedNights, setCalculatedNights] = useState<number>(0)

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
      // Invalidate reports caches so Reports page reflects latest payment data
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

  // ─── MUST be declared BEFORE any early return so hook order is stable ───
  useEffect(() => {
    if (!newCheckOutDate || !booking) {
      setIsAvailable(null)
      setAvailabilityReason('')
      setCalculatedTotal(null)
      setCalculatedNights(0)
      return
    }

    // Basic validation: must be after check_in date
    const checkInDateOnly = booking.check_in.slice(0, 10)
    if (newCheckOutDate <= checkInDateOnly) {
      setIsAvailable(false)
      setAvailabilityReason(language === 'mr' ? 'नवीन चेक-आउट तारीख चेक-इन तारखेनंतरची असावी.' : 'New checkout date must be after check-in date.')
      setCalculatedTotal(null)
      setCalculatedNights(0)
      return
    }

    // Calculate details
    const dateObj = new Date(`${newCheckOutDate}T11:00:00`)
    const checkOutISO = dateObj.toISOString()
    const nights = getDaysDiff(booking.check_in, checkOutISO)
    setCalculatedNights(nights)

    const dailyRate = Number(booking.room_price) + (Number(booking.extra_beds) * 500)
    setCalculatedTotal(dailyRate * nights)

    // Call backend to check availability
    let active = true
    setCheckingAvailability(true)
    setIsAvailable(null)
    setAvailabilityReason('')

    checkBookingExtension(booking.id, checkOutISO)
      .then((res) => {
        if (!active) return
        setIsAvailable(res.available)
        setAvailabilityReason(res.reason)
      })
      .catch((err) => {
        if (!active) return
        setIsAvailable(false)
        const errorMsg = err.response?.data?.detail || (language === 'mr' ? 'खोलीची उपलब्धता तपासता आली नाही.' : 'Failed to check room availability.')
        setAvailabilityReason(errorMsg)
      })
      .finally(() => {
        if (active) {
          setCheckingAvailability(false)
        }
      })

    return () => {
      active = false
    }
  }, [newCheckOutDate, booking?.id, booking?.check_in, booking?.room_price, booking?.extra_beds])
  // ────────────────────────────────────────────────────────────────────────

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

  const guestPhotoDoc = guestDocs?.find(d => d.doc_type === 'guest_photo') || booking?.documents?.find(d => d.doc_type === 'guest_photo');

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
    const updates: Parameters<typeof updateBooking>[1] = {
      status: 'checked_out',
    }
    
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



  // (availability effect moved above the early return — see above)

  const handleExtendStay = () => {
    if (!newCheckOutDate || !isAvailable) {
      toast.error(language === 'mr' ? 'कृपया योग्य तारीख निवडा आणि खोली उपलब्ध असल्याची खात्री करा' : 'Please select a valid date and ensure room is available')
      return
    }
    const dateObj = new Date(`${newCheckOutDate}T11:00:00`)
    const checkOutISO = dateObj.toISOString()
    
    const updates: Parameters<typeof updateBooking>[1] = {
      check_out: checkOutISO,
    }
    
    if (shouldAutoUpdateTotal && calculatedTotal !== null) {
      updates.total_amount = calculatedTotal
      
      // Sync payment status based on new total
      const isNowFullyPaid = booking.paid_amount >= calculatedTotal
      updates.payment_status = isNowFullyPaid ? 'paid' : (booking.paid_amount > 0 ? 'partial' : 'unpaid')
    }
    
    updateMutation.mutate(updates)
    setShowExtendInput(false)
    setNewCheckOutDate('')
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      setIsUploading(true)
      const uploadToast = toast.loading(language === 'mr' ? `${files.length} ओळखपत्रे अपलोड होत आहेत...` : `Uploading ${files.length} document(s)...`)

      try {
        for (const file of files) {
          const { upload_url, document_id } = await getUploadUrl(
            booking.id,
            booking.guest_id,
            file.name,
            file.type
          )
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
        const { upload_url, document_id } = await getUploadUrl(
          booking.id,
          booking.guest_id,
          file.name || 'guest_photo.jpg',
          file.type || 'image/jpeg',
          'guest_photo'
        )
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
    : 'unpaid';

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

  const nights = getDaysDiff(booking.check_in, booking.check_out)
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
    const updates: Parameters<typeof updateBooking>[1] = {
      payment_mode: newMode,
    }
    
    const isNowFullyPaid = currentPaid >= currentTotal
    updates.payment_status = isNowFullyPaid ? 'paid' : (currentPaid > 0 ? 'partial' : 'unpaid')
    
    updateMutation.mutate(updates)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Off-click dismiss zone */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Drawer Form */}
      <div className="glass-panel relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl animate-fade-in overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-3 border-b border-slate-800/80 flex-shrink-0">
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
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 flex flex-col gap-5"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* Guest Summary Card */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3 bg-slate-955/40">
            {/* Row 1: Name + Status Badge */}
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
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleGuestPhotoUpload}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 flex items-center justify-center flex-shrink-0 text-slate-500 cursor-pointer transition group">
                    <Camera className="h-5 w-5 group-hover:text-emerald-400 transition" />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleGuestPhotoUpload}
                    />
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

            {/* Row 2: Phone number with Call + Copy buttons */}
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5">
              <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <span className="flex-1 text-sm font-bold text-slate-200 tracking-wide">
                {booking.guests?.phone}
              </span>
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

            {/* Occupation (if any) */}
            {booking.occupation && (
              <div className="text-xs text-slate-500">
                <span className="font-bold">{language === 'mr' ? 'व्यवसाय:' : 'Occupation:'}</span> {booking.occupation}
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PAYMENT SUMMARY CARD — receipt-style, clear for all staff */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-950">

            {/* ── Card Header ── */}
            <div className="px-4 pt-3.5 pb-2 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                {language === 'mr' ? '💰 पेमेंट सारांश' : '💰 Payment Summary'}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {language === 'mr' 
                  ? `₹${booking.room_price} × ${nights} रात्र${booking.extra_beds > 0 ? ` + बेड ₹${extraBedTotal}` : ''}` 
                  : `₹${booking.room_price} × ${nights} night${nights !== 1 ? 's' : ''}${booking.extra_beds > 0 ? ` + bed ₹${extraBedTotal}` : ''}`}
              </span>
            </div>

            {/* ── Row 1: Total Bill ── */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/40">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {language === 'mr' ? 'एकूण बिल' : 'Total Bill'}
                </span>
                <span className="text-[10px] text-slate-600 font-medium">
                  {language === 'mr' ? '(टॅप करून बदला)' : '(tap to edit)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-baseline gap-0.5 group">
                  <span className="text-lg font-black text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingTotal}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setEditingTotal('')
                      } else {
                        const cleaned = val.replace(/^0+/, '')
                        setEditingTotal(cleaned === '' ? '0' : cleaned)
                      }
                    }}
                    onBlur={handleSaveTotalAmount}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveTotalAmount()
                        e.currentTarget.blur()
                      }
                    }}
                    className="bg-transparent border-none outline-none text-2xl font-black text-slate-100 text-right w-28 border-b-2 border-transparent focus:border-emerald-500/60 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-slate-500 text-base ml-1 select-none">✏️</span>
                </div>
                {editingTotal !== booking.total_amount && (
                  <button
                    onClick={handleSaveTotalAmount}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-[10px] font-black text-slate-950 rounded-lg transition shadow-sm shadow-emerald-500/20"
                  >
                    {language === 'mr' ? 'जतन' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Row 2: Amount Paid ── */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/40">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80">
                  {language === 'mr' ? 'जमा केलेली रक्कम' : 'Amount Paid'}
                </span>
                <span className="text-[10px] text-slate-600 font-medium">
                  {language === 'mr' ? '(टॅप करून बदला)' : '(tap to edit)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-black text-emerald-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingPaid}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setEditingPaid('')
                      } else {
                        const cleaned = val.replace(/^0+/, '')
                        setEditingPaid(cleaned === '' ? '0' : cleaned)
                      }
                    }}
                    onBlur={handleSavePaidAmount}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSavePaidAmount()
                        e.currentTarget.blur()
                      }
                    }}
                    className="bg-transparent border-none outline-none text-2xl font-black text-emerald-300 text-right w-28 border-b-2 border-transparent focus:border-emerald-500/60 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-slate-500 text-base ml-1 select-none">✏️</span>
                </div>
                {String(editingPaid) !== String(booking.paid_amount) && (
                  <button
                    onClick={handleSavePaidAmount}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-[10px] font-black text-slate-950 rounded-lg transition shadow-sm shadow-emerald-500/20"
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
                <div className="px-4 py-2 bg-slate-950/60">
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-700'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-slate-600 font-medium">₹0</span>
                    <span className={`text-[9px] font-bold ${pct >= 100 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {Math.round(pct)}% {language === 'mr' ? 'भरले' : 'paid'}
                    </span>
                    <span className="text-[9px] text-slate-600 font-medium">₹{liveTotal}</span>
                  </div>
                </div>
              )
            })()}

            {/* ── Row 3: Balance Due (THE MOST IMPORTANT ROW) ── */}
            {livePendingAmount > 0 ? (
              <div className="px-4 py-4 flex items-center justify-between bg-rose-500/8 border-t border-rose-500/25">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                    {language === 'mr' ? '⚠️ बाकी रक्कम (आता जमा करा)' : '⚠️ Balance Due'}
                  </span>
                  <span className="text-[10px] text-rose-400/70 font-medium">
                    {language === 'mr' ? 'पाहुण्यांकडून घ्यायची आहे' : 'Collect from guest'}
                  </span>
                </div>
                <span className="text-3xl font-black text-rose-400 tabular-nums">
                  ₹{livePendingAmount.toLocaleString('en-IN')}
                </span>
              </div>
            ) : (
              <div className="px-4 py-4 flex items-center justify-between bg-emerald-500/8 border-t border-emerald-500/25">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    {language === 'mr' ? '✅ पूर्ण भरले' : '✅ Fully Settled'}
                  </span>
                  <span className="text-[10px] text-emerald-400/70 font-medium">
                    {language === 'mr' ? 'कोणतीही रक्कम बाकी नाही' : 'No balance due'}
                  </span>
                </div>
                <span className="text-3xl font-black text-emerald-400">
                  ₹0
                </span>
              </div>
            )}

            {/* ── Payment Method Row ── */}
            <div className="px-4 py-3 bg-slate-900/40 border-t border-slate-800/60 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {language === 'mr' ? 'पेमेंट पद्धत:' : 'Payment method:'}
              </span>
              <div className="flex gap-1.5">
                {(['Cash', 'UPI', 'Pending'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSavePaymentMode(mode)}
                    className={`px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all duration-200 ${
                      booking.payment_mode === mode
                        ? mode === 'Cash'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                          : mode === 'UPI'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-sm shadow-blue-500/10'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
                        : 'bg-slate-900/80 border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {mode === 'Cash' ? '💵 ' : mode === 'UPI' ? '📱 ' : '⏳ '}
                    {mode === 'Cash' ? (language === 'mr' ? 'कॅश' : 'Cash') : mode === 'UPI' ? 'UPI' : (language === 'mr' ? 'बाकी' : 'Pending')}
                  </button>
                ))}
              </div>
            </div>

          </div>
          {/* ═══════════════════════════════════════════════════════════ */}

          {/* Notes */}
          {booking.notes && (
            <div className="p-3 bg-slate-950/40 border border-slate-855 rounded-2xl text-xs text-slate-400">
              <span className="font-bold text-slate-500 block mb-1">{language === 'mr' ? 'नोंद (तपशील)' : 'NOTES'}</span>
              {booking.notes}
            </div>
          )}

          {/* Document ID proofs list */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'पाहुण्यांचे ओळखपत्र (ग्राहक रेकॉर्ड)' : 'Guest ID Proofs (Customer Record)'}</span>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const idDocsOnly = guestDocs ? guestDocs.filter(d => d.doc_type !== 'guest_photo') : [];
                const bookingDocsOnly = booking.documents ? booking.documents.filter(d => d.doc_type !== 'guest_photo') : [];
                
                if (idDocsOnly.length > 0) {
                  return idDocsOnly.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition group"
                    >
                      {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                        <FileText className="h-6 w-6 text-slate-400" />
                      ) : (
                        <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                      )}
                      <span className="absolute bottom-0 inset-x-0 bg-slate-955/80 text-[8px] text-slate-400 font-bold px-1 py-0.5 truncate text-center">
                        {doc.file_name}
                      </span>
                    </a>
                  ));
                } else if (bookingDocsOnly.length > 0) {
                  return bookingDocsOnly.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition group"
                    >
                      {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                        <FileText className="h-6 w-6 text-slate-400" />
                      ) : (
                        <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                      )}
                      <span className="absolute bottom-0 inset-x-0 bg-slate-955/80 text-[8px] text-slate-400 font-bold px-1 py-0.5 truncate text-center">
                        {doc.file_name}
                      </span>
                    </a>
                  ));
                } else {
                  return <div className="text-xs text-slate-500 italic">{language === 'mr' ? 'अद्याप कोणतेही ओळखपत्र जोडलेले नाही.' : 'No documentation uploaded yet.'}</div>;
                }
              })()}
            </div>

            {/* Document upload triggers */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-955 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Camera className="h-3.5 w-3.5 text-slate-500" />
                {language === 'mr' ? 'फोटो काढा' : 'Capture'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  multiple
                />
              </label>
              <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-955 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                {language === 'mr' ? 'फाईल निवडा' : 'Upload File'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  multiple
                />
              </label>
            </div>
          </div>

          {/* Extend Stay Panel */}
          <div className="border-t border-slate-800/80 pt-3">
            {showExtendInput ? (
              <div className="flex flex-col gap-3.5 p-4 bg-slate-955 border border-slate-800 rounded-2xl animate-fade-in">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'मुक्काम वाढवा - नवीन चेक-आउट तारीख' : 'Extend Stay Checkout Date'}</span>
                
                {/* Date Input */}
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={format(parseISO(booking.check_in), 'yyyy-MM-dd')}
                    value={newCheckOutDate}
                    onChange={(e) => setNewCheckOutDate(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowExtendInput(false)
                      setNewCheckOutDate('')
                    }}
                    className="px-3.5 py-2.5 bg-slate-850 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-800 hover:text-slate-200 transition"
                  >
                    {language === 'mr' ? 'रद्द करा' : 'Cancel'}
                  </button>
                </div>

                {/* Availability Checking & Status Feedback */}
                {newCheckOutDate && (
                  <div className="flex flex-col gap-2.5 border-t border-slate-800/60 pt-3">
                    {checkingAvailability && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold py-1">
                        <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                        {language === 'mr' ? 'खोलीची उपलब्धता तपासत आहे...' : 'Checking room availability...'}
                      </div>
                    )}

                    {!checkingAvailability && isAvailable === true && (
                      <div className="flex flex-col gap-2">
                        {/* Green Success Check */}
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                          <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          {language === 'mr' ? 'मुदत वाढवण्यासाठी खोली उपलब्ध आहे!' : 'Room is available for extension!'}
                        </div>

                        {/* Recap and pricing updates */}
                        <div className="flex flex-col gap-2 p-3 bg-slate-900/60 border border-slate-850 rounded-xl text-xs">
                          <div className="flex justify-between items-center text-slate-400">
                            <span>{language === 'mr' ? 'नवीन कालावधी:' : 'New Duration:'}</span>
                            <span className="font-bold text-slate-200">
                              {calculatedNights} {language === 'mr' ? 'रात्र' : 'nights'} (+{calculatedNights - getDaysDiff(booking.check_in, booking.check_out)} {language === 'mr' ? 'रात्र' : 'nights'})
                            </span>
                          </div>
                          
                          {calculatedTotal !== null && (
                            <div className="flex justify-between items-center text-slate-400 border-t border-slate-800/60 pt-1.5 mt-0.5">
                              <span>{language === 'mr' ? 'अंदाजित एकूण रक्कम:' : 'Estimated Total Amount:'}</span>
                              <span className="font-bold text-slate-202">₹{calculatedTotal} {language === 'mr' ? `(पूर्वी ₹${booking.total_amount})` : `(originally ₹${booking.total_amount})`}</span>
                            </div>
                          )}
                        </div>

                        {/* Recalculate amount checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-450 pl-1">
                          <input
                            type="checkbox"
                            checked={shouldAutoUpdateTotal}
                            onChange={(e) => setShouldAutoUpdateTotal(e.target.checked)}
                            className="rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 h-4 w-4"
                          />
                          <span>{language === 'mr' ? `एकूण बुकिंग रक्कम बदलून ₹${calculatedTotal} करा` : `Update total booking amount to ₹${calculatedTotal}`}</span>
                        </label>

                        {/* Update Button */}
                        <button
                          type="button"
                          onClick={handleExtendStay}
                          disabled={updateMutation.isPending}
                          className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-955 text-xs font-black rounded-xl hover:shadow-lg hover:shadow-emerald-500/15 transition flex items-center justify-center gap-1.5 mt-1"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {language === 'mr' ? 'जतन करत आहे...' : 'Saving...'}
                            </>
                          ) : (
                            <>
                              {language === 'mr' ? 'मुदतवाढ निश्चित करा' : 'Confirm Extension'}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {!checkingAvailability && isAvailable === false && (
                      <div className="flex flex-col gap-2">
                        {/* Red Error Check */}
                        <div className="flex items-start gap-2 text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2.5 rounded-xl">
                          <X className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p>{language === 'mr' ? 'खोली उपलब्ध नाही!' : 'Room is not available!'}</p>
                            <p className="text-[10px] text-rose-400/70 font-medium mt-1">{availabilityReason}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowExtendInput(true)}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl border border-slate-700/50 flex items-center justify-center gap-1.5 transition"
              >
                {language === 'mr' ? 'मुक्काम कालावधी वाढवा' : 'Extend Booking Stay'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

        </div>

        {/* Floating Action Buttons Footer */}
        <div className="p-6 border-t border-slate-800/60 bg-slate-955/80 backdrop-blur-md flex flex-col gap-3 flex-shrink-0">
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
              {language === 'mr' ? `❌ बुकिंग रद्द केले गेले आहे` : `❌ Booking Cancelled`}
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

        {/* Checkout Confirmation Modal Overlay */}
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
                      <>
                        पाहुणे <span className="font-extrabold text-slate-200">{booking.guests?.name}</span> यांना खोली क्रमांक <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span> मधून चेकआऊट करायचे आहे का?
                      </>
                    ) : (
                      <>
                        Check out <span className="font-extrabold text-slate-200">{booking.guests?.name}</span> from Room <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span>?
                      </>
                    )}
                  </p>
                  
                  {dues > 0 && (
                    <div className="mt-3 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl text-xs font-black text-rose-350 flex flex-col gap-1 items-center justify-center">
                      <span>
                        {language === 'mr' ? `⚠️ प्रलंबित रक्कम: ₹${dues.toLocaleString()}` : `⚠️ Dues Pending: ₹${dues.toLocaleString()}`}
                      </span>
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
                      {language === 'mr' ? `✅ सर्व पेमेंट पूर्ण (काही बाकी नाही)` : `✅ Settled (No Dues)`}
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
                    onClick={() => {
                      setShowCheckoutConfirm(false)
                      handleCheckOut()
                    }}
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
