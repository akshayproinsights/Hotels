import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit3, X, Save, AlertCircle, RefreshCw } from 'lucide-react'
import api from '../api/client'
import { Room } from '../types'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  
  // Form states
  const [number, setNumber] = useState('')
  const [floor, setFloor] = useState(1)
  const [roomType, setRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'AC Standard' | 'Non AC Standard'>('AC Deluxe')
  const [basePrice, setBasePrice] = useState(1500)
  const [extraBedPrice, setExtraBedPrice] = useState(500)
  const [isActive, setIsActive] = useState(true)

  // Fetch Rooms
  const { data: rooms = [], isLoading, isError, refetch } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: async () => {
      const res = await api.get('/rooms')
      return res.data
    }
  })

  // Create Room Mutation
  const createMutation = useMutation({
    mutationFn: async (newRoom: any) => {
      const res = await api.post('/rooms', newRoom)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Room created successfully')
      closeModal()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || 'Failed to create room'
      toast.error(msg)
    }
  })

  // Update Room Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/rooms/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Room updated successfully')
      closeModal()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || 'Failed to update room'
      toast.error(msg)
    }
  })

  const openAddModal = () => {
    setEditingRoom(null)
    setNumber('')
    setFloor(1)
    setRoomType('AC Deluxe')
    setBasePrice(1500)
    setExtraBedPrice(500)
    setIsActive(true)
    setModalOpen(true)
  }

  const openEditModal = (room: Room) => {
    setEditingRoom(room)
    setNumber(room.number)
    setFloor(room.floor)
    setRoomType(room.room_type)
    setBasePrice(room.base_price)
    setExtraBedPrice(room.extra_bed_price)
    setIsActive(room.is_active)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingRoom(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!number.trim()) {
      toast.error('Room number is required')
      return
    }

    const payload = {
      number,
      floor,
      room_type: roomType,
      base_price: Number(basePrice),
      extra_bed_price: Number(extraBedPrice),
      is_active: isActive
    }

    if (editingRoom) {
      updateMutation.mutate({ id: editingRoom.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // Group rooms by floor
  const roomsByFloor = rooms.reduce((acc: { [key: number]: Room[] }, room) => {
    if (!acc[room.floor]) {
      acc[room.floor] = []
    }
    acc[room.floor].push(room)
    return acc
  }, {})

  const sortedFloors = Object.keys(roomsByFloor)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            Room Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Configure and manage hotel rooms</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center px-4 py-2.5 rounded-xl text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 font-semibold transition shadow-lg shadow-emerald-500/10"
        >
          <Plus className="h-5 w-5 mr-2" /> Add Room
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCw className="animate-spin h-10 w-10 text-emerald-400 mb-4" />
          <p>Loading rooms config...</p>
        </div>
      ) : isError ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto">
          <AlertCircle className="h-12 w-12 mb-4" />
          <p className="font-semibold">Error loading rooms</p>
          <button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
            Retry
          </button>
        </div>
      ) : sortedFloors.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-slate-400 max-w-md mx-auto">
          <p className="mb-6">No rooms configured yet.</p>
          <button
            onClick={openAddModal}
            className="px-5 py-2.5 bg-emerald-500 text-slate-950 rounded-xl font-semibold hover:bg-emerald-600 transition"
          >
            Create First Room
          </button>
        </div>
      ) : (
        <div className="space-y-10 animate-fade-in">
          {sortedFloors.map((floorNum) => (
            <div key={floorNum} className="space-y-4">
              <h2 className="text-lg font-bold text-emerald-400 border-b border-slate-800 pb-2 uppercase tracking-wider">
                {floorNum === 0 ? 'Ground Floor' : `${floorNum}${floorNum === 1 ? 'st' : floorNum === 2 ? 'nd' : floorNum === 3 ? 'rd' : 'th'} Floor`}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {roomsByFloor[floorNum].map((room) => (
                  <div
                    key={room.id}
                    onClick={() => openEditModal(room)}
                    className={`glass-panel cursor-pointer rounded-2xl p-5 border transition-all duration-200 hover:scale-[1.02] flex flex-col justify-between min-h-[140px] ${
                      room.is_active
                        ? 'border-emerald-500/10 hover:border-emerald-400/30'
                        : 'border-slate-800 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-2xl font-extrabold text-slate-100">
                          Room {room.number}
                        </span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                          room.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500'
                        }`}>
                          {room.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1.5">{room.room_type}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-end">
                      <div>
                        <span className="text-slate-500 text-[10px] block uppercase font-medium">Base Price</span>
                        <span className="text-slate-200 font-bold text-sm">₹{room.base_price}</span>
                      </div>
                      <Edit3 className="h-4 w-4 text-slate-500 hover:text-emerald-400 transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl relative border border-slate-700/50">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-100 mb-6">
              {editingRoom ? `Edit Room ${editingRoom.number}` : 'Add New Room'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Room Number</label>
                <input
                  type="text"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  placeholder="e.g. 101"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Floor</label>
                  <input
                    type="number"
                    required
                    value={floor}
                    onChange={(e) => setFloor(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Status</label>
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Room Type</label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                >
                  <option value="AC Deluxe">AC Deluxe</option>
                  <option value="Non AC Deluxe">Non AC Deluxe</option>
                  <option value="AC Standard">AC Standard</option>
                  <option value="Non AC Standard">Non AC Standard</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Base Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Extra Bed (₹)</label>
                  <input
                    type="number"
                    required
                    value={extraBedPrice}
                    onChange={(e) => setExtraBedPrice(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                    min="0"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-slate-800 text-slate-200 rounded-xl py-2.5 font-semibold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 flex justify-center items-center bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-semibold rounded-xl py-2.5 transition disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2" /> Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
