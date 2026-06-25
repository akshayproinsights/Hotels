import api from './client'
import type { Guest, Booking } from '../types'

export async function searchGuests(q: string): Promise<Guest[]> {
  const res = await api.get<Guest[]>('/guests/search', { params: { q } })
  return res.data
}

export async function getGuestBookings(guestId: string): Promise<Booking[]> {
  const res = await api.get<Booking[]>(`/guests/${guestId}/bookings`)
  return res.data
}
