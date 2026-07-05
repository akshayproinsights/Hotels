import api from './client'

export interface UnpaidDuesResponse {
  id: string
  booking_number: string
  check_in: string
  check_out: string
  total_amount: number
  paid_amount: number
  deposit_amount: number
  payment_status: 'unpaid' | 'partial' | 'reserved'
  payment_mode: string | null
  status: string
  rooms: {
    number: string
  }
  customers: {
    name: string
    phone: string
  }
}

export async function getUnpaidDues(): Promise<UnpaidDuesResponse[]> {
  const res = await api.get<UnpaidDuesResponse[]>('/reports/unpaid')
  return res.data
}
