import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  ATTENDANCE_STATUSES, labelOf, todayISO, formatDate, formatTime,
  hoursBetween, currentMonth, monthBounds, shortDay
} from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Icon from '../components/Icon.jsx'
import StatTile from '../components/StatTile.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import Modal from '../components/Modal.jsx'
import RegularizationForm from '../components/RegularizationForm.jsx'
import RegularizationQueue from '../components/RegularizationQueue.jsx'
import { monthSummaryCSV, monthDetailCSV, downloadCSV } from '../lib/report.js'
import { fetchNetworkStatus } from '../lib/network.js'
import {
  MIN_WORK_HOURS, lateAfterLabel, timeUntilCheckout, hoursWorked
} from '../lib/policy.js'
import DateField from '../components/DateField.jsx'

const PILL_STATUSES = ['present', 'wfh', 'half_day', 'leave', 'absent']
const PILL_LABEL = { present: 'Present', wfh: 'WFH', half_day: 'Half', leave: 'Leave', absent: 'Absent' }

export default function Attendance() {
  const { isAdmin, isApprover } = useAuth()
  const [tab, setTab] = useState('me')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="sub">
            {isApprover
              ? 'Check yourself in, mark the team, and review regularization requests.'
              : 'Check in, check out and review your month.'}
          </p>
        </div>
        {isApprover && (
          <div className="seg">
            <button type="button" className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
              <Icon name="user" size={14} /> Mine
            </button>
            <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
              <Icon name="users" size={14} /> Team roster
            </button>
            <button type="button" className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              <Icon name="inbox" size={14} /> Requests
            </button>
          </div>
        )}
      </div>

      {isApprover && tab === 'team' ? <TeamRoster />
        : isApprover && tab === 'requests' ? <RegularizationQueue />
        : <MyAttendance />}
    </>
  )
}

