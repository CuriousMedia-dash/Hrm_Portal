import { formatDate, labelOf, ATTENDANCE_STATUSES, hoursBetween, formatTime } from './format.js'

/** Quote a CSV field the way Excel expects. */
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCSV(rows) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

/** Download text as a file. The BOM makes Excel read UTF-8 properly. */
export function downloadCSV(filename, csv) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** One row per person: what payroll actually needs. */
export function monthSummaryCSV(people, records, monthLabel) {
  const header = [
    'Employee', 'Department', 'Designation', 'Present', 'Work from home',
    'On leave', 'Absent', 'Holiday', 'Late arrivals',
    'Days marked', 'Hours logged'
  ]

  const rows = people.map((person) => {
    const mine = records.filter((r) => r.employee_id === person.id)
    const count = (status) => mine.filter((r) => r.status === status).length
    const hours = mine.reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) || 0), 0)
    return [
      person.full_name, person.department || '', person.designation || '',
      count('present'), count('wfh'), count('leave'),
      count('absent'), count('holiday'),
      mine.filter((r) => r.is_late).length,
      mine.length,
      Math.round(hours * 10) / 10
    ]
  })

  return toCSV([[`Attendance summary — ${monthLabel}`], [], header, ...rows])
}

/** One row per person per day, for anyone who wants to audit it. */
export function monthDetailCSV(people, records, monthLabel) {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]))
  const header = ['Date', 'Employee', 'Department', 'Status', 'Check in', 'Check out', 'Hours', 'Late', 'Note']

  const rows = [...records]
    .sort((a, b) => a.work_date.localeCompare(b.work_date) ||
      (byId[a.employee_id]?.full_name || '').localeCompare(byId[b.employee_id]?.full_name || ''))
    .map((r) => [
      formatDate(r.work_date),
      byId[r.employee_id]?.full_name || '—',
      byId[r.employee_id]?.department || '',
      labelOf(ATTENDANCE_STATUSES, r.status),
      formatTime(r.check_in) === '—' ? '' : formatTime(r.check_in),
      formatTime(r.check_out) === '—' ? '' : formatTime(r.check_out),
      hoursBetween(r.check_in, r.check_out) ?? '',
      r.is_late ? 'Yes' : '',
      r.note || ''
    ])

  return toCSV([[`Attendance detail — ${monthLabel}`], [], header, ...rows])
}
