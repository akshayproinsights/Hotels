import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar as CalendarIcon, Loader2, ShieldAlert } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useInventory } from '../hooks/useInventory'
import BlockRoomSheet from './BlockRoomSheet'
import BookingDetailSheet from './BookingDetailSheet'
import type { InventoryRoom } from '../types'
import useLongPress from '../hooks/useLongPress'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { cancelBooking, restoreBooking } from '../api/bookings'
import { useLanguage } from '../context/LanguageContext'
import { getCustomerNameDisplay } from '../utils/customer'

interface DayDetailPanelProps {
  dateStr: string
  onClose: () => void
}

export default function DayDetailPanel({ dateStr, onClose }: DayDetailPanelProps) {
  const queryClient = useQueryClient()
  const { language } = useLanguage()
  const { data, isLoading, isError, refetch } = useInventory(dateStr)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [quickActionRoom, setQuickActionRoom] = useState<InventoryRoom | null>(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState<{ id: string; roomNumber: string; customerName: string } | null>(null)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: (_, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
      queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
      refetch()
      
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
                queryClient.invalidateQueries({ queryKey: ['inventory'] })
                queryClient.invalidateQueries({ queryKey: ['dailyReport'] })
                queryClient.invalidateQueries({ queryKey: ['monthlyReport'] })
                toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored!', { id: restoreToast })
                refetch()
              } catch (err) {
                toast.error(language === 'mr' ? 'पुनर्संचयित करण्यात अयशस्वी' : 'Failed to restore booking', { id: restoreToast })
              }
            }}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-3 py-1.5 rounded-lg transition"
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

  const handleRoomClick = (room: InventoryRoom) => {
    if (room.room_status === 'vacant') {
      setSelectedRoomForBooking(room)
    } else if (room.booking) {
      setSelectedBookingId(room.booking.id)
    }
  }

  const handleRoomLongPress = (room: InventoryRoom) => {
    if (room.room_status !== 'vacant' && room.booking) {
      setQuickActionRoom(room)
    }
  }

  const formattedDate = format(parseISO(dateStr), 'EEEE, d MMMM yyyy')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Off-click dismiss zone */}
      <div className="absolute inset-0 cursor-default" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />

      {/* Slide up sheet */}
      <div className="glass-panel relative w-full max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl p-6 flex flex-col gap-5 animate-fade-in">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-slate-100">{formattedDate}</h3>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-850 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin mb-3" />
            <span className="text-slate-400 text-sm font-semibold">Loading room status...</span>
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-rose-500/80 mb-3" />
            <span className="text-slate-300 text-sm font-bold">Failed to load room details</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            
            {/* Occupancy stats summary row */}
            <div className="grid grid-cols-4 gap-2 text-center bg-slate-955/40 p-2.5 rounded-2xl border border-slate-800/45">
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-500">Free</div>
                <div className="text-base font-black text-slate-200">{data.summary.vacant}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Occupied</div>
                <div className="text-base font-black text-slate-200">{data.summary.occupied}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-amber-500">Reserved</div>
                <div className="text-base font-black text-slate-200">{data.summary.reserved}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-rose-500">Unpaid</div>
                <div className="text-base font-black text-slate-200">{data.summary.unpaid}</div>
              </div>
            </div>

            {/* Compact 2-column room grid */}
            <div className="grid grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto">
              {data.rooms.map(room => (
                <DayPanelRoomButton
                  key={room.id}
                  room={room}
                  onClick={handleRoomClick}
                  onLongPress={handleRoomLongPress}
                  language={language}
                />
              ))}
            </div>

          </div>
        )}

      </div>

      {/* Sheets Drawers */}
      {selectedRoomForBooking && (
        <BlockRoomSheet
          room={selectedRoomForBooking}
          initialDate={dateStr}
          onClose={() => setSelectedRoomForBooking(null)}
          onSuccess={() => {
            setSelectedRoomForBooking(null)
            refetch()
          }}
        />
      )}

      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onSuccess={(action) => {
            if (action === 'checkout') {
              setSelectedBookingId(null)
            }
            refetch()
          }}
        />
      )}

      {/* Quick Action Context Menu Modal */}
      {quickActionRoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl relative">
            <button
              onClick={() => setQuickActionRoom(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition animate-pulse"
            >
              <X className="h-4.5 w-4.5" />
            </button>
            <div className="text-left mt-2">
              <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider">
                {language === 'mr' ? `खोली ${quickActionRoom.number} - त्वरित कृती` : `Room ${quickActionRoom.number} - Quick Action`}
              </h3>
              <p className="text-xs text-slate-455 mt-1 font-semibold flex items-center gap-1">
                👤 {(() => {
                  const { name: dName, isDeleted } = getCustomerNameDisplay(quickActionRoom.booking?.customers?.name);
                  return (
                    <>
                      <span>{dName}</span>
                      {isDeleted && (
                        <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1">
                          {language === 'mr' ? 'डिलीट केलेला' : 'Deleted'}
                        </span>
                      )}
                    </>
                  );
                })()} ({language === 'mr' ? 'ग्राहक' : 'Customer'})
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBookingId(quickActionRoom.booking!.id)
                  setQuickActionRoom(null)
                }}
                className="w-full py-3.5 px-4 bg-slate-950 hover:bg-slate-850 text-slate-200 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-slate-855"
              >
                📋 {language === 'mr' ? 'तपशील पहा (View Details)' : 'View Booking Details'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCancelConfirmBooking({
                    id: quickActionRoom.booking!.id,
                    roomNumber: String(quickActionRoom.number),
                    customerName: getCustomerNameDisplay(quickActionRoom.booking!.customers?.name).name || ""
                  })
                  setQuickActionRoom(null)
                }}
                className="w-full py-3.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-455 text-xs font-black rounded-2xl transition flex items-center justify-start gap-3 border border-rose-500/25"
              >
                ❌ {language === 'mr' ? 'बुकिंग रद्द करा (Cancel Booking)' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelConfirmBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-455 border-rose-500/25">
              <X className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'बुकिंग रद्द करण्याची खात्री करा' : 'Confirm Cancellation'}
              </h3>
              <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">
                {language === 'mr' ? (
                  <>खोली क्रमांक <span className="font-extrabold text-slate-200">{cancelConfirmBooking.roomNumber}</span> मधील ग्राहक <span className="font-extrabold text-slate-200">{cancelConfirmBooking.customerName}</span> यांचे बुकिंग रद्द करायचे आहे का? हे आपण नंतर Settings मधून पुनर्संचयित करू शकता.</>
                ) : (
                  <>Cancel the booking for <span className="font-extrabold text-slate-200">{cancelConfirmBooking.customerName}</span> in Room <span className="font-extrabold text-slate-200">{cancelConfirmBooking.roomNumber}</span>? You can restore this later from Settings.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                type="button"
                onClick={() => setCancelConfirmBooking(null)}
                className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelMutation.mutate(cancelConfirmBooking.id)
                  setCancelConfirmBooking(null)
                }}
                disabled={cancelMutation.isPending}
                className="py-2.5 px-4 text-white text-xs font-black rounded-xl transition shadow-lg bg-rose-500 hover:bg-rose-400 active:bg-rose-500 shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, रद्द करा' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  )
}

