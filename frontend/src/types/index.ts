export interface Room {
  id: string
  number: string
  floor: number
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  base_price: number
  extra_bed_price: number
  is_active: boolean
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string
}

export interface Guest {
  id: string
  name: string
  phone: string
  email?: string | null
  address?: string | null
  age?: number | null
  last_visit?: string | null // YYYY-MM-DD
  total_visits: number
  created_at: string
}

export interface Booking {
  id: string
  booking_number: string
  room_id: string
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  guest_id: string
  check_in: string // ISO string
  check_out: string // ISO string
  adults: number
  children: number
  extra_beds: number
  room_price: number
  extra_bed_total: number
  total_amount: number
  paid_amount: number
  payment_mode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status: 'paid' | 'unpaid' | 'partial' | 'hold'
  deposit_amount: number
  occupation?: string | null
  notes?: string | null
  status: 'active' | 'checked_out' | 'cancelled'
  actual_checkin_time?: string | null
  actual_checkout_time?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  rooms?: Room
  guests?: Guest
  documents?: Document[]
  is_checked_in: boolean
}

export interface BookingCreate {
  room_id: string
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  guest_id?: string
  guest_name?: string
  guest_phone?: string
  check_in: string // ISO string
  check_out: string // ISO string
  adults: number
  children: number
  extra_beds: number
  room_price: number
  payment_mode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status: 'paid' | 'unpaid' | 'hold' | 'partial'
  deposit_amount: number
  occupation?: string
  notes?: string
  total_amount?: number
  guest_address?: string
  guest_age?: number
  is_checked_in?: boolean
}

export interface RoomBookingInfo {
  room_id: string
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  adults: number
  children: number
  extra_beds: number
  room_price: number
  notes?: string
}

export interface BookingBatchCreate {
  rooms: RoomBookingInfo[]
  guest_id?: string
  guest_name?: string
  guest_phone?: string
  guest_address?: string
  guest_age?: number
  check_in: string // ISO string
  check_out: string // ISO string
  payment_mode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status: 'paid' | 'unpaid' | 'hold' | 'partial'
  deposit_amount: number
  occupation?: string
  notes?: string
  total_amount?: number
  is_checked_in?: boolean
}

export interface BookingUpdate {
  check_out?: string // ISO string
  paid_amount?: number
  payment_mode?: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status?: 'paid' | 'unpaid' | 'partial' | 'hold'
  status?: 'active' | 'checked_out' | 'cancelled'
  notes?: string
  total_amount?: number
  actual_checkin_time?: string | null
  actual_checkout_time?: string | null
  is_checked_in?: boolean
}

export interface Document {
  id: string
  booking_id: string
  guest_id: string
  r2_key: string
  file_name: string
  doc_type: string
  uploaded_at: string
  public_url?: string
}

export interface InventoryRoom extends Room {
  room_status: 'vacant' | 'occupied' | 'hold' | 'unpaid'
  booking?: {
    id: string
    room_id: string
    room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
    guest_id: string
    check_in: string
    check_out: string
    payment_status: 'paid' | 'unpaid' | 'partial' | 'hold'
    total_amount: number
    paid_amount: number
    is_checked_in: boolean
    guests?: {
      name: string
      phone: string
    }
  } | null
}
