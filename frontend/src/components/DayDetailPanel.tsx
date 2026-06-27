import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar as CalendarIcon, Loader2, ShieldAlert } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useInventory } from '../hooks/useInventory'
import BlockRoomSheet from './BlockRoomSheet'
import BookingDetailSheet from './BookingDetailSheet'
import type { InventoryRoom } from '../types'

interface DayDetailPanelProps {
  dateStr: string
  onClose: () => void
}

export default function DayDetailPanel({ dateStr, onClose }: DayDetailPanelProps) {
  const { data, isLoading, isError, refetch } = useInventory(dateStr)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const handleRoomClick = (room: InventoryRoom) => {
    if (room.room_status === 'vacant') {
      setSelectedRoomForBooking(room)
    } else if (room.booking) {
      setSelectedBookingId(room.booking.id)
    }
  }

  const formattedDate = format(parseISO(dateStr), 'EEEE, d MMMM yyyy')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Off-click dismiss zone - disabled from closing to prevent accidental dismissals on mobile / keyboard shifts */}
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
            <div className="grid grid-cols-4 gap-2 text-center bg-slate-950/40 p-2.5 rounded-2xl border border-slate-800/45">
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-500">Free</div>
                <div className="text-base font-black text-slate-200">{data.summary.vacant}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Occupied</div>
                <div className="text-base font-black text-slate-200">{data.summary.occupied}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-amber-500">Hold</div>
                <div className="text-base font-black text-slate-200">{data.summary.hold}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase font-bold tracking-wider text-rose-500">Unpaid</div>
                <div className="text-base font-black text-slate-200">{data.summary.unpaid}</div>
              </div>
            </div>

            {/* Compact 2-column room grid */}
            <div className="grid grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto">
              {data.rooms.map(room => {
                const borderColor =
                  room.room_status === 'vacant'  ? 'border-l-emerald-400' :
                  room.room_status === 'hold'    ? 'border-l-amber-400'   :
                  room.room_status === 'unpaid'  ? 'border-l-rose-400'    :
                                                   'border-l-slate-500'
                const statusLabel =
                  room.room_status === 'vacant'  ? { text: 'Free',    color: 'text-emerald-400' } :
                  room.room_status === 'hold'    ? { text: 'Hold',    color: 'text-amber-400'   } :
                  room.room_status === 'unpaid'  ? { text: 'Unpaid',  color: 'text-rose-400'    } :
                                                   { text: 'Occupied', color: 'text-slate-400'  }
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => handleRoomClick(room)}
                    className={`flex flex-col justify-between p-3 rounded-xl border-l-4 bg-slate-950/40 border border-slate-800/60 hover:bg-slate-900/60 active:scale-[0.98] transition-all cursor-pointer min-h-[72px] text-left ${borderColor}`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-base font-black text-slate-100 leading-none">{room.number}</span>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wide ${statusLabel.color}`}>
                        {statusLabel.text}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300 truncate mt-2">
                      {room.booking?.guests?.name || 'Available'}
                    </span>
                  </button>
                )
              })}
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
    </div>,
    document.body
  )
}
