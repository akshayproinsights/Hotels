import api from './client'
import type { InventoryRoom, Booking } from '../types'

export interface InventoryResponse {
  date: string
  summary: {
    vacant: number
    occupied: number
    hold: number
    unpaid: number
  }
  rooms: InventoryRoom[]
  daily_bookings?: Booking[]
}

export async function getInventory(dateStr: string): Promise<InventoryResponse> {
  const res = await api.get<InventoryResponse>('/inventory', { params: { date: dateStr } })
  return res.data
}
