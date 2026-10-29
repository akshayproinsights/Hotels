import { parse, parseISO, format } from 'date-fns'

interface CalendarCardProps {
  dateStr: string
  type: 'check-in' | 'check-out'
  size?: 'sm' | 'md'
  language?: string
}

export function getCalendarParts(dStr: string, _language: string = 'en') {
  if (!dStr) return { month: '---', day: '--' }
  try {
    let d: Date
    if (dStr.includes('T')) {
      d = parseISO(dStr)
    } else {
      d = parse(dStr.slice(0, 10), 'yyyy-MM-dd', new Date())
    }
    // Always use English short month names (even in Marathi mode)
    return { month: format(d, 'MMM').toUpperCase(), day: format(d, 'dd') }
  } catch (e) {
    return { month: '---', day: '--' }
  }
}

export default function CalendarCard({ dateStr, type, size = 'md', language = 'en' }: CalendarCardProps) {
  const parts = getCalendarParts(dateStr, language)
  const isSm = size === 'sm'
  const headerBg = type === 'check-in' ? 'bg-rose-500' : 'bg-emerald-600'

  return (
    <div className={`flex flex-col items-center justify-center bg-white rounded-lg text-slate-900 shadow-sm leading-none select-none overflow-hidden flex-shrink-0 ${isSm ? 'w-8 h-8' : 'w-[38px] h-[38px]'}`}>
      <div className={`w-full ${headerBg} text-white font-bold uppercase tracking-wider text-center ${isSm ? 'text-[6px] py-0.5' : 'text-[8px] py-0.5'}`}>
        {parts.month}
      </div>
      <div className={`flex-1 flex items-center justify-center font-black text-slate-800 -mt-0.5 ${isSm ? 'text-xs' : 'text-sm'}`}>
        {parts.day}
      </div>
    </div>
  )
}

interface CalendarRangeProps {
  checkInDate: string
  checkOutDate: string
  size?: 'sm' | 'md'
  language?: string
}

export function CalendarRangeBadge({ checkInDate, checkOutDate, size = 'md', language = 'en' }: CalendarRangeProps) {
  const isSm = size === 'sm'
  return (
    <div className="flex items-center gap-1 flex-shrink-0 bg-slate-950/20 p-1 rounded-xl">
      <CalendarCard dateStr={checkInDate} type="check-in" size={size} language={language} />
      <span className={`text-white/60 font-bold ${isSm ? 'text-[9px]' : 'text-[11px]'}`}>➔</span>
      <CalendarCard dateStr={checkOutDate} type="check-out" size={size} language={language} />
    </div>
  )
}
