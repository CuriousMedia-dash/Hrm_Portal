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
import {
  MIN_WORK_HOURS, lateAfterLabel, timeUntilCheckout, hoursWorked
} from '../lib/policy.js'

const PILL_STATUSES = ['present', 'wfh', 'half_day', 'leave', 'absent']
const PILL_LABEL = { present: 'Present', wfh: 'WFH', half_day: 'Half', leave: 'Leave', absent: 'Absent' }

export default function Attendance() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('me')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="sub">
            {isAdmin ? 'Check yourself in, or mark the whole team for any day.' : 'Check in, check out and review your month.'}
          </p>
        </div>
        {isAdmin && (
          <div className="seg">
            <button type="button" className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
              <Icon name="user" size={14} /> Mine
            </button>
            <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
              <Icon name="users" size={14} /> Team roster
            </button>
          </div>
        )}
      </div>

      {isAdmin && tab === 'team' ? <TeamRoster /> : <MyAttendance />}
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

  const load = useCallback(async () => {
    if (!employee?.id) { setLoading(false); return }
    setLoading(true)
    const { from, to } = monthBounds(month)
    const { data, error } = await supabase.from('attendance').select('*')
      .eq('employee_id', employee.id).gte('work_date', from).lte('work_date', to)
      .order('work_date', { ascending: false })
    if (error) toast.error(error.message)
    else setRows(data || [])
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
            {!today?.check_in ? (
              <button type="button" className="btn" onClick={checkIn} disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="login" size={15} />} Check in
              </button>
            ) : (
              <span className="chip"><Icon name="checkCircle" size={13} /> In at {formatTime(today.check_in)}</span>
            )}
            {today?.check_in && !today?.check_out && (
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
                    <tr><th>Date</th><th>Day</th><th>Status</th><th>In</th><th>Out</th><th className="right">Hours</th><th>Note</th></tr>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>
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

  const load = useCallback(async () => {
    setLoading(true)
    const [staff, marks] = await Promise.all([
      supabase.from('employees').select('id, full_name, email, department, designation')
        .in('status', ['active', 'on_notice']).order('full_name'),
      supabase.from('attendance').select('*').eq('work_date', date)
    ])
    if (staff.error || marks.error) toast.error((staff.error || marks.error).message)
    else {
      setPeople(staff.data || [])
      setRecords(Object.fromEntries((marks.data || []).map((r) => [r.employee_id, r])))
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

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return people
    return people.filter((p) => [p.full_name, p.email, p.department]
      .filter(Boolean).some((f) => f.toLowerCase().includes(term)))
  }, [people, search])

  const marked = people.filter((p) => records[p.id]).length
  const pct = people.length ? Math.round((marked / people.length) * 100) : 0

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Roster · {formatDate(date)}</h2>
          <p className="sub">{marked} of {people.length} marked</p>
        </div>
        <div className="toolbar" style={{ width: 'auto' }}>
          <label className="search" style={{ minWidth: 180 }}>
            <Icon name="search" size={16} />
            <input placeholder="Find someone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <button type="button" className="btn btn-2" onClick={markRemaining} disabled={loading || marked === people.length}>
            <Icon name="check" size={15} /> Mark rest present
          </button>
        </div>
      </div>

      <div style={{ padding: '0 18px' }}>
        <div className="meter" style={{ marginTop: 14 }}><span style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="card-body flush" style={{ marginTop: 6 }}>
        {loading ? <SkeletonRows rows={6} />
          : visible.length === 0 ? (
            <EmptyState icon="users" title="Nobody to show"
              hint={people.length === 0 ? 'Add active employees in the Employees tab first.' : 'No one matches that search.'} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Employee</th><th>Department</th><th>In / out</th><th>Mark</th></tr>
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
                              <span>{person.designation || person.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="dim">{person.department || '—'}</td>
                        <td className="nowrap dim tnum">{formatTime(record?.check_in)} — {formatTime(record?.check_out)}</td>
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
