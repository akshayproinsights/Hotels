/**
 * IST Time Utility
 * All hotel operations are in Indian Standard Time (IST = UTC+5:30).
 * These helpers ensure consistent time display and conversion regardless
 * of where the browser is running (India, Europe, etc.)
 */

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000 // 5h 30m in milliseconds

/** Convert a UTC ISO string to an IST Date object. */
export function toIST(isoString: string): Date {
  const utcMs = new Date(isoString).getTime()
  return new Date(utcMs + IST_OFFSET_MS)
}

/** Format a UTC ISO string → "HH:MM" 24h IST string. */
export function formatIST_HHmm(isoString: string): string {
  if (!isoString) return ''
  const ist = toIST(isoString)
  const h = ist.getUTCHours().toString().padStart(2, '0')
  const m = ist.getUTCMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Format a UTC ISO string → "hh:mm AM/PM" display in IST. */
export function formatIST_AMPM(isoString: string): string {
  if (!isoString) return ''
  const ist = toIST(isoString)
  const h24 = ist.getUTCHours()
  const m = ist.getUTCMinutes().toString().padStart(2, '0')
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = (h24 % 12 || 12).toString().padStart(2, '0')
  return `${h12}:${m} ${ampm}`
}

/** Get IST date string (YYYY-MM-DD) from a UTC ISO string. */
export function formatIST_Date(isoString: string): string {
  if (!isoString) return ''
  const ist = toIST(isoString)
  const y = ist.getUTCFullYear()
  const mo = (ist.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = ist.getUTCDate().toString().padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/**
 * Convert user-typed IST date (YYYY-MM-DD) + time (HH:MM 24h) to UTC ISO string.
 * e.g. date="2026-07-03", time="12:00" → "2026-07-03T06:30:00.000Z"
 */
export function toUTCfromIST(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, m] = (time || '12:00').split(':').map(Number)
  const utcMs = Date.UTC(y, mo - 1, d, h, m) - IST_OFFSET_MS
  return new Date(utcMs).toISOString()
}

/** Format a 24h "HH:MM" string (already in IST) to "hh:mm AM/PM". */
export function formatHHmm_AMPM(time24: string): string {
  if (!time24) return ''
  const [hStr, mStr] = time24.split(':')
  const h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = (h % 12 || 12).toString().padStart(2, '0')
  return `${h12}:${mStr} ${ampm}`
}
