import * as React from 'react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, Phone, CheckCircle, LogOut, FileText, Camera, Upload, Loader2, Copy, 
  ChevronLeft, ChevronRight, Plus, Minus, Save,
  Edit2, Check, ZoomIn, ZoomOut, RotateCcw, Trash2
} from 'lucide-react'
import { 
  format, 
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
import { getUploadUrl, uploadFileToR2, confirmUpload, listCustomerDocs, extractNameFromId, deleteDocument } from '../api/documents'
import { updateCustomer } from '../api/customers'
import { listAvailableRooms } from '../api/rooms'
import { getCustomerNameDisplay } from '../utils/customer'
import { formatNameByLanguage } from '../utils/nameHelper'
import { formatIST_AMPM, formatIST_Date, formatIST_HHmm, toUTCfromIST } from '../utils/istTime'
import { useLanguage } from '../context/LanguageContext'
import { useVisualViewport } from '../hooks/useVisualViewport'
import type { Room } from '../types'
import NumericKeypad from './NumericKeypad'
import CameraCaptureModal from './CameraCaptureModal'

interface BookingDetailSheetProps {
  bookingId: string
  onClose: () => void
  onSuccess: (action?: 'checkout' | 'update') => void
  autoCheckout?: boolean  // If true, auto-open the checkout receipt sheet on load
}

export default function BookingDetailSheet({ bookingId, onClose, onSuccess, autoCheckout }: BookingDetailSheetProps) {
  const { language, t } = useLanguage()
  const viewport = useVisualViewport()
  const queryClient = useQueryClient()

  // Language map for Marathi
  const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
  const weekdaysMrShort = ['रवी', 'सोम', 'मं', 'बुध', 'गुरू', 'शुक्र', 'शनी']

  // Utility: format a UTC ISO string as IST date display ("Tue, Jun 30")
  const formatFriendlyDate = (isoString: string) => {
    if (!isoString) return ''
    const istDate = formatIST_Date(isoString) // YYYY-MM-DD in IST
    const d = parse(istDate, 'yyyy-MM-dd', new Date())
    if (language !== 'mr') {
      return format(d, 'EEE, MMM d')
    }
    return `${weekdaysMrShort[d.getDay()]}, ${d.getDate()} ${monthsMr[d.getMonth()]}`
  }

  // Utility: format 24h IST string (HH:MM) to "hh:mm AM/PM"
  const formatTimeAMPM = (time24: string) => {
    if (!time24) return ''
    const [hStr, mStr] = time24.split(':')
    const h = parseInt(hStr, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12.toString().padStart(2, '0')}:${mStr} ${ampm}`
  }

  // Utility: format UTC ISO string → "hh:mm AM" in IST
  const formatFriendlyTime = (isoString: string) => {
    return formatIST_AMPM(isoString)
  }

  // Fetch full details of the booking
  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
  })

  const hasSplitPayment = booking ? !!(booking.checkout_payment_mode && booking.paid_amount > booking.deposit_amount) : false

  // Fetch all documents for this guest
  const { data: customerDocs, refetch: refetchCustomerDocs } = useQuery({
    queryKey: ['customerDocs', booking?.customer_id],
    queryFn: () => listCustomerDocs(booking?.customer_id || ''),
    enabled: !!booking?.customer_id,
  })

  // Merge customer and booking documents without duplicates (excluding photo)
  const idDocsOnly = customerDocs ? customerDocs.filter((d: any) => d.doc_type !== 'customer_photo') : []
  const bookingDocsOnly = booking?.documents ? booking.documents.filter((d: any) => d.doc_type !== 'customer_photo') : []
  const allDocsMap = new Map()
  bookingDocsOnly.forEach(d => allDocsMap.set(d.id, d))
  idDocsOnly.forEach(d => allDocsMap.set(d.id, d))
  const docs = Array.from(allDocsMap.values())

  // UI edit modes
  const [editRoomMode, setEditRoomMode] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date())
  const [activeKeypad, setActiveKeypad] = useState<'total' | 'extra' | 'paid' | 'roomPrice' | 'checkoutTotal' | 'checkoutPaid' | null>(null)

  // Booking details drafts (for editing)
  const [draftCheckIn, setDraftCheckIn] = useState('')
  const [draftCheckOut, setDraftCheckOut] = useState('')
  const [draftCheckInTime, setDraftCheckInTime] = useState('12:00')
  const [draftCheckOutTime, setDraftCheckOutTime] = useState('11:00')
  const [draftRoomType, setDraftRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'>('AC Deluxe')
  const [draftRoomId, setDraftRoomId] = useState('')
  const [draftAdults, setDraftAdults] = useState(1)
  const [draftChildren, setDraftChildren] = useState(0)
  const [draftExtraBeds, setDraftExtraBeds] = useState(0)
  const [draftRoomPrice, setDraftRoomPrice] = useState(0)
  const [editingTotal, setEditingTotal] = useState<string | number>('')
  const [editingPaid, setEditingPaid] = useState<string | number>('')
  const [editingExtraAmount, setEditingExtraAmount] = useState<string | number>('')
  const [editingExtraNote, setEditingExtraNote] = useState<string>('')

  // Available rooms list when room type / dates change
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isLoadingAvailableRooms, setIsLoadingAvailableRooms] = useState(false)

  // Modals/Confirmations
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Checkout amount editing states
  const [checkoutTotalAmount, setCheckoutTotalAmount] = useState<number>(0)
  const [checkoutPaidAmount, setCheckoutPaidAmount] = useState<number>(0)
  const [checkoutPaymentMode, setCheckoutPaymentMode] = useState<'Cash' | 'UPI' | 'IDFC'>('IDFC')
  const [checkoutIsPaidAmountModified, setCheckoutIsPaidAmountModified] = useState<boolean>(false)
  // Payment mode for the quick "Mark Fully Paid" button in the booking detail view
  const [duesPaymentMode, setDuesPaymentMode] = useState<'Cash' | 'UPI' | 'IDFC'>('IDFC')
  const [showRefDetails, setShowRefDetails] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  // Customer Name Edit States
  const [draftCustomerName, setDraftCustomerName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // Interactive ID Proof Viewer States
  const [selectedDocIndex, setSelectedDocIndex] = useState<number | null>(null)
  const [zoomScale, setZoomScale] = useState(1)
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  // Initialize drafts when booking is loaded
  useEffect(() => {
    if (booking && !showDatePicker && !editRoomMode && !isEditingName && !activeKeypad) {
      setDraftCheckIn(formatIST_Date(booking.check_in))
      setDraftCheckOut(formatIST_Date(booking.check_out))
      setDraftCheckInTime(formatIST_HHmm(booking.check_in))
      setDraftCheckOutTime(formatIST_HHmm(booking.check_out))
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
      setPickerMonth(parse(formatIST_Date(booking.check_in), 'yyyy-MM-dd', new Date()))
      if (booking.customers?.name) {
        setDraftCustomerName(booking.customers.name)
      }
    }
  }, [booking, showDatePicker, editRoomMode, isEditingName, activeKeypad])

  // Auto-open checkout receipt when autoCheckout=true and booking has loaded
  useEffect(() => {
    if (!autoCheckout || !booking || showCheckoutConfirm) return
    if (booking.status !== 'active') return
    // Initialise checkout amounts from current booking data
    setCheckoutTotalAmount(Number(booking.total_amount) || 0)
    setCheckoutPaidAmount(Number(booking.paid_amount) || 0)
    setCheckoutPaymentMode(
      (['Cash', 'UPI', 'IDFC'] as const).includes(booking.payment_mode as any)
        ? (booking.payment_mode as 'Cash' | 'UPI' | 'IDFC')
        : 'IDFC'
    )
    setCheckoutIsPaidAmountModified(false)
    setShowCheckoutConfirm(true)
  // Only run once when booking first loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, autoCheckout])

  // Fetch available rooms when dates change in edit mode
  useEffect(() => {
    if (!editRoomMode || !draftCheckIn || !draftCheckOut) return

    let active = true
    const fetchRooms = async () => {
      setIsLoadingAvailableRooms(true)
      try {
        const startISO = toUTCfromIST(draftCheckIn, '12:00')
        const endISO = toUTCfromIST(draftCheckOut, '11:00')
        const { available } = await listAvailableRooms(startISO, endISO)
        if (active) {
          // Make sure current booked room is always in the options list so it doesn't disappear
          if (booking?.rooms) {
            const hasCurrentRoom = available.some(r => r.id === booking.rooms?.id)
            setAvailableRooms(hasCurrentRoom ? available : [booking.rooms, ...available])
          } else {
            setAvailableRooms(available)
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

  // Keyboard Navigation for ID Proof Viewer
  useEffect(() => {
    if (selectedDocIndex === null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm) {
        if (e.key === 'Escape') setShowDeleteConfirm(false)
        return
      }

      if (e.key === 'ArrowLeft') {
        if (selectedDocIndex > 0) {
          setSelectedDocIndex(selectedDocIndex - 1)
          setZoomScale(1)
          setPanPosition({ x: 0, y: 0 })
        }
      } else if (e.key === 'ArrowRight') {
        if (selectedDocIndex < docs.length - 1) {
          setSelectedDocIndex(selectedDocIndex + 1)
          setZoomScale(1)
          setPanPosition({ x: 0, y: 0 })
        }
      } else if (e.key === 'Escape') {
        setSelectedDocIndex(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDocIndex, showDeleteConfirm, docs.length])

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

  // handleMarkAsPaid: used by post-checkout "Record Dues Payment" button (keeps existing mode)
  const handleMarkAsPaid = () => {
    const updates: Parameters<typeof updateBooking>[1] = {
      payment_status: 'paid',
      paid_amount: booking.total_amount,
    }
    if (!booking.payment_mode || booking.payment_mode === 'Pending') {
      updates.payment_mode = checkoutPaymentMode || 'IDFC'
    }
    updateMutation.mutate(updates)
  }

  // handleMarkFullyPaid: used by the quick "Collect" button in booking detail view.
  // Correctly records split payments: if ₹500 was paid via IDFC and user marks full via UPI,
  // it logs a split-payment audit note AND preserves the original advance payment_mode so
  // reports always show the correct IDFC/UPI breakdown.
  const handleMarkFullyPaid = (selectedMode: 'Cash' | 'UPI' | 'IDFC') => {
    const total = editingTotal === '' ? 0 : Number(editingTotal)
    const prevPaid = booking.paid_amount || 0
    const additionalPaid = total - prevPaid
    const prevMode = booking.payment_mode

    const isSplit = (
      prevPaid > 0 &&
      additionalPaid > 0 &&
      prevMode &&
      prevMode !== 'Pending' &&
      prevMode !== selectedMode
    )

    const updates: Parameters<typeof updateBooking>[1] = {
      payment_status: 'paid',
      paid_amount: total,
      // Preserve the original advance mode — don't overwrite with checkout mode.
      // If Pending (no prior payment), set it to the selected mode.
      payment_mode: (!prevMode || prevMode === 'Pending') ? selectedMode : prevMode,
      checkout_payment_mode: selectedMode,  // always record what mode was used to collect
    }

    // If split: append audit note so reports correctly attribute amounts per mode
    if (isSplit) {
      const splitNote = `Paid via ${prevMode}: ₹${prevPaid.toLocaleString('en-IN')} + ${selectedMode}: ₹${additionalPaid.toLocaleString('en-IN')}`
      updates.notes = booking.notes
        ? `${booking.notes} | ${splitNote}`
        : splitNote
    }

    updateMutation.mutate(updates)
  }

  const handleCheckOut = () => {
    const totalAmt = checkoutTotalAmount
    const prevPaid = booking.paid_amount || 0
    // If user hasn't modified paid amount, treat all dues as collected
    const finalPaid = !checkoutIsPaidAmountModified ? totalAmt : checkoutPaidAmount
    const updates: Parameters<typeof updateBooking>[1] = {
      status: 'checked_out',
      total_amount: totalAmt,
      paid_amount: finalPaid,
      payment_mode: booking.payment_mode !== 'Pending' && prevPaid > 0 ? booking.payment_mode : checkoutPaymentMode,
      checkout_payment_mode: checkoutPaymentMode,  // NEW — always track checkout mode separately
    }
    if (finalPaid >= totalAmt) {
      updates.payment_status = 'paid'
    } else if (finalPaid > 0) {
      updates.payment_status = 'partial'
    } else {
      updates.payment_status = 'unpaid'
    }

    // If the booking had a partial payment at check-in with a DIFFERENT mode,
    // append a split-payment audit note so there's a clear record in history.
    const additionalPaid = finalPaid - prevPaid
    if (
      prevPaid > 0 &&
      additionalPaid > 0 &&
      booking.payment_mode &&
      booking.payment_mode !== 'Pending' &&
      booking.payment_mode !== checkoutPaymentMode
    ) {
      const splitNote = `Paid via ${booking.payment_mode}: ₹${prevPaid.toLocaleString('en-IN')} + ${checkoutPaymentMode}: ₹${additionalPaid.toLocaleString('en-IN')}`
      updates.notes = booking.notes
        ? `${booking.notes} | ${splitNote}`
        : splitNote
    }

    updateMutation.mutate(updates)
  }

  const uploadAndExtractFiles = async (files: File[]) => {
    if (files.length === 0) return
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadAndExtractFiles(Array.from(e.target.files))
    }
  }

  const handleCameraCaptureComplete = async (capturedFiles: File[]) => {
    await uploadAndExtractFiles(capturedFiles)
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

  // Detect inconsistency: notes say "Paid via X" but payment_status is still unpaid/reserved
  const hasPaymentNoteInconsistency = (() => {
    if (!booking) return false
    const notesStr = booking.notes || ''
    const statusIsUnresolved = ['unpaid', 'reserved'].includes(booking.payment_status)
    // Check for [Paid via X Bank] pattern (manually typed)
    const hasBracketPaid = /\[Paid via [A-Za-z]+[^\]]*\]/i.test(notesStr)
    // Check for structured split note pattern (system-generated)
    const hasStructuredPaid = notesStr.split(' | ').some(p => p.trim().startsWith('Paid via ') && p.includes(': ₹'))
    return statusIsUnresolved && (hasBracketPaid || hasStructuredPaid)
  })()

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
      updates.payment_mode = 'IDFC'
    }
    updateMutation.mutate(updates)
  }


  // handleSavePaymentMode is now handled inline in the new Smart Bill Card
  // (kept as a no-op reference to avoid breaking any future re-integration)


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

    const finalCheckIn = toUTCfromIST(draftCheckIn, draftCheckInTime)
    const finalCheckOut = toUTCfromIST(draftCheckOut, draftCheckOutTime)

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


    // Parsed states for check-in time selectors
    const [ciHourStr, ciMinStr] = (draftCheckInTime || '12:00').split(':')
    const ciHourVal = parseInt(ciHourStr, 10)
    const ciHour12 = ciHourVal % 12 || 12
    const ciAmPm = ciHourVal >= 12 ? 'PM' : 'AM'
    const ciMin = ciMinStr

    // Parsed states for check-out time selectors
    const [coHourStr, coMinStr] = (draftCheckOutTime || '11:00').split(':')
    const coHourVal = parseInt(coHourStr, 10)
    const coHour12 = coHourVal % 12 || 12
    const coAmPm = coHourVal >= 12 ? 'PM' : 'AM'
    const coMin = coMinStr

    const updateCheckInTimeStr = (h12: string, min: string, ampm: string) => {
      let h24 = parseInt(h12, 10)
      if (ampm === 'PM' && h24 < 12) h24 += 12
      if (ampm === 'AM' && h24 === 12) h24 = 0
      const newTime = `${h24.toString().padStart(2, '0')}:${min}`
      setDraftCheckInTime(newTime)
    }

    const updateCheckOutTimeStr = (h12: string, min: string, ampm: string) => {
      let h24 = parseInt(h12, 10)
      if (ampm === 'PM' && h24 < 12) h24 += 12
      if (ampm === 'AM' && h24 === 12) h24 = 0
      const newTime = `${h24.toString().padStart(2, '0')}:${min}`
      setDraftCheckOutTime(newTime)
    }

    // Generate 5-minute increments for minutes, but ensure the exact minutes are options
    const minutesOptions = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    if (!minutesOptions.includes(ciMin)) {
      minutesOptions.push(ciMin)
      minutesOptions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    }

    const coMinutesOptions = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))
    if (!coMinutesOptions.includes(coMin)) {
      coMinutesOptions.push(coMin)
      coMinutesOptions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    }

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
                setDraftCheckIn(formatIST_Date(booking.check_in))
                setDraftCheckOut(formatIST_Date(booking.check_out))
                setDraftCheckInTime(formatIST_HHmm(booking.check_in))
                setDraftCheckOutTime(formatIST_HHmm(booking.check_out))
              }
            }} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
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

          {/* Time Picker Section */}
          <div className="border-t border-slate-800/80 pt-3 flex flex-col gap-2">
            <h5 className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase px-1">
              {language === 'mr' ? 'चेक-इन आणि चेक-आउट वेळ' : 'Check-in & Check-out Times'}
            </h5>
            <div className="grid grid-cols-2 gap-3">
              {/* Check-In Time */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-505 uppercase tracking-wider px-1">
                  {language === 'mr' ? 'चेक-इन वेळ' : 'Check-in Time'}
                </span>
                <div className="flex items-center gap-1 bg-slate-955/60 p-1.5 rounded-xl border border-slate-800/80">
                  <select
                    value={ciHour12}
                    onChange={(e) => updateCheckInTimeStr(e.target.value, ciMin, ciAmPm)}
                    className="flex-1 bg-transparent text-slate-200 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                      <option key={h} value={h} className="bg-slate-900 text-slate-200">{h.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-slate-600 font-bold self-center text-xs">:</span>
                  <select
                    value={ciMin}
                    onChange={(e) => updateCheckInTimeStr(ciHour12.toString(), e.target.value, ciAmPm)}
                    className="flex-1 bg-transparent text-slate-200 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    {minutesOptions.map(m => (
                      <option key={m} value={m} className="bg-slate-900 text-slate-200">{m}</option>
                    ))}
                  </select>
                  <select
                    value={ciAmPm}
                    onChange={(e) => updateCheckInTimeStr(ciHour12.toString(), ciMin, e.target.value)}
                    className="flex-1 bg-transparent text-emerald-400 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    <option value="AM" className="bg-slate-900 text-slate-200">AM</option>
                    <option value="PM" className="bg-slate-900 text-slate-200">PM</option>
                  </select>
                </div>
              </div>

              {/* Check-Out Time */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider px-1">
                  {language === 'mr' ? 'चेक-आउट वेळ' : 'Check-out Time'}
                </span>
                <div className="flex items-center gap-1 bg-slate-955/60 p-1.5 rounded-xl border border-slate-800/80">
                  <select
                    value={coHour12}
                    onChange={(e) => updateCheckOutTimeStr(e.target.value, coMin, coAmPm)}
                    className="flex-1 bg-transparent text-slate-200 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                      <option key={h} value={h} className="bg-slate-900 text-slate-200">{h.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-slate-600 font-bold self-center text-xs">:</span>
                  <select
                    value={coMin}
                    onChange={(e) => updateCheckOutTimeStr(coHour12.toString(), e.target.value, coAmPm)}
                    className="flex-1 bg-transparent text-slate-200 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    {coMinutesOptions.map(m => (
                      <option key={m} value={m} className="bg-slate-900 text-slate-200">{m}</option>
                    ))}
                  </select>
                  <select
                    value={coAmPm}
                    onChange={(e) => updateCheckOutTimeStr(coHour12.toString(), coMin, e.target.value)}
                    className="flex-1 bg-transparent text-amber-400 text-xs font-black rounded-lg focus:outline-none cursor-pointer appearance-none text-center"
                  >
                    <option value="AM" className="bg-slate-900 text-slate-200">AM</option>
                    <option value="PM" className="bg-slate-900 text-slate-200">PM</option>
                  </select>
                </div>
              </div>
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
                  setDraftCheckInTime(booking.check_in.slice(11, 16))
                  setDraftCheckOutTime(booking.check_out.slice(11, 16))
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

  const renderIDProofViewer = () => {
    if (selectedDocIndex === null) return null
    const currentDoc = docs[selectedDocIndex]
    if (!currentDoc) return null

    const guestName = formatNameByLanguage(getCustomerNameDisplay(booking.customers?.name).name, language)
    const isPdf = currentDoc.file_name.toLowerCase().endsWith('.pdf')

    // Navigation handlers
    const handlePrev = () => {
      if (selectedDocIndex > 0) {
        setSelectedDocIndex(selectedDocIndex - 1)
        setZoomScale(1)
        setPanPosition({ x: 0, y: 0 })
      }
    }

    const handleNext = () => {
      if (selectedDocIndex < docs.length - 1) {
        setSelectedDocIndex(selectedDocIndex + 1)
        setZoomScale(1)
        setPanPosition({ x: 0, y: 0 })
      }
    }

    // Zoom handlers
    const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.5, 4))
    const handleZoomOut = () => {
      setZoomScale(prev => {
        const next = Math.max(prev - 0.5, 1)
        if (next === 1) {
          setPanPosition({ x: 0, y: 0 })
        }
        return next
      })
    }
    const handleResetZoom = () => {
      setZoomScale(1)
      setPanPosition({ x: 0, y: 0 })
    }

    // Mouse pan handlers
    const handleMouseDown = (e: React.MouseEvent) => {
      if (zoomScale <= 1 || isPdf) return
      setIsDragging(true)
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y })
    }

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || zoomScale <= 1 || isPdf) return
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    // Touch pan handlers
    const handleTouchStart = (e: React.TouchEvent) => {
      if (isPdf) return
      if (zoomScale > 1 && e.touches.length === 1) {
        setIsDragging(true)
        const touch = e.touches[0]
        setDragStart({ x: touch.clientX - panPosition.x, y: touch.clientY - panPosition.y })
      } else if (zoomScale === 1 && e.touches.length === 1) {
        setTouchStartX(e.touches[0].clientX)
      }
    }

    const handleTouchMove = (e: React.TouchEvent) => {
      if (isPdf) return
      if (isDragging && zoomScale > 1 && e.touches.length === 1) {
        const touch = e.touches[0]
        setPanPosition({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y
        })
      }
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
      setIsDragging(false)
      if (zoomScale === 1 && touchStartX !== null && e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX
        const diffX = touchStartX - touchEndX
        if (diffX > 55) {
          handleNext()
        } else if (diffX < -55) {
          handlePrev()
        }
        setTouchStartX(null)
      }
    }

    const handleDeleteDoc = async () => {
      setIsDeleting(true)
      const deleteToast = toast.loading(language === 'mr' ? 'ओळखपत्र डिलीट होत आहे...' : 'Deleting ID proof...')
      try {
        await deleteDocument(currentDoc.id)
        toast.success(language === 'mr' ? 'ओळखपत्र यशस्वीरित्या डिलीट केले!' : 'ID proof deleted successfully!', { id: deleteToast })
        
        // Refetch documents
        refetch()
        refetchCustomerDocs()
        
        // Reset state
        setShowDeleteConfirm(false)
        setZoomScale(1)
        setPanPosition({ x: 0, y: 0 })
        
        // If this was the only document, close viewer. Otherwise, adjust index.
        if (docs.length <= 1) {
          setSelectedDocIndex(null)
        } else {
          // Move to previous if we deleted the last index, otherwise keep same index (which is now the next item)
          if (selectedDocIndex >= docs.length - 1) {
            setSelectedDocIndex(docs.length - 2)
          }
        }
      } catch (err) {
        console.error('Delete failed:', err)
        toast.error(language === 'mr' ? 'ओळखपत्र डिलीट करण्यात अडचण आली' : 'Failed to delete ID proof', { id: deleteToast })
      } finally {
        setIsDeleting(false)
      }
    }

    return (
      <div 
        className="fixed inset-0 z-55 flex flex-col bg-slate-955/95 backdrop-blur-md animate-fade-in"
        onClick={() => setSelectedDocIndex(null)}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-slate-100 truncate">
              {language === 'mr' ? `ओळखपत्र: ${guestName}` : `Guest: ${guestName}`}
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1.5">
              <span className="bg-slate-800 text-slate-350 px-2 py-0.5 rounded text-[10px] font-bold">
                {language === 'mr' ? `खोली ${booking.rooms?.number || ''}` : `Room ${booking.rooms?.number || ''}`}
              </span>
              <span>•</span>
              <span className="truncate max-w-[150px] sm:max-w-xs">{currentDoc.file_name}</span>
              <span>•</span>
              <span className="text-emerald-450 font-bold whitespace-nowrap">
                {selectedDocIndex + 1} / {docs.length}
              </span>
            </p>
          </div>
          <button 
            onClick={() => setSelectedDocIndex(null)}
            className="p-2 rounded-xl bg-slate-855 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main viewport */}
        <div 
          className="flex-1 relative flex items-center justify-center overflow-hidden p-4 select-none cursor-default"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {isPdf ? (
            <div className="w-full h-full max-w-3xl flex flex-col items-center justify-center p-6 bg-slate-900/40 rounded-3xl border border-slate-800/80" onClick={e => e.stopPropagation()}>
              <FileText className="h-16 w-16 text-slate-500 mb-4 animate-pulse" />
              <h4 className="text-sm font-extrabold text-slate-200 mb-1 truncate max-w-xs">{currentDoc.file_name}</h4>
              <p className="text-xs text-slate-505 mb-6 font-medium">{language === 'mr' ? 'PDF फाईल थेट झूम करता येत नाही' : 'PDF documents cannot be zoomed inline'}</p>
              <a 
                href={currentDoc.public_url}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-955 text-xs font-black rounded-xl transition shadow-lg inline-flex items-center gap-1.5"
              >
                <FileText className="h-4 w-4" />
                {language === 'mr' ? 'नवीन टॅबमध्ये PDF उघडा' : 'Open PDF in New Tab'}
              </a>
            </div>
          ) : (
            <div 
              className="relative max-h-full max-w-full flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <img 
                src={currentDoc.public_url}
                alt={currentDoc.file_name}
                className="max-h-[70dvh] max-w-full object-contain select-none transition-transform duration-100 ease-out pointer-events-auto"
                style={{
                  transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomScale})`,
                  cursor: zoomScale > 1 ? 'grab' : 'default',
                  transformOrigin: 'center center'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                draggable={false}
              />
            </div>
          )}

          {/* Floating Slide Navigation Arrows on Sides */}
          {selectedDocIndex > 0 && (
            <button 
              onClick={(e) => { e.stopPropagation(); handlePrev() }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-350 hover:text-slate-100 border border-slate-800/80 transition shadow-xl"
              title={language === 'mr' ? 'मागील' : 'Previous'}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {selectedDocIndex < docs.length - 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleNext() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-350 hover:text-slate-100 border border-slate-800/80 transition shadow-xl"
              title={language === 'mr' ? 'पुढील' : 'Next'}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Controls Footer */}
        <div 
          className="px-5 py-4 border-t border-slate-850 bg-slate-900/90 backdrop-blur flex flex-col sm:flex-row gap-4 items-center justify-between flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          {/* Pagination Dots/Indicator */}
          <div className="flex gap-1.5 items-center">
            {docs.map((_, idx) => (
              <button 
                key={idx}
                onClick={() => {
                  setSelectedDocIndex(idx)
                  handleResetZoom()
                }}
                className={`h-2 rounded-full transition-all duration-200 ${
                  idx === selectedDocIndex ? 'w-5 bg-emerald-455' : 'w-2 bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-3">
            {/* Zoom Actions (Images only) */}
            {!isPdf && (
              <div className="flex items-center bg-slate-955/60 rounded-xl border border-slate-800 p-1">
                <button 
                  onClick={handleZoomOut}
                  disabled={zoomScale <= 1}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-205 hover:bg-slate-850 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title={language === 'mr' ? 'झूम कमी करा' : 'Zoom Out'}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black text-slate-400 w-12 text-center select-none tabular-nums">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button 
                  onClick={handleZoomIn}
                  disabled={zoomScale >= 4}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-205 hover:bg-slate-850 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title={language === 'mr' ? 'झूम वाढवा' : 'Zoom In'}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {(zoomScale > 1 || panPosition.x !== 0 || panPosition.y !== 0) && (
                  <button 
                    onClick={handleResetZoom}
                    className="p-2 ml-1 rounded-lg text-amber-450 hover:text-amber-300 hover:bg-slate-855 transition"
                    title={language === 'mr' ? 'रीसेट करा' : 'Reset Zoom'}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Delete Button */}
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/30 transition flex items-center gap-1.5 text-xs font-black"
              title={language === 'mr' ? 'डिलीट करा' : 'Delete Document'}
            >
              <Trash2 className="h-4 w-4" />
              <span>{language === 'mr' ? 'काढून टाका' : 'Delete'}</span>
            </button>
          </div>
        </div>

        {/* Custom React-based Deletion Confirmation Overlay */}
        {showDeleteConfirm && (
          <div 
            className="absolute inset-0 z-56 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
              <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-400 border-rose-500/25">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">
                  {language === 'mr' ? 'ओळखपत्र डिलीट करायचे?' : 'Delete ID Proof?'}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {language === 'mr' 
                    ? 'या ओळखपत्राची फाईल आणि रेकॉर्ड कायमस्वरूपी काढून टाकण्यात येईल. ही क्रिया पूर्ववत करता येणार नाही.'
                    : 'This file and its record will be permanently deleted. This action cannot be undone.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="py-2.5 px-4 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-slate-202 text-xs font-bold rounded-xl transition"
                >
                  {language === 'mr' ? 'रद्द करा' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteDoc}
                  className="py-2.5 px-4 text-white text-xs font-black rounded-xl transition shadow-lg bg-rose-500 hover:bg-rose-450 active:bg-rose-500 shadow-rose-500/15 flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    language === 'mr' ? 'डिलीट करा' : 'Yes, Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // amountInputCls no longer needed — replaced by tappable receipt-style rows in the Smart Bill Card


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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">

          {/* 1. Date Strip */}
          <div className="glass-panel px-4 py-3 rounded-2xl bg-slate-955/40 border border-slate-800/80 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 flex-1">
                <div 
                  onClick={() => booking.status === 'active' && setShowDatePicker(true)}
                  className={`flex flex-col ${booking.status === 'active' ? 'cursor-pointer hover:opacity-80 active:scale-95 transition' : ''}`}
                >
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-इन' : 'CHECK-IN'}</span>
                  <span className="text-base font-black text-slate-100 mt-0.5">{formatFriendlyDate(draftCheckIn)}</span>
                  <span className="text-xs font-bold text-emerald-400 mt-0.5">{formatTimeAMPM(draftCheckInTime)}</span>
                </div>
                <div className="text-slate-700 font-black text-lg">➔</div>
                <div 
                  onClick={() => booking.status === 'active' && setShowDatePicker(true)}
                  className={`flex flex-col ${booking.status === 'active' ? 'cursor-pointer hover:opacity-80 active:scale-95 transition' : ''}`}
                >
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-आउट' : 'CHECK-OUT'}</span>
                  <span className="text-base font-black text-slate-100 mt-0.5">{formatFriendlyDate(draftCheckOut)}</span>
                  <span className="text-xs font-bold text-amber-500 mt-0.5">{formatTimeAMPM(draftCheckOutTime)}</span>
                </div>
              </div>
              <div className="bg-slate-850 border border-slate-805 rounded-xl px-3 py-2 text-center flex flex-col justify-center items-center flex-shrink-0">
                <span className="text-lg font-black text-slate-100 leading-none">{nights}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-1">
                  {language === 'mr' ? 'रात्र' : (nights === 1 ? 'NIGHT' : 'NIGHTS')}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Guest Card */}
          <div className="glass-panel px-4 py-3 rounded-2xl flex flex-col gap-2 bg-slate-955/40 border border-slate-800/80 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {customerPhotoDoc ? (
                  <div className="relative group w-10 h-10 flex-shrink-0">
                    <img
                      src={customerPhotoDoc.public_url}
                      alt="Customer Photo"
                      className="w-full h-full rounded-xl object-cover border border-slate-700 cursor-pointer hover:border-emerald-500 transition"
                    />
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center cursor-pointer transition">
                      <Camera className="h-4 w-4 text-slate-300" />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCustomerPhotoUpload} />
                    </label>
                  </div>
                ) : (
                  <label className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 flex items-center justify-center flex-shrink-0 text-slate-500 cursor-pointer transition group">
                    <Camera className="h-4 w-4 group-hover:text-emerald-400 transition" />
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCustomerPhotoUpload} />
                  </label>
                )}
                <div className="flex-1 min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-1.5">
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
                    <div className="flex items-center gap-1.5">
                      <div className="text-slate-200 font-extrabold text-sm leading-tight flex-1 min-w-0 truncate">
                        {(() => {
                          const { name: dName, isDeleted } = getCustomerNameDisplay(booking.customers?.name);
                          const displayName = formatNameByLanguage(dName, language);
                          return (
                            <>
                              <span>{displayName}</span>
                              {isDeleted && (
                                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1.5 inline-block whitespace-nowrap align-middle">
                                  {language === 'mr' ? 'डिलीट केलेले' : 'Deleted'}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <button
                        onClick={() => {
                          setDraftCustomerName(getCustomerNameDisplay(booking.customers?.name).name || '')
                          setIsEditingName(true)
                        }}
                        className="text-slate-600 hover:text-slate-400 transition flex-shrink-0"
                        title={language === 'mr' ? 'नाव बदला' : 'Edit Name'}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {booking.status !== 'active' && (
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-lg flex-shrink-0 ${
                    booking.status === 'checked_out'
                      ? 'bg-slate-800 text-slate-405 border border-slate-700/50'
                      : 'bg-rose-550/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {booking.status === 'checked_out'
                      ? (language === 'mr' ? 'चेकआऊट झाले' : 'Checked Out')
                      : (language === 'mr' ? 'रद्द केले' : 'Cancelled')}
                  </span>
                )}
                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-lg flex-shrink-0 ${getStatusBadgeStyles(effectivePaymentStatus)}`}>
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

            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
              <a
                href={`tel:${booking.customers?.phone}`}
                className="group flex-1 flex items-center gap-2 text-sm font-bold text-slate-200 tracking-wide hover:text-emerald-400 transition min-w-0"
              >
                <Phone className="h-3 w-3 text-slate-500 group-hover:text-emerald-400 transition flex-shrink-0" />
                <span className="truncate">{booking.customers?.phone}</span>
              </a>
              <a
                href={`tel:${booking.customers?.phone}`}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-955 text-xs font-black rounded-lg transition shadow-sm shadow-emerald-500/20"
              >
                <Phone className="h-3 w-3" />
                {language === 'mr' ? 'कॉल' : 'Call'}
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
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-850 hover:bg-slate-700 active:bg-slate-900 text-slate-350 text-xs font-bold rounded-lg transition"
              >
                <Copy className="h-3 w-3" />
                {language === 'mr' ? 'कॉपी' : 'Copy'}
              </button>
            </div>

            {booking.occupation && (
              <div className="text-xs text-slate-500 px-0.5">
                <span className="font-bold">{language === 'mr' ? 'व्यवसाय:' : 'Occupation:'}</span> {booking.occupation}
              </div>
            )}
          </div>

          {/* 3. Smart Bill Card — all payment info in one place */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 bg-slate-955/40 shadow-lg flex-shrink-0">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                💰 {language === 'mr' ? 'बिल सारांश' : 'BILL SUMMARY'}
              </span>
              <span className="text-[11px] text-slate-550 font-medium">
                {language === 'mr'
                  ? `₹${draftRoomPrice} × ${nights} रात्र${draftExtraBeds > 0 ? ` + बेड ₹${extraBedTotal}` : ''}`
                  : `₹${draftRoomPrice} × ${nights} night${nights !== 1 ? 's' : ''}${draftExtraBeds > 0 ? ` + bed ₹${extraBedTotal}` : ''}`}
              </span>
            </div>

            <div className="px-4 pt-3 pb-1 flex flex-col gap-0">

              {/* Row: Total Bill (tappable to edit) */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                <span className="text-sm font-semibold text-slate-400">{language === 'mr' ? 'एकूण बिल' : 'Total Bill'}</span>
                <button
                  type="button"
                  onClick={() => setActiveKeypad('total')}
                  className="flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5 transition active:scale-[0.97]"
                >
                  <span className="text-slate-400 text-sm font-black">₹</span>
                  <span className="text-base font-black text-slate-100 tabular-nums">{Number(editingTotal).toLocaleString('en-IN')}</span>
                  <Edit2 className="h-3 w-3 text-slate-500 ml-1" />
                </button>
              </div>

              {/* Row: Extra Charges */}
              <div className="flex items-start justify-between py-2 border-b border-slate-800/40 gap-3">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-sm font-semibold text-slate-400">{language === 'mr' ? 'अतिरिक्त शुल्क' : 'Extra Charges'}</span>
                  <input
                    id="input-extra-charges-note"
                    type="text"
                    value={editingExtraNote}
                    onChange={(e) => setEditingExtraNote(e.target.value)}
                    onBlur={() => handleSaveExtraCharges()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { handleSaveExtraCharges(); e.currentTarget.blur() }
                    }}
                    placeholder={language === 'mr' ? 'चहा, नाश्ता इ.' : 'e.g. Tea, breakfast, laundry'}
                    className="bg-slate-800/50 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 focus:outline-none focus:border-emerald-500/50 transition placeholder-slate-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setActiveKeypad('extra')}
                  className="flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-1.5 transition active:scale-[0.97] flex-shrink-0 mt-0.5"
                >
                  <span className="text-slate-400 text-sm font-black">+₹</span>
                  <span className="text-base font-black text-slate-300 tabular-nums">{Number(editingExtraAmount).toLocaleString('en-IN')}</span>
                  <Edit2 className="h-3 w-3 text-slate-500 ml-1" />
                </button>
              </div>

              {/* Row: Advance Paid (tappable to edit if not split) */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-emerald-400">
                    {language === 'mr' ? 'आगाऊ रक्कम भरली' : 'Advance Paid'}
                  </span>
                  {booking.payment_mode && booking.payment_mode !== 'Pending' && (
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {language === 'mr' ? `${booking.payment_mode} द्वारे` : `via ${booking.payment_mode}`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => !hasSplitPayment && setActiveKeypad('paid')}
                  disabled={hasSplitPayment}
                  className={`flex items-center gap-1 bg-slate-800/60 rounded-xl px-3 py-1.5 transition ${
                    hasSplitPayment ? 'cursor-not-allowed border border-slate-850 opacity-80' : 'hover:bg-slate-800 border border-emerald-700/30 active:scale-[0.97]'
                  }`}
                >
                  <span className="text-emerald-500 text-sm font-black">₹</span>
                  <span className="text-base font-black text-emerald-400 tabular-nums">
                    {(hasSplitPayment ? booking.deposit_amount : Number(editingPaid)).toLocaleString('en-IN')}
                  </span>
                  {!hasSplitPayment && <Edit2 className="h-3 w-3 text-slate-500 ml-1" />}
                </button>
              </div>

              {/* Row: Paid at Checkout (only shown if split payment) */}
              {hasSplitPayment && (
                <div className="flex items-center justify-between py-2 border-b border-slate-800/40">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-emerald-400">
                      {language === 'mr' ? 'चेकआऊट दरम्यान भरले' : 'Paid at Checkout'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {language === 'mr' ? `${booking.checkout_payment_mode} द्वारे` : `via ${booking.checkout_payment_mode}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-800/30 border border-slate-850 rounded-xl px-3 py-1.5 cursor-not-allowed opacity-80">
                    <span className="text-emerald-500 text-sm font-black">₹</span>
                    <span className="text-base font-black text-emerald-400/80 tabular-nums">
                      {(booking.paid_amount - booking.deposit_amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {/* Balance row — the big number */}
              <div className={`flex items-center justify-between py-3 rounded-xl mt-1 px-3 ${
                livePendingAmount > 0 ? 'bg-rose-500/8 border border-rose-500/20' : 'bg-emerald-500/8 border border-emerald-500/20'
              }`}>
                <span className={`text-sm font-black uppercase tracking-wide ${livePendingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {livePendingAmount > 0
                    ? (language === 'mr' ? '⚠️ वसूल करायचे' : '⚠️ To Collect')
                    : (language === 'mr' ? '✅ पूर्ण भरले' : '✅ Fully Settled')}
                </span>
                <span className={`text-3xl font-black tabular-nums ${livePendingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ₹{livePendingAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* ── Collect section — only when balance > 0 and booking is active ── */}
            {livePendingAmount > 0 && booking.status === 'active' && (
              <div className="mx-4 mb-4 mt-3 flex flex-col gap-2.5">
                {/* Show prior payment info if split */}
                {booking.paid_amount > 0 && (
                  <div className="text-[10px] text-slate-500 font-semibold bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-800/60">
                    {language === 'mr'
                      ? `आधी ${booking.payment_mode}: ₹${(booking.paid_amount || 0).toLocaleString('en-IN')} जमा`
                      : `Advance paid via ${booking.payment_mode}: ₹${(booking.paid_amount || 0).toLocaleString('en-IN')}`}
                  </div>
                )}

                {/* Payment mode for collection */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Cash', 'UPI', 'IDFC'] as const).map((mode) => {
                    const modeStyles: Record<string, { icon: string; label: string; active: string }> = {
                      Cash: { icon: '💵', label: language === 'mr' ? 'कॅश' : 'Cash', active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-500/20' },
                      UPI:  { icon: '📱', label: 'UPI',  active: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-sm shadow-blue-500/20' },
                      IDFC: { icon: '🏦', label: 'IDFC', active: 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-sm shadow-purple-500/20' },
                    }
                    const { icon, label, active } = modeStyles[mode]
                    const isSelected = duesPaymentMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDuesPaymentMode(mode)}
                        className={`py-2 rounded-xl border text-[10px] font-black transition-all duration-200 flex flex-col items-center gap-0.5 justify-center ${
                          isSelected ? active : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-350'
                        }`}
                      >
                        <span className="text-sm">{icon}</span>
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Big Collect button */}
                <button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() => handleMarkFullyPaid(duesPaymentMode)}
                  className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 text-sm font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {language === 'mr'
                    ? `⚡ ₹${livePendingAmount.toLocaleString('en-IN')} जमा करा — ${duesPaymentMode}`
                    : `⚡ Collect ₹${livePendingAmount.toLocaleString('en-IN')} via ${duesPaymentMode}`}
                </button>
              </div>
            )}

            {/* Settled badge when fully paid */}
            {livePendingAmount === 0 && booking.status === 'active' && (
              <div className="mx-4 mb-4 mt-2 py-2.5 px-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl text-center">
                <span className="text-[11px] text-emerald-400 font-bold">
                  ✅ {language === 'mr'
                    ? `${booking.payment_mode || 'पेमेंट'} द्वारे पूर्ण पेमेंट`
                    : `Fully paid via ${booking.payment_mode || 'prior payment'}`}
                </span>
              </div>
            )}
          </div>



          {/* 4. Room Card with Inline Editing */}
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
                  if (docs.length > 0) {
                    return docs.map((doc, idx) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDocIndex(idx)}
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-850 bg-slate-100 dark:bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition cursor-pointer"
                      >
                        {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                          <FileText className="h-6 w-6 text-slate-400" />
                        ) : (
                          <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                        )}
                        <span className="absolute bottom-0 inset-x-0 bg-black/45 text-[8px] text-white font-bold px-1 py-0.5 truncate text-center">
                          {doc.file_name}
                        </span>
                      </button>
                    ))
                  }
                  return <div className="text-xs text-slate-500 dark:text-slate-550 italic py-1">{language === 'mr' ? 'ओळखपत्र जोडलेले नाही.' : 'No ID proofs uploaded yet.'}</div>
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  disabled={isUploading}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-850 transition text-xs font-semibold text-slate-600 dark:text-slate-400 disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फोटो काढा' : 'Capture'}
                </button>
                <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-850 transition text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  {language === 'mr' ? 'फाईल निवडा' : 'Upload File'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} disabled={isUploading} multiple />
                </label>
              </div>
            </div>
          </div>

          {/* 6. Notes */}
          {hasPaymentNoteInconsistency && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs leading-relaxed flex-shrink-0 flex items-start gap-2">
              <span className="text-amber-400 text-base leading-none mt-0.5">⚠️</span>
              <div>
                <span className="font-bold text-amber-400 block mb-0.5">
                  {language === 'mr' ? 'नोंद आणि पेमेंट स्टेटस जुळत नाहीत' : 'Payment Mismatch'}
                </span>
                <span className="text-amber-300/80">
                  {language === 'mr'
                    ? 'नोंदीत पेमेंट झाल्याचे लिहिले आहे, पण स्टेटस "न भरलेले" आहे. कृपया Paid Amount आणि Payment Status अपडेट करा.'
                    : 'Notes say payment was received, but payment status is still unpaid/reserved. Please update the Paid Amount and Payment Status to match.'}
                </span>
              </div>
            </div>
          )}
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
                {livePendingAmount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutTotalAmount(Number(editingTotal) || 0)
                      setCheckoutPaidAmount(Number(editingPaid) || 0)
                      setCheckoutPaymentMode(
                        (['Cash', 'UPI', 'IDFC'] as const).includes(booking.payment_mode as any)
                          ? (booking.payment_mode as 'Cash' | 'UPI' | 'IDFC')
                          : 'IDFC'
                      )
                      setCheckoutIsPaidAmountModified(false)
                      setShowCheckoutConfirm(true)
                    }}
                    className="w-full py-3.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <LogOut className="h-4 w-4" />
                    {language === 'mr' ? 'पेमेंट + चेकआऊट करा' : 'Collect & Checkout'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutTotalAmount(Number(editingTotal) || 0)
                      setCheckoutPaidAmount(Number(editingPaid) || 0)
                      setCheckoutPaymentMode(booking.payment_mode === 'Pending' ? 'IDFC' : booking.payment_mode)
                      setCheckoutIsPaidAmountModified(false)
                      setShowCheckoutConfirm(true)
                    }}
                    className="w-full py-3.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-955 text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <LogOut className="h-4 w-4" />
                    {language === 'mr' ? 'चेकआऊट करा' : 'Checkout Customer'}
                  </button>
                )}
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

      {/* Checkout Confirmation Modal — Receipt Style */}
      {showCheckoutConfirm && (() => {
        const checkoutDues = Math.max(0, checkoutTotalAmount - checkoutPaidAmount)
        const guestName = formatNameByLanguage(getCustomerNameDisplay(booking.customers?.name).name, language)
        const hasAdvance = (booking.paid_amount || 0) > 0 && booking.payment_mode && booking.payment_mode !== 'Pending'
        const extraAmt = booking.extra_bill_amount || 0
        return (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-sm animate-fade-in" onClick={() => setShowCheckoutConfirm(false)}>
            <div
              className="glass-panel w-full max-w-lg rounded-t-3xl bg-slate-900 border-t border-slate-800 flex flex-col shadow-2xl max-h-[92dvh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-700" />
              </div>

              {/* Header */}
              <div className="px-5 pt-2 pb-3 border-b border-slate-800/60 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    checkoutDues > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    <LogOut className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-100">
                      {language === 'mr' ? '🏨 चेकआऊट' : '🏨 Check Out'}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      <span className="text-slate-200 font-bold">{guestName}</span>
                      {' · '}{language === 'mr' ? 'खोली' : 'Room'} <span className="text-slate-200 font-bold">{booking.rooms?.number || booking.room_id}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Receipt Body */}
              <div className="px-5 py-4 flex flex-col gap-3">

                {/* Bill breakdown — receipt style */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden">
                  {/* Room charge */}
                  <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800/50">
                    <span className="text-xs text-slate-400 font-semibold">
                      {language === 'mr'
                        ? `खोली (₹${booking.room_price} × ${(() => {
                            const ci = new Date(booking.check_in); const co = new Date(booking.check_out)
                            return Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000))
                          })()} रात्र)`
                        : `Room (₹${booking.room_price} × ${(() => {
                            const ci = new Date(booking.check_in); const co = new Date(booking.check_out)
                            return Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000))
                          })()} night${Math.max(1, Math.round((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000)) !== 1 ? 's' : ''})`}
                    </span>
                    <span className="text-sm font-black text-slate-200 tabular-nums">
                      ₹{(checkoutTotalAmount - extraAmt).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Extra charges — only if > 0 */}
                  {extraAmt > 0 && (
                    <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800/50">
                      <span className="text-xs text-slate-400 font-semibold">
                        {booking.extra_bill_note || (language === 'mr' ? 'अतिरिक्त शुल्क' : 'Extra Charges')}
                      </span>
                      <span className="text-sm font-black text-slate-300 tabular-nums">+₹{extraAmt.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {/* Advance paid — only if > 0 */}
                  {hasAdvance && (
                    <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800/50">
                      <span className="text-xs text-emerald-500 font-semibold">
                        {language === 'mr' ? `आगाऊ भरले (${booking.payment_mode})` : `Advance paid (${booking.payment_mode})`}
                      </span>
                      <span className="text-sm font-black text-emerald-400 tabular-nums">
                        −₹{(booking.paid_amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  {/* To Collect / Fully Settled */}
                  <div className={`flex justify-between items-center px-4 py-3 ${
                    checkoutDues > 0 ? 'bg-amber-500/8' : 'bg-emerald-500/8'
                  }`}>
                    <span className={`text-sm font-black uppercase tracking-wide ${checkoutDues > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {checkoutDues > 0
                        ? (language === 'mr' ? '💰 वसूल करा' : '💰 Collect Now')
                        : (language === 'mr' ? '✅ पूर्ण भरले' : '✅ Fully Settled')}
                    </span>
                    <span className={`text-2xl font-black tabular-nums ${checkoutDues > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      ₹{checkoutDues > 0 ? checkoutDues.toLocaleString('en-IN') : checkoutTotalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Payment mode — only when there are dues */}
                {checkoutDues > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">
                      {language === 'mr' ? 'कसे भरत आहेत?' : 'How are they paying?'}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Cash', 'UPI', 'IDFC'] as const).map((mode) => {
                        const modeInfo: Record<string, { icon: string; label: string; active: string }> = {
                          Cash: { icon: '💵', label: language === 'mr' ? 'कॅश' : 'Cash', active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' },
                          UPI:  { icon: '📱', label: 'UPI',  active: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
                          IDFC: { icon: '🏦', label: 'IDFC', active: 'bg-purple-500/20 text-purple-400 border-purple-500/50' },
                        }
                        const { icon, label, active } = modeInfo[mode]
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setCheckoutPaymentMode(mode)}
                            className={`py-2.5 rounded-2xl border text-[11px] font-black transition-all duration-150 flex flex-col items-center gap-1 justify-center ${
                              checkoutPaymentMode === mode ? active : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <span className="text-base">{icon}</span>
                            <span>{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Already settled message */}
                {checkoutDues === 0 && (
                  <div className="py-2 px-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl text-center">
                    <span className="text-[11px] text-emerald-400 font-bold">
                      ✅ {language === 'mr'
                        ? `${booking.payment_mode || ''} द्वारे चेक-इन वेळी पूर्ण भरले`
                        : `Fully paid via ${booking.payment_mode || 'prior payment'} at check-in`}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="px-5 pb-6 pt-1 flex flex-col gap-2 flex-shrink-0">
                {/* Primary action */}
                <button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() => { setShowCheckoutConfirm(false); handleCheckOut() }}
                  className={`w-full py-4 px-4 text-slate-950 font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 ${
                    checkoutDues > 0
                      ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                      : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                  }`}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <LogOut className="h-5 w-5" />
                  )}
                  <span className="text-sm">
                    {checkoutDues > 0
                      ? (language === 'mr'
                          ? `₹${checkoutDues.toLocaleString('en-IN')} जमा करा व चेकआऊट`
                          : `Collect ₹${checkoutDues.toLocaleString('en-IN')} via ${checkoutPaymentMode} & Checkout`)
                      : (language === 'mr' ? 'चेकआऊट निश्चित करा' : 'Confirm Checkout')}
                  </span>
                </button>

                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirm(false)}
                  className="w-full py-3 px-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-sm font-bold rounded-2xl transition"
                >
                  ← {language === 'mr' ? 'परत जा' : 'Back'}
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
                  <>खोली क्रमांक <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span> मधील ग्राहक <span className="font-extrabold text-slate-200">{formatNameByLanguage(getCustomerNameDisplay(booking.customers?.name).name, language)}</span> यांचे बुकिंग रद्द करायचे आहे का? हे आपण नंतर Settings मधून पुनर्संचयित करू शकता.</>
                ) : (
                  <>Cancel the booking for <span className="font-extrabold text-slate-200">{formatNameByLanguage(getCustomerNameDisplay(booking.customers?.name).name, language)}</span> in Room <span className="font-extrabold text-slate-200">{booking.rooms?.number || booking.room_id}</span>? You can restore this later from Settings.</>
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
              : activeKeypad === 'checkoutTotal'
              ? checkoutTotalAmount
              : activeKeypad === 'checkoutPaid'
              ? checkoutPaidAmount
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
            } else if (activeKeypad === 'checkoutTotal') {
              const numVal = Number(val) || 0
              setCheckoutTotalAmount(numVal)
            } else if (activeKeypad === 'checkoutPaid') {
              const numVal = Number(val) || 0
              setCheckoutPaidAmount(numVal)
              setCheckoutIsPaidAmountModified(true)
            }
            setActiveKeypad(null)
          }}
          onClose={() => setActiveKeypad(null)}
          label={
            activeKeypad === 'total' || activeKeypad === 'checkoutTotal'
              ? (language === 'mr' ? 'एकूण बिल टाका' : 'Enter Total Bill')
              : activeKeypad === 'extra'
              ? (language === 'mr' ? 'अतिरिक्त शुल्क टाका' : 'Enter Extra Charges')
              : activeKeypad === 'paid' || activeKeypad === 'checkoutPaid'
              ? (language === 'mr' ? 'भरलेली रक्कम टाका' : 'Enter Amount Paid')
              : (language === 'mr' ? 'खोलीचे भाडे टाका' : 'Enter Room Price')
          }
          keypadType="currency"
          language={language}
        />
      )}
      {renderDatePickerModal()}
      {renderIDProofViewer()}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCaptureComplete={handleCameraCaptureComplete}
        language={language}
      />
    </div>,
    document.body
  )
}
