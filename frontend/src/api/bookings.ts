import api from './client'
import type { Booking, BookingCreate, BookingUpdate, BookingBatchCreate } from '../types'

export async function createBooking(payload: BookingCreate): Promise<Booking> {
  const res = await api.post<Booking>('/bookings', payload)
  return res.data
}

export async function createBookingsBatch(payload: BookingBatchCreate): Promise<Booking[]> {
  const res = await api.post<Booking[]>('/bookings/batch', payload)
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

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const res = await api.patch<Booking>(`/bookings/${bookingId}`, { status: 'cancelled' })
  return res.data
}

export async function checkInBooking(bookingId: string): Promise<Booking> {
  const res = await api.patch<Booking>(`/bookings/${bookingId}`, { is_checked_in: true })
  return res.data
}

export async function restoreBooking(bookingId: string): Promise<Booking> {
  const res = await api.post<Booking>(`/bookings/${bookingId}/restore`)
  return res.data
}

export async function getCancelledBookings(): Promise<Booking[]> {
  const res = await api.get<Booking[]>('/bookings/cancelled')
  return res.data
}

export interface CheckExtensionResponse {
  available: boolean
  reason: string
}

export async function checkBookingExtension(
  bookingId: string,
  checkOut: string
): Promise<CheckExtensionResponse> {
  const res = await api.get<CheckExtensionResponse>(
    `/bookings/${bookingId}/check-extension`,
    { params: { check_out: checkOut } }
  )
  return res.data
}

export async function deleteBooking(bookingId: string): Promise<void> {
  await api.delete(`/bookings/${bookingId}`)
}