/* ------------------------------------------------------------------ */
function MyAttendance() {
  const { employee } = useAuth()
  const toast = useToast()
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState([])
  const [today, setToday] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [regs, setRegs] = useState({})            // work_date -> request
  const [regularizing, setRegularizing] = useState(null)
  const [net, setNet] = useState({ allowed: true, configured: false, unknown: true })

  // whether this browser may mark attendance at all
  useEffect(() => {
    let active = true
    fetchNetworkStatus().then((status) => { if (active) setNet(status) })
    return () => { active = false }
  }, [])

  const load = useCallback(async () => {
    if (!employee?.id) { setLoading(false); return }
    setLoading(true)
    const { from, to } = monthBounds(month)
    const [att, reg] = await Promise.all([
      supabase.from('attendance').select('*')
        .eq('employee_id', employee.id).gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }),
      supabase.from('regularizations').select('*')
        .eq('employee_id', employee.id).gte('work_date', from).lte('work_date', to)
    ])
    if (att.error) toast.error(att.error.message)
    else setRows(att.data || [])
    if (!reg.error) setRegs(Object.fromEntries((reg.data || []).map((r) => [`${r.work_date}-${r.kind}`, r])))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, month])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!employee?.id) return
    let active = true
    supabase.from('attendance').select('*')
      .eq('employee_id', employee.id).eq('work_date', todayISO()).maybeSingle()
      .then(({ data }) => { if (active) setToday(data || null) })
    return () => { active = false }
  }, [employee?.id])

  async function checkIn() {
    setBusy(true)
    const { data, error } = await supabase.from('attendance').upsert(
      { employee_id: employee.id, work_date: todayISO(), status: 'present', check_in: new Date().toISOString() },
      { onConflict: 'employee_id,work_date' }
    ).select().single()
    setBusy(false)
    if (error) toast.error(error.message)
    else { setToday(data); toast.success('Checked in.'); load() }
  }

  async function checkOut() {
    const short = timeUntilCheckout(today?.check_in)
    if (short) {
      toast.error(`You need ${MIN_WORK_HOURS} hours from check-in. ${short} to go.`)
      return
    }
    setBusy(true)
    const { data, error } = await supabase.from('attendance')
      .update({ check_out: new Date().toISOString() }).eq('id', today.id).select().single()
    setBusy(false)
    if (error) toast.error(error.message)
    else { setToday(data); toast.success('Checked out. See you tomorrow.'); load() }
  }

  // re-render every minute so the countdown and the button state stay honest
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const summary = useMemo(() => ({
    full: rows.filter((r) => ['present', 'wfh'].includes(r.status)).length,
    half: rows.filter((r) => r.status === 'half_day').length,
    leave: rows.filter((r) => r.status === 'leave').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    late: rows.filter((r) => r.is_late).length,
    hours: rows.reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) || 0), 0)
  }), [rows])

  if (!employee) {
    return (
      <section className="card">
        <EmptyState icon="user" title="No employee record linked"
          hint="Ask HR to add you to the directory with the email you signed in with." />
      </section>
    )
  }

  const elapsed = today?.check_in && !today?.check_out
    ? hoursBetween(today.check_in, new Date().toISOString())
    : null
  const remaining = today?.check_in && !today?.check_out ? timeUntilCheckout(today.check_in) : null
  const offNetwork = net.configured && !net.allowed
  const progress = today?.check_in
    ? Math.min(100, (hoursWorked(today.check_in, today.check_out || new Date()) / MIN_WORK_HOURS) * 100)
    : 0

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Today</h2>
            <p className="sub">{formatDate(todayISO())}</p>
          </div>
          <div className="page-actions">
            {offNetwork ? (
              <span className="chip" title={net.ip ? `Seen from ${net.ip}` : undefined}>
                <Icon name="alert" size={13} /> Off the office network
              </span>
            ) : !today?.check_in ? (
              <button type="button" className="btn" onClick={checkIn} disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="login" size={15} />} Check in
              </button>
            ) : (
              <span className="chip"><Icon name="checkCircle" size={13} /> In at {formatTime(today.check_in)}</span>
            )}
            {!offNetwork && today?.check_in && !today?.check_out && (
              remaining ? (
                <span className="chip" title={`Minimum ${MIN_WORK_HOURS} hours`}>
                  <Icon name="clock" size={13} /> Check out in {remaining}
                </span>
              ) : (
                <button type="button" className="btn btn-2" onClick={checkOut} disabled={busy}>
                  {busy ? <span className="spinner" /> : <Icon name="logout" size={15} />} Check out
                </button>
              )
            )}
            {today?.check_out && (
              <span className="chip"><Icon name="logout" size={13} /> Out at {formatTime(today.check_out)}</span>
            )}
          </div>
        </div>
        <div className="card-body">
          {offNetwork && (
            <div className="alert alert-bad" style={{ marginBottom: 16 }}>
              <Icon name="alert" size={16} />
              <span>
                <strong>You are not on the office network.</strong> Check-in and check-out
                are only possible from the office
                {net.ip ? <> — this device appears as <code>{net.ip}</code></> : null}.
                Ask HR to mark you if you are working elsewhere today.
              </span>
            </div>
          )}

          <div className="grid grid-4">
            <StatTile icon="clock" tone="brand" label="Status"
              value={today ? labelOf(ATTENDANCE_STATUSES, today.status) : 'Not marked'}
              hint={today?.is_late ? `Late — after ${lateAfterLabel}` : undefined} />
            <StatTile icon="login" tone={today?.is_late ? 'warn' : 'good'} label="Check in"
              value={formatTime(today?.check_in)}
              hint={today?.is_late ? 'Marked late' : undefined} />
            <StatTile icon="logout" tone="info" label="Check out" value={formatTime(today?.check_out)}
              hint={remaining ? `${remaining} to go` : undefined} />
            <StatTile icon="trend" tone="warn" label="Hours"
              value={hoursBetween(today?.check_in, today?.check_out) ?? (elapsed ?? '—')}
              hint={elapsed !== null ? `of ${MIN_WORK_HOURS} required` : undefined} />
          </div>

          {today?.check_in && !today?.check_out && (
            <div style={{ marginTop: 14 }}>
              <div className="meter"><span style={{ width: `${progress}%` }} /></div>
              <p className="dim" style={{ fontSize: '.8rem', margin: '7px 0 0' }}>
                {remaining
                  ? `Check-out unlocks after ${MIN_WORK_HOURS} hours — ${remaining} to go.`
                  : `You have passed ${MIN_WORK_HOURS} hours. You can check out whenever you are done.`}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>My month</h2>
            <p className="sub">
              {summary.full} full · {summary.half} half · {summary.leave} leave ·{' '}
              <strong style={{ color: summary.late ? 'var(--warn)' : 'inherit' }}>{summary.late} late</strong> ·{' '}
              {Math.round(summary.hours * 10) / 10}h logged
            </p>
          </div>
          <input type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)}
            style={{ width: 'auto' }} aria-label="Month" />
        </div>
        <div className="card-body flush">
          {loading ? <SkeletonRows rows={6} avatar={false} />
            : rows.length === 0 ? (
              <EmptyState icon="calendar" title="Nothing recorded this month"
                hint="Days appear here once you check in or HR marks the roster." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Day</th><th>Status</th><th>In</th><th>Out</th><th className="right">Hours</th><th>Note</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="nowrap">{formatDate(row.work_date)}</td>
                        <td className="dim">{shortDay(row.work_date)}</td>
                        <td><Badge value={row.status} label={labelOf(ATTENDANCE_STATUSES, row.status)} /></td>
                        <td className="nowrap tnum">
                          {formatTime(row.check_in)}
                          {row.is_late && <span className="badge badge-warn" style={{ marginLeft: 6 }}>late</span>}
                        </td>
                        <td className="nowrap tnum">{formatTime(row.check_out)}</td>
                        <td className="right tnum">{hoursBetween(row.check_in, row.check_out) ?? '—'}</td>
                        <td className="dim">{row.note || '—'}</td>
                        <td>
                          <div className="row-actions">
                            {row.is_late && !regs[`${row.work_date}-late`] && (
                              <button type="button" className="btn btn-2 btn-sm"
                                onClick={() => setRegularizing(row)}>
                                Regularize
                              </button>
                            )}
                            {regs[`${row.work_date}-late`] && (
                              <Badge value={regs[`${row.work_date}-late`].status}
                                label={regs[`${row.work_date}-late`].status === 'pending'
                                  ? 'requested' : regs[`${row.work_date}-late`].status} />
                            )}
                            {row.late_waived && !regs[`${row.work_date}-late`] && (
                              <span className="chip">waived</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>

      {regularizing && (
        <RegularizationForm
          record={regularizing}
          kind="late"
          onClose={() => setRegularizing(null)}
          onSaved={() => { setRegularizing(null); load() }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TeamRoster() {
  const { employee: me } = useAuth()
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [people, setPeople] = useState([])
  const [records, setRecords] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [search, setSearch] = useState('')
  const [lateCounts, setLateCounts] = useState({})
  const [sortByLate, setSortByLate] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportMonth, setReportMonth] = useState(date.slice(0, 7))
  const [reportBusy, setReportBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = monthBounds(date.slice(0, 7))
    const [staff, marks, lates] = await Promise.all([
      supabase.from('employees').select('id, full_name, email, department, designation, status')
        // 'pending' means HR has not filled in their details yet — they still
        // come to work, so they belong on the roster
        .in('status', ['active', 'on_notice', 'pending']).order('full_name'),
      supabase.from('attendance').select('*').eq('work_date', date),
      // every late arrival in the month the chosen date belongs to
      supabase.from('attendance').select('employee_id')
        .eq('is_late', true).gte('work_date', from).lte('work_date', to)
    ])
    if (staff.error || marks.error || lates.error) {
      toast.error((staff.error || marks.error || lates.error).message)
    } else {
      setPeople(staff.data || [])
      setRecords(Object.fromEntries((marks.data || []).map((r) => [r.employee_id, r])))
      const counts = {}
      for (const row of lates.data || []) counts[row.employee_id] = (counts[row.employee_id] || 0) + 1
      setLateCounts(counts)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => { load() }, [load])

  async function mark(employeeId, status) {
    setSavingId(employeeId)
    const existing = records[employeeId]
    const { data, error } = existing
      ? await supabase.from('attendance')
          .update({ status, marked_by: me?.id ?? null }).eq('id', existing.id).select().single()
      : await supabase.from('attendance')
          .insert({ employee_id: employeeId, work_date: date, status, marked_by: me?.id ?? null }).select().single()
    setSavingId(null)
    if (error) toast.error(error.message)
    else setRecords((prev) => ({ ...prev, [employeeId]: data }))
  }

  async function markRemaining() {
    const unmarked = people.filter((p) => !records[p.id])
    if (unmarked.length === 0) { toast.info('Everyone is already marked.'); return }
    const { data, error } = await supabase.from('attendance').insert(
      unmarked.map((p) => ({ employee_id: p.id, work_date: date, status: 'present', marked_by: me?.id ?? null }))
    ).select()
    if (error) toast.error(error.message)
    else {
      setRecords((prev) => ({ ...prev, ...Object.fromEntries((data || []).map((r) => [r.employee_id, r])) }))
      toast.success(`${unmarked.length} marked present.`)
    }
  }

  /** Pull a whole month and hand it back as a CSV file. */
  async function downloadReport(kind) {
    setReportBusy(true)
    const { from, to } = monthBounds(reportMonth)
    const [staff, records] = await Promise.all([
      supabase.from('employees').select('id, full_name, department, designation')
        .in('status', ['active', 'on_notice', 'inactive']).order('full_name'),
      supabase.from('attendance').select('*').gte('work_date', from).lte('work_date', to)
    ])
    setReportBusy(false)

    if (staff.error || records.error) {
      toast.error((staff.error || records.error).message)
      return
    }

    const label = new Date(`${from}T00:00:00`)
      .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const csv = kind === 'detail'
      ? monthDetailCSV(staff.data || [], records.data || [], label)
      : monthSummaryCSV(staff.data || [], records.data || [], label)

    downloadCSV(`attendance-${kind}-${reportMonth}.csv`, csv)
    toast.success(`${label} ${kind} downloaded.`)
    setReportOpen(false)
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term
      ? people.filter((p) => [p.full_name, p.email, p.department]
          .filter(Boolean).some((f) => f.toLowerCase().includes(term)))
      : [...people]
    if (sortByLate) {
      list.sort((a, b) => (lateCounts[b.id] || 0) - (lateCounts[a.id] || 0) ||
                          a.full_name.localeCompare(b.full_name))
    }
    return list
  }, [people, search, sortByLate, lateCounts])

  const marked = people.filter((p) => records[p.id]).length
  const pct = people.length ? Math.round((marked / people.length) * 100) : 0
  const totalLates = Object.values(lateCounts).reduce((sum, n) => sum + n, 0)
  const monthLabel = new Date(`${date}T00:00:00`)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Roster · {formatDate(date)}</h2>
          <p className="sub">
            {marked} of {people.length} marked ·{' '}
            <strong style={{ color: totalLates ? 'var(--warn)' : 'inherit' }}>
              {totalLates} late arrival{totalLates === 1 ? '' : 's'}
            </strong>{' '}in {monthLabel}
          </p>
        </div>
        <div className="toolbar" style={{ width: 'auto' }}>
          <label className="search" style={{ minWidth: 180 }}>
            <Icon name="search" size={16} />
            <input placeholder="Find someone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <DateField value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <button type="button" className="btn btn-2" onClick={markRemaining} disabled={loading || marked === people.length}>
            <Icon name="check" size={15} /> Mark rest present
          </button>
          <button type="button" className="btn btn-2" onClick={() => setReportOpen(true)}>
            <Icon name="trend" size={15} /> Month report
          </button>
        </div>
      </div>

      <div style={{ padding: '0 18px' }}>
        <div className="meter" style={{ marginTop: 14 }}><span style={{ width: `${pct}%` }} /></div>
      </div>

      {reportOpen && (
        <Modal title="Download attendance report"
          subtitle="Everyone's attendance for one month, as a CSV you can open in Excel"
          onClose={() => setReportOpen(false)}>
          <div className="field">
            <label htmlFor="report_month">Month</label>
            <input id="report_month" type="month" value={reportMonth} max={currentMonth()}
              onChange={(e) => setReportMonth(e.target.value)} />
          </div>

          <div className="report-choice">
            <div>
              <strong>Summary</strong>
              <p className="dim">One row per person: present, WFH, half days, leave, absent,
                late arrivals, days marked and hours logged. This is the one payroll wants.</p>
              <button type="button" className="btn" disabled={reportBusy}
                onClick={() => downloadReport('summary')}>
                {reportBusy && <span className="spinner" />} Download summary
              </button>
            </div>
            <div>
              <strong>Daily detail</strong>
              <p className="dim">One row per person per day, with check-in, check-out, hours
                and the late flag. Use it to audit a specific week.</p>
              <button type="button" className="btn btn-2" disabled={reportBusy}
                onClick={() => downloadReport('detail')}>
                {reportBusy && <span className="spinner" />} Download detail
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="card-body flush" style={{ marginTop: 6 }}>
        {loading ? <SkeletonRows rows={6} />
          : visible.length === 0 ? (
            <EmptyState icon="users" title="Nobody to show"
              hint={people.length === 0 ? 'Add active employees in the Employees tab first.' : 'No one matches that search.'} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>In / out</th>
                    <th className="right">
                      <button type="button" className="th-sort" onClick={() => setSortByLate((v) => !v)}
                        title="Late arrivals this month — click to sort">
                        Late (MTD) {sortByLate ? '▾' : ''}
                      </button>
                    </th>
                    <th>Mark</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((person) => {
                    const record = records[person.id]
                    return (
                      <tr key={person.id}>
                        <td>
                          <div className="person">
                            <Avatar name={person.full_name} size="sm" />
                            <div className="who">
                              <strong>{person.full_name}</strong>
                              <span>
                                {person.status === 'pending'
                                  ? 'Record incomplete — set them Active in Employees'
                                  : (person.designation || person.email)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="dim">{person.department || '—'}</td>
                        <td className="nowrap dim tnum">{formatTime(record?.check_in)} — {formatTime(record?.check_out)}</td>
                        <td className="right">
                          {lateCounts[person.id]
                            ? <span className={`late-count ${lateCounts[person.id] >= 3 ? 'high' : ''}`}>
                                {lateCounts[person.id]}
                              </span>
                            : <span className="dim tnum">0</span>}
                        </td>
                        <td>
                          <div className="pills">
                            {PILL_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className={`pill ${record?.status === status ? `on-${status}` : ''}`}
                                disabled={savingId === person.id}
                                onClick={() => mark(person.id, status)}
                              >
                                {PILL_LABEL[status]}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </section>
  )
}
