import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit3, X, Save, AlertCircle, RefreshCw, Hotel, Users, Search, User, Phone, Calendar, Loader2, Check, Trash2, History } from 'lucide-react'
import api from '../api/client'
import { Room, Customer } from '../types'
import toast from 'react-hot-toast'
import { searchCustomers, deleteCustomer } from '../api/customers'
import { getAllBookings } from '../api/bookings'
import CustomerProfileSheet from '../components/CustomerProfileSheet'
import BookingDetailSheet from '../components/BookingDetailSheet'
import NumericKeypad from '../components/NumericKeypad'
import { format, parseISO } from 'date-fns'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../hooks/useAuth'
import useLongPress from '../hooks/useLongPress'
import { getCustomerNameDisplay, cleanPhoneDisplay } from '../utils/customer'
import { formatNameByLanguage } from '../utils/nameHelper'

interface CustomerCardProps {
  customer: Customer
  onClick: (customer: Customer) => void
  onLongPress: (customer: Customer) => void
  language: string
}

function CustomerCard({ customer, onClick, onLongPress, language }: CustomerCardProps) {
  const longPressHandlers = useLongPress(
    () => onLongPress(customer),
    () => onClick(customer)
  )

  const displayName = formatNameByLanguage(getCustomerNameDisplay(customer.name).name, language)
  const displayPhone = cleanPhoneDisplay(customer.phone)

  return (
    <div
      {...longPressHandlers}
      className="glass-panel cursor-pointer rounded-xl p-3.5 border border-emerald-500/10 hover:border-emerald-450/40 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between bg-slate-900/30 active:scale-[0.99]"
    >
      <div className="flex justify-between items-center gap-3">
        <h3 className="text-base font-black text-slate-100 flex items-center gap-2 truncate">
          <User className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="truncate">{displayName}</span>
        </h3>
        <a
          href={`tel:${displayPhone}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-slate-400 hover:text-emerald-400 font-bold flex items-center gap-1.5 transition flex-shrink-0"
        >
          <Phone className="h-3.5 w-3.5 text-slate-500" />
          {displayPhone}
        </a>
      </div>
      
      <div className="mt-3 pt-2.5 border-t border-slate-800/40 flex justify-between items-center text-[11px] text-slate-400 font-semibold">
        <span className="inline-block whitespace-nowrap bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md text-[10px] shrink-0">
          {customer.total_visits} {language === 'mr' ? 'भेटी' : (customer.total_visits === 1 ? 'visit' : 'visits')}
        </span>
        {customer.last_visit ? (
          <span className="flex items-center gap-1 text-slate-405">
            <Calendar className="h-3.5 w-3.5 text-slate-550" />
            {language === 'mr' ? 'शेवटची भेट:' : 'Last:'} {format(parseISO(customer.last_visit + 'T00:00:00'), 'dd MMM yyyy')}
          </span>
        ) : customer.created_at ? (
          <span className="flex items-center gap-1 text-slate-405">
            <Calendar className="h-3.5 w-3.5 text-slate-550" />
            {language === 'mr' ? 'चेक इन ::' : 'Check In ::'} {format(parseISO(customer.created_at), 'dd MMM yyyy')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { language, t } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  // Hide Rooms tab for the 'santosh' account (becomes santosh@snapkhata.com after login transformation)
  // While auth is still loading treat as restricted to avoid a brief Rooms tab flash
  const isSantosh = authLoading || (user?.email?.startsWith('santosh@') ?? false)
  const [activeTab, setActiveTab] = useState<'rooms' | 'customers' | 'trash' | 'history'>('history')

  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'active' | 'reserved' | 'checked_out' | 'cancelled'>('all')
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  // Fetch All Bookings for Booking History
  const { data: allBookings = [], isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ['allBookings'],
    queryFn: getAllBookings,
    enabled: activeTab === 'history'
  })

  const filteredBookings = useMemo(() => {
    let result = allBookings

    // Filter out bookings with deleted customers
    result = result.filter(b => {
      const name = b.customers?.name || ''
      return !name.startsWith('[DELETED] ')
    })

    // Filter by status
    if (historyStatusFilter !== 'all') {
      if (historyStatusFilter === 'active') {
        result = result.filter(b => b.status === 'active' && b.is_checked_in)
      } else if (historyStatusFilter === 'reserved') {
        result = result.filter(b => b.status === 'active' && !b.is_checked_in)
      } else {
        result = result.filter(b => b.status === historyStatusFilter)
      }
    }

    // Filter by search query
    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase()
      result = result.filter(b => {
        const customerName = b.customers?.name || ''
        const customerPhone = b.customers?.phone || ''
        const roomNumber = b.rooms?.number || ''
        const bookingNumber = b.booking_number || ''
        
        return customerName.toLowerCase().includes(q) ||
               customerPhone.includes(q) ||
               roomNumber.toLowerCase().includes(q) ||
               bookingNumber.toLowerCase().includes(q)
      })
    }

    return [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [allBookings, historyStatusFilter, historySearchQuery])

  useEffect(() => {
    if (isSantosh && activeTab === 'rooms') {
      setActiveTab('customers')
    }
  }, [isSantosh, activeTab])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [trashSearchQuery, setTrashSearchQuery] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [showDeleteCustomerConfirm, setShowDeleteCustomerConfirm] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

  // Fetch Cancelled Bookings for Trash Bin
  const { data: cancelledBookings = [], isLoading: isTrashLoading, refetch: refetchTrash } = useQuery<any[]>({
    queryKey: ['cancelledBookings'],
    queryFn: async () => {
      const res = await api.get('/bookings/cancelled')
      return res.data
    },
    enabled: activeTab === 'trash'
  })

  // Restore Cancelled Booking Mutation
  const restoreMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await api.post(`/bookings/${bookingId}/restore`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancelledBookings'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success(language === 'mr' ? 'बुकिंग पुनर्संचयित केले!' : 'Booking restored successfully!')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || (language === 'mr' ? 'पुनर्संचयित करण्यात अयशस्वी' : 'Failed to restore booking')
      toast.error(msg)
    }
  })

  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<any | null>(null)

  const deleteMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await api.delete(`/bookings/${bookingId}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancelledBookings'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success(language === 'mr' ? 'बुकिंग कायमचे डिलीट केले!' : 'Booking permanently deleted!')
      setBookingToDelete(null)
      setShowPermanentDeleteConfirm(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || (language === 'mr' ? 'डिलीट करण्यात अयशस्वी' : 'Failed to delete booking')
      toast.error(msg)
    }
  })

  const filteredCancelledBookings = cancelledBookings.filter(b => 
    b.customers?.name?.toLowerCase().includes(trashSearchQuery.toLowerCase()) ||
    b.rooms?.number?.toLowerCase().includes(trashSearchQuery.toLowerCase())
  )
  
  // Form states
  const [number, setNumber] = useState('')
  const [floor, setFloor] = useState(1)
  const [roomType, setRoomType] = useState<'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'>('AC Deluxe')
  const [basePrice, setBasePrice] = useState(1500)
  const [extraBedPrice, setExtraBedPrice] = useState(500)
  const [nonAcPrice, setNonAcPrice] = useState(1000)
  const [nonAcExtraBedPrice, setNonAcExtraBedPrice] = useState(300)
  const [isActive, setIsActive] = useState(true)
  const [activeKeypad, setActiveKeypad] = useState<'floor' | 'basePrice' | 'extraBedPrice' | 'nonAcPrice' | 'nonAcExtraBedPrice' | null>(null)

  // Customer Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // Load default customer list on mount, or query debounced search
  useEffect(() => {
    let active = true

    const loadCustomers = async (queryStr: string) => {
      setIsSearching(true)
      try {
        const results = await searchCustomers(queryStr)
        if (active) {
          setSearchResults(results)
        }
      } catch (err) {
        console.error('Failed to search customers', err)
      } finally {
        if (active) {
          setIsSearching(false)
        }
      }
    }

    if (searchQuery.trim().length === 0) {
      loadCustomers('')
      return
    }

    if (searchQuery.trim().length < 2) {
      return
    }

    const delayDebounceFn = setTimeout(() => {
      loadCustomers(searchQuery)
    }, 300)

    return () => {
      active = false
      clearTimeout(delayDebounceFn)
    }
  }, [searchQuery, refreshTrigger])

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

  // Delete Room Mutation
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null)
  const [showDeleteRoomConfirm, setShowDeleteRoomConfirm] = useState(false)

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await api.delete(`/rooms/${roomId}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      toast.success(language === 'mr' ? 'खोली यशस्विरित्या डिलीट केली!' : 'Room deleted successfully!')
      setRoomToDelete(null)
      setShowDeleteRoomConfirm(false)
      if (modalOpen) {
        closeModal()
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || (language === 'mr' ? 'खोली डिलीट करण्यात अयशस्वी' : 'Failed to delete room')
      toast.error(msg)
    }
  })

  // Delete Customer Mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return deleteCustomer(customerId)
    },
    onSuccess: () => {
      toast.success(language === 'mr' ? 'ग्राहक यशस्विरित्या डिलीट केला!' : 'Customer deleted successfully!')
      setCustomerToDelete(null)
      setShowDeleteCustomerConfirm(false)
      setRefreshTrigger(prev => prev + 1)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || (language === 'mr' ? 'ग्राहक डिलीट करण्यात अयशस्वी' : 'Failed to delete customer')
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
    setNonAcPrice(1000)
    setNonAcExtraBedPrice(300)
    setIsActive(true)
    setModalOpen(true)
  }

  const openEditModal = (room: Room) => {
    setEditingRoom(room)
    setNumber(room.number)
    setFloor(room.floor)
    const baseType = room.room_type === 'VIP AC Suite' || room.room_type === 'VIP Non AC Suite' ? 'VIP AC Suite' : 'AC Deluxe'
    setRoomType(baseType)
    setBasePrice(room.base_price)
    setExtraBedPrice(room.extra_bed_price)
    setNonAcPrice(room.non_ac_price || 0)
    setNonAcExtraBedPrice(room.non_ac_extra_bed_price || 0)
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
      non_ac_price: Number(nonAcPrice),
      non_ac_extra_bed_price: Number(nonAcExtraBedPrice),
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
            {activeTab === 'rooms' && !isSantosh
              ? (language === 'mr' ? 'खोलीच्या सेटिंग्ज' : 'Room Settings') 
              : activeTab === 'customers'
              ? (language === 'mr' ? 'ग्राहकांची यादी' : 'Customer Registry')
              : activeTab === 'history'
              ? (language === 'mr' ? 'बुकिंग इतिहास' : 'Booking History')
              : (language === 'mr' ? 'कचरापेटी (Trash Bin)' : 'Trash Bin')}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {activeTab === 'rooms' && !isSantosh
              ? (language === 'mr' ? 'हॉटेलच्या खोल्यांचे व्यवस्थापन आणि दर ठरवा' : 'Configure and manage hotel rooms')
              : activeTab === 'customers'
              ? (language === 'mr' ? 'ग्राहकांचा राहण्याचा इतिहास, भेटींची नोंद आणि ओळखपत्रे शोधा' : 'Look up customer stays, visits history, and uploaded ID proofs')
              : activeTab === 'history'
              ? (language === 'mr' ? 'केलेले सर्व बुकिंग्स शोधा, फिल्टर करा आणि व्यवस्थापित करा' : 'Search, filter, and manage all past and current bookings')
              : (language === 'mr' ? 'रद्द केलेले बुकिंग्स तपासा आणि पुनर्संचयित करा' : 'Review and restore soft-cancelled bookings')}
          </p>
        </div>
        {activeTab === 'rooms' && !isSantosh && (
          <button
            onClick={openAddModal}
            className="flex items-center px-4 py-2.5 rounded-xl text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 font-semibold transition shadow-lg shadow-emerald-500/10"
          >
            <Plus className="h-5 w-5 mr-2" /> {language === 'mr' ? 'खोली जोडा' : 'Add Room'}
          </button>
        )}
      </div>

      {/* Segmented Switcher */}
      <div className="flex bg-slate-950/80 border border-slate-800/40 p-1 rounded-2xl max-w-lg mb-8">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
            activeTab === 'history'
              ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <History className="h-4 w-4 text-emerald-500" />
          {language === 'mr' ? 'इतिहास' : 'History'}
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
            activeTab === 'customers'
              ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Users className="h-4 w-4" />
          {language === 'mr' ? 'ग्राहक' : 'Customers'}
        </button>
        {!isSantosh && (
          <button
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === 'rooms'
                ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <Hotel className="h-4 w-4" />
            {language === 'mr' ? 'खोल्या' : 'Rooms'}
          </button>
        )}
        <button
          onClick={() => setActiveTab('trash')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
            activeTab === 'trash'
              ? 'bg-slate-905 text-emerald-400 border border-slate-800 shadow-md'
              : 'text-slate-550 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Trash2 className="h-4 w-4 text-rose-500" />
          {language === 'mr' ? 'कचरापेटी' : 'Trash Bin'}
        </button>
      </div>

      {activeTab === 'rooms' && !isSantosh ? (
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
                            <p className="text-slate-400 text-xs mt-1.5 font-bold uppercase tracking-wider">
                              {room.room_type.includes('VIP') ? (language === 'mr' ? 'VIP सूट' : 'VIP Suite') : (language === 'mr' ? 'डीलक्स' : 'Deluxe')}
                            </p>
                          </div>

                          <div className="flex flex-col gap-1 text-[11px] text-slate-400 mt-2 border-t border-slate-800/40 pt-2">
                            <div className="flex justify-between">
                              <span>AC: <strong className="text-emerald-400 font-bold">₹{room.base_price}</strong></span>
                              <span>Extra Bed: <strong className="text-slate-300 font-semibold">₹{room.extra_bed_price}</strong></span>
                            </div>
                            <div className="flex justify-between">
                              <span>Non-AC: <strong className="text-sky-400 font-bold">₹{room.non_ac_price}</strong></span>
                              <span>Extra Bed: <strong className="text-slate-300 font-semibold">₹{room.non_ac_extra_bed_price}</strong></span>
                            </div>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-800/40 flex justify-end items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditModal(room)}
                              className="p-1.5 text-slate-550 hover:text-emerald-400 transition rounded-lg hover:bg-slate-800/80"
                              title={language === 'mr' ? 'संपादित करा' : 'Edit'}
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRoomToDelete(room)
                                setShowDeleteRoomConfirm(true)
                              }}
                              className="p-1.5 text-slate-550 hover:text-rose-450 transition rounded-lg hover:bg-rose-500/10"
                              title={language === 'mr' ? 'डिलीट करा' : 'Delete'}
                            >
                              <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-400" />
                            </button>
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
      ) : (activeTab === 'customers' || (activeTab === 'rooms' && isSantosh)) ? (
        <div className="space-y-6 animate-fade-in">
          {/* Customer Search Bar */}
          <div className="glass-panel p-4 rounded-2xl bg-slate-900/45 border-slate-850 max-w-2xl">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              {language === 'mr' ? 'ग्राहक शोधा' : 'Search Customers'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder={language === 'mr' ? 'ग्राहकाचे नाव किंवा मोबाईल नंबर टाईप करा...' : 'Type customer name or phone number...'}
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
                <CustomerCard
                  key={g.id}
                  customer={g}
                  onClick={setSelectedCustomer}
                  onLongPress={(c) => {
                    setCustomerToDelete(c)
                    setShowDeleteCustomerConfirm(true)
                  }}
                  language={language}
                />
              ))}
            </div>
          ) : searchQuery.trim().length >= 2 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto">
              <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold">
                {language === 'mr' 
                  ? `या नावाने ग्राहक सापडले नाहीत: "${searchQuery}"` 
                  : `No customers found matching "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto bg-slate-900/20 border-slate-850 animate-fade-in">
              <Users className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
              <h4 className="text-sm font-extrabold text-slate-300">
                {language === 'mr' ? 'ग्राहकांचे प्रोफाईल शोधा' : 'Lookup Customer Profiles'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {language === 'mr' 
                  ? 'ग्राहकांचा जुना इतिहास आणि अपलोड केलेली ओळखपत्रे शोधण्यासाठी वर ग्राहकाचे नाव किंवा मोबाईल नंबरचे २ किंवा त्यापेक्षा जास्त अक्षरे टाईप करा.' 
                  : "Type 2 or more characters of a customer's name or mobile number in the search bar above to fetch stay histories and uploaded ID cards."}
              </p>
            </div>
          )}

          {/* Customer detail sheet portal */}
          {selectedCustomer && (
            <CustomerProfileSheet
              customer={selectedCustomer}
              onClose={() => setSelectedCustomer(null)}
            />
          )}
        </div>
      ) : activeTab === 'history' ? (
        <div className="space-y-4 animate-fade-in">
          {/* Compact Search & Refresh Input Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder={language === 'mr' ? 'नाव, फोन, रूम किंवा बुकिंग नं...' : 'Search guest, phone, room, ID...'}
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-slate-955 border border-slate-850 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
              />
              {historySearchQuery && (
                <button
                  onClick={() => setHistorySearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => refetchHistory()}
              disabled={isHistoryLoading}
              className="p-3.5 rounded-2xl bg-slate-955 border border-slate-850 hover:bg-slate-900 text-slate-450 hover:text-slate-200 transition flex items-center justify-center shrink-0"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isHistoryLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Horizontally Scrollable Status Filter Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-4 px-4">
            {[
              { id: 'all', label: language === 'mr' ? 'सर्व' : 'All' },
              { id: 'active', label: language === 'mr' ? 'चालू (In-House)' : 'In-House' },
              { id: 'reserved', label: language === 'mr' ? 'आरक्षित' : 'Reserved' },
              { id: 'checked_out', label: language === 'mr' ? 'चेक आउट' : 'Checked Out' },
              { id: 'cancelled', label: language === 'mr' ? 'रद्द' : 'Cancelled' }
            ].map(chip => {
              const isActive = historyStatusFilter === chip.id
              return (
                <button
                  key={chip.id}
                  onClick={() => setHistoryStatusFilter(chip.id as any)}
                  className={`py-2 px-4 rounded-xl text-xs font-black transition-all duration-150 border whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-455 border-emerald-500/35'
                      : 'bg-slate-900/30 text-slate-400 border-slate-800/80 hover:text-slate-350 hover:bg-slate-900/50'
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>

          {isHistoryLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-xs font-semibold">{language === 'mr' ? 'बुकिंग इतिहास लोड करत आहे...' : 'Loading booking history...'}</p>
            </div>
          ) : filteredBookings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
              {filteredBookings.map((b) => {
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBookingId(b.id)}
                    className="glass-panel cursor-pointer rounded-2xl p-5 border border-slate-800/80 bg-slate-900/30 hover:border-emerald-500/20 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between min-h-[160px] active:scale-[0.99] relative overflow-hidden"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-955 border border-slate-850 px-2 py-0.5 rounded-md text-[10px] text-slate-400 font-extrabold whitespace-nowrap">
                            {b.booking_number}
                          </span>
                          <span className="bg-slate-955 border border-slate-850 px-2 py-0.5 rounded-md text-[10px] text-emerald-400 font-extrabold whitespace-nowrap">
                            {language === 'mr' ? 'खोली' : 'Room'} {b.rooms?.number || b.room_id}
                          </span>
                        </div>
                        
                        {/* Status Badge */}
                        {(() => {
                          let statusText = ''
                          let statusStyle = ''
                          if (b.status === 'cancelled') {
                            statusText = language === 'mr' ? 'रद्द' : 'Cancelled'
                            statusStyle = 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                          } else if (b.status === 'checked_out') {
                            statusText = language === 'mr' ? 'चेक आउट' : 'Checked Out'
                            statusStyle = 'bg-slate-950 border border-slate-850 text-slate-400'
                          } else if (b.status === 'active') {
                            if (b.is_checked_in) {
                              statusText = language === 'mr' ? 'चालू' : 'In-House'
                              statusStyle = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            } else {
                              statusText = language === 'mr' ? 'आरक्षित' : 'Reserved'
                              statusStyle = 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }
                          }
                          return (
                            <span className={`text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full ${statusStyle} whitespace-nowrap`}>
                              {statusText}
                            </span>
                          )
                        })()}
                      </div>
                      
                      {/* Customer Name & Phone */}
                      <div className="mt-3.5">
                        <h3 className="text-base font-black text-slate-100 flex items-center gap-1.5 truncate">
                          👤 {(() => {
                            const { name: dName, isDeleted } = getCustomerNameDisplay(b.customers?.name)
                            const displayName = formatNameByLanguage(dName, language)
                            return (
                              <>
                                <span className="truncate">{displayName}</span>
                                {isDeleted && (
                                  <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1 whitespace-nowrap">
                                    {language === 'mr' ? 'डिलीट केलेले' : 'Deleted'}
                                  </span>
                                )}
                              </>
                            )
                          })()}
                        </h3>
                        <p className="text-xs text-slate-505 font-medium mt-1">
                          📞 {cleanPhoneDisplay(b.customers?.phone)}
                        </p>
                      </div>

                      {/* Dates & Pricing */}
                      <div className="mt-3.5 space-y-1.5 border-t border-slate-800/40 pt-3">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'कालावधी:' : 'Duration:'}</span>
                          <span className="text-slate-350">
                            {format(parseISO(b.check_in), 'dd MMM, hh:mm a')} - {format(parseISO(b.check_out), 'dd MMM, hh:mm a')}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'एकूण रक्कम:' : 'Total Amount:'}</span>
                          <span className="text-slate-300 font-bold">₹{parseFloat(b.total_amount || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'जमा / बाकी:' : 'Paid / Balance:'}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-550 font-bold">₹{parseFloat(b.paid_amount || 0).toLocaleString()}</span>
                            <span className="text-slate-700">/</span>
                            {(() => {
                              const balance = parseFloat(b.total_amount || 0) - parseFloat(b.paid_amount || 0)
                              const balanceStyle = balance > 0 ? 'text-rose-455 font-bold' : 'text-slate-500 font-semibold'
                              return <span className={balanceStyle}>₹{balance.toLocaleString()}</span>
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Card Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1 text-slate-450 font-bold">
                        💳 {b.payment_mode || 'Pending'}
                      </span>
                      <span className="text-emerald-450 hover:text-emerald-400 transition flex items-center gap-0.5">
                        {language === 'mr' ? 'तपशील पहा' : 'View Details'} ➔
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto">
              <Calendar className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
              <p className="text-sm font-semibold">
                {language === 'mr' ? 'कोणतेही बुकिंग सापडले नाही.' : 'No bookings found.'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {language === 'mr' 
                  ? 'फिल्टर किंवा सर्च क्वेरी बदलून पुन्हा प्रयत्न करा.' 
                  : 'Try changing your filter settings or search query to see history.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Trash Bin tab */
        <div className="space-y-6 animate-fade-in">
          {/* Trash Header and Search */}
          <div className="glass-panel p-4 rounded-2xl bg-slate-900/45 border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                {language === 'mr' ? 'रद्द केलेले बुकिंग शोधा' : 'Search Cancelled Bookings'}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder={language === 'mr' ? 'ग्राहकाचे नाव किंवा खोली क्रमांक टाईप करा...' : 'Type customer name or room number...'}
                  value={trashSearchQuery}
                  onChange={(e) => setTrashSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-850 rounded-2xl text-slate-200 focus:outline-none focus:border-emerald-500 text-sm"
                />
                {trashSearchQuery && (
                  <button
                    onClick={() => setTrashSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => refetchTrash()}
              disabled={isTrashLoading}
              className="p-2.5 rounded-xl bg-slate-955 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition self-end sm:self-center"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isTrashLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isTrashLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-xs font-semibold">{language === 'mr' ? 'रद्द केलेले बुकिंग लोड करत आहे...' : 'Loading trash bin...'}</p>
            </div>
          ) : filteredCancelledBookings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCancelledBookings.map((b) => {
                return (
                  <div
                    key={b.id}
                    className="glass-panel rounded-2xl p-5 border border-slate-800/80 bg-slate-900/30 flex flex-col justify-between min-h-[160px] relative overflow-hidden"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="text-base font-extrabold text-slate-100 truncate pr-2 flex items-center gap-1">
                          👤 {(() => {
                            const { name: dName, isDeleted } = getCustomerNameDisplay(b.customers?.name);
                            const displayName = formatNameByLanguage(dName, language);
                            return (
                              <>
                                <span className="truncate">{displayName}</span>
                                {isDeleted && (
                                  <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-rose-500/20 ml-1 whitespace-nowrap">
                                    {language === 'mr' ? 'डिलीट केलेले' : 'Deleted'}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </h3>
                        <span className="bg-slate-955 border border-slate-850 px-2 py-0.5 rounded-md text-[10px] text-slate-400 font-extrabold whitespace-nowrap">
                          {language === 'mr' ? 'खोली' : 'Room'} {b.rooms?.number || b.room_id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        📞 {cleanPhoneDisplay(b.customers?.phone)}
                      </p>
                      
                      <div className="mt-3.5 space-y-1.5 border-t border-slate-800/40 pt-3">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'कालावधी:' : 'Duration:'}</span>
                          <span className="text-slate-350">
                            {format(parseISO(b.check_in), 'dd MMM, hh:mm a')} - {format(parseISO(b.check_out), 'dd MMM, hh:mm a')}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'एकूण रक्कम:' : 'Total Amount:'}</span>
                          <span className="text-slate-300 font-bold">₹{b.total_amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{language === 'mr' ? 'जमा रक्कम:' : 'Paid Amount:'}</span>
                          <span className="text-emerald-500 font-bold">₹{b.paid_amount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/40 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => restoreMutation.mutate(b.id)}
                        disabled={restoreMutation.isPending}
                        className="py-2 px-3 bg-emerald-500 hover:bg-emerald-450 text-slate-955 text-xs font-black rounded-xl transition shadow-md shadow-emerald-500/10 flex items-center gap-1"
                      >
                        ↩️ {language === 'mr' ? 'पुनर्संचयित करा' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookingToDelete(b)
                          setShowPermanentDeleteConfirm(true)
                        }}
                        className="py-2 px-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/20 text-rose-450 hover:text-rose-450 text-xs font-bold rounded-xl transition flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        {language === 'mr' ? 'कायमचे डिलीट करा' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 max-w-md mx-auto">
              <Check className="h-10 w-10 text-emerald-500/50 mx-auto mb-3" />
              <p className="text-sm font-semibold">
                {language === 'mr' ? 'कचरापेटी रिकामी आहे.' : 'Trash bin is empty.'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {language === 'mr' 
                  ? 'रद्द केलेले कोणतेही बुकिंग येथे आढळले नाही.' 
                  : 'Cancelled bookings will appear here for you to restore if needed.'}
              </p>
            </div>
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
                  <button
                    type="button"
                    onClick={() => setActiveKeypad('floor')}
                    className="w-full bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl px-4 py-2.5 text-slate-200 text-left flex justify-between items-center transition"
                  >
                    <span>{floor}</span>
                    <span className="text-[10px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'Edit'}</span>
                  </button>
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
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">
                  {language === 'mr' ? 'खोलीचा प्रकार' : 'Room Type'}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRoomType('AC Deluxe')}
                    className={`py-3 rounded-xl border-2 font-black text-xs transition duration-150 text-center ${
                      roomType === 'AC Deluxe' || roomType === 'Non AC Deluxe'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    🏢 {language === 'mr' ? 'डीलक्स' : 'Deluxe'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomType('VIP AC Suite')}
                    className={`py-3 rounded-xl border-2 font-black text-xs transition duration-150 text-center ${
                      roomType === 'VIP AC Suite' || roomType === 'VIP Non AC Suite'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    👑 {language === 'mr' ? 'VIP सूट' : 'VIP Suite'}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-800/40 my-2 pt-3">
                <span className="text-[10px] font-black text-emerald-450 uppercase tracking-widest block mb-2">
                  ✨ {language === 'mr' ? 'AC चे दर (AC Rates)' : 'AC RATES'}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      {language === 'mr' ? 'भाडे (₹)' : 'Base Price (₹)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveKeypad('basePrice')}
                      className="w-full bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl px-4 py-2.5 text-slate-200 text-left flex justify-between items-center transition"
                    >
                      <span>₹{basePrice}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'Edit'}</span>
                    </button>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      {language === 'mr' ? 'अतिरिक्त बेड (₹)' : 'Extra Bed (₹)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveKeypad('extraBedPrice')}
                      className="w-full bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-xl px-4 py-2.5 text-slate-200 text-left flex justify-between items-center transition"
                    >
                      <span>₹{extraBedPrice}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'Edit'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800/40 my-2 pt-3">
                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest block mb-2">
                  ❄️ {language === 'mr' ? 'Non-AC चे दर (Non-AC Rates)' : 'NON-AC RATES'}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      {language === 'mr' ? 'भाडे (₹)' : 'Base Price (₹)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveKeypad('nonAcPrice')}
                      className="w-full bg-slate-900 border border-slate-800 hover:border-sky-500 rounded-xl px-4 py-2.5 text-slate-200 text-left flex justify-between items-center transition"
                    >
                      <span>₹{nonAcPrice}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'Edit'}</span>
                    </button>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      {language === 'mr' ? 'अतिरिक्त बेड (₹)' : 'Extra Bed (₹)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setActiveKeypad('nonAcExtraBedPrice')}
                      className="w-full bg-slate-900 border border-slate-800 hover:border-sky-500 rounded-xl px-4 py-2.5 text-slate-200 text-left flex justify-between items-center transition"
                    >
                      <span>₹{nonAcExtraBedPrice}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{language === 'mr' ? 'बदला' : 'Edit'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                {editingRoom && (
                  <button
                    type="button"
                    onClick={() => {
                      setRoomToDelete(editingRoom)
                      setShowDeleteRoomConfirm(true)
                    }}
                    className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-xl px-3.5 py-2.5 font-semibold transition flex items-center justify-center"
                    title={language === 'mr' ? 'खोली डिलीट करा' : 'Delete Room'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
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

          {activeKeypad !== null && (
            <NumericKeypad
              value={
                activeKeypad === 'floor'
                  ? floor
                  : activeKeypad === 'basePrice'
                  ? basePrice
                  : activeKeypad === 'extraBedPrice'
                  ? extraBedPrice
                  : activeKeypad === 'nonAcPrice'
                  ? nonAcPrice
                  : nonAcExtraBedPrice
              }
              onDone={(val) => {
                const numVal = Number(val) || 0
                if (activeKeypad === 'floor') setFloor(numVal)
                else if (activeKeypad === 'basePrice') setBasePrice(numVal)
                else if (activeKeypad === 'extraBedPrice') setExtraBedPrice(numVal)
                else if (activeKeypad === 'nonAcPrice') setNonAcPrice(numVal)
                else if (activeKeypad === 'nonAcExtraBedPrice') setNonAcExtraBedPrice(numVal)
                setActiveKeypad(null)
              }}
              onClose={() => setActiveKeypad(null)}
              label={
                activeKeypad === 'floor'
                  ? (language === 'mr' ? 'मजला क्रमांक टाका' : 'Enter Floor Number')
                  : activeKeypad === 'basePrice'
                  ? (language === 'mr' ? 'AC मूळ भाडे टाका' : 'Enter AC Base Price')
                  : activeKeypad === 'extraBedPrice'
                  ? (language === 'mr' ? 'AC अतिरिक्त बेड भाडे टाका' : 'Enter AC Extra Bed Price')
                  : activeKeypad === 'nonAcPrice'
                  ? (language === 'mr' ? 'Non-AC मूळ भाडे टाका' : 'Enter Non-AC Base Price')
                  : (language === 'mr' ? 'Non-AC अतिरिक्त बेड भाडे टाका' : 'Enter Non-AC Extra Bed Price')
              }
              keypadType={activeKeypad === 'floor' ? 'number' : 'currency'}
              maxDigits={activeKeypad === 'floor' ? 2 : 6}
              language={language}
            />
          )}
        </div>,
        document.body
      )}

      {/* Room Deletion Confirmation Dialog */}
      {showDeleteRoomConfirm && roomToDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-450 border-rose-500/25">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'खोली डिलीट करण्याची खात्री करा' : 'Confirm Room Deletion'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                <span className="text-rose-400 font-bold block mb-1">
                  {language === 'mr' ? '⚠️ ही क्रिया पूर्ववत केली जाऊ शकत नाही!' : '⚠️ This action CANNOT be undone!'}
                </span>
                {language === 'mr' ? (
                  <>तुम्हाला खरोखर <span className="font-extrabold text-slate-200">खोली {roomToDelete.number}</span> डिलीट करायची आहे का?</>
                ) : (
                  <>Are you sure you want to delete <span className="font-extrabold text-slate-200">Room {roomToDelete.number}</span>?</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => {
                  setRoomToDelete(null)
                  setShowDeleteRoomConfirm(false)
                }}
                className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => deleteRoomMutation.mutate(roomToDelete.id)}
                disabled={deleteRoomMutation.isPending}
                className="py-2.5 px-4 bg-rose-500 hover:bg-rose-400 active:bg-rose-500 text-slate-955 text-xs font-black rounded-xl transition shadow-lg shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, डिलीट करा' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Trash Bin Booking Permanent Deletion Confirmation Dialog */}
      {showPermanentDeleteConfirm && bookingToDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-450 border-rose-500/25">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'कायमचे डिलीट करण्याची खात्री करा' : 'Confirm Permanent Deletion'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                <span className="text-rose-400 font-bold block mb-1">
                  {language === 'mr' ? '⚠️ ही क्रिया पूर्ववत केली जाऊ शकत नाही!' : '⚠️ This action CANNOT be undone!'}
                </span>
                {language === 'mr' ? (
                  <>खोली क्रमांक <span className="font-extrabold text-slate-200">{bookingToDelete.rooms?.number || bookingToDelete.room_id}</span> मधील ग्राहक <span className="font-extrabold text-slate-200">{formatNameByLanguage(bookingToDelete.customers?.name, language)}</span> यांचे बुकिंग कायमचे डिलीट करायचे आहे का? सर्व संबंधित दस्तऐवज आणि माहिती कायमची नष्ट होईल.</>
                ) : (
                  <>Permanently delete the booking for <span className="font-extrabold text-slate-200">{formatNameByLanguage(bookingToDelete.customers?.name, language)}</span> in Room <span className="font-extrabold text-slate-200">{bookingToDelete.rooms?.number || bookingToDelete.room_id}</span>? All associated data and documents will be permanently lost.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => {
                  setBookingToDelete(null)
                  setShowPermanentDeleteConfirm(false)
                }}
                className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(bookingToDelete.id)}
                disabled={deleteMutation.isPending}
                className="py-2.5 px-4 bg-rose-500 hover:bg-rose-400 active:bg-rose-500 text-slate-955 text-xs font-black rounded-xl transition shadow-lg shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, डिलीट करा' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Customer Deletion Confirmation Dialog */}
      {showDeleteCustomerConfirm && customerToDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-fade-in">
          <div className="glass-panel w-full max-w-xs rounded-3xl bg-slate-900 border-slate-800 p-5 flex flex-col gap-4 text-center shadow-2xl">
            <div className="h-11 w-11 rounded-full flex items-center justify-center mx-auto border bg-rose-500/10 text-rose-450 border-rose-500/25">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">
                {language === 'mr' ? 'ग्राहक डिलीट करण्याची खात्री करा' : 'Confirm Customer Deletion'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                <span className="text-rose-400 font-bold block mb-1">
                  {language === 'mr' ? '⚠️ ही क्रिया पूर्ववत केली जाऊ शकत नाही!' : '⚠️ This action CANNOT be undone!'}
                </span>
                {language === 'mr' ? (
                  <>तुम्हाला खरोखर ग्राहक <span className="font-extrabold text-slate-200">{formatNameByLanguage(getCustomerNameDisplay(customerToDelete.name).name, language)}</span> डिलीट करायचे आहे का? त्यांचे रेकॉर्ड रिपोर्टमध्ये डिलीट चिन्हासह राहतील.</>
                ) : (
                  <>Are you sure you want to delete customer <span className="font-extrabold text-slate-200">{formatNameByLanguage(getCustomerNameDisplay(customerToDelete.name).name, language)}</span>? Their records will remain in history marked as deleted.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => {
                  setCustomerToDelete(null)
                  setShowDeleteCustomerConfirm(false)
                }}
                className="py-2.5 px-4 bg-slate-955 border border-slate-800 text-slate-300 hover:text-slate-200 text-xs font-bold rounded-xl transition"
              >
                {language === 'mr' ? 'रद्द करा' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => deleteCustomerMutation.mutate(customerToDelete.id)}
                disabled={deleteCustomerMutation.isPending}
                className="py-2.5 px-4 bg-rose-500 hover:bg-rose-400 active:bg-rose-500 text-slate-955 text-xs font-black rounded-xl transition shadow-lg shadow-rose-500/15"
              >
                {language === 'mr' ? 'होय, डिलीट करा' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Booking detail sheet portal */}
      {selectedBookingId && (
        <BookingDetailSheet
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onSuccess={() => {
            refetchHistory()
            setSelectedBookingId(null)
          }}
        />
      )}

    </div>
  )
}

