import api from './client'
import type { Room } from '../types'

/** Fetch all rooms ordered by floor → number */
export async function listRooms(): Promise<Room[]> {
  const res = await api.get<Room[]>('/rooms')
  return res.data
}

/** Create a new room */
export async function createRoom(payload: {
  number: string
  floor: number
  room_type: Room['room_type']
  base_price: number
  extra_bed_price?: number
}): Promise<Room> {
  const res = await api.post<Room>('/rooms', payload)
  return res.data
}

/** Partial-update a room — pass only the fields that changed */
export async function updateRoom(
  roomId: string,
  payload: Partial<Omit<Room, 'id' | 'created_at'>>,
): Promise<Room> {
  const res = await api.patch<Room>(`/rooms/${roomId}`, payload)
  return res.data
}

/** Fetch available and partially-available rooms for the given check-in/out range */
export async function listAvailableRooms(
  checkIn: string,
  checkOut: string
): Promise<{ available: Room[]; partial: (Room & { next_checkin: string; next_checkin_iso: string })[] }> {
  const res = await api.get<{ available: Room[]; partial: (Room & { next_checkin: string; next_checkin_iso: string })[] }>('/rooms/available', {
    params: { check_in: checkIn, check_out: checkOut }
  })
  return res.data
}
