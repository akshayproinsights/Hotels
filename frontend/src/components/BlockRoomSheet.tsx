import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { X, User, Phone, Calendar as CalendarIcon, Bed, Plus, Minus, Camera, Upload, Briefcase, FileText, Loader2 } from 'lucide-react'
import { format, addDays, differenceInCalendarDays, parse } from 'date-fns'
import toast from 'react-hot-toast'
import type { InventoryRoom } from '../types'
import { searchGuests } from '../api/guests'
import { createBooking } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload } from '../api/documents'

interface BlockRoomSheetProps {
  room: InventoryRoom
  onClose: () => void
  onSuccess: () => void
}

interface LocalFile {
  file: File
  preview: string
}

export default function BlockRoomSheet({ room, onClose, onSuccess }: BlockRoomSheetProps) {
  const [guestName, setGuestName] = useState('')
  const [selectedGuestId, setSelectedGuestId] = useState<string | undefined>(undefined)
  const [guestPhone, setGuestPhone] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; phone: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [recentGuests, setRecentGuests] = useState<{ id: string; name: string; phone: string }[]>([])
  
  // Steppers
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [extraBeds, setExtraBeds] = useState(0)

  // Dates
  const now = new Date()
  const defaultCheckInTime = format(now, 'HH:mm')
  const [checkInDate, setCheckInDate] = useState(format(now, 'yyyy-MM-dd'))
  const [checkInTime, setCheckInTime] = useState(defaultCheckInTime)
  
  const tomorrow = addDays(now, 1)
  const [checkOutDate, setCheckOutDate] = useState(format(tomorrow, 'yyyy-MM-dd'))
  const [checkOutTime, setCheckOutTime] = useState('11:00')

  // Additional Fields
  const [occupation, setOccupation] = useState('')
  const [notes, setNotes] = useState('')
  const [roomPrice, setRoomPrice] = useState(room.base_price)
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Pending'>('Cash')
  
  // Documents
  const [selectedFiles, setSelectedFiles] = useState<LocalFile[]>([])
  
  // Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
    if (guestName.length < 2) {
      setSearchResults([])
      return
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchGuests(guestName)
        setSearchResults(results)
        setShowDropdown(true)
      } catch (err) {
        console.error('Failed to search guests', err)
      }
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [guestName])

  // Computed Values
  const checkinDateTime = parse(`${checkInDate} ${checkInTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const checkoutDateTime = parse(`${checkOutDate} ${checkOutTime}`, 'yyyy-MM-dd HH:mm', new Date())
  const nights = Math.max(1, differenceInCalendarDays(checkoutDateTime, checkinDateTime))
  const extraBedTotal = extraBeds * room.extra_bed_price * nights
  const totalAmount = (roomPrice * nights) + extraBedTotal

  const selectGuest = (guest: { id: string; name: string; phone: string }) => {
    setSelectedGuestId(guest.id)
    setGuestName(guest.name)
    setGuestPhone(guest.phone)
    setShowDropdown(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = (Array.from(e.target.files) as File[]).map((file: File) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      }))
      setSelectedFiles(prev => [...prev, ...filesArr])
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

  const handleSubmit = async (paymentStatus: 'hold' | 'paid' | 'unpaid') => {
    if (!guestName.trim()) {
      toast.error('Guest Name is required')
      return
    }
    if (!guestPhone.trim()) {
      toast.error('Phone Number is required')
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Create booking payload
      const checkInISO = checkinDateTime.toISOString()
      const checkOutISO = checkoutDateTime.toISOString()

      const payload = {
        room_id: room.id,
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
        deposit_amount: paymentStatus === 'hold' ? 500 : 0, // default placeholder deposit for hold
        occupation: occupation || undefined,
        notes: notes || undefined,
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
        toast.loading('Uploading ID documents...', { id: 'upload' })
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
        toast.success('Documents uploaded successfully', { id: 'upload' })
      }

      toast.success(paymentStatus === 'hold' ? 'Room blocked successfully!' : 'Check-in completed successfully!')
      onSuccess()
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.response?.data?.detail || 'Failed to complete booking operation'
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Off-click dismiss zone */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Drawer Form */}
      <div className="glass-panel relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl p-6 flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-xl text-sm font-extrabold">
                Room {room.number}
              </span>
              Book & Block
            </h2>
            <p className="text-xs text-slate-500 mt-1">Ready for check-in on Floor {room.floor}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex flex-col gap-4">
          
          {/* Guest Name & Autocomplete */}
          <div className="relative flex flex-col gap-1.5" ref={dropdownRef}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Guest Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Search or enter guest name"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value)
                  setSelectedGuestId(undefined) // clear selection if typed
                }}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute top-[72px] z-50 w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                {searchResults.map((guest) => (
                  <button
                    key={guest.id}
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

          {/* Recent Guests Pills */}
          {recentGuests.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent Guests</span>
              <div className="flex flex-wrap gap-2">
                {recentGuests.map((guest) => (
                  <button
                    key={guest.phone}
                    type="button"
                    onClick={() => selectGuest(guest)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition border border-slate-800"
                  >
                    {guest.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phone Number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Phone className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="tel"
                placeholder="10-digit mobile number"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          </div>

          {/* Grid Layout: Room Type, Adults, Children */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Room Type</span>
              <div className="py-3 px-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl text-slate-400 text-sm font-semibold flex items-center gap-2">
                <Bed className="h-4 w-4 text-slate-500" />
                {room.room_type}
              </div>
            </div>

            {/* Steppers: Adults & Children */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Occupancy</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setAdults(prev => Math.max(1, prev - 1))}
                    className="p-2 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-bold text-slate-200">{adults}A</span>
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
                  <span className="text-sm font-bold text-slate-200">{children}C</span>
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
          </div>

          {/* Dates: Check-in / Check-out */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Check-in</span>
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Check-out</span>
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Compute Night Label */}
          <div className="flex justify-between items-center py-2 px-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              Duration of Stay:
            </span>
            <span className="text-sm font-extrabold text-emerald-300">
              {nights} {nights === 1 ? 'Night' : 'Nights'}
            </span>
          </div>

          {/* Extra Bed Stepper & Computed pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                <span>Extra Beds</span>
                <span className="text-[10px] text-slate-500 lowercase font-medium">+₹{room.extra_bed_price}/night</span>
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Room Price (₹/Night)</label>
              <input
                type="number"
                value={roomPrice}
                onChange={(e) => setRoomPrice(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm h-[46px]"
              />
            </div>
          </div>

          {/* Optional: Occupation & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Occupation</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Briefcase className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder="e.g. Business"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Notes (Max 150 chars)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FileText className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder="Additional request info"
                  value={notes}
                  maxLength={150}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Payment Mode Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment Mode</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Pending'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition duration-200 ${
                    paymentMode === mode
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* ID Capture / Upload section */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">ID Documentation</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Camera className="h-4 w-4 text-slate-500" />
                Capture ID
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  multiple
                />
              </label>
              <label className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Upload className="h-4 w-4 text-slate-500" />
                Upload Doc
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  multiple
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

          {/* Pricing Summary Card */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl mt-2 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Calculated Total</span>
              <div className="text-2xl font-black text-slate-200">₹{totalAmount}</div>
            </div>
            <div className="text-right text-xs text-slate-400 font-medium">
              <div>Base: ₹{roomPrice} × {nights}n</div>
              {extraBeds > 0 && <div>Extra Bed: ₹{extraBedTotal}</div>}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('hold')}
              className="py-3.5 px-4 bg-slate-800 hover:bg-slate-750 active:bg-slate-800 text-slate-200 text-sm font-bold rounded-2xl transition disabled:opacity-50 flex items-center justify-center gap-2 border border-slate-700/60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Block Room (Hold)
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(paymentMode === 'Pending' ? 'unpaid' : 'paid')}
              className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 text-sm font-black rounded-2xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Block & Check In
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
