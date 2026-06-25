import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  DollarSign, 
  Activity, 
  Percent, 
  TrendingUp, 
  UserMinus, 
  ShieldAlert, 
  Loader2,
  CreditCard,
  Layers,
  LogOut,
  LogIn,
  Clock,
  ArrowRight
} from 'lucide-react'
import { getDailyReport, getMonthlyReport, getUnpaidDues } from '../api/reports'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'unpaid'>('daily')

  // Daily report states
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Monthly report states
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Daily Query
  const { 
    data: dailyData, 
    isLoading: dailyLoading, 
    isError: dailyError, 
    refetch: dailyRefetch,
    isRefetching: dailyRefetching
  } = useQuery({
    queryKey: ['dailyReport', selectedDate],
    queryFn: () => getDailyReport(selectedDate),
    enabled: activeTab === 'daily'
  })

  // Monthly Query
  const { 
    data: monthlyData, 
    isLoading: monthlyLoading, 
    isError: monthlyError, 
    refetch: monthlyRefetch,
    isRefetching: monthlyRefetching
  } = useQuery({
    queryKey: ['monthlyReport', selectedYear, selectedMonth],
    queryFn: () => getMonthlyReport(selectedYear, selectedMonth),
    enabled: activeTab === 'monthly'
  })

  // Unpaid Query
  const { 
    data: unpaidData, 
    isLoading: unpaidLoading, 
    isError: unpaidError, 
    refetch: unpaidRefetch,
    isRefetching: unpaidRefetching
  } = useQuery({
    queryKey: ['unpaidDues'],
    queryFn: () => getUnpaidDues(),
    enabled: activeTab === 'unpaid'
  })

  // Daily Date navigation
  const handlePrevDay = () => {
    setSelectedDate(prev => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'))
  }

  const handleNextDay = () => {
    setSelectedDate(prev => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'))
  }

  const handleToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  }

  // Monthly year range
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 animate-fade-in">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
            Business Reports
          </h1>
          <p className="text-slate-400 text-sm mt-1">Monitor collections, occupancy, and hotel revenue stats</p>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-slate-950/80 p-1 border border-slate-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'daily'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Daily Collections
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'monthly'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Monthly Revenue
          </button>
          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'unpaid'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unpaid Dues
          </button>
        </div>
      </div>

      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* Daily Date Controller */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/40 border-slate-800/40">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevDay}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <button
                onClick={handleToday}
                className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:bg-slate-900 text-xs font-bold text-slate-300 transition"
              >
                Today
              </button>

              <button
                onClick={handleNextDay}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4.5 w-4.5 text-emerald-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => dailyRefetch()}
                disabled={dailyRefetching}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition ml-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${dailyRefetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {dailyLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
              <p className="text-slate-400 font-semibold text-sm">Loading daily collections...</p>
            </div>
          ) : dailyError || !dailyData ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
              <ShieldAlert className="h-12 w-12 mb-4" />
              <p className="font-semibold">Error loading daily stats</p>
              <button onClick={() => dailyRefetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Daily KPI summaries */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <LogIn className="h-4 w-4" />
                    Check-ins Today
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">{dailyData.check_ins_today}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <LogOut className="h-4 w-4" />
                    Check-outs Today
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">{dailyData.check_outs_today}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-indigo-500/5 border-indigo-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Percent className="h-4 w-4" />
                    Occupancy Rate
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">{dailyData.occupancy.pct.toFixed(1)}%</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      {dailyData.occupancy.occupied} / {dailyData.occupancy.total_rooms} Rooms
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    Total Collected
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.total_collected.toLocaleString()}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4" />
                    Cash / UPI
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.cash_collected.toLocaleString()} / ₹{dailyData.upi_collected.toLocaleString()}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-rose-500/5 border-rose-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 flex items-center gap-1.5">
                    <UserMinus className="h-4 w-4" />
                    Total Pending Dues
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.pending_dues.toLocaleString()}</span>
                </div>
              </div>

              {/* Collections transaction table */}
              <div className="glass-panel rounded-2xl p-6 bg-slate-900/20 border-slate-800/40">
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400 mb-4">
                  Collections Log
                </h3>

                {dailyData.payments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic text-xs">
                    No transactions recorded on this date.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-500 font-extrabold uppercase tracking-wider">
                          <th className="pb-3 pr-4">Ref Number</th>
                          <th className="pb-3 px-4">Guest</th>
                          <th className="pb-3 px-4">Room</th>
                          <th className="pb-3 px-4">Receipt Type</th>
                          <th className="pb-3 px-4">Mode</th>
                          <th className="pb-3 pl-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-semibold text-slate-300">
                        {dailyData.payments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-800/20 transition-all duration-100">
                            <td className="py-3.5 pr-4 text-slate-200 font-black">{payment.booking_number}</td>
                            <td className="py-3.5 px-4">{payment.guest_name}</td>
                            <td className="py-3.5 px-4">
                              <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[11px] font-black text-slate-200">
                                Room {payment.room_number}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                payment.payment_type === 'Final Settlement'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {payment.payment_type}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                payment.payment_mode === 'Cash'
                                  ? 'bg-slate-700/30 text-slate-400 border border-slate-700/40'
                                  : payment.payment_mode === 'UPI'
                                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {payment.payment_mode}
                              </span>
                            </td>
                            <td className="py-3.5 pl-4 text-right text-slate-100 font-black">₹{payment.collected_amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Monthly Controller */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/40 border-slate-800/40">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Select Month & Year</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                onClick={() => monthlyRefetch()}
                disabled={monthlyRefetching}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition ml-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${monthlyRefetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {monthlyLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
              <p className="text-slate-400 font-semibold text-sm">Generating monthly reports...</p>
            </div>
          ) : monthlyError || !monthlyData ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
              <ShieldAlert className="h-12 w-12 mb-4" />
              <p className="font-semibold">Error loading monthly stats</p>
              <button onClick={() => monthlyRefetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Monthly KPI summaries */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Total Revenue
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">₹{monthlyData.revenue.total.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      Room: ₹{monthlyData.revenue.room.toLocaleString()} · Beds: ₹{monthlyData.revenue.extra_bed.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Percent className="h-4 w-4" />
                    Occupancy Rate
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">{monthlyData.occupancy.rate.toFixed(1)}%</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      {monthlyData.occupancy.occupied_room_nights} / {monthlyData.occupancy.available_room_nights} Room-Nights
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-teal-500/5 border-teal-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-teal-400 flex items-center gap-1.5">
                    <Activity className="h-4 w-4" />
                    Average Daily Rate (ADR)
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{Math.round(monthlyData.adr).toLocaleString()}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-indigo-500/5 border-indigo-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    RevPAR
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{Math.round(monthlyData.revpar).toLocaleString()}</span>
                </div>
              </div>

              {/* Room type performance breakdown cards */}
              <div className="glass-panel rounded-2xl p-6 bg-slate-900/20 border-slate-800/40">
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400 mb-6">
                  Performance by Room Type
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {monthlyData.room_type_performance.map((perf) => (
                    <div 
                      key={perf.room_type} 
                      className="p-5 bg-slate-950/45 border border-slate-800/80 rounded-2xl flex flex-col justify-between gap-4"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-extrabold text-slate-200">{perf.room_type}</span>
                        <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-black">
                          {perf.occupancy_rate.toFixed(1)}% Occ
                        </span>
                      </div>

                      {/* Custom progress bar */}
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-850">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${perf.occupancy_rate}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div>
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Occupied</span>
                          <span className="text-slate-300 font-black mt-0.5 block">{perf.occupied_nights} / {perf.available_nights} Nights</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">Revenue</span>
                          <span className="text-slate-100 font-black mt-0.5 block">₹{perf.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'unpaid' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-4 flex justify-between items-center bg-slate-900/40 border-slate-800/40">
            <h2 className="text-sm font-extrabold tracking-wider uppercase text-slate-400 flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-rose-400" />
              Outstanding Payments
            </h2>
            <button
              onClick={() => unpaidRefetch()}
              disabled={unpaidRefetching}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${unpaidRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {unpaidLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
              <p className="text-slate-400 font-semibold text-sm">Loading pending dues...</p>
            </div>
          ) : unpaidError || !unpaidData ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
              <ShieldAlert className="h-12 w-12 mb-4" />
              <p className="font-semibold">Error loading unpaid dues</p>
              <button onClick={() => unpaidRefetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                Retry
              </button>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-6 bg-slate-900/20 border-slate-800/40">
              {unpaidData.length === 0 ? (
                <div className="text-center py-12 text-slate-500 italic text-xs">
                  All clear! No outstanding payments right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {unpaidData.map((due) => (
                    <div key={due.id} className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-slate-100 font-extrabold flex items-center gap-2">
                            {due.guests.name}
                            <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-300">
                              Room {due.rooms.number}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-medium mt-1">{due.guests.phone}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                          due.payment_status === 'hold' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {due.payment_status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                        <div>
                          <span className="text-[9px] uppercase font-bold tracking-wide text-slate-500 block">Total Bill</span>
                          <span className="text-sm font-bold text-slate-300 mt-0.5 block">₹{due.total_amount.toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] uppercase font-bold tracking-wide text-rose-500 block">Pending Amount</span>
                          <span className="text-sm font-black text-rose-400 mt-0.5 block">₹{(due.total_amount - due.paid_amount).toLocaleString()}</span>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-slate-500 flex justify-between items-center mt-1">
                        <span>Check-in: {format(parseISO(due.check_in), 'dd MMM yyyy')}</span>
                        <a href={`/inventory?date=${format(parseISO(due.check_in), 'yyyy-MM-dd')}`} className="text-emerald-400 font-bold hover:text-emerald-300 flex items-center gap-1 transition">
                          View Booking <ArrowRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
