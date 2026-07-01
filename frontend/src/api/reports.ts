import api from './client'

export interface FinancialsSummary {
  total_revenue: number
  total_dues: number
  total_bookings: number
  occupancy_rate: number
  adr: number
  avg_booking_value: number
  occupied_nights: number
  total_rooms: number
  days_in_range: number
}

export interface FinancialsResponse {
  summary: FinancialsSummary
  payment_modes: {
    Cash: number
    UPI: number
    IDFC: number
    Pending: number
    [key: string]: number
  }
  room_types: {
    'AC Deluxe': number
    'Non AC Deluxe': number
    'VIP AC Suite': number
    'VIP Non AC Suite': number
    [key: string]: number
  }
  trend: Array<{
    date: string
    revenue: number
    bookings: number
  }>
  ledger: Array<{
    id: string
    booking_number: string
    customer_name: string
    customer_phone: string
    customer_is_deleted?: boolean
    room_number: string
    room_type: string
    check_in: string
    check_out: string
    total_amount: number
    paid_amount: number
    payment_mode: string
    payment_status: 'paid' | 'unpaid' | 'partial' | 'reserved'
    status: 'active' | 'checked_out' | 'cancelled'
    created_at: string
    extra_bill_amount: number
  }>
}

export async function getFinancials(startDate?: string, endDate?: string): Promise<FinancialsResponse> {
  const params: Record<string, string> = {}
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate

  const res = await api.get<FinancialsResponse>('/reports/financials', { params })
  return res.data
}
