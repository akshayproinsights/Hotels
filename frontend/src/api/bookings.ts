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

export async function getAllBookings(): Promise<Booking[]> {
  const res = await api.get<Booking[]>('/bookings')
  return res.data
}

/** 
 * Silently auto-process bookings based on current time:
 * - Auto check-in: bookings whose check_in time has passed and is_checked_in=false
 * - Auto check-out: bookings whose check_out time has passed and status=active
 * Fire-and-forget — errors are swallowed so they never block the UI.
 */
export async function autoProcessBookings(): Promise<{ checked_in: number; checked_out: number } | null> {
  try {
    const res = await api.post<{ checked_in: number; checked_out: number; errors: string[] }>('/bookings/auto-process')
    return res.data
  } catch {
    // Silent failure — this is a background task, never surface errors to user
    return null
  }
}
