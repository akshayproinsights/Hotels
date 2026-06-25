import * as React from 'react'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, User, Phone, CheckCircle, LogOut, FileText, Camera, Upload, ArrowRight, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { getBooking, updateBooking } from '../api/bookings'
import { getUploadUrl, uploadFileToR2, confirmUpload } from '../api/documents'

interface BookingDetailSheetProps {
  bookingId: string
  onClose: () => void
  onSuccess: () => void
}

export default function BookingDetailSheet({ bookingId, onClose, onSuccess }: BookingDetailSheetProps) {
  const queryClient = useQueryClient()
  const [showExtendInput, setShowExtendInput] = useState(false)
  const [newCheckOutDate, setNewCheckOutDate] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'Cash' | 'UPI'>('Cash')

  // Fetch full details of the booking
  const { data: booking, isLoading, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
  })

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateBooking>[1]) => updateBooking(bookingId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      // Invalidate reports caches so Reports page reflects latest payment data
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      toast.success('Booking updated successfully')
      refetch()
      onSuccess()
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.detail || 'Failed to update booking'
      toast.error(errorMsg)
    },
  })

  if (isLoading || !booking) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="glass-panel relative w-full max-w-lg rounded-t-3xl bg-slate-900 shadow-2xl p-6 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
          <span className="text-sm text-slate-400 font-semibold mt-4">Loading booking details...</span>
        </div>
      </div>
    )
  }

  const checkInFormatted = format(parseISO(booking.check_in), 'dd MMM yyyy, hh:mm a')
  const checkOutFormatted = format(parseISO(booking.check_out), 'dd MMM yyyy, hh:mm a')
  const pendingAmount = Math.max(0, booking.total_amount - booking.paid_amount)

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
    updateMutation.mutate({
      status: 'checked_out',
    })
  }

  const handleExtendStay = () => {
    if (!newCheckOutDate) {
      toast.error('Please select a valid date')
      return
    }
    // Set checkout date to selected date at 11:00 AM (default check-out time)
    const dateObj = new Date(`${newCheckOutDate}T11:00:00`)
    updateMutation.mutate({
      check_out: dateObj.toISOString(),
    })
    setShowExtendInput(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setIsUploading(true)
      const uploadToast = toast.loading('Uploading new ID document...')

      try {
        const { upload_url, document_id } = await getUploadUrl(
          booking.id,
          booking.guest_id,
          file.name,
          file.type
        )
        await uploadFileToR2(upload_url, file)
        await confirmUpload(document_id)
        toast.success('Document added successfully', { id: uploadToast })
        refetch()
      } catch (err) {
        console.error(err)
        toast.error('Failed to upload document', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  const getStatusBadgeStyles = () => {
    switch (booking.payment_status) {
      case 'hold':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
      case 'unpaid':
      case 'partial':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
      case 'paid':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
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
              <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-xl text-sm font-extrabold border border-slate-700">
                Room {booking.rooms?.number}
              </span>
              Booking Details
            </h2>
            <p className="text-xs text-slate-500 mt-1">Booking Ref: {booking.booking_number}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-col gap-5">
          {/* Guest Summary Card */}
          <div className="glass-panel p-4 rounded-2xl flex items-start justify-between bg-slate-950/40">
            <div>
              <div className="flex items-center gap-2 text-slate-200 font-extrabold text-base">
                <User className="h-4.5 w-4.5 text-slate-500" />
                {booking.guests?.name}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium mt-1">
                <Phone className="h-3.5 w-3.5 text-slate-500" />
                {booking.guests?.phone}
              </div>
              {booking.occupation && (
                <div className="text-xs text-slate-500 mt-2">
                  <span className="font-bold">Occupation:</span> {booking.occupation}
                </div>
              )}
            </div>
            <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg ${getStatusBadgeStyles()}`}>
              {booking.payment_status}
            </span>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-in</span>
              <span className="text-xs font-bold text-slate-200">{checkInFormatted}</span>
            </div>
            <div className="flex flex-col gap-1 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Check-out</span>
              <span className="text-xs font-bold text-slate-200">{checkOutFormatted}</span>
            </div>
          </div>

          {/* Pricing Ledger */}
          <div className="flex flex-col gap-3 p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
              <span>Nightly Rate</span>
              <span>₹{booking.room_price}</span>
            </div>
            {booking.extra_beds > 0 && (
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                <span>Extra Bed Rate ({booking.extra_beds} × ₹500)</span>
                <span>₹{booking.extra_bed_total}</span>
              </div>
            )}
            <div className="border-t border-slate-800/80 my-1" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300">Total Charged</span>
              <span className="text-sm font-extrabold text-slate-200">₹{booking.total_amount}</span>
            </div>
            <div className="flex justify-between items-center text-emerald-400">
              <span className="text-xs font-bold">Total Paid</span>
              <span className="text-sm font-black">₹{booking.paid_amount}</span>
            </div>
            {pendingAmount > 0 && (
              <div className="flex justify-between items-center text-rose-400">
                <span className="text-xs font-bold">Pending Balance</span>
                <span className="text-sm font-black">₹{pendingAmount}</span>
              </div>
            )}
            {booking.payment_mode && (
              <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                Payment Method: <span className="text-slate-300">{booking.payment_mode}</span>
              </div>
            )}
          </div>

          {/* Payment Method Selector when Pending */}
          {pendingAmount > 0 && booking.payment_mode === 'Pending' && (
            <div className="flex flex-col gap-2.5 p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Collection Method</span>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_mode_mark"
                    value="Cash"
                    checked={selectedPaymentMode === 'Cash'}
                    onChange={() => setSelectedPaymentMode('Cash')}
                    className="accent-emerald-400 h-3.5 w-3.5"
                  />
                  Cash
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_mode_mark"
                    value="UPI"
                    checked={selectedPaymentMode === 'UPI'}
                    onChange={() => setSelectedPaymentMode('UPI')}
                    className="accent-emerald-400 h-3.5 w-3.5"
                  />
                  UPI
                </label>
              </div>
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-2xl text-xs text-slate-400">
              <span className="font-bold text-slate-500 block mb-1">NOTES</span>
              {booking.notes}
            </div>
          )}

          {/* Document ID proofs list */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Guest ID Proofs</span>
            <div className="flex flex-wrap gap-2">
              {booking.documents && booking.documents.length > 0 ? (
                booking.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center hover:border-emerald-500 transition group"
                  >
                    {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                      <FileText className="h-6 w-6 text-slate-400" />
                    ) : (
                      <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover" />
                    )}
                    <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] text-slate-400 font-bold px-1 py-0.5 truncate text-center">
                      {doc.file_name}
                    </span>
                  </a>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No documentation uploaded yet.</div>
              )}
            </div>

            {/* Document upload triggers */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Camera className="h-3.5 w-3.5 text-slate-500" />
                Capture
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </label>
              <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-950 border border-slate-800 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                Upload File
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>

          {/* Extend Stay Panel */}
          <div className="border-t border-slate-800/80 pt-3">
            {showExtendInput ? (
              <div className="flex flex-col gap-2 p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select New Checkout Date</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    min={format(new Date(), 'yyyy-MM-dd')}
                    value={newCheckOutDate}
                    onChange={(e) => setNewCheckOutDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleExtendStay}
                    className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-black rounded-xl hover:bg-emerald-400 transition"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExtendInput(false)}
                    className="px-3 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowExtendInput(true)}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl border border-slate-700/50 flex items-center justify-center gap-1.5 transition"
              >
                Extend Booking Stay
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-2 border-t border-slate-800/80 pt-4">
            {pendingAmount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAsPaid}
                className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 text-sm font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                <CheckCircle className="h-4.5 w-4.5" />
                Collect & Mark Paid
              </button>
            ) : (
              <div className="py-3.5 px-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-extrabold rounded-2xl flex items-center justify-center gap-2">
                <CheckCircle className="h-4.5 w-4.5" />
                Paid In Full
              </div>
            )}
            
            <button
              type="button"
              onClick={handleCheckOut}
              className="py-3.5 px-4 bg-slate-950 hover:bg-red-500/10 border border-slate-850 hover:border-red-500/20 text-slate-300 hover:text-red-400 text-sm font-bold rounded-2xl transition flex items-center justify-center gap-2"
            >
              <LogOut className="h-4.5 w-4.5 text-slate-500 hover:text-red-400" />
              Checkout Guest
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
