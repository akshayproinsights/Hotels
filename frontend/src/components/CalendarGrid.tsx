// Calendar Grid component for monthly bookings visualization
import type { CalendarDay } from '../api/calendar'
export type { CalendarDay }

interface GridCell {
  dayNumber: number
  isCurrentMonth: boolean
  dateStr: string
  data: CalendarDay | null
  isToday?: boolean
}

interface CalendarGridProps {
  year: number
  month: number
  daysData: CalendarDay[]
  onDayClick: (dateStr: string) => void
}

export default function CalendarGrid({ year, month, daysData, onDayClick }: CalendarGridProps) {
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday
  const totalDaysInMonth = new Date(year, month, 0).getDate()
  const prevMonthLastDate = new Date(year, month - 1, 0).getDate()

  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDate = today.getDate()

  const gridCells: GridCell[] = []

  // Prepend previous month's padding days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    gridCells.push({
      dayNumber: prevMonthLastDate - i,
      isCurrentMonth: false,
      dateStr: '',
      data: null,
    })
  }

  // Current month's days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayData = daysData.find(item => item.date === dateStr) ?? null
    gridCells.push({
      dayNumber: d,
      isCurrentMonth: true,
      dateStr,
      data: dayData,
      isToday: todayYear === year && todayMonth === month && todayDate === d,
    })
  }

  // Append next month's padding days to complete final row
  const totalCells = Math.ceil(gridCells.length / 7) * 7
  for (let i = 1; i <= totalCells - gridCells.length; i++) {
    gridCells.push({
      dayNumber: i,
      isCurrentMonth: false,
      dateStr: '',
      data: null,
    })
  }

  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  return (
    <div className="w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {weekDays.map(wd => (
          <div key={wd} className="text-[10px] font-extrabold text-slate-500 tracking-wider">
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {gridCells.map((cell, idx) => {
          if (!cell.isCurrentMonth) {
            return (
              <div
                key={`pad-${idx}`}
                className="aspect-square glass-panel rounded-xl flex items-center justify-center opacity-20 border-transparent bg-slate-950/20"
              >
                <span className="text-xs font-semibold text-slate-500">{cell.dayNumber}</span>
              </div>
            )
          }

          const status = cell.data?.status ?? 'vacant'
          const vacantCount = cell.data?.vacant ?? 0

          let statusClasses = ''
          let dotColor = ''
          if (status === 'vacant') {
            statusClasses = 'border-emerald-500/20 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08] hover:border-emerald-500/40 text-emerald-400'
            dotColor = 'bg-emerald-400'
          } else if (status === 'few_left') {
            statusClasses = 'border-amber-500/20 bg-amber-500/[0.03] hover:bg-amber-500/[0.08] hover:border-amber-500/40 text-amber-400'
            dotColor = 'bg-amber-400'
          } else {
            statusClasses = 'border-rose-500/20 bg-rose-500/[0.03] hover:bg-rose-500/[0.08] hover:border-rose-500/40 text-rose-400'
            dotColor = 'bg-rose-400'
          }

          return (
            <button
              key={`day-${cell.dayNumber}`}
              onClick={() => onDayClick(cell.dateStr)}
              className={`aspect-square relative rounded-xl border flex flex-col items-center justify-between p-1.5 transition duration-200 ${statusClasses} ${
                cell.isToday ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''
              }`}
            >
              <span className={`text-xs font-bold ${cell.isToday ? 'text-slate-100' : 'text-slate-300'}`}>
                {cell.dayNumber}
              </span>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-extrabold tracking-tight opacity-90">
                  {vacantCount} V
                </span>
                <span className={`h-1 w-1 rounded-full ${dotColor}`} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
