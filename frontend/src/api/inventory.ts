import api from './client'
import type { InventoryRoom } from '../types'

export interface InventoryResponse {
  date: string
  summary: {
    vacant: number
    occupied: number
    hold: number
    unpaid: number
  }
  rooms: InventoryRoom[]
}

export async function getInventory(dateStr: string): Promise<InventoryResponse> {
  const res = await api.get<InventoryResponse>('/inventory', { params: { date: dateStr } })
  return res.data
}
