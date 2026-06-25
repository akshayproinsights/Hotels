// Dedicated API client for the calendar endpoint — mirrors the pattern of api/bookings.ts, api/rooms.ts etc.
import api from './client'

export interface CalendarDay {
  date: string       // YYYY-MM-DD
  vacant: number
  occupied: number
  status: 'full' | 'few_left' | 'vacant'
}

export interface CalendarResponse {
  month: number
  year: number
  total_rooms: number
  days: CalendarDay[]
}

export async function getCalendar(month: number, year: number): Promise<CalendarResponse> {
  const res = await api.get<CalendarResponse>('/calendar', { params: { month, year } })
  return res.data
}
