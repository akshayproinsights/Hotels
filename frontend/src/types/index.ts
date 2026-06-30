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
  role?: 'admin' | 'staff'
}

export interface Customer {
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

export type Guest = Customer;

export interface Booking {
  id: string
  booking_number: string
  room_id: string
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  customer_id: string
  guest_id?: string
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
  payment_status: 'paid' | 'unpaid' | 'partial' | 'reserved'
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
  customers?: Customer
  guests?: Customer
  documents?: Document[]
  is_checked_in: boolean
  extra_bill_amount?: number
  extra_bill_note?: string | null
}

export interface BookingCreate {
  room_id: string
  room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  check_in: string // ISO string
  check_out: string // ISO string
  adults: number
  children: number
  extra_beds: number
  room_price: number
  payment_mode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status: 'paid' | 'unpaid' | 'reserved' | 'partial'
  deposit_amount: number
  occupation?: string
  notes?: string
  total_amount?: number
  customer_address?: string
  customer_age?: number
  is_checked_in?: boolean
  extra_bill_amount?: number
  extra_bill_note?: string | null
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
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_address?: string
  customer_age?: number
  check_in: string // ISO string
  check_out: string // ISO string
  payment_mode: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status: 'paid' | 'unpaid' | 'reserved' | 'partial'
  deposit_amount: number
  occupation?: string
  notes?: string
  total_amount?: number
  is_checked_in?: boolean
  extra_bill_amount?: number
  extra_bill_note?: string | null
}

export interface BookingUpdate {
  check_in?: string // ISO string
  check_out?: string // ISO string
  room_id?: string
  room_type?: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
  adults?: number
  children?: number
  extra_beds?: number
  room_price?: number
  paid_amount?: number
  payment_mode?: 'Cash' | 'UPI' | 'IDFC' | 'Pending'
  payment_status?: 'paid' | 'unpaid' | 'partial' | 'reserved'
  status?: 'active' | 'checked_out' | 'cancelled'
  notes?: string
  total_amount?: number
  actual_checkin_time?: string | null
  actual_checkout_time?: string | null
  is_checked_in?: boolean
  extra_bill_amount?: number
  extra_bill_note?: string | null
}

export interface Document {
  id: string
  booking_id: string
  customer_id: string
  r2_key: string
  file_name: string
  doc_type: string
  uploaded_at: string
  public_url?: string
}

export interface InventoryRoom extends Room {
  room_status: 'vacant' | 'occupied' | 'reserved' | 'unpaid'
  booking?: {
    id: string
    room_id: string
    room_type: 'AC Deluxe' | 'Non AC Deluxe' | 'VIP AC Suite' | 'VIP Non AC Suite'
    customer_id: string
    check_in: string
    check_out: string
    payment_status: 'paid' | 'unpaid' | 'partial' | 'reserved'
    total_amount: number
    paid_amount: number
    is_checked_in: boolean
    customers?: {
      name: string
      phone: string
    }
    guests?: {
      name: string
      phone: string
    }
  } | null
}
