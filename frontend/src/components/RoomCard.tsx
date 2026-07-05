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

  // Find the active booking for this room today.
  // Prioritise the guest who is ACTUALLY checked in — this prevents a stale/prior
  // "active" booking (whose guest has already left but the booking wasn't checked out)
  // from being picked over the current occupant.
  const activeBookingsForRoom = (dailyBookings || []).filter(
    (b: any) => b.room_id === room.id && b.status === 'active'
  )
  const activeBooking =
    activeBookingsForRoom.find((b: any) => b.is_checked_in) ??
    activeBookingsForRoom[0]

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
          // Find all bookings for this room today (active + checked_out)
          const roomBookings = (dailyBookings || []).filter(
            (b: any) => b.room_id === room.id && (b.status === 'active' || b.status === 'checked_out')
          ).sort((a: any, b: any) => a.check_in.localeCompare(b.check_in))

          // Separate into active (currently occupying) vs already-departed
          const activeBookings = roomBookings.filter((b: any) => b.status === 'active')
          const checkedOutBookings = roomBookings.filter((b: any) => b.status === 'checked_out')

          // ── Case 1: There is a currently-active booking ──────────────────────
          // Always show the active guest as primary. Ignore checked-out guests on
          // the card — they appear in the detail drawer but clutter the room grid.
          if (activeBookings.length > 0) {
            // Prefer the checked-in booking; fall back to the first active one
            const b = activeBookings.find((x: any) => x.is_checked_in) ?? activeBookings[0]

            // Room is VACANT per backend but has a booking — safety guard
            if (room.room_status === 'vacant') {
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
                  <span className={`text-[8px] font-black whitespace-nowrap px-1.5 py-0.5 rounded-md uppercase tracking-wide text-white shrink-0 ${
                    isCheckingOutToday ? 'bg-orange-500' : 'bg-sky-600'
                  }`}>
                    {timeLabel}
                  </span>
                ) : null}
              </div>
            )
          }

          // ── Case 2: All bookings are checked_out — room is now free ──────────
          if (checkedOutBookings.length > 0) {
            return (
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
                {language === 'mr' ? 'उपलब्ध' : 'Available'}
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
