import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'
import useLongPress from '../hooks/useLongPress'
import { getMarathiName } from '../utils/nameHelper'
import { getCustomerNameDisplay } from '../utils/customer'
import { formatIST_AMPM } from '../utils/istTime'

interface RoomCardProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
  onLongPress?: (room: InventoryRoom) => void
  dailyBookings?: any[]
  selectedDate: string
}

export default function RoomCard({ room, onClick, onLongPress, dailyBookings, selectedDate }: RoomCardProps) {
  const { language } = useLanguage()

  const longPressHandlers = useLongPress(
    () => {
      if (onLongPress) {
        onLongPress(room)
      }
    },
    () => {
      onClick(room)
    }
  )

  const getStatusStyles = () => {
    switch (room.room_status) {
      case 'vacant':
        return {
          border: 'border-slate-800/80 hover:border-emerald-500/30 border-l-4 border-l-emerald-400',
          bg: 'bg-emerald-500/[0.02]',
          badgeText: language === 'mr' ? 'रिकामी' : 'Free',
          badgeColor: 'text-emerald-400',
        }
      case 'reserved':
        return {
          border: 'border-slate-800/80 hover:border-amber-500/30 border-l-4 border-l-amber-400',
          bg: 'bg-amber-500/[0.02]',
          badgeText: language === 'mr' ? 'बुक / आरक्षित' : 'Booked',
          badgeColor: 'text-amber-400',
        }
      case 'unpaid':
        return {
          border: 'border-slate-800/80 hover:border-rose-500/30 border-l-4 border-l-rose-400',
          bg: 'bg-rose-500/[0.02]',
          badgeText: language === 'mr' ? 'चेक-इन (बाकी)' : 'Checked In (Dues)',
          badgeColor: 'text-rose-400',
        }
      case 'occupied':
      default:
        return {
          border: 'border-slate-800/80 hover:border-slate-400/30 border-l-4 border-l-slate-550',
          bg: 'bg-slate-500/[0.02]',
          badgeText: language === 'mr' ? 'चेक-इन' : 'Checked In',
          badgeColor: 'text-slate-400',
        }
    }
  }

  const styles = getStatusStyles()
  const handlers = onLongPress ? longPressHandlers : { onClick: () => onClick(room) }

  return (
    <button
      {...handlers}
      className={`glass-panel w-full text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[72px] sm:min-h-[96px] transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md ${styles.bg} ${styles.border}`}
    >
      <div className="flex justify-between items-start w-full">
        <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
          {room.number}
        </span>
        <span className={`text-[9px] sm:text-[10px] uppercase tracking-widest font-black ${styles.badgeColor}`}>
          {styles.badgeText}
        </span>
      </div>

      <div className="w-full mt-1.5 sm:mt-2">
        {(() => {
          // Find all bookings for this room today
          const roomBookings = (dailyBookings || []).filter(
            (b: any) => b.room_id === room.id && (b.status === 'active' || b.status === 'checked_out')
          ).sort((a: any, b: any) => a.check_in.localeCompare(b.check_in))

          if (roomBookings.length > 1) {
            // Handoff day! Multiple bookings.
            const b1 = roomBookings[0]
            const b2 = roomBookings[1]
            const name1 = getMarathiName(getCustomerNameDisplay(b1.customers?.name).name)
            const name2 = getMarathiName(getCustomerNameDisplay(b2.customers?.name).name)
            const t1 = formatIST_AMPM(b1.check_out)
            const t2 = formatIST_AMPM(b2.check_in)

            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 truncate block">
                  🔄 {name1} ({t1})
                </span>
                <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 truncate block">
                  ➡️ {name2} ({t2})
                </span>
              </div>
            )
          }

          // Single booking
          if (roomBookings.length === 1) {
            const b = roomBookings[0]
            const name = getMarathiName(getCustomerNameDisplay(b.customers?.name).name)
            
            // Check if check_out is today
            const isCheckingOutToday = b.check_out.startsWith(selectedDate)
            const isCheckingInToday = b.check_in.startsWith(selectedDate)

            let timeSuffix = ""
            if (isCheckingOutToday) {
              const coTime = formatIST_AMPM(b.check_out)
              timeSuffix = ` (${language === 'mr' ? 'प्रस्थान' : 'Out'} ${coTime})`
            } else if (isCheckingInToday) {
              const ciTime = formatIST_AMPM(b.check_in)
              timeSuffix = ` (${language === 'mr' ? 'आगमन' : 'In'} ${ciTime})`
            }

            return (
              <span className="text-[11px] sm:text-xs font-semibold text-slate-300 truncate block">
                {room.room_status === 'reserved' ? '📅' : '👤'} {name}{timeSuffix}
              </span>
            )
          }

          // Vacant
          return (
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
              {language === 'mr' ? 'उपलब्ध' : 'Available'}
            </span>
          )
        })()}
      </div>
    </button>
  )
}
