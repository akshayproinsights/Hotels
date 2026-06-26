import * as React from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, User, Phone, MapPin, Briefcase, Calendar, Camera, Upload, FileText, Loader2, ZoomIn, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { Guest, Document } from '../types'
import { getGuestBookings } from '../api/guests'
import { listGuestDocs, getUploadUrl, uploadFileToR2, confirmUpload } from '../api/documents'
import DocumentLightbox from './DocumentLightbox'

interface GuestProfileSheetProps {
  guest: Guest
  onClose: () => void
}

export default function GuestProfileSheet({ guest, onClose }: GuestProfileSheetProps) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Query guest stay history
  const { data: bookings = [], isLoading: isLoadingBookings } = useQuery({
    queryKey: ['guestBookings', guest.id],
    queryFn: () => getGuestBookings(guest.id),
  })

  // Query guest documents
  const { data: guestDocs = [], isLoading: isLoadingDocs, refetch: refetchDocs } = useQuery({
    queryKey: ['guestDocs', guest.id],
    queryFn: () => listGuestDocs(guest.id),
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (bookings.length === 0) {
        toast.error('Cannot upload documents for a guest with no bookings')
        return
      }

      const files = Array.from(e.target.files)
      setIsUploading(true)
      const uploadToast = toast.loading(`Uploading ${files.length} document(s)...`)

      // Associate with the guest's latest booking ID
      const latestBookingId = bookings[0].id

      try {
        for (const file of files) {
          const { upload_url, document_id } = await getUploadUrl(
            latestBookingId,
            guest.id,
            file.name,
            file.type
          )
          await uploadFileToR2(upload_url, file)
          await confirmUpload(document_id)
        }
        toast.success('Documents added successfully', { id: uploadToast })
        refetchDocs()
      } catch (err) {
        console.error(err)
        toast.error('Failed to upload one or more documents', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleGuestPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (bookings.length === 0) {
        toast.error('Cannot upload documents for a guest with no bookings')
        return
      }

      const file = e.target.files[0]
      setIsUploading(true)
      const uploadToast = toast.loading('Uploading guest photo...')

      // Associate with the guest's latest booking ID
      const latestBookingId = bookings[0].id

      try {
        const { upload_url, document_id } = await getUploadUrl(
          latestBookingId,
          guest.id,
          file.name || 'guest_photo.jpg',
          file.type || 'image/jpeg',
          'guest_photo'
        )
        await uploadFileToR2(upload_url, file)
        await confirmUpload(document_id)
        toast.success('Guest photo uploaded successfully', { id: uploadToast })
        refetchDocs()
      } catch (err) {
        console.error(err)
        toast.error('Failed to upload guest photo', { id: uploadToast })
      } finally {
        setIsUploading(false)
      }
    }
  }

  // Calculate unpaid balance sum across all bookings
  const totalPendingDues = bookings.reduce((sum, b) => {
    const pending = b.total_amount - b.paid_amount
    return sum + (pending > 0 ? pending : 0)
  }, 0)

  return createPortal(
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
                Guest Profile
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">Customer Record ID: {guest.id.substring(0, 8)}...</p>
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
          
          {/* Profile Card */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col gap-3 bg-slate-950/40 border-slate-800/40">
            <div className="flex justify-between items-start gap-4">
              <div className="flex gap-3">
                {guestDocs.find(d => d.doc_type === 'guest_photo') ? (
                  <div className="relative group w-12 h-12 flex-shrink-0">
                    <img
                      src={guestDocs.find(d => d.doc_type === 'guest_photo')?.public_url}
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
                  <label className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 flex items-center justify-center flex-shrink-0 text-slate-500 cursor-pointer transition group">
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
                  <h3 className="text-lg font-black text-slate-100 flex items-center gap-2">
                    {guest.name}
                  </h3>
                  <a
                    href={`tel:${guest.phone}`}
                    className="text-xs text-slate-400 hover:text-emerald-400 font-bold mt-1 flex items-center gap-2 transition"
                  >
                    <Phone className="h-3.5 w-3.5 text-slate-500" />
                    {guest.phone}
                  </a>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {guest.total_visits} {guest.total_visits === 1 ? 'Visit' : 'Visits'}
                </span>
                {totalPendingDues > 0 && (
                  <div className="text-[10px] text-rose-400 font-black mt-2 uppercase tracking-wide bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md inline-block">
                    ₹{totalPendingDues} Pending Dues
                  </div>
                )}
              </div>
            </div>

            {/* Profile Metadata */}
            <div className="border-t border-slate-850/60 pt-2 grid grid-cols-1 gap-2 text-xs">
              {guest.address && (
                <div className="flex items-start gap-2 text-slate-400">
                  <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-500 block uppercase text-[9px] tracking-wider">Address</span>
                    {guest.address}
                  </div>
                </div>
              )}
              {guest.age !== undefined && guest.age !== null && (
                <div className="flex items-start gap-2 text-slate-400">
                  <User className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-500 block uppercase text-[9px] tracking-wider">Age</span>
                    {guest.age} years
                  </div>
                </div>
              )}
              {bookings.length > 0 && bookings[0].occupation && (
                <div className="flex items-start gap-2 text-slate-400">
                  <Briefcase className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-500 block uppercase text-[9px] tracking-wider">Occupation</span>
                    {bookings[0].occupation}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ID Documents Grid */}
          <div className="flex flex-col gap-2">
            {(() => {
              const idDocsOnly = guestDocs.filter(d => d.doc_type !== 'guest_photo');
              return (
                <>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>ID Proofs & Documents ({idDocsOnly.length})</span>
                  </span>

                  {isLoadingDocs ? (
                    <div className="flex items-center justify-center p-6 text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin mr-2 text-emerald-400" />
                      <span className="text-xs font-semibold">Loading documents...</span>
                    </div>
                  ) : idDocsOnly.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {idDocsOnly.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className="relative aspect-square rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col items-center justify-center hover:border-emerald-500 transition group"
                        >
                          {doc.file_name.toLowerCase().endsWith('.pdf') ? (
                            <FileText className="h-8 w-8 text-slate-400 group-hover:scale-105 transition" />
                          ) : (
                            <img src={doc.public_url} alt={doc.file_name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                          )}
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <ZoomIn className="h-5 w-5 text-slate-200" />
                          </div>
                          <span className="absolute bottom-0 inset-x-0 bg-slate-950/85 text-[8px] text-slate-400 font-bold px-1 py-0.5 truncate text-center">
                            {doc.file_name}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic p-3 bg-slate-950/20 border border-slate-850 rounded-2xl">
                      No ID documentation uploaded for this guest.
                    </div>
                  )}
                </>
              );
            })()}

            {/* Document upload zone */}
            {bookings.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <label className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-950 border border-slate-850 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  Capture
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
                <label className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-950 border border-slate-850 border-dashed rounded-xl cursor-pointer hover:bg-slate-900 transition text-xs font-semibold text-slate-400">
                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                  Upload ID
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
            )}
          </div>

          {/* Stay History List */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Stay History & Billing</span>
            
            {isLoadingBookings ? (
              <div className="flex items-center justify-center p-6 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2 text-emerald-400" />
                <span className="text-xs font-semibold">Loading stays...</span>
              </div>
            ) : bookings.length > 0 ? (
              <div className="flex flex-col gap-2.5 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
                {bookings.map((booking) => {
                  const checkInDate = format(parseISO(booking.check_in), 'dd MMM yyyy')
                  const checkOutDate = format(parseISO(booking.check_out), 'dd MMM yyyy')
                  const pending = booking.total_amount - booking.paid_amount
                  const isPaid = pending <= 0

                  return (
                    <div 
                      key={booking.id}
                      className="p-3 bg-slate-950/60 border border-slate-850 rounded-2xl flex flex-col gap-2"
                    >
                      {/* Booking Header */}
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-lg font-extrabold border border-slate-800 text-[10px]">
                            Room {booking.rooms?.number}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">{booking.booking_number}</span>
                        </div>
                        <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded ${
                          booking.status === 'checked_out' 
                            ? 'bg-slate-800 text-slate-400' 
                            : booking.status === 'cancelled'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {booking.status === 'active' ? 'Active' : booking.status === 'checked_out' ? 'Checked Out' : 'Cancelled'}
                        </span>
                      </div>

                      {/* Dates */}
                      <div className="flex justify-between items-center text-xs text-slate-300">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Calendar className="h-3.5 w-3.5 text-slate-500" />
                          <span>{checkInDate}</span>
                          <span className="text-slate-500">→</span>
                          <span>{checkOutDate}</span>
                        </div>
                      </div>

                      {/* Financial Detail */}
                      <div className="border-t border-slate-900/60 pt-2 flex justify-between items-center text-xs">
                        <div className="text-slate-500 font-medium">
                          Total Bill: <span className="text-slate-300 font-bold">₹{booking.total_amount}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isPaid ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[10px]">
                              <CheckCircle className="h-3 w-3" /> Fully Paid
                            </span>
                          ) : (
                            <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded text-[10px] font-black border border-rose-500/10">
                              ₹{pending} Dues
                            </span>
                          )}
                          <span className="text-slate-500 text-[10px]">({booking.payment_mode})</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic p-3 bg-slate-950/20 border border-slate-850 rounded-2xl text-center">
                No past stays found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox portal overlay */}
      {selectedDoc && (
        <DocumentLightbox
          docUrl={selectedDoc.public_url || ''}
          fileName={selectedDoc.file_name}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>,
    document.body
  )
}
