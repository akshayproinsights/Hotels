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
