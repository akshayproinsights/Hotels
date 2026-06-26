import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, User, Phone, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Minus, Camera, Upload, Briefcase, FileText, Loader2 } from 'lucide-react'
import { 
  format, 
  addDays, 
  differenceInCalendarDays, 
  parse, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isAfter, 
  isBefore, 
  isToday, 
  addMonths, 
  subMonths, 
  startOfDay 
} from 'date-fns'
import toast from 'react-hot-toast'
import type { InventoryRoom, Room, Document } from '../types'
import { searchGuests, getGuestBookings } from '../api/guests'
import { createBooking } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload, listGuestDocs, extractNameFromId } from '../api/documents'
import { listAvailableRooms } from '../api/rooms'
import { useLanguage } from '../context/LanguageContext'


interface BlockRoomSheetProps {
  room?: InventoryRoom
  onClose: () => void
  onSuccess: () => void
  initialDate?: string // yyyy-MM-dd — pre-fill check-in to this date when opened from a calendar day
}

interface LocalFile {
  file: File
  preview: string
}

export default function BlockRoomSheet({ room, onClose, onSuccess, initialDate }: BlockRoomSheetProps) {
  const { language, t } = useLanguage()
  const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
  const formatBtnDate = (dStr: string) => {
    if (!dStr) return language === 'mr' ? 'तारीख निवडा' : 'Select date';
    const d = parse(dStr, 'yyyy-MM-dd', new Date());
    if (language !== 'mr') return format(d, 'dd-MMM-yyyy');
    return `${d.getDate()} ${monthsMr[d.getMonth()]} ${d.getFullYear()}`;
  }
  const [guestName, setGuestName] = useState('')
  const [selectedGuestId, setSelectedGuestId] = useState<string | undefined>(undefined)
  const [guestPhone, setGuestPhone] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; phone: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeSearchField, setActiveSearchField] = useState<'name' | 'phone' | null>(null)
  const [recentGuests, setRecentGuests] = useState<{ id: string; name: string; phone: string }[]>([])
  
  // Steppers
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [extraBeds, setExtraBeds] = useState(0)

  // Dates — use initialDate (calendar-selected day) if provided, otherwise default to today
  const now = new Date()
  const getRoundedNextHourTime = (date: Date) => {
    const hours = date.getHours()
    const nextHour = (hours + 1) % 24
    return `${String(nextHour).padStart(2, '0')}:00`
  }
  const defaultCheckInTime = getRoundedNextHourTime(now)
  const startDate = initialDate ? parse(initialDate, 'yyyy-MM-dd', new Date()) : now
  const [checkInDate, setCheckInDate] = useState(format(startDate, 'yyyy-MM-dd'))
  const [checkInTime, setCheckInTime] = useState(defaultCheckInTime)
  
  const defaultCheckOut = addDays(startDate, 1)
  const [checkOutDate, setCheckOutDate] = useState(format(defaultCheckOut, 'yyyy-MM-dd'))
  const [checkOutTime, setCheckOutTime] = useState('11:00')

  // Additional Fields
  const [occupation, setOccupation] = useState('')
  const [notes, setNotes] = useState('')
  const [roomPrice, setRoomPrice] = useState(room?.base_price ?? 0)
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Pending'>('Pending')
  const [depositAmount, setDepositAmount] = useState<string | number>(0)
  
  // Documents
  const [selectedFiles, setSelectedFiles] = useState<LocalFile[]>([])
  
  // Total Amount State (for editing)
  const [totalAmount, setTotalAmount] = useState<string | number>('')
  
  // Existing guest documents
  const [existingDocs, setExistingDocs] = useState<Document[]>([])
  
  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExtractingName, setIsExtractingName] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)


  // Dynamic Room states
  const [selectedRoomType, setSelectedRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'AC Standard' | 'Non AC Standard'>(room?.room_type ?? 'AC Deluxe')
  const [selectedRoomId, setSelectedRoomId] = useState<string>(room?.id ?? '')
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isLoadingAvailableRooms, setIsLoadingAvailableRooms] = useState(false)
  
  // Custom Date Picker states
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState<Date>(now)

  // Load recent guests
  useEffect(() => {
    const stored = localStorage.getItem('recent_guests')
    if (stored) {
      try {
        setRecentGuests(JSON.parse(stored))
      } catch (e) {
        // Ignore
      }
    }
  }, [])

  // Auto-close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Guest search autocompletion (debounced)
  useEffect(() => {
    const query = activeSearchField === 'name' ? guestName : activeSearchField === 'phone' ? guestPhone : ''
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchGuests(query)
        setSearchResults(results)
        setShowDropdown(true)
      } catch (err) {
        console.error('Failed to search guests', err)
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [guestName, guestPhone, activeSearchField])

  // Fetch available rooms whenever date or time selection changes
  useEffect(() => {
    if (!checkInDate || !checkOutDate) return

    let active = true
    const fetchRooms = async () => {
      setIsLoadingAvailableRooms(true)
      try {
        const startISO = parse(`${checkInDate} ${checkInTime}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const endISO = parse(`${checkOutDate} ${checkOutTime}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const res = await listAvailableRooms(startISO, endISO)
        if (active) {
          // Keep initial room in selection list if available, or if selection hasn't changed
          if (room) {
            const containsRoom = res.some(r => r.id === room.id)
            const updatedRooms = containsRoom ? res : [room, ...res.filter(r => r.id !== room.id)]
            setAvailableRooms(updatedRooms)
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
  }, [checkInDate, checkInTime, checkOutDate, checkOutTime, room])

  // Filter available rooms by selected room type
  const filteredRooms = availableRooms.filter(r => r.room_type === selectedRoomType)

  // Auto-select first room of selected type when list or type changes
  useEffect(() => {
    const filtered = availableRooms.filter(r => r.room_type === selectedRoomType)
    if (filtered.length > 0) {
      const exists = filtered.some(r => r.id === selectedRoomId)
      if (!exists) {
        setSelectedRoomId(filtered[0].id)
      }
    } else {
      if (room && room.room_type === selectedRoomType) {
        setSelectedRoomId(room.id)
      } else {
        setSelectedRoomId('')
      }
    }
  }, [selectedRoomType, availableRooms, selectedRoomId, room])

  // Update room price state when the selected room updates
  useEffect(() => {
    const cur = (room && selectedRoomId === room.id) ? room : availableRooms.find(r => r.id === selectedRoomId)
    if (cur) {
      setRoomPrice(cur.base_price)
      setSelectedRoomType(cur.room_type)
    }
  }, [selectedRoomId, availableRooms, room])

  // Synchronize calendar focus month when popover opens
  useEffect(() => {
    if (showDatePicker && checkInDate) {
      setPickerMonth(parse(checkInDate, 'yyyy-MM-dd', new Date()))
    }
  }, [showDatePicker, checkInDate])

  // Computed Values
  const currentSelectedRoom = (room && selectedRoomId === room.id)
    ? room 
    : (availableRooms.find(r => r.id === selectedRoomId) || null)

  const checkinDateTime = parse(`${checkInDate} ${checkInTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const checkoutDateTime = parse(`${checkOutDate} ${checkOutTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const nights = Math.max(1, differenceInCalendarDays(checkoutDateTime, checkinDateTime))
  const extraBedTotal = extraBeds * (currentSelectedRoom?.extra_bed_price ?? 500) * nights
  const defaultTotalAmount = (roomPrice * nights) + extraBedTotal

  // Sync state with calculated total, but only when base factors change
  useEffect(() => {
    setTotalAmount(defaultTotalAmount)
  }, [roomPrice, nights, extraBeds, defaultTotalAmount])

  // Load existing guest documents
  useEffect(() => {
    if (selectedGuestId) {
      listGuestDocs(selectedGuestId)
        .then(docs => setExistingDocs(docs))
        .catch(err => console.error('Failed to load guest documents', err))
    } else {
      setExistingDocs([])
    }
  }, [selectedGuestId])

  const selectGuest = async (guest: { id: string; name: string; phone: string }) => {
    setSelectedGuestId(guest.id)
    setGuestName(guest.name)
    setGuestPhone(guest.phone)
    setShowDropdown(false)
    setActiveSearchField(null)

    // Fetch and prefill last known occupation
    try {
      const bookings = await getGuestBookings(guest.id)
      if (bookings && bookings.length > 0) {
        const lastWithOccupation = bookings.find(b => b.occupation && b.occupation.trim())
        if (lastWithOccupation?.occupation) {
          setOccupation(lastWithOccupation.occupation)
        }
      }
    } catch (err) {
      console.error('Failed to prefill guest occupation from last bookings', err)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = (Array.from(e.target.files) as File[]).map((file: File) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      }))
      setSelectedFiles(prev => [...prev, ...filesArr])

      // Auto-extract name from the first uploaded file
      const fileToExtract = e.target.files[0]
      setIsExtractingName(true)
      const toastId = toast.loading(language === 'mr' ? 'ओळखपत्रातून नाव शोधत आहे...' : 'Extracting name from ID...')
      try {
        const name = await extractNameFromId(fileToExtract)
        if (name && name.trim()) {
          setGuestName(name.trim())
          toast.success(
            language === 'mr' 
              ? `नाव सापडले: ${name.trim()}` 
              : `Extracted name: ${name.trim()}`,
            { id: toastId }
          )
        } else {
          toast.error(
            language === 'mr'
              ? 'नाव शोधता आले नाही. कृपया स्वतः टाईप करा.'
              : 'Could not extract name. Please enter manually.',
            { id: toastId }
          )
        }
      } catch (err) {
        console.error('Failed to extract name', err)
        toast.error(
          language === 'mr'
            ? 'नाव शोधण्यात अडचण आली'
            : 'Error extracting name',
          { id: toastId }
        )
      } finally {
        setIsExtractingName(false)
      }
    }
  }


  const removeFile = (index: number) => {
    setSelectedFiles(prev => {
      const copy = [...prev]
      if (copy[index].preview) {
        URL.revokeObjectURL(copy[index].preview)
      }
      copy.splice(index, 1)
      return copy
    })
  }

  const saveToRecentGuests = (guest: { id: string; name: string; phone: string }) => {
    const list = [guest, ...recentGuests.filter(g => g.phone !== guest.phone)].slice(0, 3)
    setRecentGuests(list)
    localStorage.setItem('recent_guests', JSON.stringify(list))
  }

  const renderDatePickerModal = () => {
    if (!showDatePicker) return null

    const monthStart = startOfMonth(pickerMonth)
    const monthEnd = endOfMonth(pickerMonth)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)
    const days = eachDayOfInterval({ start: startDate, end: endDate })

    const selCheckIn = checkInDate ? parse(checkInDate, 'yyyy-MM-dd', new Date()) : null
    const selCheckOut = checkOutDate ? parse(checkOutDate, 'yyyy-MM-dd', new Date()) : null

    const handlePrevMonth = () => setPickerMonth(prev => subMonths(prev, 1))
    const handleNextMonth = () => setPickerMonth(prev => addMonths(prev, 1))

    const handleDayClick = (day: Date) => {
      const todayStart = startOfDay(new Date())
      if (isBefore(day, todayStart)) {
        toast.error(language === 'mr' ? "पूर्वीची तारीख निवडता येत नाही" : "Cannot select past dates")
        return
      }

      const formatted = format(day, 'yyyy-MM-dd')

      if (!checkInDate || (checkInDate && checkOutDate)) {
        setCheckInDate(formatted)
        setCheckOutDate('')
      } else {
        const ci = parse(checkInDate, 'yyyy-MM-dd', new Date())
        if (isAfter(day, ci)) {
          setCheckOutDate(formatted)
        } else if (isSameDay(day, ci)) {
          setCheckOutDate('')
        } else {
          setCheckInDate(formatted)
          setCheckOutDate('')
        }
      }
    }

    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ]

    const tempNights = selCheckIn && selCheckOut ? Math.max(1, differenceInCalendarDays(selCheckOut, selCheckIn)) : 0

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
        <div className="glass-panel relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
          
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-extrabold text-slate-200">{language === 'mr' ? 'तारीख निवडा' : 'Select Date Range'}</h4>
              <p className="text-[10px] text-slate-500 font-medium">{language === 'mr' ? 'चेक-इन आणि नंतर चेक-आउट तारीख निवडा' : 'Click check-in then check-out'}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (checkInDate && !checkOutDate) {
                  const ci = parse(checkInDate, 'yyyy-MM-dd', new Date())
                  setCheckOutDate(format(addDays(ci, 1), 'yyyy-MM-dd'))
                }
                setShowDatePicker(false)
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl transition"
            >
              {language === 'mr' ? 'पूर्ण' : 'Done'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-इन' : 'Check-in'}</span>
              <div className="text-xs font-bold text-emerald-400">
                {selCheckIn ? (language === 'mr' ? `${selCheckIn.getDate()} ${monthsMr[selCheckIn.getMonth()]} ${selCheckIn.getFullYear()}` : format(selCheckIn, 'dd MMM yyyy')) : (language === 'mr' ? 'तारीख निवडा' : 'Select date')}
              </div>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{language === 'mr' ? 'चेक-आउट' : 'Check-out'}</span>
              <div className="text-xs font-bold text-amber-400">
                {selCheckOut ? (language === 'mr' ? `${selCheckOut.getDate()} ${monthsMr[selCheckOut.getMonth()]} ${selCheckOut.getFullYear()}` : format(selCheckOut, 'dd MMM yyyy')) : (language === 'mr' ? 'तारीख निवडा' : 'Select date')}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-black text-slate-300">
              {language === 'mr' ? monthsMr[pickerMonth.getMonth()] : MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {(language === 'mr' ? ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((day, idx) => (
                <div key={idx} className="text-[10px] font-extrabold text-slate-500 uppercase">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === pickerMonth.getMonth()
                const isTodayDate = isToday(day)
                
                const isCi = selCheckIn ? isSameDay(day, selCheckIn) : false
                const isCo = selCheckOut ? isSameDay(day, selCheckOut) : false
                const isInRange = selCheckIn && selCheckOut ? (isAfter(day, selCheckIn) && isBefore(day, selCheckOut)) : false
                
                const todayStart = startOfDay(new Date())
                const isPast = isBefore(day, todayStart)

                let btnClass = 'text-slate-300 hover:bg-slate-850'
                if (isPast) {
                  btnClass = 'text-slate-600 opacity-20 cursor-not-allowed'
                } else if (isCi || isCo) {
                  btnClass = 'bg-emerald-500 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20'
                } else if (isInRange) {
                  btnClass = 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 rounded-none'
                } else if (!isCurrentMonth) {
                  btnClass = 'text-slate-500 opacity-30 hover:bg-slate-800'
                }

                if (isTodayDate && !isCi && !isCo && !isInRange) {
                  btnClass += ' ring-1 ring-slate-700 ring-offset-1 ring-offset-slate-900'
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isPast}
                    onClick={() => handleDayClick(day)}
                    className={`aspect-square text-xs rounded-xl flex items-center justify-center transition duration-150 ${btnClass}`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {tempNights > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-center text-xs font-bold text-emerald-400">
              {language === 'mr' ? `मुक्काम कालावधी: ${tempNights} रात्र` : `Duration of Stay: ${tempNights} ${tempNights === 1 ? 'Night' : 'Nights'}`}
            </div>
          )}

        </div>
      </div>
    )
  }

  const handleSubmit = async (paymentStatus: 'hold' | 'paid' | 'unpaid' | 'partial') => {
    if (!guestName.trim()) {
      toast.error(language === 'mr' ? 'पाहुण्याचे नाव आवश्यक आहे' : 'Guest Name is required')
      return
    }
    if (!guestPhone.trim()) {
      toast.error(language === 'mr' ? 'मोबाईल नंबर आवश्यक आहे' : 'Phone Number is required')
      return
    }
    if (!selectedRoomId) {
      toast.error(language === 'mr' ? 'या तारखांसाठी कोणतीही खोली उपलब्ध नाही' : 'No room is selected or available for these dates')
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Create booking payload
      const checkInISO = checkinDateTime.toISOString()
      const checkOutISO = checkoutDateTime.toISOString()

      const payload = {
        room_id: selectedRoomId,
        room_type: selectedRoomType,
        guest_id: selectedGuestId,
        guest_name: selectedGuestId ? undefined : guestName,
        guest_phone: selectedGuestId ? undefined : guestPhone,
        check_in: checkInISO,
        check_out: checkOutISO,
        adults,
        children,
        extra_beds: extraBeds,
        room_price: roomPrice,
        payment_mode: paymentMode,
        payment_status: paymentStatus,
        // For partial payments (Cash/UPI with deposit < total), store the partial deposit amount
        // For hold: use depositAmount if provided, else 500
        // For paid: 0 (full payment, no deposit distinction needed)
        // For unpaid/Pending: use depositAmount (advance)
        deposit_amount: paymentStatus === 'partial'
          ? (Number(depositAmount) || 0)
          : paymentMode === 'Pending'
          ? (Number(depositAmount) || 0)
          : paymentStatus === 'hold'
          ? (Number(depositAmount) || 500)
          : 0,
        occupation: occupation || undefined,
        notes: notes || undefined,
        total_amount: Number(totalAmount) || 0,
      }

      const booking = await createBooking(payload)

      // Save to recent list
      saveToRecentGuests({
        id: booking.guest_id,
        name: guestName,
        phone: guestPhone,
      })

      // 2. Upload documents if any
      if (selectedFiles.length > 0) {
        toast.loading(language === 'mr' ? 'ओळखपत्रे अपलोड होत आहेत...' : 'Uploading ID documents...', { id: 'upload' })
        for (const localFile of selectedFiles) {
          const { upload_url, document_id } = await getUploadUrl(
            booking.id,
            booking.guest_id,
            localFile.file.name,
            localFile.file.type
          )
          await uploadFileToR2(upload_url, localFile.file)
          await confirmUpload(document_id)
        }
        toast.success(language === 'mr' ? 'ओळखपत्रे यशस्वीरित्या अपलोड झाली' : 'Documents uploaded successfully', { id: 'upload' })
      }

      toast.success(paymentStatus === 'hold' 
        ? (language === 'mr' ? 'खोली यशस्वीरित्या होल्ड केली गेली!' : 'Room blocked successfully!') 
        : (language === 'mr' ? 'चेक-इन यशस्वीरित्या पूर्ण झाले!' : 'Check-in completed successfully!'))
      onSuccess()
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.response?.data?.detail || (language === 'mr' ? 'बुकिंग पूर्ण करण्यास अडचण आली' : 'Failed to complete booking operation')
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm animate-fade-in" style={{ height: '100dvh' }}>
      {/* Main Full-Screen Form */}
      <div className="relative w-full flex flex-col bg-slate-900 shadow-2xl overflow-hidden" style={{ height: '100dvh' }}>

        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-3 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-xl text-sm font-extrabold">
                {language === 'mr' ? 'खोली' : 'Room'} {currentSelectedRoom?.number ?? '—'}
              </span>
              {language === 'mr' ? 'बुक आणि ब्लॉक' : 'Book & Block'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {currentSelectedRoom 
                ? (language === 'mr' 
                    ? `${currentSelectedRoom.floor} रा मजला - चेक-इन साठी तयार` 
                    : `Ready for check-in on Floor ${currentSelectedRoom.floor}`) 
                : t('select_room_prompt')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body - Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-5">

          {/* ID Capture / Upload section (Autofill) */}
          <div className="flex flex-col gap-1.5 p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>{language === 'mr' ? 'ओळखपत्र अपलोड करा' : 'ID Documentation'}</span>
              {isExtractingName && <Loader2 className="h-4.5 w-4.5 animate-spin text-emerald-400" />}
            </span>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <label className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Camera className="h-4 w-4 text-slate-500" />
                {language === 'mr' ? 'फोटो काढा' : 'Capture ID'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isExtractingName}
                />
              </label>
              <label className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Upload className="h-4 w-4 text-slate-500" />
                {language === 'mr' ? 'फाईल अपलोड' : 'Upload Doc'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isExtractingName}
                />
              </label>
            </div>

            {/* Selected File Thumbnails */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 group">
                    {f.preview ? (
                      <img src={f.preview} alt="ID Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 font-extrabold text-[10px]">
                        PDF
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Guest Name & Phone container for shared click-outside reference */}
          <div className="flex flex-col gap-5" ref={dropdownRef}>
            {/* Guest Name & Autocomplete */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('guest_name')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'mr' ? 'पाहुण्याचे नाव शोधा किंवा टाका' : 'Search or enter guest name'}
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value)
                    setSelectedGuestId(undefined) // clear selection if typed
                    setActiveSearchField('name')
                  }}
                  onFocus={() => {
                    if (guestName.length >= 2) {
                      setActiveSearchField('name')
                      setShowDropdown(true)
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
              {activeSearchField === 'name' && showDropdown && searchResults.length > 0 && (
                <div className="absolute top-[72px] z-50 w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  {searchResults.map((guest) => (
                    <button
                      key={guest.id}
                      type="button"
                      onClick={() => selectGuest(guest)}
                      className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-900 border-b border-slate-900 flex justify-between items-center transition"
                    >
                      <span className="font-semibold">{guest.name}</span>
                      <span className="text-xs text-slate-500">{guest.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone Number */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('mobile_number')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="tel"
                  placeholder={language === 'mr' ? '१०-अंकी मोबाईल नंबर' : '10-digit mobile number'}
                  value={guestPhone}
                  onChange={(e) => {
                    setGuestPhone(e.target.value)
                    setSelectedGuestId(undefined)
                    setActiveSearchField('phone')
                  }}
                  onFocus={() => {
                    if (guestPhone.length >= 2) {
                      setActiveSearchField('phone')
                      setShowDropdown(true)
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
              {activeSearchField === 'phone' && showDropdown && searchResults.length > 0 && (
                <div className="absolute top-[72px] z-50 w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  {searchResults.map((guest) => (
                    <button
                      key={guest.id}
                      type="button"
                      onClick={() => selectGuest(guest)}
                      className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-900 border-b border-slate-900 flex justify-between items-center transition"
                    >
                      <span className="font-semibold">{guest.name}</span>
                      <span className="text-xs text-slate-500">{guest.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Existing Guest Documents */}
          {selectedGuestId && existingDocs.length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {language === 'mr' ? 'सिस्टममध्ये उपलब्ध ओळखपत्रे' : 'Existing ID Proofs on File'}
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {existingDocs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center hover:border-emerald-500 transition group"
                  >
                    {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                      <FileText className="h-5 w-5 text-slate-400" />
                    ) : (
                      <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Room Selection: Type and Room Number Dropdowns */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('room_type')}</span>
              <div className="relative">
                <select
                  value={selectedRoomType}
                  onChange={(e) => setSelectedRoomType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-semibold h-[46px] select-dark"
                >
                  <option value="AC Deluxe">AC Deluxe</option>
                  <option value="Non AC Deluxe">Non AC Deluxe</option>
                  <option value="AC Standard">AC Standard</option>
                  <option value="Non AC Standard">Non AC Standard</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'खोली क्रमांक' : 'Room Number'}</span>
              <div className="relative">
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  disabled={isLoadingAvailableRooms}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-semibold h-[46px] select-dark disabled:opacity-50"
                >
                  {isLoadingAvailableRooms ? (
                    <option value="">{t('loading')}</option>
                  ) : filteredRooms.length === 0 ? (
                    <option value="">{language === 'mr' ? 'कोणतीही खोली उपलब्ध नाही' : 'No rooms available'}</option>
                  ) : (
                    filteredRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.number}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Occupancy and Extra Beds Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Steppers: Adults & Children */}
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'प्रौढ' : 'Adults'}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'मुले' : 'Children'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setAdults(prev => Math.max(1, prev - 1))}
                    className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-bold text-slate-200">{adults}</span>
                  <button
                    type="button"
                    onClick={() => setAdults(prev => prev + 1)}
                    className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setChildren(prev => Math.max(0, prev - 1))}
                    className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-bold text-slate-200">{children}</span>
                  <button
                    type="button"
                    onClick={() => setChildren(prev => prev + 1)}
                    className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Extra Beds Stepper */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                <span>{language === 'mr' ? 'अतिरिक्त बेड' : 'Extra Beds'}</span>
                <span className="text-[10px] text-slate-500 lowercase font-medium">
                  +₹{currentSelectedRoom?.extra_bed_price ?? 500}{language === 'mr' ? '/रात्र' : '/night'}
                </span>
              </span>
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1 h-[46px]">
                <button
                  type="button"
                  onClick={() => setExtraBeds(prev => Math.max(0, prev - 1))}
                  className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="text-sm font-bold text-slate-200">{extraBeds}</span>
                <button
                  type="button"
                  onClick={() => setExtraBeds(prev => prev + 1)}
                  className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Dates: Check-in / Check-out Buttons Triggering Custom Calendar */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'चेक-इन तारीख' : 'Check-in'}</span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 hover:border-emerald-500/50 text-xs flex items-center justify-between transition h-[42px]"
                >
                  <span>{formatBtnDate(checkInDate)}</span>
                  <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
                </button>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs h-[36px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'चेक-आउट तारीख' : 'Check-out'}</span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 hover:border-emerald-500/50 text-xs flex items-center justify-between transition h-[42px]"
                >
                  <span>{formatBtnDate(checkOutDate)}</span>
                  <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
                </button>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs h-[36px]"
                />
              </div>
            </div>
          </div>

          {/* Compute Night Label */}
          <div className="flex justify-between items-center py-2.5 px-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              {language === 'mr' ? 'मुक्काम कालावधी:' : 'Duration of Stay:'}
            </span>
            <span className="text-sm font-extrabold text-emerald-300">
              {nights} {language === 'mr' ? 'रात्र' : (nights === 1 ? 'Night' : 'Nights')}
            </span>
          </div>

          {/* Room Price and Occupation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'खोली भाडे (₹/रात्र)' : 'Room Price (₹/Night)'}</label>
              <input
                type="number"
                value={roomPrice}
                onChange={(e) => setRoomPrice(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm h-[46px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'व्यवसाय' : 'Occupation'}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Briefcase className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'mr' ? 'उदा. नोकरी/व्यवसाय' : 'e.g. Business'}
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm h-[46px]"
                />
              </div>
            </div>
          </div>

          {/* Notes (Full Width) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'तपशील / इतर मागण्या' : 'Notes (Max 150 chars)'}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <FileText className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder={language === 'mr' ? 'इतर माहिती / मागण्या' : 'Additional request info'}
                value={notes}
                maxLength={150}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm h-[46px]"
              />
            </div>
          </div>





        </div> {/* End of scrollable body */}

        {/* ——— Unified Payment Card (fixed bottom) ——— */}
        <div className="border-t border-slate-800 bg-slate-950 flex-shrink-0 flex flex-col">

          {/* Row 1: Total Bill + Payment Method Pills */}
          <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-800/60">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {language === 'mr' ? 'एकूण बिल' : 'Total Bill'}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-black text-slate-400">₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={totalAmount}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setTotalAmount('')
                    } else {
                      const cleaned = val.replace(/^0+/, '')
                      setTotalAmount(cleaned === '' ? '0' : cleaned)
                    }
                  }}
                  className="bg-transparent border-none outline-none text-2xl font-black text-slate-100 w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <span className="text-[10px] text-slate-600 font-medium mt-0.5">
                {language === 'mr' ? `₹${roomPrice} × ${nights} रात्र${extraBeds > 0 ? ` + बेड ₹${extraBedTotal}` : ''}` : `₹${roomPrice} × ${nights}n${extraBeds > 0 ? ` + bed ₹${extraBedTotal}` : ''}`}
              </span>
            </div>

            {/* Payment Method Pills */}
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {language === 'mr' ? 'पेमेंट कसे?' : 'How paying?'}
              </span>
              <div className="flex gap-1.5">
                {(['Cash', 'UPI', 'Pending'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPaymentMode(mode)
                      if (mode !== 'Pending') setDepositAmount(0)
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition-all duration-200 ${
                      paymentMode === mode
                        ? mode === 'Cash'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : mode === 'UPI'
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                        : 'bg-slate-900 border-slate-700/60 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {mode === 'Cash' ? '💵' : mode === 'UPI' ? '📱' : '⏳'}&nbsp;
                    {mode === 'Cash' ? (language === 'mr' ? 'कॅश' : 'Cash') : mode === 'UPI' ? 'UPI' : (language === 'mr' ? 'बाकी' : 'Pending')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Deposit Input + Live Split Bar */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {language === 'mr' ? 'आता मिळाले (₹)' : 'Collected Now (₹)'}
              </label>
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition ${
                paymentMode === 'Pending'
                  ? 'bg-slate-900 border-amber-500/30 focus-within:border-amber-400/60'
                  : 'bg-slate-900 border-emerald-500/20 focus-within:border-emerald-400/40'
              }`}>
                <span className={`text-sm font-black ${paymentMode === 'Pending' ? 'text-amber-400' : 'text-emerald-400'}`}>₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={paymentMode !== 'Pending' ? String(totalAmount || 0) : '0'}
                  value={depositAmount === 0 ? '' : depositAmount}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '') {
                      setDepositAmount(0)
                    } else {
                      const cleaned = val.replace(/^0+/, '')
                      setDepositAmount(cleaned === '' ? 0 : cleaned)
                    }
                  }}
                  className="flex-1 bg-transparent border-none outline-none text-base font-black text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Live paid/due split */}
            {(() => {
              const total = Number(totalAmount) || 0
              const paid = paymentMode !== 'Pending' && Number(depositAmount) === 0
                ? total
                : Math.min(Number(depositAmount) || 0, total)
              const due = Math.max(0, total - paid)
              const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0
              return (
                <div className="flex flex-col items-end gap-1 min-w-[84px]">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    <span className="text-[10px] font-bold text-emerald-400">
                      {language === 'mr' ? 'भरले' : 'Paid'} ₹{paid}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {due > 0 ? (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                      <span className="text-[10px] font-black text-rose-400">
                        {language === 'mr' ? 'बाकी' : 'Due'} ₹{due}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-black text-emerald-400">
                        {language === 'mr' ? '✓ पूर्ण' : '✓ Fully Paid'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Row 3: Action Buttons */}
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('hold')}
              className="py-3.5 px-4 bg-slate-800 hover:bg-slate-750 active:bg-slate-800 text-slate-200 text-sm font-bold rounded-2xl transition disabled:opacity-50 flex items-center justify-center gap-2 border border-slate-700/60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {language === 'mr' ? 'खोली होल्ड करा' : 'Block Room (Hold)'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (paymentMode === 'Pending') {
                  handleSubmit('unpaid')
                } else {
                  // If a partial deposit was entered and it's less than the total, mark as partial
                  const depositAmt = Number(depositAmount) || 0
                  const totalAmt = Number(totalAmount) || 0
                  const isPartial = depositAmt > 0 && depositAmt < totalAmt
                  handleSubmit(isPartial ? 'partial' : 'paid')
                }
              }}
              className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 text-sm font-black rounded-2xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {language === 'mr' ? 'चेक-इन करा' : 'Block & Check In'}
            </button>
          </div>
        </div>
      </div>
      {renderDatePickerModal()}
    </div>,
    document.body
  )
}
