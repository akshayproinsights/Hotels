import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'
import useLongPress from '../hooks/useLongPress'
import { formatNameByLanguage, shortenLongName } from '../utils/nameHelper'
import { getCustomerNameDisplay } from '../utils/customer'
import { formatIST_AMPM, formatIST_Date } from '../utils/istTime'

interface RoomCardProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
  onLongPress?: (room: InventoryRoom) => void
  dailyBookings?: any[]
  selectedDate: string
}

export default function RoomCard({ room, onClick, onLongPress, dailyBookings, selectedDate }: RoomCardProps) {
  const { language } = useLanguage()

  // Find the active booking for this room today
  const activeBooking = (dailyBookings || []).find(
    (b: any) => b.room_id === room.id && b.status === 'active'
  )

  // Derive the true operational state from booking data
  const isDueOut = !!(activeBooking && formatIST_Date(activeBooking.check_out) === selectedDate)
  const isArrival = !!(activeBooking && !activeBooking.is_checked_in && formatIST_Date(activeBooking.check_in) === selectedDate)
  const isInHouse = !!(activeBooking && activeBooking.is_checked_in && !isDueOut)
  const isUnpaid = !!(activeBooking && activeBooking.is_checked_in && ['unpaid', 'partial'].includes(activeBooking.payment_status))

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

  // ─── Status config ───────────────────────────────────────────────────────
  // ALL badges use fully-solid backgrounds + white/dark text so they render
  // correctly in BOTH light mode and dark mode on mobile PWA.
  const getStatusStyles = () => {
    if (room.room_status === 'vacant') {
      return {
        border: 'border-slate-200 hover:border-emerald-400/50 border-l-4 border-l-emerald-500 dark:border-slate-800/80',
        bg: '',
        badgeClass: 'bg-emerald-500 text-white',
        badgeText: language === 'mr' ? 'रिकामी' : 'Vacant',
      }
    }

    // DUE OUT + UNPAID — most urgent, solid rose
    if (isDueOut && isUnpaid) {
      return {
        border: 'border-rose-300 border-l-4 border-l-rose-500 dark:border-rose-500/40',
        bg: '',
        badgeClass: 'bg-rose-500 text-white',
        badgeText: language === 'mr' ? 'निघतात ⚠️' : 'Due Out ⚠️',
      }
    }

    // DUE OUT — solid orange, works on both themes
    if (isDueOut) {
      return {
        border: 'border-orange-300 border-l-4 border-l-orange-500 dark:border-orange-500/40',
        bg: '',
        badgeClass: 'bg-orange-500 text-white',
        badgeText: language === 'mr' ? 'आज निघतात' : 'Due Out',
      }
    }

    // ARRIVAL — solid sky blue
    if (isArrival) {
      return {
        border: 'border-slate-200 hover:border-sky-400/50 border-l-4 border-l-sky-500 dark:border-slate-800/80',
        bg: '',
        badgeClass: 'bg-sky-600 text-white',
        badgeText: language === 'mr' ? 'आगमन' : 'Arrival',
      }
    }

    // UNPAID — solid rose
    if (isUnpaid) {
      return {
        border: 'border-rose-300 border-l-4 border-l-rose-500 dark:border-rose-500/30',
        bg: '',
        badgeClass: 'bg-rose-500 text-white',
        badgeText: language === 'mr' ? 'बाकी रक्कम' : 'Unpaid',
      }
    }

    // STAYOVER — solid slate/indigo
    if (isInHouse) {
      return {
        border: 'border-slate-200 hover:border-slate-400/30 border-l-4 border-l-slate-400 dark:border-slate-800/80',
        bg: '',
        badgeClass: 'bg-slate-500 text-white',
        badgeText: language === 'mr' ? 'मुक्कामी' : 'Stayover',
      }
    }

    // Future booked (not arriving today)
    return {
      border: 'border-slate-200 border-l-4 border-l-slate-300 dark:border-slate-800/80',
      bg: '',
      badgeClass: 'bg-slate-400 text-white',
      badgeText: language === 'mr' ? 'बुक केले' : 'Booked',
    }
  }

  const styles = getStatusStyles()
  const handlers = onLongPress ? longPressHandlers : { onClick: () => onClick(room) }

  return (
    <button
      {...handlers}
      className={`glass-panel w-full text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[72px] sm:min-h-[96px] transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md ${styles.bg} ${styles.border}`}
    >
      <div className="flex justify-between items-start w-full gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
            {room.number}
          </span>
          {activeBooking?.is_checked_in && (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Checked In" />
          )}
        </div>
        {/* Solid pill badge — always legible on mobile/sunlight */}
        <span className={`text-[8px] sm:text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${styles.badgeClass}`}>
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
            // Handoff day! One checking out/already checked out, one checking in.
            const b1 = roomBookings[0]
            const b2 = roomBookings[1]

            // If the outgoing guest is already checked out, only show the arrival
            if (b1.status === 'checked_out') {
              const name2 = shortenLongName(formatNameByLanguage(getCustomerNameDisplay(b2.customers?.name).name, language))
              const t2 = formatIST_AMPM(b2.check_in)
              return (
                <div className="flex justify-between items-center w-full gap-1.5">
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-300 break-words whitespace-normal leading-tight flex-1 min-w-0">
                    🚌 {name2}
                  </span>
                  <span className="text-[8px] font-black whitespace-nowrap bg-sky-600 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
                    {language === 'mr' ? 'आत' : 'In'} {t2}
                  </span>
                </div>
              )
            }

            const name1 = shortenLongName(formatNameByLanguage(getCustomerNameDisplay(b1.customers?.name).name, language))
            const name2 = shortenLongName(formatNameByLanguage(getCustomerNameDisplay(b2.customers?.name).name, language))
            const t1 = formatIST_AMPM(b1.check_out)
            const t2 = formatIST_AMPM(b2.check_in)

            return (
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex justify-between items-center w-full gap-1.5">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 break-words whitespace-normal leading-tight flex-1 min-w-0">
                    🚪 {name1}
                  </span>
                  {/* Solid orange pill — no contrast issues */}
                  <span className="text-[8px] font-black whitespace-nowrap bg-orange-500 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
                    {t1}
                  </span>
                </div>
                <div className="flex justify-between items-center w-full gap-1.5">
                  <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 break-words whitespace-normal leading-tight flex-1 min-w-0">
                    🚌 {name2}
                  </span>
                  {/* Solid sky pill */}
                  <span className="text-[8px] font-black whitespace-nowrap bg-sky-600 text-white px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
                    {t2}
                  </span>
                </div>
              </div>
            )
          }

          // Single booking
          if (roomBookings.length === 1) {
            const b = roomBookings[0]

            // Already checked out — room is now clean, show as available
            if (b.status === 'checked_out') {
              return (
                <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
                  {language === 'mr' ? 'उपलब्ध' : 'Available'}
                </span>
              )
            }

            const name = shortenLongName(formatNameByLanguage(getCustomerNameDisplay(b.customers?.name).name, language))

            const isCheckingOutToday = formatIST_Date(b.check_out) === selectedDate
            const isCheckingInToday = formatIST_Date(b.check_in) === selectedDate
            const isCheckedIn = b.is_checked_in

            let timeLabel = ''
            let icon = '👤'

            if (isCheckingOutToday) {
              const coTime = formatIST_AMPM(b.check_out)
              timeLabel = `${language === 'mr' ? 'बाहेर' : 'Out'} ${coTime}`
              icon = '🚪'
            } else if (isCheckingInToday && !isCheckedIn) {
              const ciTime = formatIST_AMPM(b.check_in)
              timeLabel = `${language === 'mr' ? 'आत' : 'In'} ${ciTime}`
              icon = '🚌'
            }

            return (
              <div className="flex justify-between items-center w-full gap-1.5">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-300 break-words whitespace-normal leading-tight flex-1 min-w-0">
                  {icon} {name}
                </span>
                {timeLabel ? (
                  // Solid pill — orange for checkout, sky for arrival
                  <span className={`text-[8px] font-black whitespace-nowrap px-1.5 py-0.5 rounded-md uppercase tracking-wide text-white shrink-0 ${
                    isCheckingOutToday ? 'bg-orange-500' : 'bg-sky-600'
                  }`}>
                    {timeLabel}
                  </span>
                ) : null}
              </div>
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
