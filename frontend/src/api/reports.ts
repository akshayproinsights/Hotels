import api from './client'

export interface DailyReportPayment {
  id: string
  booking_number: string
  guest_name: string
  room_number: string
  collected_amount: number
  payment_mode: 'Cash' | 'UPI' | 'Pending'
  payment_type: string
  total_amount: number
  paid_amount: number
  pending_amount: number
  status: 'active' | 'checked_out' | 'cancelled'
}

export interface DailyReportResponse {
  date: string
  check_ins_today: number
  check_outs_today: number
  occupancy: {
    total_rooms: number
    occupied: number
    pct: number
  }
  total_collected: number
  cash_collected: number
  upi_collected: number
  pending_dues: number
  payments: DailyReportPayment[]
}

export interface UnpaidDuesResponse {
  id: string
  booking_number: string
  check_in: string
  total_amount: number
  paid_amount: number
  deposit_amount: number
  payment_status: 'unpaid' | 'partial' | 'hold'
  rooms: {
    number: string
  }
  guests: {
    name: string
    phone: string
  }
}

export interface RoomTypePerformance {
  room_type: string
  occupied_nights: number
  available_nights: number
  occupancy_rate: number
  revenue: number
}

export interface MonthlyReportResponse {
  year: number
  month: number
  revenue: {
    total: number
    room: number
    extra_bed: number
  }
  occupancy: {
    available_room_nights: number
    occupied_room_nights: number
    rate: number
  }
  adr: number
  revpar: number
  room_type_performance: RoomTypePerformance[]
}

export async function getDailyReport(dateStr?: string): Promise<DailyReportResponse> {
  const res = await api.get<DailyReportResponse>('/reports/daily', {
    params: dateStr ? { date: dateStr } : {},
  })
  return res.data
}

export async function getMonthlyReport(year: number, month: number): Promise<MonthlyReportResponse> {
  const res = await api.get<MonthlyReportResponse>('/reports/monthly', {
    params: { year, month },
  })
  return res.data
}

export async function getUnpaidDues(): Promise<UnpaidDuesResponse[]> {
  const res = await api.get<UnpaidDuesResponse[]>('/reports/unpaid')
  return res.data
}
