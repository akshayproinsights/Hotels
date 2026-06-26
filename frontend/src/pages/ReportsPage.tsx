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
  LogIn
} from 'lucide-react'
import { getDailyReport, getMonthlyReport } from '../api/reports'
import { useLanguage } from '../context/LanguageContext'

const MONTHS = [
  { value: 1, label_en: 'January', label_mr: 'जानेवारी' },
  { value: 2, label_en: 'February', label_mr: 'फेब्रुवारी' },
  { value: 3, label_en: 'March', label_mr: 'मार्च' },
  { value: 4, label_en: 'April', label_mr: 'एप्रिल' },
  { value: 5, label_en: 'May', label_mr: 'मे' },
  { value: 6, label_en: 'June', label_mr: 'जून' },
  { value: 7, label_en: 'July', label_mr: 'जुलै' },
  { value: 8, label_en: 'August', label_mr: 'ऑगस्ट' },
  { value: 9, label_en: 'September', label_mr: 'सप्टेंबर' },
  { value: 10, label_en: 'October', label_mr: 'ऑक्टोबर' },
  { value: 11, label_en: 'November', label_mr: 'नोव्हेंबर' },
  { value: 12, label_en: 'December', label_mr: 'डिसेंबर' }
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily')
  const { language, t } = useLanguage()

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
            {t('business_reports')}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {language === 'mr' 
              ? 'हॉटेलमधील कमाई, खोल्यांचा वापर आणि इतर तपशील पहा' 
              : 'Monitor collections, occupancy, and hotel revenue stats'}
          </p>
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
            {t('daily_report')}
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'monthly'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('monthly_report')}
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
                {t('today')}
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
              <p className="text-slate-400 font-semibold text-sm">{t('fetching_reports')}</p>
            </div>
          ) : dailyError || !dailyData ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
              <ShieldAlert className="h-12 w-12 mb-4" />
              <p className="font-semibold">{language === 'mr' ? 'दैनिक अहवाल लोड करताना त्रुटी आली' : 'Error loading daily stats'}</p>
              <button onClick={() => dailyRefetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                {t('try_again')}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Daily KPI summaries */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <LogIn className="h-4 w-4" />
                    {language === 'mr' ? 'आजचे चेक-इन' : 'Check-ins Today'}
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">{dailyData.check_ins_today}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <LogOut className="h-4 w-4" />
                    {language === 'mr' ? 'आजचे चेक-आउट' : 'Check-outs Today'}
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">{dailyData.check_outs_today}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-indigo-500/5 border-indigo-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Percent className="h-4 w-4" />
                    {t('occupancy_rate')}
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">{dailyData.occupancy.pct.toFixed(1)}%</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      {dailyData.occupancy.occupied} / {dailyData.occupancy.total_rooms} {language === 'mr' ? 'खोल्या' : 'Rooms'}
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    {t('total_collected')}
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.total_collected.toLocaleString()}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4" />
                    {language === 'mr' ? 'कॅश / युपीआय' : 'Cash / UPI'}
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.cash_collected.toLocaleString()} / ₹{dailyData.upi_collected.toLocaleString()}</span>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-rose-500/5 border-rose-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 flex items-center gap-1.5">
                    <UserMinus className="h-4 w-4" />
                    {language === 'mr' ? 'एकूण थकीत रक्कम' : 'Total Pending Dues'}
                  </span>
                  <span className="text-2xl font-black text-slate-100 mt-2">₹{dailyData.pending_dues.toLocaleString()}</span>
                </div>
              </div>

              {/* Collections transaction table */}
              <div className="glass-panel rounded-2xl p-6 bg-slate-900/20 border-slate-800/40">
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-slate-400 mb-4">
                  {t('detailed_logs')}
                </h3>

                {dailyData.payments.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic text-xs">
                    {t('no_reports_for_date')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-500 font-extrabold uppercase tracking-wider">
                          <th className="pb-3 pr-4">{language === 'mr' ? 'संदर्भ क्रमांक' : 'Ref Number'}</th>
                          <th className="pb-3 px-4">{language === 'mr' ? 'पाहुणे' : 'Guest'}</th>
                          <th className="pb-3 px-4">{t('room')}</th>
                          <th className="pb-3 px-4">{language === 'mr' ? 'पावती प्रकार' : 'Receipt Type'}</th>
                          <th className="pb-3 px-4">{language === 'mr' ? 'पेमेंट मोड' : 'Mode'}</th>
                          <th className="pb-3 pl-4 text-right">{t('amount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-semibold text-slate-300">
                        {dailyData.payments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-800/20 transition-all duration-100">
                            <td className="py-3.5 pr-4 text-slate-200 font-black">{payment.booking_number}</td>
                            <td className="py-3.5 px-4">{payment.guest_name}</td>
                            <td className="py-3.5 px-4">
                              <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[11px] font-black text-slate-200">
                                {language === 'mr' ? 'खोली' : 'Room'} {payment.room_number}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                payment.payment_type === 'Final Settlement'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {payment.payment_type === 'Final Settlement' 
                                  ? (language === 'mr' ? 'अंतिम सेटलमेंट' : 'Final Settlement')
                                  : (language === 'mr' ? 'अ‍ॅडव्हान्स पेमेंट' : payment.payment_type)}
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
                                {payment.payment_mode === 'Cash' 
                                  ? (language === 'mr' ? 'कॅश' : 'Cash')
                                  : payment.payment_mode}
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
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {language === 'mr' ? 'महिना आणि वर्ष निवडा' : 'Select Month & Year'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>
                    {language === 'mr' ? m.label_mr : m.label_en}
                  </option>
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
              <p className="text-slate-400 font-semibold text-sm">{t('fetching_reports')}</p>
            </div>
          ) : monthlyError || !monthlyData ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-red-400 flex flex-col items-center max-w-md mx-auto border-slate-800">
              <ShieldAlert className="h-12 w-12 mb-4" />
              <p className="font-semibold">{language === 'mr' ? 'मासिक अहवाल लोड करताना त्रुटी आली' : 'Error loading monthly stats'}</p>
              <button onClick={() => monthlyRefetch()} className="mt-4 px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition">
                {t('try_again')}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Monthly KPI summaries */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-emerald-500/5 border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    {language === 'mr' ? 'एकूण उत्पन्न' : 'Total Revenue'}
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">₹{monthlyData.revenue.total.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      {language === 'mr' 
                        ? `खोली: ₹${monthlyData.revenue.room.toLocaleString()} · बेड: ₹${monthlyData.revenue.extra_bed.toLocaleString()}`
                        : `Room: ₹${monthlyData.revenue.room.toLocaleString()} · Beds: ₹${monthlyData.revenue.extra_bed.toLocaleString()}`}
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-slate-500/5 border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Percent className="h-4 w-4" />
                    {t('occupancy_rate')}
                  </span>
                  <div>
                    <span className="text-2xl font-black text-slate-100 block mt-2">{monthlyData.occupancy.rate.toFixed(1)}%</span>
                    <span className="text-[9px] text-slate-500 font-bold block mt-1">
                      {monthlyData.occupancy.occupied_room_nights} / {monthlyData.occupancy.available_room_nights} {language === 'mr' ? 'खोली-रात्री' : 'Room-Nights'}
                    </span>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between bg-teal-500/5 border-teal-500/10">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-teal-400 flex items-center gap-1.5">
                    <Activity className="h-4 w-4" />
                    {language === 'mr' ? 'सरासरी दैनिक दर (ADR)' : 'Average Daily Rate (ADR)'}
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
                  {language === 'mr' ? 'खोलीच्या प्रकारानुसार कामगिरी' : 'Performance by Room Type'}
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
                          {perf.occupancy_rate.toFixed(1)}% {language === 'mr' ? 'वापर' : 'Occ'}
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
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">
                            {language === 'mr' ? 'वापरलेल्या' : 'Occupied'}
                          </span>
                          <span className="text-slate-300 font-black mt-0.5 block">
                            {perf.occupied_nights} / {perf.available_nights} {language === 'mr' ? 'रात्री' : 'Nights'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-wide">
                            {language === 'mr' ? 'कमाई' : 'Revenue'}
                          </span>
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

    </div>
  )
}
