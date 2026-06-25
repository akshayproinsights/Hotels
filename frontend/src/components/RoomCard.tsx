import { User, ShieldAlert, CheckCircle, Clock, BedDouble } from 'lucide-react'
import type { InventoryRoom } from '../types'

interface RoomCardProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
}

export default function RoomCard({ room, onClick }: RoomCardProps) {
  const getStatusStyles = () => {
    switch (room.room_status) {
      case 'vacant':
        return {
          border: 'border-emerald-500/20 hover:border-emerald-400/50',
          bg: 'bg-emerald-500/5',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
          badgeText: 'Vacant',
          icon: <CheckCircle className="h-4 w-4 text-emerald-400" />,
        }
      case 'hold':
        return {
          border: 'border-amber-500/20 hover:border-amber-400/50',
          bg: 'bg-amber-500/5',
          text: 'text-amber-400',
          badgeBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
          badgeText: 'Hold',
          icon: <Clock className="h-4 w-4 text-amber-400" />,
        }
      case 'unpaid':
        return {
          border: 'border-rose-500/20 hover:border-rose-400/50',
          bg: 'bg-rose-500/5',
          text: 'text-rose-400',
          badgeBg: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
          badgeText: 'Unpaid Dues',
          icon: <ShieldAlert className="h-4 w-4 text-rose-400" />,
        }
      case 'occupied':
      default:
        return {
          border: 'border-slate-500/20 hover:border-slate-400/50',
          bg: 'bg-slate-500/5',
          text: 'text-slate-300',
          badgeBg: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
          badgeText: 'Occupied',
          icon: <User className="h-4 w-4 text-slate-400" />,
        }
    }
  }

  const styles = getStatusStyles()

  return (
    <button
      onClick={() => onClick(room)}
      className={`glass-panel w-full text-left rounded-2xl p-4 flex flex-col justify-between min-h-[140px] transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20 ${styles.bg} ${styles.border}`}
    >
      <div className="flex justify-between items-start w-full">
        <div>
          <span className="text-2xl font-extrabold tracking-tight text-slate-100">
            {room.number}
          </span>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-medium">
            <BedDouble className="h-3 w-3 text-slate-500" />
            {room.room_type}
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-lg ${styles.badgeBg}`}>
          <span className="flex items-center gap-1">
            {styles.icon}
            {styles.badgeText}
          </span>
        </span>
      </div>

      <div className="w-full mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center">
        {room.booking ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <User className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                {room.booking.guests?.name || 'Guest'}
              </span>
              <span className="text-[10px] text-slate-500 truncate">
                {room.booking.guests?.phone || ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 font-medium">
            Available / Ready
          </div>
        )}
        <div className="text-right">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Nightly
          </div>
          <div className="text-sm font-bold text-slate-200">
            ₹{room.base_price}
          </div>
        </div>
      </div>
    </button>
  )
}