interface DayPanelRoomButtonProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
  onLongPress: (room: InventoryRoom) => void
  language: string
}

function DayPanelRoomButton({ room, onClick, onLongPress, language }: DayPanelRoomButtonProps) {
  const longPressHandlers = useLongPress(
    () => onLongPress(room),
    () => onClick(room)
  )

  const borderColor =
    room.room_status === 'vacant'   ? 'border-l-emerald-400' :
    room.room_status === 'reserved' ? 'border-l-amber-400'   :
    room.room_status === 'unpaid'   ? 'border-l-rose-400'    :
                                      'border-l-slate-500'
  const statusLabel =
    room.room_status === 'vacant'   ? { text: 'Free',     color: 'text-emerald-400' } :
    room.room_status === 'reserved' ? { text: 'Reserved', color: 'text-amber-400'   } :
    room.room_status === 'unpaid'   ? { text: 'Unpaid',   color: 'text-rose-400'    } :
                                      { text: 'Occupied', color: 'text-slate-400'  }

  return (
    <button
      {...longPressHandlers}
      type="button"
      className={`flex flex-col justify-between p-3 rounded-xl border-l-4 bg-slate-955/40 border border-slate-800/60 hover:bg-slate-900/60 active:scale-[0.98] transition-all cursor-pointer min-h-[72px] text-left ${borderColor}`}
    >
      <div className="flex justify-between items-start w-full">
        <span className="text-base font-black text-slate-100 leading-none">{room.number}</span>
        <span className={`text-[10px] font-extrabold uppercase tracking-wide ${statusLabel.color}`}>
          {statusLabel.text}
        </span>
      </div>
      <span className="text-xs font-semibold text-slate-350 truncate mt-2 flex items-center gap-1">
        {room.booking?.customers?.name ? (
          (() => {
            const { name: dName, isDeleted } = getCustomerNameDisplay(room.booking.customers.name);
            return (
              <>
                <span className="truncate">{dName}</span>
                {isDeleted && (
                  <span className="text-rose-455 font-bold shrink-0">
                    ({language === 'mr' ? 'डिलीट' : 'Del'})
                  </span>
                )}
              </>
            );
          })()
        ) : 'Available'}
      </span>
    </button>
  )
}
