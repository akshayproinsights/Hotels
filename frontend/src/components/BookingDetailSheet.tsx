import * as React from 'react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, Phone, CheckCircle, LogOut, FileText, Camera, Upload, Loader2, Copy, 
  ChevronLeft, ChevronRight, Plus, Minus, Calendar as CalendarIcon, Save,
  Edit2, Check
} from 'lucide-react'
import { 
  format, 
  parseISO, 
  parse, 
  differenceInCalendarDays,
  isAfter,
  isBefore,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths
} from 'date-fns'
import toast from 'react-hot-toast'
import { getBooking, updateBooking, cancelBooking, restoreBooking } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload, listCustomerDocs, extractNameFromId } from '../api/documents'
import { updateCustomer } from '../api/customers'
import { listAvailableRooms } from '../api/rooms'
import { getCustomerNameDisplay } from '../utils/customer'
import { useLanguage } from '../context/LanguageContext'
import { useVisualViewport } from '../hooks/useVisualViewport'
import type { Room } from '../types'
import NumericKeypad from './NumericKeypad'

interface BookingDetailSheetProps {
  bookingId: string
  onClose: () => void
  onSuccess: (action?: 'checkout' | 'update') => void
}

export default function BookingDetailSheet({ bookingId, onClose, onSuccess }: BookingDetailSheetProps) {
  const { language, t } = useLanguage()
  const viewport = useVisualViewport()
  const queryClient = useQueryClient()

  // Language map for Marathi
  const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
  const weekdaysMrShort = ['रवी', 'सोम', 'मं', 'बुध', 'गुरू', 'शुक्र', 'शनी']

  // Utility to format date string to "Tue, Jun 30" style
  const formatFriendlyDate = (isoString: string) => {
    if (!isoString) return ''
    const d = isoString.includes('T') ? parseISO(isoString) : parse(isoString.slice(0, 10), 'yyyy-MM-dd', new Date())
    if (language !== 'mr') {
      return format(d, 'EEE, MMM d')
    }
    return `${weekdaysMrShort[d.getDay()]}, ${d.getDate()} ${monthsMr[d.getMonth()]}`
  }

  // Utility to format time to "12:00 PM" style
  const formatFriendlyTime = (isoString: string) => {
    if (!isoString) return ''
    const d = isoString.includes('T') ? parseISO(isoString) : parse(isoString, 'yyyy-MM-dd HH:mm:ss', new Date())
    return format(d, 'hh:mm a')
  }

  // Fetch full details of the booking
  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
  })

  // Fetch all documents for this guest
  const { data: customerDocs, refetch: refetchCustomerDocs } = useQuery({
    queryKey: ['customerDocs', booking?.customer_id],
    queryFn: () => listCustomerDocs(booking?.customer_id || ''),
    enabled: !!booking?.customer_id,
  })

  // UI edit modes
  const [editRoomMode, setEditRoomMode] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date())
  const [activeKeypad, setActiveKeypad] = useState<'total' | 'extra' | 'paid' | 'roomPrice' | null>(null)

  // Booking details drafts (for editing)
  const [draftCheckIn, setDraftCheckIn] = useState('')
  const [draftCheckOut, setDraftCheckOut] = useState('')
  const [draftRoomType, setDraftRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'>('AC Deluxe')
  const [draftRoomId, setDraftRoomId] = useState('')
  const [draftAdults, setDraftAdults] = useState(1)
  const [draftChildren, setDraftChildren] = useState(0)
  const [draftExtraBeds, setDraftExtraBeds] = useState(0)
  const [draftRoomPrice, setDraftRoomPrice] = useState(0)
  const [editingTotal, setEditingTotal] = useState<string | number>('')
  const [editingPaid, setEditingPaid] = useState<string | number>('')
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'Cash' | 'UPI' | 'IDFC'>('Cash')
  const [editingExtraAmount, setEditingExtraAmount] = useState<string | number>('')
  const [editingExtraNote, setEditingExtraNote] = useState<string>('')

  // Available rooms list when room type / dates change
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isLoadingAvailableRooms, setIsLoadingAvailableRooms] = useState(false)

  // Modals/Confirmations
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRefDetails, setShowRefDetails] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Customer Name Edit States
  const [draftCustomerName, setDraftCustomerName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // Initialize drafts when booking is loaded
  useEffect(() => {
    if (booking && !showDatePicker && !editRoomMode && !isEditingName && !activeKeypad) {
      setDraftCheckIn(booking.check_in.slice(0, 10))
      setDraftCheckOut(booking.check_out.slice(0, 10))
      setDraftRoomType(booking.room_type || booking.rooms?.room_type || 'AC Deluxe')
      setDraftRoomId(booking.room_id)
      setDraftAdults(booking.adults)
      setDraftChildren(booking.children)
      setDraftExtraBeds(booking.extra_beds)
      setDraftRoomPrice(booking.room_price)
      setEditingTotal(booking.total_amount)
      setEditingPaid(booking.paid_amount)
      setEditingExtraAmount(booking.extra_bill_amount || 0)
      setEditingExtraNote(booking.extra_bill_note || '')
      setPickerMonth(parseISO(booking.check_in))
      if (booking.customers?.name) {
        setDraftCustomerName(booking.customers.name)
      }
    }
  }, [booking, showDatePicker, editRoomMode, isEditingName, activeKeypad])

  // Fetch available rooms when dates change in edit mode
  useEffect(() => {
    if (!editRoomMode || !draftCheckIn || !draftCheckOut) return

    let active = true
    const fetchRooms = async () => {
      setIsLoadingAvailableRooms(true)
      try {
        const startISO = parse(`${draftCheckIn} 12:00`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const endISO = parse(`${draftCheckOut} 11:00`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const res = await listAvailableRooms(startISO, endISO)
        if (active) {
          // Make sure current booked room is always in the options list so it doesn't disappear
          if (booking?.rooms) {
            const hasCurrentRoom = res.some(r => r.id === booking.rooms?.id)
            setAvailableRooms(hasCurrentRoom ? res : [booking.rooms, ...res])
          } else {
            setAvailableRooms(res)
          }
        }
      } catch (err) {
        console.error('Error fetching available rooms', err)
      } finally {
        if (active) {
          setIsLoadingAvailableRooms(false)
        }
      }
    }

    fetchRooms()
    return () => {
      active = false
    }
  }, [draftCheckIn, draftCheckOut, editRoomMode, booking])

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateBooking>[1]) => updateBooking(bookingId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      
      const isCheckin = variables?.is_checked_in === true
      if (isCheckin) {
        toast.success(language === 'mr' ? 'चेक-इन यशस्वीरित्या पूर्ण झाले!' : 'Checked in successfully!')
      } else {
        toast.success(language === 'mr' ? 'बुकिंग यशस्वीरित्या अपडेट झाले' : 'Booking updated successfully')
      }
      
      refetch()
      const isCheckout = variables?.status === 'checked_out'
      onSuccess(isCheckout ? 'checkout' : 'update')
      setEditRoomMode(false)
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.detail || (language === 'mr' ? 'बुकिंग अपडेट करण्यात अडचण आली' : 'Failed to update booking')
      toast.error(errorMsg)
    },
  })

  const updateCustomerMutation = useMutation({
    mutationFn: (newName: string) => {
      if (!booking?.customer_id) throw new Error('No customer ID')
      return updateCustomer(booking.customer_id, { name: newName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      toast.success(language === 'mr' ? 'नाव बदलले गेले!' : 'Customer name updated successfully')
      setIsEditingName(false)
      refetch()
    },
    onError: () => {
      toast.error(language === 'mr' ? 'नाव बदलण्यात अडचण आली' : 'Failed to update customer name')
    }
  })

  const handleSaveCustomerName = () => {
    if (!draftCustomerName.trim()) return
    updateCustomerMutation.mutate(draftCustomerName)
  }


  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      
      onClose()
      onSuccess('update')
      
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
                queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
                queryClient.invalidateQueries({ queryKey: ['inventory'] })
                queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
                queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
                toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored!', { id: restoreToast })
                onSuccess('update')
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

  const restoreMutation = useMutation({
    mutationFn: () => restoreBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored successfully')
      refetch()
      onSuccess('update')
    },
    onError: () => {
      toast.error(language === 'mr' ? 'पुनर्संचयित करण्यात अडचण आली' : 'Failed to restore booking')
    }
  })

  if (isLoading || !booking) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="glass-panel relative w-full max-w-lg rounded-t-3xl bg-slate-900 shadow-2xl p-6 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
          <span className="text-sm text-slate-400 font-semibold mt-4">
            {language === 'mr' ? 'बुकिंगचे तपशील लोड होत आहेत...' : 'Loading booking details...'}
          </span>
        </div>
      </div>,
      document.body
    )
  }

  const customerPhotoDoc = customerDocs?.find((d: any) => d.doc_type === 'customer_photo') || booking?.documents?.find((d: any) => d.doc_type === 'customer_photo')

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
          const { upload_url, document_id } = await getUploadUrl(booking.id, booking.customer_id, file.name, file.type)
          await uploadFileToR2(upload_url, file)
          await confirmUpload(document_id)
        }
        toast.success(language === 'mr' ? 'ओळखपत्रे यशस्वीरित्या जोडली गेली' : 'Documents added successfully', { id: uploadToast })
        
        // Auto-run OCR details extraction on the uploaded ID cards
        try {
          const details = await extractNameFromId(files)
          if (details && details.name && details.name.trim()) {
            const updates: Parameters<typeof updateCustomer>[1] = { name: details.name.trim() }
            if (details.address) updates.address = details.address.trim()
            if (details.age) updates.age = details.age
            
            await updateCustomer(booking.customer_id, updates)
            toast.success(language === 'mr' ? `ओळखपत्रातून नाव अपडेट केले: ${details.name.trim()}` : `Extracted and updated guest name: ${details.name.trim()}`)
          }
        } catch (ocrErr) {
          console.error('OCR Extraction failed:', ocrErr)
        }

        refetch()
        refetchCustomerDocs()
      } catch (err) {
        console.error(err)
        toast.error(language === 'mr' ? 'काही ओळखपत्रे अपलोड करण्यात अडचण आली' : 'Failed to upload one or more documents', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleCustomerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setIsUploading(true)
      const uploadToast = toast.loading(language === 'mr' ? 'फोटो अपलोड होत आहे...' : 'Uploading photo...')
      try {
        const { upload_url, document_id } = await getUploadUrl(booking.id, booking.customer_id, file.name || 'customer_photo.jpg', file.type || 'image/jpeg', 'customer_photo')
        await uploadFileToR2(upload_url, file)
        await confirmUpload(document_id)
        toast.success(language === 'mr' ? 'फोटो यशस्वीरित्या अपलोड झाला' : 'Photo uploaded successfully', { id: uploadToast })
        refetch()
        refetchCustomerDocs()
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
      case 'reserved':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      case 'paid':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    }
  }

  // Calculated state values
  const liveTotal = editingTotal === '' ? 0 : Number(editingTotal)
  const livePaid = editingPaid === '' ? 0 : Number(editingPaid)
  const livePendingAmount = Math.max(0, liveTotal - livePaid)

  const nights = (() => {
    if (!draftCheckIn || !draftCheckOut) return 1
    const s = new Date(draftCheckIn)
    const e = new Date(draftCheckOut)
    return Math.max(1, differenceInCalendarDays(e, s))
  })()

  const extraBedTotal = draftExtraBeds * 500 * nights

  const handleSaveTotalAmount = (valueToSave?: string | number) => {
    const val = valueToSave !== undefined ? valueToSave : editingTotal
    const newTotal = val === '' ? 0 : Number(val)
    if (newTotal === booking.total_amount) return
    updateMutation.mutate({ total_amount: newTotal })
  }

  const handleSavePaidAmount = (valueToSave?: string | number) => {
    const val = valueToSave !== undefined ? valueToSave : editingPaid
    const newPaid = val === '' ? 0 : Number(val)
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

  const handleSavePaymentMode = (newMode: 'Cash' | 'UPI' | 'IDFC' | 'Pending') => {
    if (newMode === booking.payment_mode) return
    const currentPaid = editingPaid === '' ? 0 : Number(editingPaid)
    const currentTotal = editingTotal === '' ? 0 : Number(editingTotal)
    const updates: Parameters<typeof updateBooking>[1] = { payment_mode: newMode }
    const isNowFullyPaid = currentPaid >= currentTotal
    updates.payment_status = isNowFullyPaid ? 'paid' : (currentPaid > 0 ? 'partial' : 'unpaid')
    updateMutation.mutate(updates)
  }

  const handleSaveExtraCharges = (valueToSave?: string | number) => {
    const val = valueToSave !== undefined ? valueToSave : editingExtraAmount
    const newExtraAmount = val === '' ? 0 : Number(val)
    const newExtraNote = editingExtraNote.trim()
    
    if (newExtraAmount === (booking.extra_bill_amount || 0) && newExtraNote === (booking.extra_bill_note || '')) return

    const oldExtraAmount = booking.extra_bill_amount || 0
    const diff = newExtraAmount - oldExtraAmount
    const currentTotal = editingTotal === '' ? 0 : Number(editingTotal)
    const newTotal = currentTotal + diff

    // Update frontend state immediately to feel responsive
    setEditingTotal(newTotal)

    // Calculate new payment status based on new total and livePaid
    const isNowFullyPaid = livePaid >= newTotal

    updateMutation.mutate({
      extra_bill_amount: newExtraAmount,
      extra_bill_note: newExtraNote,
      total_amount: newTotal,
      payment_status: isNowFullyPaid ? 'paid' : (livePaid > 0 ? 'partial' : 'unpaid')
    })
  }

  // Room details inline edit submission
  const handleSaveRoomDetails = () => {
    // Recalculate total if price/extra beds changed
    const recalculatedTotal = (draftRoomPrice * nights) + extraBedTotal + (booking.extra_bill_amount || 0)
    updateMutation.mutate({
      room_id: draftRoomId,
      room_type: draftRoomType,
      adults: draftAdults,
      children: draftChildren,
      extra_beds: draftExtraBeds,
      room_price: draftRoomPrice,
      total_amount: recalculatedTotal
    })
  }

  // Date edit validation and submission
  const handleSaveDates = () => {
    const newNights = differenceInCalendarDays(new Date(draftCheckOut), new Date(draftCheckIn))
    const recalculatedTotal = (draftRoomPrice * newNights) + (draftExtraBeds * 500 * newNights) + (booking.extra_bill_amount || 0)

    const currentTimeStr = format(new Date(), 'HH:mm')

    const finalCheckIn = draftCheckIn === booking.check_in.slice(0, 10)
      ? booking.check_in
      : parse(`${draftCheckIn} ${currentTimeStr}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()

    const finalCheckOut = draftCheckOut === booking.check_out.slice(0, 10)
      ? booking.check_out
      : parse(`${draftCheckOut} ${currentTimeStr}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()

    updateMutation.mutate({
      check_in: finalCheckIn,
      check_out: finalCheckOut,
      total_amount: recalculatedTotal
    })
  }

  const renderDatePickerModal = () => {
    if (!showDatePicker) return null

    const monthStart = startOfMonth(pickerMonth)
    const monthEnd = endOfMonth(pickerMonth)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)
    const days = eachDayOfInterval({ start: startDate, end: endDate })

    const selCheckIn = draftCheckIn ? parse(draftCheckIn, 'yyyy-MM-dd', new Date()) : null
    const selCheckOut = draftCheckOut ? parse(draftCheckOut, 'yyyy-MM-dd', new Date()) : null

    const handlePrevMonth = () => setPickerMonth(prev => subMonths(prev, 1))
    const handleNextMonth = () => setPickerMonth(prev => addMonths(prev, 1))

    const handleDayClick = (day: Date) => {
      const formatted = format(day, 'yyyy-MM-dd')

      if (!draftCheckIn || (draftCheckIn && draftCheckOut)) {
        setDraftCheckIn(formatted)
        setDraftCheckOut('')
      } else {
        const ci = parse(draftCheckIn, 'yyyy-MM-dd', new Date())
        if (isAfter(day, ci)) {
          setDraftCheckOut(formatted)
        } else if (isSameDay(day, ci)) {
          setDraftCheckOut('')
        } else {
          setDraftCheckIn(formatted)
          setDraftCheckOut('')
        }
      }
    }

    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ]

    return (
      <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
        <div className="glass-panel relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-extrabold text-slate-200">{language === 'mr' ? 'तारीख निवडा' : 'Select Date Range'}</h4>
              <p className="text-[10px] text-slate-500 font-medium">{language === 'mr' ? 'चेक-इन आणि नंतर चेक-आउट तारीख निवडा' : 'Click check-in then check-out'}</p>
            </div>
            <button onClick={() => {
              setShowDatePicker(false)
              if (booking) {
                setDraftCheckIn(booking.check_in.slice(0, 10))
                setDraftCheckOut(booking.check_out.slice(0, 10))
              }
            }} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-955/60 p-3 rounded-2xl border border-slate-850">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-इन' : 'Check-in'}</span>
              <div className="text-xs font-bold text-emerald-400">
                {selCheckIn ? formatFriendlyDate(draftCheckIn) : (language === 'mr' ? 'तारीख निवडा' : 'Select date')}
              </div>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-आउट' : 'Check-out'}</span>
              <div className="text-xs font-bold text-amber-400">
                {selCheckOut ? formatFriendlyDate(draftCheckOut) : (language === 'mr' ? 'तारीख निवडा' : 'Select date')}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-black text-slate-300">
              {language === 'mr' ? monthsMr[pickerMonth.getMonth()] : MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
            </span>
            <div className="flex gap-1.5">
              <button type="button" onClick={handlePrevMonth} className="p-1.5 rounded-lg bg-slate-955 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={handleNextMonth} className="p-1.5 rounded-lg bg-slate-955 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {(language === 'mr' ? ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((day, idx) => (
                <div key={idx} className="text-[10px] font-extrabold text-slate-500 uppercase">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, dayIdx) => {
                const formatted = format(day, 'yyyy-MM-dd')
                const isSelectedStart = draftCheckIn === formatted
                const isSelectedEnd = draftCheckOut === formatted
                const inRange = draftCheckIn && draftCheckOut && isAfter(day, parse(draftCheckIn, 'yyyy-MM-dd', new Date())) && isBefore(day, parse(draftCheckOut, 'yyyy-MM-dd', new Date()))
                const currentMonth = day.getMonth() === pickerMonth.getMonth()
                
                let dayBg = 'hover:bg-slate-800 text-slate-400'
                if (!currentMonth) dayBg = 'text-slate-500 opacity-30 hover:bg-slate-800'
                if (isSelectedStart) dayBg = 'bg-emerald-500 text-slate-955 font-black rounded-lg'
                if (isSelectedEnd) dayBg = 'bg-amber-500 text-slate-955 font-black rounded-lg'
                if (inRange) dayBg = 'bg-emerald-500/10 text-emerald-300 font-semibold'

                return (
                  <button
                    key={dayIdx}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={`py-2 text-xs transition duration-150 flex items-center justify-center ${dayBg}`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowDatePicker(false)
                if (booking) {
                  setDraftCheckIn(booking.check_in.slice(0, 10))
                  setDraftCheckOut(booking.check_out.slice(0, 10))
                }
              }}
              className="flex-1 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-350 text-xs font-bold rounded-xl border border-slate-800"
            >
              {language === 'mr' ? 'रद्द करा' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!draftCheckIn || !draftCheckOut}
              onClick={() => {
                setShowDatePicker(false)
                handleSaveDates()
              }}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-955 text-xs font-black rounded-xl shadow-lg disabled:opacity-40"
            >
              {language === 'mr' ? 'निवडा' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const amountInputCls = "bg-transparent outline-none text-2xl font-black text-right w-28 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      style={viewport ? { height: `${viewport.height}px`, top: `${viewport.offsetTop}px`, bottom: 'auto' } : undefined}
    >
      <div
        className="glass-panel relative w-full max-w-lg flex flex-col rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl animate-fade-in overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={viewport ? { height: `${viewport.height * 0.92}px` } : { height: '92dvh' }}
      >
        {/* Header */}
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
                <div className="text-[10px] text-slate-550 mt-1 font-medium bg-slate-955/20 px-2 py-1 rounded-lg border border-slate-850/60 max-w-fit">
                  {language === 'mr' ? 'बुकिंग संदर्भ क्रमांक:' : 'Booking Ref:'} <span className="text-slate-450 font-bold">{booking.booking_number}</span> • <span className="text-slate-450 font-bold">{booking.room_type || booking.rooms?.room_type}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scroll Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">

          {/* 1. Date Strip */}
          <div className="glass-panel p-4 rounded-2xl bg-slate-955/40 border border-slate-800/80 flex flex-col gap-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 flex-1">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-इन' : 'CHECK-IN'}</span>
                  <span className="text-base font-black text-slate-100 mt-0.5">{formatFriendlyDate(draftCheckIn)}</span>
                  <span className="text-xs font-bold text-emerald-400 mt-0.5">{formatFriendlyTime(booking.check_in)}</span>
                </div>
                <div className="text-slate-700 font-black text-lg">➔</div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-आउट' : 'CHECK-OUT'}</span>
                  <span className="text-base font-black text-slate-100 mt-0.5">{formatFriendlyDate(draftCheckOut)}</span>
                  <span className="text-xs font-bold text-amber-500 mt-0.5">{formatFriendlyTime(booking.check_out)}</span>
                </div>
              </div>
              <div className="bg-slate-850 border border-slate-805 rounded-xl px-3 py-2 text-center flex flex-col justify-center items-center flex-shrink-0">
                <span className="text-lg font-black text-slate-100 leading-none">{nights}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-1">
                  {language === 'mr' ? 'रात्र' : (nights === 1 ? 'NIGHT' : 'NIGHTS')}
                </span>
              </div>
            </div>
            {booking.status === 'active' && (
              <button
                onClick={() => setShowDatePicker(true)}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
                {language === 'mr' ? 'बुकिंग तारखा बदला (लवकर चेक-आउट)' : 'Edit Booking Dates (Early Checkout)'}
              </button>
            )}
          </div>

          {/* 2. Guest Card */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3 bg-slate-955/40 border border-slate-800/80 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {customerPhotoDoc ? (
                  <div className="relative group w-12 h-12 flex-shrink-0">
                    <img
                      src={customerPhotoDoc.public_url}
                      alt="Customer Photo"
                      className="w-full h-full rounded-xl object-cover border border-slate-700 cursor-pointer hover:border-emerald-500 transition"
                    />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center cursor-pointer transition">
                      <Camera className="h-4.5 w-4.5 text-slate-300" />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCustomerPhotoUpload} />
                    </label>
                  </div>
                ) : (
                  <label className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 flex items-center justify-center flex-shrink-0 text-slate-500 cursor-pointer transition group">
                    <Camera className="h-5 w-5 group-hover:text-emerald-400 transition" />
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCustomerPhotoUpload} />
                  </label>
                )}
                <div className="flex-1 min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="text"
                        value={draftCustomerName}
                        onChange={(e) => setDraftCustomerName(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-sm text-slate-100 font-bold focus:outline-none focus:border-emerald-500 w-full"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCustomerName()
                          if (e.key === 'Escape') {
                            setDraftCustomerName(getCustomerNameDisplay(booking.customers?.name).name || '')
                            setIsEditingName(false)
                          }
                        }}
                      />
                      <button
                        onClick={handleSaveCustomerName}
                        disabled={updateCustomerMutation.isPending}
                        className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-450 text-slate-955 transition flex-shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setDraftCustomerName(getCustomerNameDisplay(booking.customers?.name).name || '')
                          setIsEditingName(false)
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-205 transition flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-extrabold text-base truncate flex items-center gap-1">
                        {(() => {
                          const { name: dName, isDeleted } = getCustomerNameDisplay(booking.customers?.name);
                          return (
                            <>
                              <span className="truncate">{dName}</span>
                              {isDeleted && (
                                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1 shrink-0 whitespace-nowrap">
                                  {language === 'mr' ? 'डिलीट केलेले' : 'Deleted'}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                      <button
                        onClick={() => {
                          setDraftCustomerName(getCustomerNameDisplay(booking.customers?.name).name || '')
                          setIsEditingName(true)
                        }}
                        className="text-slate-500 hover:text-slate-350 transition"
                        title={language === 'mr' ? 'नाव बदला' : 'Edit Name'}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {booking.status !== 'active' && (
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0 ${
                    booking.status === 'checked_out'
                      ? 'bg-slate-800 text-slate-405 border border-slate-700/50'
                      : 'bg-rose-550/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {booking.status === 'checked_out'
                      ? (language === 'mr' ? 'चेकआऊट झाले' : 'Checked Out')
                      : (language === 'mr' ? 'रद्द केले' : 'Cancelled')}
                  </span>
                )}
                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0 ${getStatusBadgeStyles(effectivePaymentStatus)}`}>
                  {(effectivePaymentStatus as string) === 'hold'
                    ? (language === 'mr' ? 'होल्डवर' : 'On Hold')
                    : effectivePaymentStatus === 'unpaid'
                      ? (language === 'mr' ? 'पेमेंट केले नाही' : 'Unpaid')
                      : effectivePaymentStatus === 'partial'
                        ? (language === 'mr' ? 'अंशतः पेमेंट' : 'Partial')
                        : effectivePaymentStatus === 'reserved'
                          ? (language === 'mr' ? 'राखीव' : 'Reserved')
                          : (language === 'mr' ? 'पूर्ण भरले' : 'Paid')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5">
              <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <span className="flex-1 text-sm font-bold text-slate-200 tracking-wide">{booking.customers?.phone}</span>
              <a
                href={`tel:${booking.customers?.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-955 text-xs font-black rounded-lg transition shadow-sm shadow-emerald-500/20"
              >
                <Phone className="h-3 w-3" />
                {language === 'mr' ? 'कॉल करा' : 'Call'}
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(booking.customers?.phone ?? '').then(() => {
                    toast.success(language === 'mr' ? 'नंबर कॉपी केला!' : 'Number copied!')
                  }).catch(() => {
                    toast.error(language === 'mr' ? 'नंबर कॉपी करू शकलो नाही' : 'Could not copy number')
                  })
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-850 hover:bg-slate-700 active:bg-slate-900 text-slate-350 text-xs font-bold rounded-lg transition"
              >
                <Copy className="h-3 w-3" />
                {language === 'mr' ? 'कॉपी' : 'Copy'}
              </button>
            </div>

            {booking.occupation && (
              <div className="text-xs text-slate-500">
                <span className="font-bold">{language === 'mr' ? 'व्यवसाय:' : 'Occupation:'}</span> {booking.occupation}
              </div>
            )}
          </div>

          {/* 3. Payment Details */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 bg-slate-955/40 shadow-lg flex-shrink-0">
            <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                💰 {language === 'mr' ? 'पेमेंट' : 'PAYMENT'}
              </span>
              <span className="text-[11px] text-slate-550 font-medium">
                {language === 'mr'
                  ? `₹${draftRoomPrice} × ${nights} रात्र${draftExtraBeds > 0 ? ` + बेड ₹${extraBedTotal}` : ''}`
                  : `₹${draftRoomPrice} × ${nights} night${nights !== 1 ? 's' : ''}${draftExtraBeds > 0 ? ` + bed ₹${extraBedTotal}` : ''}`}
              </span>
            </div>

            <div className="px-5 py-5 flex items-center justify-between border-b border-slate-800/60">
              <div>
                <div className="text-sm font-bold text-slate-300">{language === 'mr' ? 'एकूण बिल' : 'Total Bill'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
                  <span className="text-slate-400 text-lg font-black">₹</span>
                  <input
                    id="input-total-amount"
                    type="text"
                    readOnly
                    value={editingTotal}
                    onClick={() => setActiveKeypad('total')}
                    className={`${amountInputCls} cursor-pointer`}
                  />
                </div>
                {editingTotal !== booking.total_amount && (
                  <button onClick={() => handleSaveTotalAmount()} className="px-3 py-2 bg-emerald-500 text-slate-955 text-xs font-black rounded-lg">
                    {language === 'mr' ? 'जतन' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3 bg-slate-900/40 border-b border-slate-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-300">
                    {language === 'mr' ? 'अतिरिक्त शुल्क' : 'Extra Charges'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
                     <span className="text-slate-400 text-lg font-black">₹</span>
                     <input
                       id="input-extra-charges-amount"
                       type="text"
                       readOnly
                       value={editingExtraAmount}
                       onClick={() => setActiveKeypad('extra')}
                       className={`${amountInputCls} cursor-pointer`}
                     />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {language === 'mr' ? 'तपशील (उदा. चहा, पाणी)' : 'Item Details / Notes'}
                </span>
                <div className="flex gap-2">
                  <input
                    id="input-extra-charges-note"
                    type="text"
                    value={editingExtraNote}
                    onChange={(e) => setEditingExtraNote(e.target.value)}
                    onBlur={() => handleSaveExtraCharges()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveExtraCharges()
                        e.currentTarget.blur()
                      }
                    }}
                    placeholder={language === 'mr' ? 'चहा, नाश्ता इ.' : 'e.g. Tea, breakfast, laundry'}
                    className="flex-1 bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-slate-500 transition"
                  />
                  {(editingExtraAmount !== (booking.extra_bill_amount || 0) || editingExtraNote !== (booking.extra_bill_note || '')) && (
                    <button
                      type="button"
                      onClick={() => handleSaveExtraCharges()}
                      className="px-3 py-2 bg-emerald-500 text-slate-955 text-xs font-black rounded-xl transition hover:bg-emerald-450"
                    >
                      {language === 'mr' ? 'जतन' : 'Save'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-5 flex items-center justify-between border-b border-slate-800/60">
              <div>
                <div className="text-sm font-bold text-emerald-400">{language === 'mr' ? 'जमा केलेली रक्कम' : 'Amount Paid'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
                  <span className="text-emerald-500 text-lg font-black">₹</span>
                  <input
                    id="input-paid-amount"
                    type="text"
                    readOnly
                    value={editingPaid}
                    onClick={() => setActiveKeypad('paid')}
                    className={`${amountInputCls} cursor-pointer`}
                  />
                </div>
                {String(editingPaid) !== String(booking.paid_amount) && (
                  <button onClick={() => handleSavePaidAmount()} className="px-3 py-2 bg-emerald-500 text-slate-955 text-xs font-black rounded-lg">
                    {language === 'mr' ? 'जतन' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const pct = liveTotal > 0 ? Math.min(100, (livePaid / liveTotal) * 100) : 0
              return (
                <div className="px-5 py-3 bg-slate-900/40 border-b border-slate-800/60">
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-700'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[9px] font-bold text-slate-500 uppercase">
                    <span>{Math.round(pct)}% {language === 'mr' ? 'भरले' : 'paid'}</span>
                    <span>{language === 'mr' ? 'एकूण' : 'Total'}: ₹{liveTotal}</span>
                  </div>
                </div>
              )
            })()}

            <div className={`px-5 py-5 flex items-center justify-between ${
              livePendingAmount > 0 ? 'bg-rose-500/5 border-b border-rose-500/15' : 'bg-emerald-500/5 border-b border-emerald-500/15'
            }`}>
              <div>
                <div className={`text-base font-black ${livePendingAmount > 0 ? 'text-rose-450' : 'text-emerald-400'}`}>
                  {livePendingAmount > 0 ? (language === 'mr' ? '⚠️ बाकी रक्कम' : '⚠️ Balance Due') : (language === 'mr' ? '✅ पूर्ण भरले' : '✅ Fully Paid')}
                </div>
              </div>
              <span className={`text-3xl font-black tabular-nums ${livePendingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ₹{livePendingAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="px-5 py-3.5 flex items-center justify-between bg-slate-900/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'पेमेंट पद्धत' : 'PAYMENT MODE'}</span>
              <div className="flex gap-2">
                {(['Cash', 'UPI', 'IDFC', 'Pending'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSavePaymentMode(mode)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                      booking.payment_mode === mode
                        ? mode === 'Cash'
                          ? 'bg-emerald-500 text-slate-955'
                          : mode === 'UPI'
                          ? 'bg-blue-500 text-white'
                          : mode === 'IDFC'
                          ? 'bg-purple-500 text-white'
                          : 'bg-amber-500 text-slate-955'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'Cash' ? '💵 Cash' : mode === 'UPI' ? '📱 UPI' : mode === 'IDFC' ? '🏦 IDFC' : '⏳ Pending'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Room Card with Inline Editing */}
          <div className="glass-panel p-4 rounded-2xl bg-slate-955/40 border border-slate-800/80 flex flex-col gap-4 flex-shrink-0">
            <div className="flex justify-between items-center border-b border-slate-805/50 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                🏨 {language === 'mr' ? 'खोली तपशील' : 'ROOM DETAILS'}
              </span>
              {booking.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setEditRoomMode(!editRoomMode)}
                  className="text-xs font-black text-emerald-400 hover:text-emerald-350 transition"
                >
                  {editRoomMode ? (language === 'mr' ? '✕ रद्द' : '✕ Cancel') : (language === 'mr' ? '✏️ खोली बदला' : '✏️ Edit Room')}
                </button>
              )}
            </div>

            {!editRoomMode ? (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-base font-black text-slate-100">
                      {booking.room_type || booking.rooms?.room_type}
                    </div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">
                      {language === 'mr' ? `खोली क्रमांक: ${booking.rooms?.number}` : `Room Number: ${booking.rooms?.number}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-slate-100">
                      ₹{booking.room_price}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      {language === 'mr' ? '/ प्रति रात्र' : '/ per night'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 bg-slate-900/30 p-2.5 rounded-xl border border-slate-800/40 text-center">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'प्रौढ' : 'Adults'}</span>
                    <div className="text-xs font-black text-slate-200 mt-0.5">{booking.adults}</div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'मुले' : 'Children'}</span>
                    <div className="text-xs font-black text-slate-200 mt-0.5">{booking.children}</div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'अतिरिक्त बेड' : 'Extra Beds'}</span>
                    <div className="text-xs font-black text-slate-200 mt-0.5">{booking.extra_beds}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'खोलीचा प्रकार' : 'ROOM TYPE'}</span>
                    <select
                      value={draftRoomType}
                      onChange={(e) => setDraftRoomType(e.target.value as any)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="AC Deluxe">AC Deluxe</option>
                      <option value="Non AC Deluxe">Non AC Deluxe</option>
                      <option value="VIP AC Suite">VIP AC Suite</option>
                      <option value="VIP Non AC Suite">VIP Non AC Suite</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'खोली क्रमांक' : 'ROOM NUMBER'}</span>
                    {isLoadingAvailableRooms ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-500 flex items-center justify-between font-bold">
                        <span>Loading...</span>
                        <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                      </div>
                    ) : (
                      <select
                        value={draftRoomId}
                        onChange={(e) => {
                          const rId = e.target.value
                          setDraftRoomId(rId)
                          const selected = availableRooms.find(r => r.id === rId)
                          if (selected) {
                            setDraftRoomPrice(selected.base_price)
                          }
                        }}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-emerald-500 transition"
                      >
                        {availableRooms
                          .filter(r => r.room_type === draftRoomType)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.number}
                            </option>
                          ))}
                        {availableRooms.filter(r => r.room_type === draftRoomType).length === 0 && (
                          <option value="">{language === 'mr' ? 'उपलब्ध नाही' : 'No vacant rooms'}</option>
                        )}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col items-center bg-slate-900/40 border border-slate-800/85 rounded-2xl p-2 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">{language === 'mr' ? 'प्रौढ' : 'Adults'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftAdults(prev => Math.max(1, prev - 1))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-black text-slate-200 w-4">{draftAdults}</span>
                      <button
                        type="button"
                        onClick={() => setDraftAdults(prev => prev + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-center bg-slate-900/40 border border-slate-800/85 rounded-2xl p-2 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">{language === 'mr' ? 'मुले' : 'Children'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftChildren(prev => Math.max(0, prev - 1))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-black text-slate-200 w-4">{draftChildren}</span>
                      <button
                        type="button"
                        onClick={() => setDraftChildren(prev => prev + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-center bg-slate-900/40 border border-slate-800/85 rounded-2xl p-2 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">{language === 'mr' ? 'अतिरिक्त बेड' : 'Extra Beds'}</span>
                    <span className="text-[7px] text-slate-550 font-medium mb-1">+₹500/night</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftExtraBeds(prev => Math.max(0, prev - 1))}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-black text-slate-200 w-4">{draftExtraBeds}</span>
                      <button
                        type="button"
                        onClick={() => setDraftExtraBeds(prev => prev + 1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-350"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'किंमत (₹/रात्र)' : 'ROOM PRICE (₹/NIGHT)'}</span>
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-slate-500 text-sm font-bold mr-1.5">₹</span>
                    <input
                      type="text"
                      readOnly
                      value={draftRoomPrice}
                      onClick={() => setActiveKeypad('roomPrice')}
                      className="bg-transparent outline-none flex-1 text-slate-200 font-black text-sm cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveRoomDetails}
                  disabled={updateMutation.isPending || !draftRoomId}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  {language === 'mr' ? 'जतन करा' : 'Save Room Details'}
                </button>
              </div>
            )}
          </div>

          {/* 5. Guest ID Proofs */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-955/30 flex-shrink-0">
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-transparent">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {language === 'mr' ? 'ओळखपत्रे' : 'Guest ID Proofs'}
              </span>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 pt-3">
                {(() => {
                  const idDocsOnly = customerDocs ? customerDocs.filter((d: any) => d.doc_type !== 'customer_photo') : []
                  const bookingDocsOnly = booking.documents ? booking.documents.filter((d: any) => d.doc_type !== 'customer_photo') : []
                  
                  // Merge customer and booking documents without duplicates
                  const allDocsMap = new Map()
                  bookingDocsOnly.forEach(d => allDocsMap.set(d.id, d))
                  idDocsOnly.forEach(d => allDocsMap.set(d.id, d))
                  const docs = Array.from(allDocsMap.values())

                  if (docs.length > 0) {
                    return docs.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-850 bg-slate-100 dark:bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition"
                      >
                        {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                          <FileText className="h-6 w-6 text-slate-400" />
                        ) : (
                          <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/45 text-[8px] text-white font-bold px-1 py-0.5 truncate text-center">
                          {doc.file_name}
                        </span>
                      </a>
                    ))
                  }
                  return <div className="text-xs text-slate-500 dark:text-slate-550 italic py-1">{language === 'mr' ? 'ओळखपत्र जोडलेले नाही.' : 'No ID proofs uploaded yet.'}</div>
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-850 transition text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फोटो काढा' : 'Capture'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} disabled={isUploading} multiple />
                </label>
                <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-850 transition text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फाईल निवडा' : 'Upload File'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} multiple />
                </label>
              </div>
            </div>
          </div>

          {/* 6. Notes */}
          {booking.notes && (
            <div className="p-3 bg-slate-955/40 border border-slate-805 rounded-2xl text-xs text-slate-400 leading-relaxed flex-shrink-0">
              <span className="font-bold text-slate-500 block mb-1 uppercase tracking-wider">{language === 'mr' ? 'नोंद' : 'Notes'}</span>
              {booking.notes}
            </div>
          )}

          {/* 7. Action Buttons (NON-floating, at end of scroll body) */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-3 pb-8 flex-shrink-0">
            {booking.status === 'checked_out' ? (
              <>
                <div className="py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-2xl text-center">
                  {language === 'mr'
                    ? `✅ ग्राहक यशस्वीरित्या चेकआऊट झाले (वेळ: ${formatFriendlyDate(booking.actual_checkout_time || booking.updated_at)} ${formatFriendlyTime(booking.actual_checkout_time || booking.updated_at)})`
                    : `✅ Guest Checked Out on ${formatFriendlyDate(booking.actual_checkout_time || booking.updated_at)} at ${formatFriendlyTime(booking.actual_checkout_time || booking.updated_at)}`}
                </div>
                {livePendingAmount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAsPaid}
                    className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-955 text-sm font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <CheckCircle className="h-4.5 w-4.5" />
                    {language === 'mr' ? 'बाकी रक्कम जमा करा (पेमेंट नोंदवा)' : 'Record Dues Payment'}
                  </button>
                )}
              </>
            ) : booking.status === 'cancelled' ? (
              <div className="flex flex-col gap-2">
                <div className="py-3 px-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-2xl text-center">
                  {language === 'mr' ? '❌ बुकिंग रद्द केले गेले आहे' : '❌ Booking Cancelled'}
                </div>
                <button
                  type="button"
                  onClick={() => restoreMutation.mutate()}
                  disabled={restoreMutation.isPending}
                  className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg"
                >
                  {language === 'mr' ? 'पुनर्संचयित करा (Restore)' : 'Restore Booking'}
                </button>
              </div>
            ) : !booking.is_checked_in ? (
              <div className="flex flex-col gap-3">
                <div className="py-2.5 px-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold rounded-2xl text-center">
                  📅 {language === 'mr' ? 'ग्राहक अद्याप आलेले नाही — चेक-इन प्रतीक्षित' : 'Customer not yet arrived — Check-in pending'}
                </div>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ is_checked_in: true })}
                  disabled={updateMutation.isPending}
                  className="w-full py-4 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-955 text-sm font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
                >
                  <CheckCircle className="h-5 w-5" />
                  {language === 'mr' ? 'चेक-इन निश्चित करा' : 'Confirm Check-In'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-450 hover:text-rose-350 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5 w-full"
                >
                  ❌ {language === 'mr' ? 'बुकिंग रद्द करा' : 'Cancel Booking'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {livePendingAmount > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={handleMarkAsPaid}
                        className="py-3.5 px-3 bg-slate-955 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 text-slate-350 hover:text-emerald-400 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        {language === 'mr' ? 'फक्त पेमेंट नोंदवा' : 'Collect Payment Only'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCheckoutConfirm(true)}
                        className="py-3.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg"
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
                        className="py-3.5 px-3 bg-slate-955 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/25 text-slate-300 hover:text-rose-450 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="h-4 w-4 text-slate-500" />
                        {language === 'mr' ? 'चेकआऊट करा' : 'Checkout Customer'}
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-450 hover:text-rose-350 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-1.5 w-full mt-1"
                >
                  ❌ {language === 'mr' ? 'बुकिंग रद्द करा' : 'Cancel Booking'}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Checkout Confirmation Modal */}
      {showCheckoutConfirm && (() => {
        const dues = Math.max(0, booking.total_amount - booking.paid_amount)
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
            <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className={`h-11 w-11 rounded-full flex items-center justify-center mx-auto border ${
                dues > 0 ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              }`}>
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">
                  {dues > 0 ? (language === 'mr' ? 'पेमेंट आणि चेकआऊट' : 'Collect & Checkout') : (language === 'mr' ? 'चेकआऊटची खात्री करा' : 'Confirm Checkout')}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {language === 'mr' ? (
                    <>ग्राहक <span className="font-extrabold text-slate-200">{getCustomerNameDisplay(booking.customers?.name).name}</span> यांना खोली क्रमांक <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span> मधून चेकआऊट करायचे आहे का?</>
                  ) : (
                    <>Check out <span className="font-extrabold text-slate-200">{getCustomerNameDisplay(booking.customers?.name).name}</span> from Room <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span>?</>
                  )}
                </p>

                {dues > 0 && (
                  <div className="mt-3 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl text-xs font-black text-rose-350 flex flex-col gap-1 items-center justify-center">
                    <span>{language === 'mr' ? `⚠️ प्रलंबित रक्कम: ₹${dues.toLocaleString()}` : `⚠️ Dues Pending: ₹${dues.toLocaleString()}`}</span>
                    {booking.payment_mode !== 'Pending' && (
                      <span className="text-[10px] text-rose-400/80 font-medium">
                        {language === 'mr' ? `पेमेंट मोड: ${booking.payment_mode === 'Cash' ? 'कॅश' : booking.payment_mode === 'UPI' ? 'UPI' : 'IDFC'}` : `Payment Mode: ${booking.payment_mode}`}
                      </span>
                    )}
                  </div>
                )}

                {dues > 0 && booking.payment_mode === 'Pending' && (
                  <div className="flex flex-col gap-2 mt-3.5 text-left bg-slate-955/40 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center block">
                      {language === 'mr' ? 'पेमेंट मोड निवडा:' : 'Select Payment Mode:'}
                    </span>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {(['Cash', 'UPI', 'IDFC'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSelectedPaymentMode(mode)}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                            selectedPaymentMode === mode
                              ? mode === 'Cash'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                                : mode === 'UPI'
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                                : 'bg-purple-500/15 text-purple-400 border-purple-500/40'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mode === 'Cash' ? (language === 'mr' ? '💵 कॅश' : '💵 Cash') : mode === 'UPI' ? (language === 'mr' ? '📱 UPI' : '📱 UPI') : (language === 'mr' ? '🏦 IDFC' : '🏦 IDFC')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dues <= 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black bg-emerald-500/10 border-emerald-500/20 text-emerald-350">
                    {language === 'mr' ? '✅ सर्व पेमेंट पूर्ण (काही बाकी नाही)' : '✅ Settled (No Dues)'}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirm(false)}
                  className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-350 hover:text-slate-200 text-xs font-bold rounded-xl transition"
                >
                  {language === 'mr' ? 'रद्द करा' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCheckoutConfirm(false); handleCheckOut() }}
                  className={`py-2.5 px-4 text-slate-955 text-xs font-black rounded-xl transition shadow-lg ${
                    dues > 0 ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 shadow-emerald-500/15' : 'bg-rose-500 hover:bg-rose-450 active:bg-rose-550 shadow-rose-500/15'
                  }`}
                >
                  {language === 'mr' ? 'निश्चित करा' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cancellation Confirmation Modal */}
      {showCancelConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-400 border-rose-500/25">
              <X className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'बुकिंग रद्द करण्याची खात्री करा' : 'Confirm Cancellation'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {language === 'mr' ? (
                  <>खोली क्रमांक <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span> मधील ग्राहक <span className="font-extrabold text-slate-200">{getCustomerNameDisplay(booking.customers?.name).name}</span> यांचे बुकिंग रद्द करायचे आहे का? हे आपण नंतर Settings मधून पुनर्संचयित करू शकता.</>
                ) : (
                  <>Cancel the booking for <span className="font-extrabold text-slate-200">{getCustomerNameDisplay(booking.customers?.name).name}</span> in Room <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span>? You can restore this later from Settings.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="py-2.5 px-4 bg-slate-955 border border-slate-805 text-slate-350 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelConfirm(false)
                  cancelMutation.mutate()
                }}
                disabled={cancelMutation.isPending}
                className="py-2.5 px-4 text-white text-xs font-black rounded-xl transition shadow-lg bg-rose-500 hover:bg-rose-450 active:bg-rose-500 shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, रद्द करा' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
      {activeKeypad !== null && (
        <NumericKeypad
          value={
            activeKeypad === 'total'
              ? editingTotal
              : activeKeypad === 'extra'
              ? editingExtraAmount
              : activeKeypad === 'paid'
              ? editingPaid
              : activeKeypad === 'roomPrice'
              ? draftRoomPrice
              : ''
          }
          onDone={(val) => {
            if (activeKeypad === 'total') {
              const cleanedVal = val === '' ? '0' : val.replace(/^0+/, '') || '0'
              setEditingTotal(cleanedVal)
              handleSaveTotalAmount(cleanedVal)
            } else if (activeKeypad === 'extra') {
              const cleanedVal = val === '' ? '0' : val.replace(/^0+/, '') || '0'
              setEditingExtraAmount(cleanedVal)
              handleSaveExtraCharges(cleanedVal)
            } else if (activeKeypad === 'paid') {
              const cleanedVal = val === '' ? '0' : val.replace(/^0+/, '') || '0'
              setEditingPaid(cleanedVal)
              handleSavePaidAmount(cleanedVal)
            } else if (activeKeypad === 'roomPrice') {
              const numVal = Number(val) || 0
              setDraftRoomPrice(numVal)
            }
            setActiveKeypad(null)
          }}
          onClose={() => setActiveKeypad(null)}
          label={
            activeKeypad === 'total'
              ? (language === 'mr' ? 'एकूण बिल टाका' : 'Enter Total Bill')
              : activeKeypad === 'extra'
              ? (language === 'mr' ? 'अतिरिक्त शुल्क टाका' : 'Enter Extra Charges')
              : activeKeypad === 'paid'
              ? (language === 'mr' ? 'भरलेली रक्कम टाका' : 'Enter Amount Paid')
              : (language === 'mr' ? 'खोलीचे भाडे टाका' : 'Enter Room Price')
          }
          keypadType="currency"
          language={language}
        />
      )}
      {renderDatePickerModal()}
    </div>,
    document.body
  )
}
