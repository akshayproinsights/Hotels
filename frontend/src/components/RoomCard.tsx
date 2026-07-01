import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'
import useLongPress from '../hooks/useLongPress'
import { getMarathiName } from '../utils/nameHelper'
import { getCustomerNameDisplay } from '../utils/customer'


interface RoomCardProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
  onLongPress?: (room: InventoryRoom) => void
}

export default function RoomCard({ room, onClick, onLongPress }: RoomCardProps) {
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
        {room.booking?.customers?.name ? (
          <span className="text-[11px] sm:text-xs font-semibold text-slate-300 truncate block">
            {(() => {
              const { name: cleanName, isDeleted } = getCustomerNameDisplay(room.booking.customers.name);
              return (
                <>
                  {room.room_status === 'reserved' ? '📅' : '👤'} {getMarathiName(cleanName)}
                  {isDeleted && (
                    <span className="text-rose-455 ml-1 font-bold">
                      ({language === 'mr' ? 'डिलीट' : 'Del'})
                    </span>
                  )}
                </>
              );
            })()}
          </span>
        ) : (
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
            {language === 'mr' ? 'उपलब्ध' : 'Available'}
          </span>
        )}
      </div>
    </button>
  )
}
