export const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual leave' },
  { value: 'sick',   label: 'Sick leave' },
  { value: 'earned', label: 'Earned leave' },
  { value: 'maternity', label: 'Maternity leave' }
]

export const ATTENDANCE_STATUSES = [
  { value: 'present',  label: 'Present' },
  { value: 'wfh',      label: 'Work from home' },
  { value: 'half_day', label: 'Half day' },
  { value: 'leave',    label: 'On leave' },
  { value: 'absent',   label: 'Absent' },
  { value: 'holiday',  label: 'Holiday' }
]

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'intern',    label: 'Intern' },
  { value: 'contract',  label: 'Contract' }
]

export const EMPLOYEE_STATUSES = [
  { value: 'active',    label: 'Active' },
  { value: 'on_notice', label: 'On notice' },
  { value: 'inactive',  label: 'Inactive' },
  { value: 'pending',   label: 'Pending' }
]

export const labelOf = (list, value) =>
  list.find((item) => item.value === value)?.label ?? (value || '—')

/** Today in the browser's timezone as YYYY-MM-DD (not UTC). */
export function todayISO(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatRange(start, end) {
  if (start === end) return formatDate(start)
  return `${formatDate(start)} → ${formatDate(end)}`
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

/** Working days between two ISO dates, excluding Sat/Sun. */
export function workingDaysBetween(startISO, endISO) {
  if (!startISO || !endISO) return 0
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  let days = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) days += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function hoursBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  if (!Number.isFinite(diff) || diff <= 0) return null
  return Math.round((diff / 3600000) * 10) / 10
}

export function monthBounds(monthValue) {
  // monthValue is "YYYY-MM"
  const [year, month] = monthValue.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  return { from: todayISO(first), to: todayISO(last) }
}

export function currentMonth() {
  return todayISO().slice(0, 7)
}

/** The last n dates ending today, oldest first, as YYYY-MM-DD. */
export function lastNDays(n = 7) {
  const out = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(todayISO(d))
  }
  return out
}

/** "Mon", "Tue", … for an ISO date. */
export function shortDay(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}

/** "12 Sep" — compact label for lists. */
export function shortDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
