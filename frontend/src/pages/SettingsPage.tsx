import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit3, X, Save, AlertCircle, RefreshCw, Hotel, Users, Search, User, Phone, Calendar, Loader2 } from 'lucide-react'
import api from '../api/client'
import { Room, Guest } from '../types'
import toast from 'react-hot-toast'
import { searchGuests } from '../api/guests'
import GuestProfileSheet from '../components/GuestProfileSheet'
import { format, parseISO } from 'date-fns'
import { useLanguage } from '../context/LanguageContext'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { language, t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'rooms' | 'guests'>('rooms')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  
  // Form states
  const [number, setNumber] = useState('')
  const [floor, setFloor] = useState(1)
  const [roomType, setRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'AC Standard' | 'Non AC Standard'>('AC Deluxe')
  const [basePrice, setBasePrice] = useState(1500)
  const [extraBedPrice, setExtraBedPrice] = useState(500)
  const [isActive, setIsActive] = useState(true)

  // Guest Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Guest[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)

  // Load default guest list on mount, or query debounced search
  useEffect(() => {
    let active = true

    const loadGuests = async (queryStr: string) => {
      setIsSearching(true)
      try {
        const results = await searchGuests(queryStr)
        if (active) {
          setSearchResults(results)
        }
      } catch (err) {
        console.error('Failed to search guests', err)
      } finally {
        if (active) {
          setIsSearching(false)
        }
      }
    }

    if (searchQuery.trim().length === 0) {
      loadGuests('')
      return
    }

    if (searchQuery.trim().length < 2) {
      return
    }

    const delayDebounceFn = setTimeout(() => {
      loadGuests(searchQuery)
    }, 300)

    return () => {
      active = false
      clearTimeout(delayDebounceFn)
    }
  }, [searchQuery])

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
      toast.success(t('room_created_success'))
      closeModal()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || t('failed_create_room')
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
      toast.success(t('room_updated_success'))
      closeModal()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || t('failed_update_room')
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
      toast.error(language === 'mr' ? 'खोली क्रमांक आवश्यक आहे' : 'Room number is required')
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            {activeTab === 'rooms' 
              ? (language === 'mr' ? 'खोलीच्या सेटिंग्ज' : 'Room Settings') 
              : (language === 'mr' ? 'पाहुण्यांची यादी' : 'Guest Registry')}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {activeTab === 'rooms'
              ? (language === 'mr' ? 'हॉटेलच्या खोल्यांचे व्यवस्थापन आणि दर ठरवा' : 'Configure and manage hotel rooms')
              : (language === 'mr' ? 'पाहुण्यांचा राहण्याचा इतिहास, भेटींची नोंद आणि ओळखपत्रे शोधा' : 'Look up guest stays, visits history, and uploaded ID proofs')}
          </p>
        </div>
        {activeTab === 'rooms' && (
          <button
            onClick={openAddModal}
            className="flex items-center px-4 py-2.5 rounded-xl text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 font-semibold transition shadow-lg shadow-emerald-500/10"
          >
            <Plus className="h-5 w-5 mr-2" /> {language === 'mr' ? 'खोली जोडा' : 'Add Room'}
          </button>
        )}
      </div>

      {/* Segmented Switcher */}
      <div className="flex bg-slate-950/80 border border-slate-800/40 p-1 rounded-2xl max-w-[280px] mb-8">
        <button
          onClick={() => setActiveTab('rooms')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
            activeTab === 'rooms'
              ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Hotel className="h-4 w-4" />
          {language === 'mr' ? 'खोल्यांचे नियोजन' : 'Rooms Config'}
        </button>
        <button
          onClick={() => setActiveTab('guests')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
            activeTab === 'guests'
              ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Users className="h-4 w-4" />
          {language === 'mr' ? 'पाहुणे नोंदणी' : 'Guest Registry'}
        </button>
      </div>

      {activeTab === 'rooms' ? (
        <>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="animate-spin h-10 w-10 text-emerald-400 mb-4" />
              <p>{language === 'mr' ? 'खोल्यांचे नियोजन लोड करत आहे...' : 'Loading rooms config...'}</p>
            </div>
          ) : isError ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto">
              <AlertCircle className="h-12 w-12 mb-4" />
              <p className="font-semibold">{language === 'mr' ? 'खोल्यांची माहिती लोड करताना चूक झाली' : 'Error loading rooms'}</p>
              <button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                {t('try_again')}
              </button>
            </div>
          ) : sortedFloors.length === 0 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-400 max-w-md mx-auto">
              <p className="mb-6">{language === 'mr' ? 'अद्याप कोणत्याही खोल्या जोडल्या नाहीत.' : 'No rooms configured yet.'}</p>
              <button
                onClick={openAddModal}
                className="px-5 py-2.5 bg-emerald-500 text-slate-950 rounded-xl font-semibold hover:bg-emerald-600 transition"
              >
                {language === 'mr' ? 'पहिली खोली जोडा' : 'Create First Room'}
              </button>
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in">
              {sortedFloors.map((floorNum) => {
                const floorText = floorNum === 0 
                  ? (language === 'mr' ? 'तळमजला (Ground Floor)' : 'Ground Floor')
                  : language === 'mr'
                    ? `${floorNum} ${floorNum === 1 ? 'ला' : floorNum === 2 ? 'रा' : floorNum === 3 ? 'रा' : 'था'} मजला`
                    : `${floorNum}${floorNum === 1 ? 'st' : floorNum === 2 ? 'nd' : floorNum === 3 ? 'rd' : 'th'} Floor`

                return (
                  <div key={floorNum} className="space-y-4">
                    <h2 className="text-lg font-bold text-emerald-400 border-b border-slate-800 pb-2 uppercase tracking-wider">
                      {floorText}
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
                                {language === 'mr' ? 'खोली' : 'Room'} {room.number}
                              </span>
                              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                                room.is_active
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-slate-800 text-slate-500'
                              }`}>
                                {room.is_active 
                                  ? (language === 'mr' ? 'सक्रिय' : 'Active') 
                                  : (language === 'mr' ? 'निष्क्रिय' : 'Inactive')}
                              </span>
                            </div>
                            <p className="text-slate-400 text-xs mt-1.5">{room.room_type}</p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-end">
                            <div>
                              <span className="text-slate-500 text-[10px] block uppercase font-medium">
                                {language === 'mr' ? 'मूळ भाडे' : 'Base Price'}
                              </span>
                              <span className="text-slate-200 font-bold text-sm">₹{room.base_price}</span>
                            </div>
                            <Edit3 className="h-4 w-4 text-slate-500 hover:text-emerald-400 transition" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Guest Search Bar */}
          <div className="glass-panel p-4 rounded-2xl bg-slate-900/45 border-slate-850 max-w-2xl">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              {language === 'mr' ? 'पाहुणे शोधा' : 'Search Guests'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder={language === 'mr' ? 'पाहुण्याचे नाव किंवा मोबाईल नंबर टाईप करा...' : 'Type guest name or phone number...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Search results list */}
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-xs font-semibold">{language === 'mr' ? 'माहिती शोधत आहे...' : 'Searching database...'}</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
              {searchResults.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setSelectedGuest(g)}
                  className="glass-panel cursor-pointer rounded-2xl p-5 border border-emerald-500/10 hover:border-emerald-450/40 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between min-h-[120px] bg-slate-900/30"
                >
                  <div>
                    <h3 className="text-lg font-black text-slate-100 flex items-center gap-2">
                      <User className="h-4.5 w-4.5 text-emerald-400" />
                      {g.name}
                    </h3>
                    <a
                      href={`tel:${g.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-slate-400 hover:text-emerald-400 font-bold mt-1.5 flex items-center gap-1.5 transition"
                    >
                      <Phone className="h-3.5 w-3.5 text-slate-500" />
                      {g.phone}
                    </a>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center text-[11px] text-slate-400 font-semibold">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md text-[10px]">
                      {g.total_visits} {language === 'mr' ? 'भेटी' : (g.total_visits === 1 ? 'visit' : 'visits')}
                    </span>
                    {g.last_visit && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                        {language === 'mr' ? 'शेवटची भेट:' : 'Last:'} {format(parseISO(g.last_visit + 'T00:00:00'), 'dd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery.trim().length >= 2 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto">
              <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold">
                {language === 'mr' 
                  ? `या नावाने पाहुणे सापडले नाहीत: "${searchQuery}"` 
                  : `No guests found matching "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto bg-slate-900/20 border-slate-850 animate-fade-in">
              <Users className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
              <h4 className="text-sm font-extrabold text-slate-300">
                {language === 'mr' ? 'पाहुण्यांचे प्रोफाईल शोधा' : 'Lookup Guest Profiles'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {language === 'mr' 
                  ? 'पाहुण्यांचा जुना इतिहास आणि अपलोड केलेली ओळखपत्रे शोधण्यासाठी वर पाहुण्याचे नाव किंवा मोबाईल नंबरचे २ किंवा त्यापेक्षा जास्त अक्षरे टाईप करा.' 
                  : "Type 2 or more characters of a guest's name or mobile number in the search bar above to fetch stay histories and uploaded ID cards."}
              </p>
            </div>
          )}

          {/* Guest detail sheet portal */}
          {selectedGuest && (
            <GuestProfileSheet
              guest={selectedGuest}
              onClose={() => setSelectedGuest(null)}
            />
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl relative border border-slate-700/50">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-100 mb-6">
              {editingRoom 
                ? (language === 'mr' ? `खोली ${editingRoom.number} संपादित करा` : `Edit Room ${editingRoom.number}`)
                : (language === 'mr' ? 'नवीन खोली जोडा' : 'Add New Room')}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  {language === 'mr' ? 'खोली क्रमांक' : 'Room Number'}
                </label>
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    {language === 'mr' ? 'मजला' : 'Floor'}
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    {language === 'mr' ? 'स्थिती' : 'Status'}
                  </label>
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  >
                    <option value="true">{language === 'mr' ? 'सक्रिय' : 'Active'}</option>
                    <option value="false">{language === 'mr' ? 'निष्क्रिय' : 'Inactive'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  {language === 'mr' ? 'खोलीचा प्रकार' : 'Room Type'}
                </label>
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    {language === 'mr' ? 'मूळ भाडे (₹)' : 'Base Price (₹)'}
                  </label>
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    {language === 'mr' ? 'अतिरिक्त बेड (₹)' : 'Extra Bed (₹)'}
                  </label>
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
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 flex justify-center items-center bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-semibold rounded-xl py-2.5 transition disabled:opacity-50"
                >
                  <Save className="h-4 w-4 mr-2" /> {language === 'mr' ? 'जतन करा' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
