import api from './client'
import type { Booking, BookingCreate, BookingUpdate } from '../types'

export async function createBooking(payload: BookingCreate): Promise<Booking> {
  const res = await api.post<Booking>('/bookings', payload)
  return res.data
}

export async function getBooking(bookingId: string): Promise<Booking> {
  const res = await api.get<Booking>(`/bookings/${bookingId}`)
  return res.data
}

export async function updateBooking(
  bookingId: string,
  payload: BookingUpdate
): Promise<Booking> {
  const res = await api.patch<Booking>(`/bookings/${bookingId}`, payload)
  return res.data
}
