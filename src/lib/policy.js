/**
 * Company work rules, in one place.
 * The database enforces the same two numbers — see supabase/add_work_rules.sql.
 * Change them in both places or they will disagree.
 */
export const LATE_AFTER = { hour: 10, minute: 20 }   // arrivals after 10:20 are late
export const MIN_WORK_HOURS = 8                       // hours before check-out is allowed
export const INTERNSHIP_MONTHS = 6                    // intern -> full time
export const NOTICE_WARN_DAYS = 15                    // warn this far before the last working day
export const INTERN_WARN_DAYS = 30                    // warn this far before conversion

export const lateAfterLabel = `${LATE_AFTER.hour}:${String(LATE_AFTER.minute).padStart(2, '0')} AM`

/** Was this check-in after the cut-off, in the viewer's own clock? */
export function isLateArrival(checkIn) {
  if (!checkIn) return false
  const d = new Date(checkIn)
  return d.getHours() > LATE_AFTER.hour ||
    (d.getHours() === LATE_AFTER.hour && d.getMinutes() > LATE_AFTER.minute)
}

/** Whole and part hours worked since check-in, as a number. */
export function hoursWorked(checkIn, until = new Date()) {
  if (!checkIn) return 0
  return (new Date(until).getTime() - new Date(checkIn).getTime()) / 3600000
}

/** "2h 35m" — how much longer until check-out unlocks. */
export function timeUntilCheckout(checkIn) {
  const remaining = MIN_WORK_HOURS - hoursWorked(checkIn)
  if (remaining <= 0) return null
  const hours = Math.floor(remaining)
  const minutes = Math.max(1, Math.ceil((remaining - hours) * 60))
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** Add whole months, clamping to the end of a shorter month. */
export function addMonths(dateISO, months) {
  const d = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)          // 31 Aug + 6 months -> 28/29 Feb
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 10)
}

/** When an intern is due to convert: the explicit date, else joining + 6 months. */
export function conversionDate(employee) {
  if (employee.internship_end_date) return employee.internship_end_date
  if (!employee.date_of_joining) return null
  return addMonths(employee.date_of_joining, INTERNSHIP_MONTHS)
}

/** Whole days from today to an ISO date; negative once it has passed. */
export function daysUntil(dateISO) {
  if (!dateISO) return null
  const target = new Date(`${dateISO}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

export function describeDays(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1) return `in ${days} days`
  if (days === -1) return 'yesterday'
  return `${Math.abs(days)} days ago`
}
