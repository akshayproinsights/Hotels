import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw, Layers, ShieldAlert, Loader2, LayoutGrid, Map } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import RoomCard from '../components/RoomCard'
import BlockRoomSheet from '../components/BlockRoomSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import type { InventoryRoom } from '../types'
import { useLanguage } from '../context/LanguageContext'

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid')
  const { language, t } = useLanguage()

  // Touch gesture state for swipe-to-navigate days
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    // If modal/drawer sheet is open, do not trigger swipe date change
    if (selectedRoomForBooking || selectedBookingId) return
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (selectedRoomForBooking || selectedBookingId) return
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (selectedRoomForBooking || selectedBookingId || !touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const minSwipeDistance = 75 // Minimum pixel movement required

    // Swipe Left (finger moves right to left): Go to next day
    // Swipe Right (finger moves left to right): Go to previous day
    if (distance > minSwipeDistance) {
      handleNextDay()
    } else if (distance < -minSwipeDistance) {
      handlePrevDay()
    }
  }

  // Synchronize state if URL parameter changes
  const urlDate = searchParams.get('date')
  useEffect(() => {
    if (urlDate && urlDate !== selectedDate) {
      setSelectedDate(urlDate)
    }
  }, [urlDate, selectedDate])

  const { data, isLoading, isError, refetch, isRefetching } = useInventory(selectedDate)

  const handlePrevDay = () => {
    const newDate = format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleNextDay = () => {
    const newDate = format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleToday = () => {
    const newDate = format(new Date(), 'yyyy-MM-dd')
    setSelectedDate(newDate)
    setSearchParams({ date: newDate })
  }

  const handleRoomClick = (room: InventoryRoom) => {
    if (room.room_status === 'vacant') {
      setSelectedRoomForBooking(room)
    } else if (room.booking) {
      setSelectedBookingId(room.booking.id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
        <p className="text-slate-400 font-semibold text-sm">{t('fetching_inventory')}</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <ShieldAlert className="h-12 w-12 text-rose-500/80 mb-4" />
        <h2 className="text-lg font-bold text-slate-200">{t('failed_load_inventory')}</h2>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">
          {language === 'mr' ? 'कृपया इंटरनेट कनेक्शन तपासा आणि पुन्हा प्रयत्न करा.' : 'Please check your connection or setup and try again.'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold"
        >
          {t('try_again')}
        </button>
      </div>
    )
  }

  // Group rooms by floor
  const roomsByFloor = data.rooms.reduce((acc, room) => {
    const floor = room.floor
    if (!acc[floor]) acc[floor] = []
    acc[floor].push(room)
    return acc;
  }, {} as Record<number, InventoryRoom[]>)

  // Sorted floors
  const sortedFloors = Object.keys(roomsByFloor)
    .map(Number)
    .sort((a, b) => a - b)

  const formatSelectedDate = (dateStr: string, compact = false) => {
    const parsed = parseISO(dateStr)
    if (language !== 'mr') {
      return format(parsed, compact ? 'EEE, d MMM' : 'EEEE, d MMMM yyyy')
    }
    const daysMr = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
    const daysMrCompact = ['रवि', 'सोम', 'मंगळ', 'बुध', 'गुरु', 'शुक्र', 'शनि']
    const monthsMr = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
    const dayName = compact ? daysMrCompact[parsed.getDay()] : daysMr[parsed.getDay()]
    const monthName = monthsMr[parsed.getMonth()]
    return compact 
      ? `${dayName}, ${parsed.getDate()} ${monthName.slice(0, 3)}`
      : `${dayName}, ${parsed.getDate()} ${monthName} ${parsed.getFullYear()}`
  }

  const formattedDate = formatSelectedDate(selectedDate, false)
  const formattedDateCompact = formatSelectedDate(selectedDate, true)

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col gap-4 px-3 py-4 pb-24 animate-fade-in sm:px-4 sm:py-6"
    >
      
      {/* Date Navigation Bar */}
      <div className="glass-panel rounded-2xl p-2.5 sm:p-4 flex flex-col gap-3.5 sm:flex-row sm:justify-between sm:items-center bg-slate-900/40">
        {/* Primary Date Switcher */}
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <button
            onClick={handlePrevDay}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition active:scale-95 flex-shrink-0"
            title={language === 'mr' ? 'पूर्वीचा दिवस' : 'Previous Day'}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <div className="flex items-center gap-2 flex-1 justify-center sm:flex-initial">
            <button
              onClick={() => navigate(`/?date=${selectedDate}`)}
              className="flex items-center gap-2 hover:bg-slate-850/60 bg-slate-950/40 border border-slate-850 px-3 py-2.5 rounded-xl transition active:scale-95 text-left"
              title={language === 'mr' ? 'तारीख बदलण्यासाठी कॅलेंडरवर जा' : 'Go to calendar to change date'}
            >
              <CalendarIcon className="h-4.5 w-4.5 text-emerald-400 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-extrabold text-slate-200 tracking-tight whitespace-nowrap">
                <span className="inline sm:hidden">{formattedDateCompact}</span>
                <span className="hidden sm:inline">{formattedDate}</span>
              </span>
            </button>

            <button
              onClick={handleToday}
              className="px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-xl hover:bg-slate-900 text-xs font-black text-emerald-400 active:scale-95 transition"
            >
              {t('today')}
            </button>
          </div>

          <button
            onClick={handleNextDay}
            className="flex items-center justify-center w-14 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition active:scale-95 flex-shrink-0"
            title={language === 'mr' ? 'पुढील दिवस' : 'Next Day'}
          >
            <ChevronRight className="h-7 w-7 stroke-[3]" />
          </button>
        </div>

        {/* Secondary Controls (Refresh & Layout Toggles) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t border-slate-850/40 pt-3 sm:pt-0 sm:border-t-0">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/40 border border-slate-850 hover:bg-slate-900 text-slate-400 rounded-xl transition disabled:opacity-50 active:scale-95 text-xs font-bold"
            title={language === 'mr' ? 'अपडेट करा' : 'Refresh inventory'}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>{language === 'mr' ? 'रीफ्रेश' : 'Refresh'}</span>
          </button>

          {/* Toggle Layout Segmented Controller */}
          <div className="flex bg-slate-950/60 p-0.5 sm:p-1 border border-slate-800 rounded-xl flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={language === 'mr' ? 'ग्रिड कार्ड व्ह्यू' : 'Grid Card View'}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">{language === 'mr' ? 'ग्रिड' : 'Grid'}</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                viewMode === 'map'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={language === 'mr' ? 'मजला आराखडा मॅप व्ह्यू' : 'Floor Plan Map View'}
            >
              <Map className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">{language === 'mr' ? 'नकाशा' : 'Map'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Occupancy Stats Summary */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-emerald-500/5 border-emerald-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1 sm:gap-1.5">
            <span>✅</span>
            <span className="truncate">{language === 'mr' ? 'रिकामी' : 'Free'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.vacant}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-slate-500/5 border-slate-800">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5">
            <span>👤</span>
            <span className="truncate">{language === 'mr' ? 'भरलेली' : 'Occupied'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.occupied}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-amber-500/5 border-amber-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-amber-500 flex items-center gap-1 sm:gap-1.5">
            <span>🔒</span>
            <span className="truncate">{language === 'mr' ? 'होल्ड' : 'Hold'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.hold}</span>
        </div>

        <div className="glass-panel flex flex-col items-center justify-center p-1.5 rounded-xl sm:rounded-2xl sm:items-start sm:p-3.5 bg-rose-500/5 border-rose-500/10">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-rose-500 flex items-center gap-1 sm:gap-1.5">
            <span>⚠️</span>
            <span className="truncate">{language === 'mr' ? 'बाकी' : 'Unpaid'}</span>
          </span>
          <span className="text-xs sm:text-2xl font-black text-slate-100 mt-0.5 sm:mt-2">{data.summary.unpaid}</span>
        </div>
      </div>

      {/* Arriving Today Banner — shows reserved guests whose check-in date is today */}
      {(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const isViewingToday = selectedDate === todayStr
        if (!isViewingToday) return null
        const arrivingToday = data.rooms.filter(room =>
          room.room_status === 'hold' &&
          room.booking?.check_in &&
          room.booking.check_in.startsWith(todayStr)
        )
        if (arrivingToday.length === 0) return null
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🛬</span>
              <h3 className="text-sm font-extrabold text-amber-400 uppercase tracking-wider">
                {language === 'mr'
                  ? `आज येणारे पाहुणे — ${arrivingToday.length} खोल्या`
                  : `Arriving Today — ${arrivingToday.length} Room${arrivingToday.length > 1 ? 's' : ''}`}
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {arrivingToday.map(room => (
                <button
                  key={room.id}
                  onClick={() => handleRoomClick(room)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 hover:border-amber-500/50 transition active:scale-[0.99] text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-amber-400">{room.number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-200 truncate">
                      {room.booking?.guests?.name || (language === 'mr' ? 'अज्ञात पाहुणे' : 'Unknown Guest')}
                    </p>
                    <p className="text-[10px] text-slate-500 font-semibold truncate">
                      {room.room_type} · {language === 'mr' ? 'आज चेक-इन' : 'Check-in Today'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                      {language === 'mr' ? 'ताडण करा' : 'Tap to Check In'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Floors Room Layout */}
      <div className="flex flex-col gap-8">
        {sortedFloors.map((floor) => {
          const rooms = roomsByFloor[floor]
          const mid = Math.ceil(rooms.length / 2)
          const leftRooms = rooms.slice(0, mid)
          const rightRooms = rooms.slice(mid)

          // Floor text formatting in Marathi / English
          const floorText = floor === 0 
            ? (language === 'mr' ? 'तळमजला (Ground Floor)' : 'Ground Floor')
            : language === 'mr'
              ? `${floor} ${floor === 1 ? 'ला' : floor === 2 ? 'रा' : floor === 3 ? 'रा' : 'था'} मजला`
              : `${floor}${floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor`

          return (
            <section key={floor} className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4.5 w-4.5 text-slate-500" />
                  <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400">
                    {floorText} — {rooms.length} {language === 'mr' ? 'खोल्या' : 'Rooms'}
                  </h3>
                </div>
                {viewMode === 'map' && (
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                    {language === 'mr' ? 'मजला आराखडा मॅप व्ह्यू' : 'Floor Plan Map View'}
                  </span>
                )}
              </div>
              
              {viewMode === 'map' ? (
                /* Physical Corridor Layout */
                <div className="grid grid-cols-11 gap-2 bg-slate-950/30 border border-slate-800/40 p-4 rounded-3xl relative overflow-hidden min-h-[160px]">
                  {/* Left Side Rooms Corridor */}
                  <div className="col-span-5 flex flex-col gap-3">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 text-center mb-1 block">
                      {language === 'mr' ? 'डावीकडील खोल्या' : 'Left Side Rooms'}
                    </span>
                    {leftRooms.map((room) => (
                      <MiniRoomBox
                        key={room.id}
                        room={room}
                        onClick={handleRoomClick}
                      />
                    ))}
                  </div>

                  {/* Hallway Walkway corridor */}
                  <div className="col-span-1 flex flex-col items-center justify-center border-l border-r border-dashed border-slate-800/80 bg-slate-950/20 relative py-4 select-none rounded-md">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] uppercase tracking-widest text-slate-600 font-extrabold rotate-90 whitespace-nowrap tracking-[0.25em]">
                        {language === 'mr' ? 'कॉरिडॉर' : 'CORRIDOR'}
                      </span>
                    </div>
                  </div>

                  {/* Right Side Rooms Corridor */}
                  <div className="col-span-5 flex flex-col gap-3">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 text-center mb-1 block">
                      {language === 'mr' ? 'उजवीकडील खोल्या' : 'Right Side Rooms'}
                    </span>
                    {rightRooms.map((room) => (
                      <MiniRoomBox
                        key={room.id}
                        room={room}
                        onClick={handleRoomClick}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                /* Grid Cards Layout */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onClick={handleRoomClick}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Sheets Drawers */}
      {selectedRoomForBooking && (
        <BlockRoomSheet
          room={selectedRoomForBooking}
          initialDate={selectedDate}
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

    </div>
  )
}

interface MiniRoomBoxProps {
  room: InventoryRoom
  onClick: (room: InventoryRoom) => void
}

function MiniRoomBox({ room, onClick }: MiniRoomBoxProps) {
  const { language } = useLanguage()

  const getStatusBorderColor = () => {
    switch (room.room_status) {
      case 'vacant':
        return 'border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-400 hover:border-emerald-400/50 hover:bg-emerald-500/[0.06]'
      case 'hold':
        return 'border-amber-500/20 bg-amber-500/[0.03] text-amber-400 hover:border-amber-400/50 hover:bg-amber-500/[0.06]'
      case 'unpaid':
        return 'border-rose-500/20 bg-rose-500/[0.03] text-rose-400 hover:border-rose-400/50 hover:bg-rose-500/[0.06]'
      case 'occupied':
      default:
        return 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/30'
    }
  }

  const getStatusText = () => {
    switch (room.room_status) {
      case 'vacant': return language === 'mr' ? 'रिकामी' : 'Free'
      case 'hold': return language === 'mr' ? 'होल्ड' : 'Hold'
      case 'unpaid': return language === 'mr' ? 'बाकी – जमा करा' : 'Dues – Collect'
      case 'occupied': return language === 'mr' ? 'भरलेली' : 'Occupied'
    }
  }

  return (
    <button
      onClick={() => onClick(room)}
      className={`border rounded-2xl p-3 flex justify-between items-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md w-full text-left ${getStatusBorderColor()}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-slate-100">{room.number}</span>
          <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded-md text-slate-400 truncate">
            {room.room_type.replace(' Deluxe', ' DLX').replace(' Standard', ' STD')}
          </span>
        </div>
        {room.booking?.guests?.name ? (
          <span className="text-[11px] font-semibold text-slate-400 truncate block mt-0.5">
            👤 {room.booking.guests.name}
          </span>
        ) : (
          <span className="text-[10px] text-slate-500 font-medium">
            {language === 'mr' ? 'तयार / उपलब्ध' : 'Ready / Available'}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end flex-shrink-0 ml-2">
        <span className="text-[9px] uppercase tracking-widest font-black opacity-80">
          {getStatusText()}
        </span>
        <span className="text-[10px] text-slate-400 font-bold mt-0.5">
          ₹{room.base_price}
        </span>
      </div>
    </button>
  )
}
