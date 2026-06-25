import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw, Layers, CheckCircle2, AlertTriangle, UserMinus, ShieldAlert, Loader2 } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import RoomCard from '../components/RoomCard'
import BlockRoomSheet from '../components/BlockRoomSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import type { InventoryRoom } from '../types'

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<InventoryRoom | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

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
        <p className="text-slate-400 font-semibold text-sm">Fetching daily inventory status...</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <ShieldAlert className="h-12 w-12 text-rose-500/80 mb-4" />
        <h2 className="text-lg font-bold text-slate-200">Failed to load inventory</h2>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">
          Please check your connection or setup and try again.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-bold"
        >
          Try Again
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

  const formattedDate = format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-24 animate-fade-in">
      
      {/* Date Navigation Bar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/40">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevDay}
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <button
            onClick={handleToday}
            className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-900 text-xs font-bold text-slate-300 transition"
          >
            Today
          </button>

          <button
            onClick={handleNextDay}
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4.5 w-4.5 text-emerald-400" />
          <span className="text-sm font-extrabold text-slate-200 tracking-tight">
            {formattedDate}
          </span>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition ml-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Occupancy Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Vacant
          </span>
          <span className="text-2xl font-black text-slate-100 mt-2">{data.summary.vacant}</span>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Occupied
          </span>
          <span className="text-2xl font-black text-slate-100 mt-2">{data.summary.occupied}</span>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between bg-amber-500/5 border-amber-500/10">
          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Hold
          </span>
          <span className="text-2xl font-black text-slate-100 mt-2">{data.summary.hold}</span>
        </div>

        <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between bg-rose-500/5 border-rose-500/10">
          <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500 flex items-center gap-1.5">
            <UserMinus className="h-3.5 w-3.5" />
            Unpaid Dues
          </span>
          <span className="text-2xl font-black text-slate-100 mt-2">{data.summary.unpaid}</span>
        </div>
      </div>

      {/* Floors Room Layout */}
      <div className="flex flex-col gap-8">
        {sortedFloors.map((floor) => {
          const rooms = roomsByFloor[floor]
          return (
            <section key={floor} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                <Layers className="h-4.5 w-4.5 text-slate-500" />
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400">
                  {floor === 0 ? 'Ground Floor' : `${floor}${floor === 1 ? 'st' : floor === 2 ? 'nd' : floor === 3 ? 'rd' : 'th'} Floor`} — {rooms.length} Rooms
                </h3>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onClick={handleRoomClick}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* Sheets Drawers */}
      {selectedRoomForBooking && (
        <BlockRoomSheet
          room={selectedRoomForBooking}
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
          onSuccess={() => {
            setSelectedBookingId(null)
            refetch()
          }}
        />
      )}

    </div>
  )
}
