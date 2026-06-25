// Day detail bottom sheet panel component
import { Link } from 'react-router-dom'
import { X, Calendar as CalendarIcon, Loader2, ArrowRight, User, ShieldAlert } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useInventory } from '../hooks/useInventory'

interface DayDetailPanelProps {
  dateStr: string
  onClose: () => void
}

export default function DayDetailPanel({ dateStr, onClose }: DayDetailPanelProps) {
  const { data, isLoading, isError } = useInventory(dateStr)

  const formattedDate = format(parseISO(dateStr), 'EEEE, d MMMM yyyy')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'vacant':
        return (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Vacant
          </span>
        )
      case 'hold':
        return (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Hold
          </span>
        )
      case 'unpaid':
        return (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Unpaid
          </span>
        )
      case 'occupied':
      default:
        return (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Occupied
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Backdrop click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide up sheet */}
      <div className="glass-panel relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-700/50 bg-slate-900/95 shadow-2xl p-6 flex flex-col gap-5 animate-fade-in">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-lg font-bold text-slate-100">{formattedDate}</h3>
              <p className="text-xs text-slate-500">Availability Summary</p>
            </div>
          </div>
          <button
            onClick={onClose}
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
                <div className="text-[9px] uppercase font-bold tracking-wider text-emerald-500">Vacant</div>
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
            <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
              {data.rooms.map(room => (
                <div
                  key={room.id}
                  className={`flex flex-col p-2.5 rounded-xl border gap-1 ${
                    room.room_status === 'vacant'
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : room.room_status === 'hold'
                      ? 'bg-amber-500/5 border-amber-500/20'
                      : room.room_status === 'unpaid'
                      ? 'bg-rose-500/5 border-rose-500/20'
                      : 'bg-slate-950/30 border-slate-800/60'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-extrabold text-slate-100">{room.number}</span>
                    {getStatusBadge(room.room_status)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Fl {room.floor} · {room.room_type.replace('Non AC ', 'N/AC ').replace('AC ', 'AC ')}
                  </span>
                  {room.booking && (
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1 truncate">
                      <User className="h-3 w-3 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{room.booking.guests?.name || 'Guest'}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Go to full day action button */}
            <Link
              to={`/inventory?date=${dateStr}`}
              onClick={onClose}
              className="mt-2 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 text-sm font-black rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer"
            >
              View Full Day in Inventory
              <ArrowRight className="h-4 w-4" />
            </Link>

          </div>
        )}

      </div>
    </div>
  )
}
