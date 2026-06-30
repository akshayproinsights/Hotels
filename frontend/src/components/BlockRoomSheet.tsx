import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, User, Phone, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Minus, Camera, Upload, Briefcase, FileText, Loader2, MapPin } from 'lucide-react'
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
import type { InventoryRoom, Room, Document, Customer } from '../types'
import { searchCustomers, getCustomerBookings } from '../api/customers'
import { createBookingsBatch } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload, listCustomerDocs, extractNameFromId } from '../api/documents'
import { compressImage, compressImages } from '../utils/imageCompressor'
import { listAvailableRooms } from '../api/rooms'
import { useLanguage } from '../context/LanguageContext'
import { useVisualViewport } from '../hooks/useVisualViewport'
import DocumentLightbox from './DocumentLightbox'
import NumericKeypad from './NumericKeypad'



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
  const viewport = useVisualViewport()
  const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']

  const formatCardDate = (dStr: string) => {
    if (!dStr) return language === 'mr' ? 'तारीख निवडा' : 'Select date';
    const d = parse(dStr, 'yyyy-MM-dd', new Date());
    if (language !== 'mr') return format(d, 'EEE, MMM d');
    const mrWeekdaysShort = ['रवी', 'सोम', 'मं', 'बुध', 'गुरू', 'शुक्र', 'शनी'];
    return `${mrWeekdaysShort[d.getDay()]}, ${d.getDate()} ${monthsMr[d.getMonth()]}`;
  }

  const formatTimeAMPM = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      const [hoursStr, minutesStr] = timeStr.split(':');
      const hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      const minutesPad = minutes.toString().padStart(2, '0');
      const hoursPad = hours12.toString().padStart(2, '0');
      return `${hoursPad}:${minutesPad} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  }




  const [guestName, setGuestName] = useState('')
  const [selectedGuestId, setSelectedGuestId] = useState<string | undefined>(undefined)
  const [guestPhone, setGuestPhone] = useState('')
  const [guestAddress, setGuestAddress] = useState('')
  const [guestAge, setGuestAge] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeSearchField, setActiveSearchField] = useState<'name' | 'phone' | null>(null)
  const [recentGuests, setRecentGuests] = useState<{ id: string; name: string; phone: string; address?: string | null; age?: number | null }[]>([])
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  
  // Dynamic Room interface and states
  interface SelectedRoomConfig {
    id: string
    room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
    room_id: string
    adults: number
    children: number
    extra_beds: number
    room_price: number
    notes: string
  }

  const [selectedRooms, setSelectedRooms] = useState<SelectedRoomConfig[]>([
    {
      id: Math.random().toString(36).substring(2, 9),
      room_type: room?.room_type ?? 'AC Deluxe',
      room_id: room?.id ?? '',
      adults: 1,
      children: 0,
      extra_beds: 0,
      room_price: room?.base_price ?? 0,
      notes: '',
    }
  ])

  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isLoadingAvailableRooms, setIsLoadingAvailableRooms] = useState(false)

  const updateRoomConfig = (id: string, updates: Partial<SelectedRoomConfig>) => {
    setSelectedRooms(prev => prev.map(r => {
      if (r.id !== id) return r
      const newConfig = { ...r, ...updates }
      
      if (updates.room_type) {
        const selectedIds = prev.filter(x => x.id !== id && x.room_id).map(x => x.room_id)
        const filtered = availableRooms.filter(roomOpt => roomOpt.room_type === updates.room_type && !selectedIds.includes(roomOpt.id))
        
        if (filtered.length > 0) {
          newConfig.room_id = filtered[0].id
          newConfig.room_price = filtered[0].base_price
        } else {
          newConfig.room_id = ''
          newConfig.room_price = 0
        }
      }
      
      if (updates.room_id) {
        const found = availableRooms.find(roomOpt => roomOpt.id === updates.room_id)
        if (found) {
          newConfig.room_price = found.base_price
        }
      }
      
      return newConfig
    }))
  }

  const addRoomConfig = () => {
    const selectedIds = selectedRooms.map(r => r.room_id)
    const nextAvail = availableRooms.find(r => !selectedIds.includes(r.id))
    const type = nextAvail?.room_type ?? 'AC Deluxe'
    const id = nextAvail?.id ?? ''
    const price = nextAvail?.base_price ?? 0
    
    setSelectedRooms(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        room_type: type,
        room_id: id,
        adults: 1,
        children: 0,
        extra_beds: 0,
        room_price: price,
        notes: ''
      }
    ])
  }

  const removeRoomConfig = (id: string) => {
    if (selectedRooms.length <= 1) return
    setSelectedRooms(prev => prev.filter(r => r.id !== id))
  }

  const getRoomOptions = (configId: string) => {
    const selectedIds = selectedRooms
      .filter(r => r.id !== configId && r.room_id)
      .map(r => r.room_id)
    return availableRooms.filter(r => !selectedIds.includes(r.id))
  }

  // Dates — use initialDate (calendar-selected day) if provided, otherwise default to today
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const startDate = initialDate ? parse(initialDate, 'yyyy-MM-dd', new Date()) : now
  const initialCheckInDateStr = format(startDate, 'yyyy-MM-dd')
  const isInitialToday = initialCheckInDateStr === todayStr

  const [checkInDate, setCheckInDate] = useState(initialCheckInDateStr)
  const [checkInTime, setCheckInTime] = useState(isInitialToday ? format(now, 'HH:mm') : '12:00')
  
  const defaultCheckOut = addDays(startDate, 1)
  const [checkOutDate, setCheckOutDate] = useState(format(defaultCheckOut, 'yyyy-MM-dd'))
  const [checkOutTime, setCheckOutTime] = useState(isInitialToday ? format(now, 'HH:mm') : '11:00')

  // Additional Fields
  const [occupation, setOccupation] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'IDFC' | 'Pending'>('Pending')
  const [depositAmount, setDepositAmount] = useState<string | number>(0)
  
  // Documents
  const [selectedFiles, setSelectedFiles] = useState<LocalFile[]>([])
  const [guestPhoto, setGuestPhoto] = useState<LocalFile | { preview: string; file?: null } | null>(null)
  
  // Total Amount State (for editing)
  const [totalAmount, setTotalAmount] = useState<string | number>('')
  
  // Existing guest documents
  const [existingDocs, setExistingDocs] = useState<Document[]>([])
  
  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExtractingName, setIsExtractingName] = useState(false)
  const [activeKeypad, setActiveKeypad] = useState<'total' | 'deposit' | 'phone' | 'age' | string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
        const results = await searchCustomers(query)
        setSearchResults(results)
        setShowDropdown(true)
      } catch (err) {
        console.error('Failed to search customers', err)
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [guestName, guestPhone, activeSearchField])

  // Update checkInTime and checkOutTime when checkInDate changes (today vs future date)
  useEffect(() => {
    if (!checkInDate) return
    const currentTodayStr = format(new Date(), 'yyyy-MM-dd')
    if (checkInDate === currentTodayStr) {
      const curTime = format(new Date(), 'HH:mm')
      setCheckInTime(curTime)
      setCheckOutTime(curTime)
    } else if (checkInDate > currentTodayStr) {
      setCheckInTime('12:00')
      setCheckOutTime('11:00')
    }
  }, [checkInDate])

  // Fetch available rooms whenever date or time selection changes
  useEffect(() => {
    if (!checkInDate || !checkOutDate) return

    let active = true
    const fetchRooms = async () => {
      setIsLoadingAvailableRooms(true)
      try {
        const effectiveCheckInTime = checkInTime || '12:00'
        const effectiveCheckOutTime = checkOutTime || effectiveCheckInTime
        const startISO = parse(`${checkInDate} ${effectiveCheckInTime}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const endISO = parse(`${checkOutDate} ${effectiveCheckOutTime}`, 'yyyy-MM-dd HH:mm', new Date()).toISOString()
        const res = await listAvailableRooms(startISO, endISO)
        if (active) {
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

  // Automatically fill in empty room IDs or update selected rooms if availableRooms changes
  useEffect(() => {
    if (availableRooms.length === 0) return
    setSelectedRooms(prev => prev.map(config => {
      if (config.room_id) {
        const isStillAvailable = availableRooms.some(r => r.id === config.room_id)
        if (isStillAvailable || (room && config.room_id === room.id)) {
          return config
        }
      }
      const selectedIds = prev.filter(x => x !== config && x.room_id).map(x => x.room_id)
      const filtered = availableRooms.filter(r => r.room_type === config.room_type && !selectedIds.includes(r.id))
      if (filtered.length > 0) {
        return {
          ...config,
          room_id: filtered[0].id,
          room_price: filtered[0].base_price
        }
      }
      return {
        ...config,
        room_id: '',
        room_price: 0
      }
    }))
  }, [availableRooms, room])

  // Synchronize calendar focus month when popover opens
  useEffect(() => {
    if (showDatePicker && checkInDate) {
      setPickerMonth(parse(checkInDate, 'yyyy-MM-dd', new Date()))
    }
  }, [showDatePicker, checkInDate])

  const effectiveCheckInTime = checkInTime || '12:00'
  const effectiveCheckOutTime = checkOutTime || effectiveCheckInTime
  const checkinDateTime = parse(`${checkInDate} ${effectiveCheckInTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const checkoutDateTime = parse(`${checkOutDate} ${effectiveCheckOutTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const nights = Math.max(1, differenceInCalendarDays(checkoutDateTime, checkinDateTime))
  // Check In Now button is only shown when check-in date is TODAY (walk-in or same-day arrival)
  const isCheckingInToday = checkInDate === format(new Date(), 'yyyy-MM-dd')

  const calculateRoomTotal = (rConfig: SelectedRoomConfig) => {
    const foundRoom = availableRooms.find(r => r.id === rConfig.room_id)
    const extraBedPrice = foundRoom?.extra_bed_price ?? 500
    const extraBedTotal = rConfig.extra_beds * extraBedPrice * nights
    return (rConfig.room_price * nights) + extraBedTotal
  }

  const defaultTotalAmount = selectedRooms.reduce((acc, r) => acc + calculateRoomTotal(r), 0)

  // Sync state with calculated total, but only when base factors change
  useEffect(() => {
    setTotalAmount(defaultTotalAmount)
  }, [defaultTotalAmount])

  // Load existing guest documents
  useEffect(() => {
    if (selectedGuestId) {
      listCustomerDocs(selectedGuestId)
        .then((docs: Document[]) => {
          setExistingDocs(docs)
          const photoDoc = docs.find(d => d.doc_type === 'customer_photo')
          if (photoDoc) {
            setGuestPhoto({ preview: photoDoc.public_url || '', file: null })
          } else {
            setGuestPhoto(null)
          }
        })
        .catch((err: any) => {
          console.error('Failed to load customer documents', err)
          setGuestPhoto(null)
        })
    } else {
      setExistingDocs([])
      setGuestPhoto(null)
    }
  }, [selectedGuestId])

  const selectGuest = async (guest: { id: string; name: string; phone: string; address?: string | null; age?: number | null }) => {
    setSelectedGuestId(guest.id)
    setGuestName(guest.name)
    setGuestPhone(guest.phone)
    setGuestAddress(guest.address || '')
    setGuestAge(guest.age !== undefined && guest.age !== null ? String(guest.age) : '')
    setShowDropdown(false)
    setActiveSearchField(null)

    // Fetch and prefill last known occupation
    try {
      const bookings = await getCustomerBookings(guest.id)
      if (bookings && bookings.length > 0) {
        const lastWithOccupation = bookings.find(b => b.occupation && b.occupation.trim())
        if (lastWithOccupation?.occupation) {
          setOccupation(lastWithOccupation.occupation)
        }
      }
    } catch (err: any) {
      console.error('Failed to prefill customer occupation from last bookings', err)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const rawFiles = Array.from(e.target.files) as File[]
      const compressed = await compressImages(rawFiles)
      const filesArr = compressed.map((file: File) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      }))
      setSelectedFiles(prev => [...prev, ...filesArr])
    }
  }

  const extractGuestDetails = async () => {
    if (selectedFiles.length === 0) return
    setIsExtractingName(true)
    const toastId = toast.loading(language === 'mr' ? 'ओळखपत्रातून माहिती शोधत आहे...' : 'Extracting details from ID...')
    try {
      const filesToExtract = selectedFiles.map(lf => lf.file)
      const details = await extractNameFromId(filesToExtract)
      if (details && details.name && details.name.trim()) {
        setGuestName(details.name.trim())
        if (details.address) {
          setGuestAddress(details.address.trim())
        }
        if (details.age !== undefined && details.age !== null) {
          setGuestAge(String(details.age))
        }
        toast.success(
          language === 'mr' 
            ? `माहिती मिळाली!` 
            : `Extracted details successfully`,
          { id: toastId }
        )
      } else {
        toast.error(
          language === 'mr'
            ? 'माहिती शोधता आली नाही. कृपया स्वतः टाईप करा.'
            : 'Could not extract customer details. Please enter manually.',
          { id: toastId }
        )
      }
    } catch (err) {
      console.error('Failed to extract details', err)
      toast.error(
        language === 'mr'
          ? 'माहिती शोधण्यात अडचण आली'
          : 'Error extracting details',
        { id: toastId }
      )
    } finally {
      setIsExtractingName(false)
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

  const handleGuestPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const compressed = await compressImage(file)
      setGuestPhoto({
        file: compressed,
        preview: URL.createObjectURL(compressed)
      })
    }
  }

  const saveToRecentGuests = (guest: { id: string; name: string; phone: string; address?: string | null; age?: number | null }) => {
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

          <button
            type="button"
            onClick={() => {
              if (checkInDate && !checkOutDate) {
                const ci = parse(checkInDate, 'yyyy-MM-dd', new Date())
                setCheckOutDate(format(addDays(ci, 1), 'yyyy-MM-dd'))
              }
              setShowDatePicker(false)
            }}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-sm font-black text-slate-950 rounded-2xl transition duration-150 text-center shadow-lg shadow-emerald-500/20"
          >
            {language === 'mr' 
              ? `पूर्ण (${tempNights || 1} रात्र)` 
              : `Done (${tempNights || 1} ${(tempNights || 1) === 1 ? 'Night' : 'Nights'})`}
          </button>

        </div>
      </div>
    )
  }

  const handleSubmit = async (paymentStatus: 'reserved' | 'paid' | 'unpaid' | 'partial') => {
    if (!guestName.trim()) {
      toast.error(language === 'mr' ? 'ग्राहकाचे नाव आवश्यक आहे' : 'Customer Name is required')
      return
    }
    if (!guestPhone.trim()) {
      toast.error(language === 'mr' ? 'मोबाईल नंबर आवश्यक आहे' : 'Phone Number is required')
      return
    }

    const invalidRoom = selectedRooms.some(r => !r.room_id)
    if (invalidRoom) {
      toast.error(language === 'mr' ? 'कृपया सर्व खोल्या निवडा' : 'Please select a room number for all rooms')
      return
    }

    setIsSubmitting(true)

    try {
      const checkInISO = checkinDateTime.toISOString()
      const checkOutISO = checkoutDateTime.toISOString()

      const payload = {
        rooms: selectedRooms.map(r => ({
          room_id: r.room_id,
          room_type: r.room_type,
          adults: r.adults,
          children: r.children,
          extra_beds: r.extra_beds,
          room_price: r.room_price,
          notes: r.notes || undefined,
        })),
        customer_id: selectedGuestId,
        customer_name: guestName,
        customer_phone: guestPhone,
        customer_address: guestAddress || undefined,
        customer_age: guestAge ? Number(guestAge) : undefined,
        check_in: checkInISO,
        check_out: checkOutISO,
        payment_mode: paymentMode,
        payment_status: paymentStatus,
        deposit_amount: (paymentStatus === 'partial' || paymentMode === 'Pending' || paymentStatus === 'reserved')
          ? (Number(depositAmount) || 0)
          : 0,
        occupation: occupation || undefined,
        notes: notes || undefined,
        total_amount: Number(totalAmount) || 0,
        is_checked_in: paymentStatus !== 'reserved',
      }

      const bookings = await createBookingsBatch(payload)

      if (bookings && bookings.length > 0) {
        localStorage.setItem('last_payment_mode', paymentMode)
        saveToRecentGuests({
          id: bookings[0].customer_id,
          name: guestName,
          phone: guestPhone,
        })

        // Upload documents if any (link to first booking in batch)
        if (selectedFiles.length > 0) {
          toast.loading(language === 'mr' ? 'ओळखपत्रे अपलोड होत आहेत...' : 'Uploading ID documents...', { id: 'upload' })
          for (const localFile of selectedFiles) {
            const { upload_url, document_id } = await getUploadUrl(
              bookings[0].id,
              bookings[0].customer_id,
              localFile.file.name,
              localFile.file.type
            )
            await uploadFileToR2(upload_url, localFile.file)
            await confirmUpload(document_id)
          }
          toast.success(language === 'mr' ? 'ओळखपत्रे यशस्वीरित्या अपलोड झाली' : 'Documents uploaded successfully', { id: 'upload' })
        }

        // Upload guest photo if any
        if (guestPhoto && guestPhoto.file) {
          toast.loading(language === 'mr' ? 'ग्राहकाचा फोटो अपलोड होत आहे...' : 'Uploading customer photo...', { id: 'guest-photo-upload' })
          try {
            const { upload_url, document_id } = await getUploadUrl(
              bookings[0].id,
              bookings[0].customer_id,
              guestPhoto.file.name || 'customer_photo.jpg',
              guestPhoto.file.type || 'image/jpeg',
              'customer_photo'
            )
            await uploadFileToR2(upload_url, guestPhoto.file)
            await confirmUpload(document_id)
            toast.success(language === 'mr' ? 'ग्राहकाचा फोटो यशस्वीरित्या अपलोड झाला' : 'Customer photo uploaded successfully', { id: 'guest-photo-upload' })
          } catch (photoErr) {
            console.error('Failed to upload customer photo', photoErr)
            toast.error(language === 'mr' ? 'ग्राहकाचा फोटो अपलोड करण्यात अडचण आली' : 'Failed to upload customer photo', { id: 'guest-photo-upload' })
          }
        }
      }

      toast.success(paymentStatus === 'reserved' 
        ? (language === 'mr' ? 'खोल्या यशस्वीरित्या आरक्षित केल्या गेल्या!' : 'Rooms reserved successfully!') 
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm animate-fade-in" style={viewport ? { height: `${viewport.height}px`, top: `${viewport.offsetTop}px`, bottom: 'auto' } : { height: '100dvh' }}>
      {/* Main Full-Screen Form */}
      <div className="relative w-full flex flex-col bg-slate-900 shadow-2xl" style={viewport ? { height: `${viewport.height}px` } : { height: '100dvh' }}>

        {/* Header */}
        <div className="p-4 md:p-6 pb-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-100 flex items-center gap-2">
                {language === 'mr' ? 'बुक आणि ब्लॉक' : 'Book & Block'}
                <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg text-xs font-black">
                  {language === 'mr' 
                    ? `${selectedRooms.length} खोल्या` 
                    : `${selectedRooms.length} Room(s)`}
                </span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-805 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Unified Date & Time Selector (Header Booking Summary Card) */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 select-none">
            {/* Check-In Column */}
            <div className="flex-1 flex flex-col items-start min-w-0">
              <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">
                {language === 'mr' ? 'चेक-इन' : 'CHECK-IN'}
              </span>
              <button
                type="button"
                onClick={() => setShowDatePicker(true)}
                className="mt-0.5 font-black text-slate-100 text-sm md:text-base hover:text-emerald-400 transition cursor-pointer text-left focus:outline-none"
              >
                {formatCardDate(checkInDate)}
              </button>
              <div className="relative mt-0.5 cursor-pointer flex items-center gap-1 group">
                <span className="text-emerald-400 font-extrabold text-xs group-hover:text-emerald-350 transition">
                  {formatTimeAMPM(checkInTime)}
                </span>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => {
                    const val = e.target.value
                    setCheckInTime(val)
                    setCheckOutTime(val)
                  }}
                  style={{ colorScheme: 'dark' }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* Arrow Spacer */}
            <div className="px-2 flex items-center justify-center">
              <span className="text-slate-600 font-bold text-sm">→</span>
            </div>

            {/* Check-Out Column */}
            <div className="flex-1 flex flex-col items-start min-w-0">
              <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">
                {language === 'mr' ? 'चेक-आउट' : 'CHECK-OUT'}
              </span>
              <button
                type="button"
                onClick={() => setShowDatePicker(true)}
                className="mt-0.5 font-black text-slate-100 text-sm md:text-base hover:text-amber-400 transition cursor-pointer text-left focus:outline-none"
              >
                {formatCardDate(checkOutDate)}
              </button>
              <div className="relative mt-0.5 cursor-pointer flex items-center gap-1 group">
                <span className="text-amber-400 font-extrabold text-xs group-hover:text-amber-350 transition">
                  {formatTimeAMPM(checkOutTime)}
                </span>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
            </div>

            {/* Vertical Separator */}
            <div className="h-8 w-px bg-slate-800/80 mx-2.5" />

            {/* Nights Column */}
            <div className="flex flex-col items-center justify-center min-w-[45px]">
              <span className="text-base font-black text-slate-100 leading-none">
                {nights}
              </span>
              <span className="text-[8px] text-slate-500 font-extrabold uppercase tracking-wider mt-1">
                {language === 'mr' ? 'रात्र' : (nights === 1 ? 'NIGHT' : 'NIGHTS')}
              </span>
            </div>
          </div>
        </div>

        {/* Form Body - Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 pb-10 space-y-5">

          {/* Dynamic Room Configuration List */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {language === 'mr' ? 'खोल्यांची निवड' : 'Rooms Selected'} ({selectedRooms.length})
              </span>
              <button
                type="button"
                onClick={addRoomConfig}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-extrabold rounded-xl transition border border-emerald-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                {language === 'mr' ? 'खोली जोडा' : 'Add Room'}
              </button>
            </div>

            {selectedRooms.map((config, index) => {
              const options = getRoomOptions(config.id)
              return (
                <div key={config.id} className="relative flex flex-col gap-3.5 p-4 bg-slate-950/20 rounded-2xl border border-slate-800/80">
                  {selectedRooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoomConfig(config.id)}
                      className="absolute top-3 right-3 text-rose-500/80 hover:text-rose-400 text-xs font-extrabold flex items-center gap-0.5 p-1 rounded hover:bg-rose-500/10 transition"
                    >
                      <Minus className="h-3 w-3" />
                      {language === 'mr' ? 'काढा' : 'Remove'}
                    </button>
                  )}

                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {language === 'mr' ? `खोली ${index + 1}` : `Room ${index + 1}`}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('room_type')}</span>
                      <select
                        value={config.room_type}
                        onChange={(e) => updateRoomConfig(config.id, { room_type: e.target.value as any })}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-semibold h-[46px] select-dark"
                      >
                        <option value="AC Deluxe">AC Deluxe</option>
                        <option value="Non AC Deluxe">Non AC Deluxe</option>
                        <option value="VIP AC Suite">VIP AC Suite</option>
                        <option value="VIP Non AC Suite">VIP Non AC Suite</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {language === 'mr' ? 'खोली क्रमांक' : 'Room Number'}
                      </span>
                      <SearchableRoomSelect
                        value={config.room_id}
                        options={options}
                        isLoading={isLoadingAvailableRooms}
                        onChange={(roomId) => updateRoomConfig(config.id, { room_id: roomId })}
                        placeholder={language === 'mr' ? 'खोली निवडा' : 'Select room'}
                        language={language}
                      />
                    </div>
                  </div>

                  {/* Steppers & Price for this Room */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'प्रौढ' : 'Adults'}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{language === 'mr' ? 'मुले' : 'Children'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1 h-[38px]">
                          <button
                            type="button"
                            onClick={() => updateRoomConfig(config.id, { adults: Math.max(1, config.adults - 1) })}
                            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-xs font-bold text-slate-200">{config.adults}</span>
                          <button
                            type="button"
                            onClick={() => updateRoomConfig(config.id, { adults: config.adults + 1 })}
                            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1 h-[38px]">
                          <button
                            type="button"
                            onClick={() => updateRoomConfig(config.id, { children: Math.max(0, config.children - 1) })}
                            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-xs font-bold text-slate-200">{config.children}</span>
                          <button
                            type="button"
                            onClick={() => updateRoomConfig(config.id, { children: config.children + 1 })}
                            className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                        <span>{language === 'mr' ? 'अतिरिक्त बेड' : 'Extra Beds'}</span>
                        <span className="text-[9px] text-slate-500 lowercase font-medium">
                          +₹{availableRooms.find(r => r.id === config.room_id)?.extra_bed_price ?? 500}{language === 'mr' ? '/रात्र' : '/night'}
                        </span>
                      </span>
                      <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1 h-[38px]">
                        <button
                          type="button"
                          onClick={() => updateRoomConfig(config.id, { extra_beds: Math.max(0, config.extra_beds - 1) })}
                          className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="text-xs font-bold text-slate-200">{config.extra_beds}</span>
                        <button
                          type="button"
                          onClick={() => updateRoomConfig(config.id, { extra_beds: config.extra_beds + 1 })}
                          className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {language === 'mr' ? 'खोली भाडे (₹/रात्र)' : 'Room Price (₹/Night)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveKeypad(`room_price_${config.id}`)}
                      className={`w-full flex items-center gap-1.5 rounded-2xl px-3 py-2 border text-xs h-[38px] transition active:scale-[0.98] ${
                        activeKeypad === `room_price_${config.id}`
                          ? 'bg-emerald-500/10 border-emerald-400/60 ring-2 ring-emerald-500/20'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <span className="text-emerald-400 font-black text-sm">₹</span>
                      <span className="flex-1 text-left font-black text-slate-100">{config.room_price || 0}</span>
                      <span className="text-[9px] text-slate-500 font-bold">EDIT</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ID Capture / Upload section (Autofill) */}
          <div className="flex flex-col gap-1.5 p-4 bg-slate-950/40 rounded-2xl border border-slate-800/80">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>{language === 'mr' ? 'ओळखपत्र अपलोड करा' : 'ID Documentation'}</span>
            </span>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <label className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Camera className="h-4 w-4 text-slate-500" />
                {language === 'mr' ? 'फोटो काढा' : 'Capture ID'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
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
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isExtractingName}
                />
              </label>
            </div>

            {/* Selected File Thumbnails & Extraction Trigger */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex flex-wrap gap-2">
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
                <button
                  type="button"
                  onClick={extractGuestDetails}
                  disabled={isExtractingName}
                  className="w-full mt-1.5 py-2.5 px-4 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-black rounded-2xl transition border border-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {isExtractingName ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {language === 'mr' ? 'माहिती शोधत आहे...' : 'Extracting details...'}
                    </>
                  ) : (
                    <>
                      <span className="text-xs">🔍</span>
                      {language === 'mr' ? 'ओळखपत्रातून माहिती मिळवा' : 'Extract Info from IDs'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Existing Guest Documents — grouped with ID Documentation */}
          {selectedGuestId && existingDocs.length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {language === 'mr' ? 'सिस्टममध्ये उपलब्ध ओळखपत्रे' : 'Existing ID Proofs on File'}
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {existingDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedDoc(doc)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-800 bg-slate-955 flex items-center justify-center hover:border-emerald-500 transition group"
                  >
                    {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                      <FileText className="h-5 w-5 text-slate-400" />
                    ) : (
                      <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Guest Name & Phone container for shared click-outside reference */}
          <div className="flex flex-col gap-5" ref={dropdownRef}>
            {/* Guest Name & Autocomplete */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'ग्राहकाचे नाव' : 'Customer Name'}</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    placeholder={language === 'mr' ? 'ग्राहकाचे नाव शोधा किंवा टाका' : 'Search or enter customer name'}
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
                  {activeSearchField === 'name' && showDropdown && searchResults.length > 0 && (
                    <div className="absolute top-[52px] z-50 w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
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
                
                {/* Guest Photo camera box */}
                <div className="relative flex-shrink-0 w-[46px] h-[46px]">
                  <label className="w-full h-full flex items-center justify-center bg-slate-950 border border-slate-800 hover:border-emerald-500 rounded-2xl cursor-pointer overflow-hidden transition group">
                    {guestPhoto ? (
                      <img src={guestPhoto.preview} alt="Guest" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 transition" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleGuestPhotoChange}
                    />
                  </label>
                  {guestPhoto && (
                    <button
                      type="button"
                      onClick={() => setGuestPhoto(null)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Phone Number */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('mobile_number')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  readOnly
                  placeholder={language === 'mr' ? '१०-अंकी मोबाईल नंबर' : '10-digit mobile number'}
                  value={guestPhone}
                  onClick={() => {
                    setActiveKeypad('phone')
                    setActiveSearchField('phone')
                    setShowDropdown(true)
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
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

            {/* Address */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'पत्ता' : 'Address'}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 pt-3.5 flex items-start pointer-events-none">
                  <MapPin className="h-4 w-4 text-slate-500" />
                </span>
                <textarea
                  rows={2}
                  placeholder={language === 'mr' ? 'पत्ता प्रविष्ट करा' : 'Enter address'}
                  value={guestAddress}
                  onChange={(e) => setGuestAddress(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm resize-none"
                />
              </div>
            </div>

            {/* Age */}
            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'वय' : 'Age'}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  readOnly
                  placeholder={language === 'mr' ? 'वय टाका' : 'Enter age'}
                  value={guestAge}
                  onClick={() => setActiveKeypad('age')}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Occupation (Full Width) */}
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

          {/* Reason of Visit (Full Width) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{language === 'mr' ? 'भेट देण्याचे कारण' : 'Reason of Visit (Max 150 chars)'}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <FileText className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder={language === 'mr' ? 'उदा. पर्यटन / वैयक्तिक काम / व्यवसाय' : 'e.g. Tourism / Personal / Business'}
                value={notes}
                maxLength={150}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm h-[46px]"
              />
            </div>
          </div>





          {/* ——— Billing & Book Room Section (Inline at end of all boxes) ——— */}
          {(() => {
            const total = Number(totalAmount) || 0
            const paid = paymentMode !== 'Pending' && Number(depositAmount) === 0
              ? total
              : Math.min(Number(depositAmount) || 0, total)
            const due = Math.max(0, total - paid)

            // Dynamic payment status label
            let statusLabelEn = 'PENDING PAYMENT'
            let statusLabelMr = 'पेमेंट बाकी'
            let statusColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20'

            if (due === 0 && total > 0) {
              statusLabelEn = '✓ FULLY PAID'
              statusLabelMr = '✓ पूर्ण भरले'
              statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            } else if (paid > 0 && due > 0) {
              statusLabelEn = 'PARTIAL PAYMENT'
              statusLabelMr = 'अंशतः जमा'
              statusColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20'
            }

            const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0

            return (
              <div className="mt-2 border border-slate-800 bg-slate-950/40 rounded-3xl overflow-hidden shadow-2xl flex flex-col flex-shrink-0">
                
                {/* Header Strip with Status Badge */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-b border-slate-800">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    💰 {language === 'mr' ? 'बिल आणि पेमेंट' : 'Billing & Payment'}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${statusColor}`}>
                    {language === 'mr' ? statusLabelMr : statusLabelEn}
                  </span>
                </div>

                {/* Receipt Card Body */}
                <div className="p-4 flex flex-col gap-4">
                  {/* Row 1: Total Bill */}
                  <div className="flex justify-between items-center bg-slate-900/20 p-3 rounded-2xl border border-slate-800/40">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {language === 'mr' ? 'एकूण बिल' : 'Total Bill'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveKeypad('total')}
                        className="flex items-baseline gap-1 mt-0.5 group text-left"
                      >
                        <span className="text-sm font-black text-slate-400">₹</span>
                        <span className="text-2xl font-black text-slate-100 min-w-[3rem] border-b-2 border-dashed border-slate-700 group-hover:border-amber-500/50 transition-colors pb-0.5">
                          {totalAmount || '0'}
                        </span>
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                        {language === 'mr' ? 'कालावधी' : 'Duration'}
                      </span>
                      <span className="text-xs font-black text-slate-300 mt-1 block">
                        {language === 'mr' 
                          ? `${selectedRooms.length} खोल्या × ${nights} रात्र` 
                          : `${selectedRooms.length} room(s) × ${nights} night(s)`}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Payment Method */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {language === 'mr' ? 'पेमेंट कसे?' : 'Payment Method'}
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Cash', 'UPI', 'IDFC', 'Pending'] as const).map((mode) => {
                        let activeStyle = ''
                        let modeIcon = ''
                        let modeLabel: string = mode

                        if (mode === 'Cash') {
                          modeIcon = '💵'
                          modeLabel = language === 'mr' ? 'कॅश' : 'Cash'
                          activeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                        } else if (mode === 'UPI') {
                          modeIcon = '📱'
                          modeLabel = 'UPI'
                          activeStyle = 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                        } else if (mode === 'IDFC') {
                          modeIcon = '🏦'
                          modeLabel = 'IDFC'
                          activeStyle = 'bg-purple-500/15 text-purple-400 border-purple-500/40'
                        } else {
                          modeIcon = '⏳'
                          modeLabel = language === 'mr' ? 'बाकी' : 'Pending'
                          activeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                        }

                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setPaymentMode(mode)
                              if (mode !== 'Pending') setDepositAmount(0)
                            }}
                            className={`py-2 rounded-xl border text-[10px] font-black transition-all duration-200 flex flex-col items-center gap-1 justify-center ${
                              paymentMode === mode
                                ? activeStyle
                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <span className="text-sm">{modeIcon}</span>
                            <span>{modeLabel}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Row 3: Advance Received Input */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {language === 'mr' ? 'जमा रक्कम (₹)' : 'Advance Paid (₹)'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveKeypad('deposit')}
                        className={`w-full flex items-center gap-2 rounded-2xl px-3 py-3 border transition active:scale-[0.98] ${
                          activeKeypad === 'deposit'
                            ? paymentMode === 'Pending'
                              ? 'bg-amber-500/10 border-amber-400/60 ring-2 ring-amber-500/20'
                              : 'bg-emerald-500/10 border-emerald-400/60 ring-2 ring-emerald-500/20'
                            : paymentMode === 'Pending'
                            ? 'bg-slate-900 border-amber-500/30'
                            : 'bg-slate-900 border-emerald-500/20'
                        }`}
                      >
                        <span className={`text-sm font-black ${paymentMode === 'Pending' ? 'text-amber-400' : 'text-emerald-400'}`}>₹</span>
                        <span className="flex-1 text-left text-sm font-black text-slate-100">
                          {depositAmount === 0 || depositAmount === '' ? (
                            <span className="text-slate-500 font-medium text-xs">
                              {paymentMode !== 'Pending' ? String(totalAmount || 0) : (language === 'mr' ? 'रक्कम टाका' : 'Enter amount')}
                            </span>
                          ) : depositAmount}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'EDIT'}</span>
                      </button>
                    </div>

                    {/* Due/Remaining Summary */}
                    <div className="flex flex-col justify-end h-full">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                        <span>{language === 'mr' ? 'भरले: ' : 'Paid: '}₹{paid}</span>
                        <span>{language === 'mr' ? 'बाकी: ' : 'Due: '}₹{due}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-1">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right">
                        {due > 0 ? (
                          <span className="text-[10px] font-black text-rose-400">
                            ₹{due} {language === 'mr' ? 'देणे बाकी' : 'Remaining Due'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-400">
                            ✓ {language === 'mr' ? 'पूर्ण भरले' : 'Fully Settled'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 4: Action Buttons */}
                <div className="p-4 pt-0 flex flex-col gap-2.5 bg-slate-900/20">
                  {isCheckingInToday ? (
                    <>
                      {/* Primary: Block & Check In */}
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          const depositAmt = Number(depositAmount) || 0
                          const totalAmt = Number(totalAmount) || 0
                          const isPartial = depositAmt > 0 && depositAmt < totalAmt
                          if (paymentMode === 'Pending') {
                            handleSubmit(isPartial ? 'partial' : 'unpaid')
                          } else {
                            handleSubmit(isPartial ? 'partial' : 'paid')
                          }
                        }}
                        className="w-full py-4 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 rounded-2xl transition disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-emerald-500/20"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                        ) : (
                          <span className="text-xl flex-shrink-0">✅</span>
                        )}
                        <div className="flex flex-col items-start text-left gap-0.5 flex-1">
                          <span className="text-base font-black tracking-tight">
                            {language === 'mr' ? 'ब्लॉक & चेक-इन करा' : 'Block & Check In'}
                          </span>
                          <span className="text-[10px] text-emerald-950 font-bold uppercase tracking-wider">
                            {paymentMode === 'Pending'
                              ? (language === 'mr' ? `→ जमा रक्कम: ₹${paid} · देणे बाकी: ₹${due}` : `→ Advance: ₹${paid} · Due: ₹${due}`)
                              : due > 0
                              ? (language === 'mr' ? `→ ${paymentMode} द्वारे जमा ₹${paid} · बाकी ₹${due}` : `→ Advance ₹${paid} via ${paymentMode} · Due ₹${due}`)
                              : (language === 'mr' ? `→ ${paymentMode} द्वारे पूर्ण भरले (₹${total})` : `→ Fully Paid via ${paymentMode} (₹${total})`)}
                          </span>
                        </div>
                        <span className="text-lg font-black bg-emerald-600/30 px-3 py-1 rounded-xl border border-emerald-600/10">
                          ₹{total}
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                          <span>⏳</span>
                          {language === 'mr'
                            ? 'ग्राहक नंतर येणार आहेत — खोली आरक्षित होईल'
                            : 'Customer arrives later — room will be reserved until check-in'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSubmit('reserved')}
                        className="w-full py-4 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 rounded-2xl transition disabled:opacity-50 flex items-center gap-3 shadow-xl shadow-emerald-500/20"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                        ) : (
                          <CalendarIcon className="h-5 w-5 text-slate-950 flex-shrink-0" />
                        )}
                        <div className="flex flex-col items-start text-left gap-0.5 flex-1">
                          <span className="text-base font-black tracking-tight">
                            {language === 'mr' ? 'खोली बुक करा' : 'Book Room Now'}
                          </span>
                          <span className="text-[10px] text-emerald-950 font-bold uppercase tracking-wider">
                            {paymentMode === 'Pending'
                              ? (language === 'mr' ? `→ जमा रक्कम: ₹${paid} · देणे बाकी: ₹${due}` : `→ Advance: ₹${paid} · Due: ₹${due}`)
                              : due > 0
                              ? (language === 'mr' ? `→ ${paymentMode} द्वारे जमा ₹${paid} · बाकी ₹${due}` : `→ Advance ₹${paid} via ${paymentMode} · Due ₹${due}`)
                              : (language === 'mr' ? `→ ${paymentMode} द्वारे पूर्ण भरले (₹${total})` : `→ Fully Paid via ${paymentMode} (₹${total})`)}
                          </span>
                        </div>
                        <span className="text-lg font-black bg-emerald-600/30 px-3 py-1 rounded-xl border border-emerald-600/10">
                          ₹{total}
                        </span>
                      </button>
                    </>
                  )}
                </div>

              </div>
            )
          })()}

        </div> {/* End of scrollable body */}
      </div>
      {renderDatePickerModal()}
      {selectedDoc && (
        <DocumentLightbox
          docUrl={selectedDoc.public_url || ''}
          fileName={selectedDoc.file_name}
          guestName={guestName || undefined}
          roomNumber={
            selectedRooms
              .map(config => {
                const matchedRoom = availableRooms.find(r => r.id === config.room_id) || (room?.id === config.room_id ? room : null)
                return matchedRoom ? matchedRoom.number : ''
              })
              .filter(Boolean)
              .join(', ') || room?.number || undefined
          }
          docType={selectedDoc.doc_type}
          onClose={() => setSelectedDoc(null)}
        />
      )}
      {activeKeypad !== null && (
        <NumericKeypad
          value={
            activeKeypad === 'total'
              ? totalAmount
              : activeKeypad === 'deposit'
              ? depositAmount
              : activeKeypad === 'phone'
              ? guestPhone
              : activeKeypad === 'age'
              ? guestAge
              : activeKeypad.startsWith('room_price_')
              ? (selectedRooms.find(r => `room_price_${r.id}` === activeKeypad)?.room_price ?? 0)
              : ''
          }
          onDone={(val) => {
            if (activeKeypad === 'total') {
              setTotalAmount(val === '' ? '' : val.replace(/^0+/, '') || '0')
            } else if (activeKeypad === 'deposit') {
              setDepositAmount(val === '' ? 0 : (val.replace(/^0+/, '') || 0))
            } else if (activeKeypad === 'phone') {
              setGuestPhone(val)
              setSelectedGuestId(undefined)
              setActiveSearchField('phone')
            } else if (activeKeypad === 'age') {
              setGuestAge(val)
            } else if (activeKeypad.startsWith('room_price_')) {
              const configId = activeKeypad.replace('room_price_', '')
              updateRoomConfig(configId, { room_price: Number(val) || 0 })
            }
            setActiveKeypad(null)
          }}
          onClose={() => setActiveKeypad(null)}
          label={
            activeKeypad === 'total'
              ? (language === 'mr' ? 'एकूण बिल' : 'Total Bill')
              : activeKeypad === 'deposit'
              ? (language === 'mr' ? 'आता मिळाले' : 'Collected Now')
              : activeKeypad === 'phone'
              ? (language === 'mr' ? 'मोबाईल नंबर' : 'Mobile Number')
              : activeKeypad === 'age'
              ? (language === 'mr' ? 'वय' : 'Age')
              : activeKeypad.startsWith('room_price_')
              ? (language === 'mr' ? 'खोली भाडे (₹/रात्र)' : 'Room Price (per Night)')
              : (language === 'mr' ? 'संख्या टाका' : 'Enter Number')
          }
          keypadType={
            activeKeypad === 'phone'
              ? 'phone'
              : activeKeypad === 'age'
              ? 'number'
              : 'currency'
          }
          language={language}
        />
      )}
    </div>,
    document.body
  )
}

function SearchableRoomSelect({
  value,
  options,
  onChange,
  isLoading,
  placeholder,
  language
}: {
  value: string
  options: Room[]
  onChange: (id: string) => void
  isLoading: boolean
  placeholder: string
  language: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedRoom = options.find(o => o.id === value)

  useEffect(() => {
    if (selectedRoom) {
      setSearchTerm(selectedRoom.number)
    } else {
      setSearchTerm('')
    }
  }, [value, selectedRoom])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm(selectedRoom?.number ?? '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedRoom])

  const filteredOptions = options.filter(o => 
    o.number.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        placeholder={isLoading ? (language === 'mr' ? 'लोड होत आहे...' : 'Loading...') : placeholder}
        value={searchTerm}
        disabled={isLoading}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setSearchTerm(e.target.value)
          setIsOpen(true)
        }}
        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-semibold h-[46px] select-dark disabled:opacity-50"
      />
      {isOpen && (
        <div className="absolute top-[50px] left-0 z-50 w-full max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-xl">
          {isLoading ? (
            <div className="px-4 py-3 text-xs text-slate-500">{language === 'mr' ? 'लोड होत आहे...' : 'Loading...'}</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">{language === 'mr' ? 'कोणतीही खोली उपलब्ध नाही' : 'No rooms available'}</div>
          ) : (
            filteredOptions.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange(r.id)
                  setSearchTerm(r.number)
                  setIsOpen(false)
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-900 transition flex justify-between items-center"
              >
                <span className="font-bold">{r.number}</span>
                <span className="text-[10px] text-slate-500">{r.room_type}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
