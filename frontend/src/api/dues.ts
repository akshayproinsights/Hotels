import api from './client'

export interface UnpaidDuesResponse {
  id: string
  booking_number: string
  check_in: string
  check_out: string
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

export async function getUnpaidDues(): Promise<UnpaidDuesResponse[]> {
  const res = await api.get<UnpaidDuesResponse[]>('/reports/unpaid')
  return res.data
}
