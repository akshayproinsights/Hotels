import { useQuery } from '@tanstack/react-query'
import { getCalendar } from '../api/calendar'
export type { CalendarDay, CalendarResponse } from '../api/calendar'

export function useCalendar(month: number, year: number) {
  return useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => getCalendar(month, year),
    staleTime: 60_000, // 1 minute — calendar data is stable within a month
  })
}
