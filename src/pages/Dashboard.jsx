import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  todayISO, formatDate, formatRange, formatTime, labelOf,
  LEAVE_TYPES, ATTENDANCE_STATUSES, lastNDays, shortDay
} from '../lib/format.js'
import StatTile from '../components/StatTile.jsx'
import Badge from '../components/Badge.jsx'
import Avatar from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import MiniBars from '../components/MiniBars.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows, SkeletonTiles } from '../components/Skeleton.jsx'
import { MIN_WORK_HOURS, timeUntilCheckout } from '../lib/policy.js'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { employee, isAdmin } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ headcount: 0, present: 0, onLeave: 0, pending: 0 })
  const [pending, setPending] = useState([])
  const [outToday, setOutToday] = useState([])
  const [myLeave, setMyLeave] = useState([])
  const [myToday, setMyToday] = useState(null)
  const [week, setWeek] = useState([])
  const [busy, setBusy] = useState(false)

  const days = lastNDays(7)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      const today = todayISO()
      const from = days[0]

      try {
        if (isAdmin) {
          const [head, todayMarks, outs, queue, weekMarks] = await Promise.all([
            supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('attendance').select('status').eq('work_date', today),
            supabase.from('leave_requests')
              .select('id, leave_type, start_date, end_date, employee:employees!leave_requests_employee_id_fkey(full_name, department)')
              .eq('status', 'approved').lte('start_date', today).gte('end_date', today),
            supabase.from('leave_requests')
              .select('id, leave_type, start_date, end_date, days, reason, employee:employees!leave_requests_employee_id_fkey(full_name, department)')
              .eq('status', 'pending').order('created_at').limit(5),
            supabase.from('attendance').select('work_date, status').gte('work_date', from).lte('work_date', today)
          ])
          if (!active) return

          const err = head.error || todayMarks.error || outs.error || queue.error || weekMarks.error
          if (err) throw err

          const inToday = (todayMarks.data || []).filter((r) => ['present', 'wfh', 'half_day'].includes(r.status)).length
          setStats({
            headcount: head.count ?? 0,
            present: inToday,
            onLeave: (outs.data || []).length,
            pending: (queue.data || []).length
          })
          setPending(queue.data || [])
          setOutToday(outs.data || [])
          setWeek(days.map((date) => ({
            label: shortDay(date),
            value: (weekMarks.data || []).filter((r) => r.work_date === date && ['present', 'wfh', 'half_day'].includes(r.status)).length,
            sub: formatDate(date)
          })))
        }

        if (employee?.id) {
          const [mine, todayRow, myWeek] = await Promise.all([
            supabase.from('leave_requests').select('id, leave_type, start_date, end_date, days, status')
              .eq('employee_id', employee.id).order('start_date', { ascending: false }).limit(4),
            supabase.from('attendance').select('*')
              .eq('employee_id', employee.id).eq('work_date', today).maybeSingle(),
            supabase.from('attendance').select('work_date, status')
              .eq('employee_id', employee.id).gte('work_date', from).lte('work_date', today)
          ])
          if (!active) return
          if (mine.error) throw mine.error

          setMyLeave(mine.data || [])
          setMyToday(todayRow.data || null)
          if (!isAdmin) {
            setWeek(days.map((date) => {
              const row = (myWeek.data || []).find((r) => r.work_date === date)
              const value = row ? (row.status === 'half_day' ? 0.5 : ['present', 'wfh'].includes(row.status) ? 1 : 0) : 0
              return { label: shortDay(date), value, sub: row ? labelOf(ATTENDANCE_STATUSES, row.status) : 'Not marked' }
            }))
          }
        }
      } catch (err) {
        if (active) toast.error(err.message || 'Could not load the dashboard.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, isAdmin])

  async function checkIn() {
    if (!employee?.id) return
    setBusy(true)
    const { data, error } = await supabase.from('attendance').upsert(
      { employee_id: employee.id, work_date: todayISO(), status: 'present', check_in: new Date().toISOString() },
      { onConflict: 'employee_id,work_date' }
    ).select().single()
    setBusy(false)
    if (error) toast.error(error.message)
    else { setMyToday(data); toast.success('Checked in. Have a good day.') }
  }

  async function checkOut() {
    if (!myToday) return
    const short = timeUntilCheckout(myToday.check_in)
    if (short) {
      toast.error(`You need ${MIN_WORK_HOURS} hours from check-in. ${short} to go.`)
      return
    }
    setBusy(true)
    const { data, error } = await supabase.from('attendance')
      .update({ check_out: new Date().toISOString() }).eq('id', myToday.id).select().single()
    setBusy(false)
    if (error) toast.error(error.message)
    else { setMyToday(data); toast.success('Checked out. See you tomorrow.') }
  }

  // re-render each minute so the countdown stays live
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const remaining = myToday?.check_in && !myToday?.check_out
    ? timeUntilCheckout(myToday.check_in)
    : null
  const firstName = (employee?.full_name || '').split(' ')[0] || 'there'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}, {firstName}</h1>
          <p className="sub">{formatDate(todayISO())} · here’s where things stand.</p>
        </div>
        <div className="page-actions">
          {!myToday?.check_in ? (
            <button type="button" className="btn" onClick={checkIn} disabled={busy || !employee}>
              <Icon name="clock" size={16} /> Check in
            </button>
          ) : !myToday?.check_out ? (
            remaining ? (
              <span className="chip" title={`Minimum ${MIN_WORK_HOURS} hours from check-in`}>
                <Icon name="clock" size={14} /> Check out in {remaining}
              </span>
            ) : (
              <button type="button" className="btn btn-2" onClick={checkOut} disabled={busy}>
                <Icon name="clock" size={16} /> Check out
              </button>
            )
          ) : (
            <span className="chip"><Icon name="checkCircle" size={14} /> Day closed at {formatTime(myToday.check_out)}</span>
          )}
          <Link className="btn btn-2" to="/leave"><Icon name="palm" size={16} /> Apply for leave</Link>
        </div>
      </div>

      {loading ? (
        <SkeletonTiles count={4} />
      ) : isAdmin ? (
        <div className="grid grid-4">
          <StatTile icon="users" tone="brand" label="Active headcount" value={stats.headcount} hint="People marked active" />
          <StatTile icon="checkCircle" tone="good" label="Marked in today" value={stats.present}
            suffix={`of ${stats.headcount}`} hint="Present, WFH or half day" />
          <StatTile icon="palm" tone="info" label="Out on leave" value={stats.onLeave} hint="Approved leave covering today" />
          <StatTile icon="inbox" tone="warn" label="Awaiting approval" value={stats.pending}>
            {stats.pending > 0 && <Link className="tile-link" to="/leave">Review requests →</Link>}
          </StatTile>
        </div>
      ) : (
        <div className="grid grid-4">
          <StatTile icon="clock" tone="brand" label="Today" value={myToday ? labelOf(ATTENDANCE_STATUSES, myToday.status) : 'Not marked'}
            hint={myToday?.check_in ? `In at ${formatTime(myToday.check_in)}` : 'Check in to start the day'} />
          <StatTile icon="login" tone="good" label="Checked in" value={formatTime(myToday?.check_in)} />
          <StatTile icon="logout" tone="info" label="Checked out" value={formatTime(myToday?.check_out)} />
          <StatTile icon="calendar" tone="warn" label="Open requests"
            value={myLeave.filter((l) => l.status === 'pending').length} hint="Leave waiting on HR" />
        </div>
      )}

      <div className="grid grid-wide" style={{ marginTop: 16 }}>
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>{isAdmin ? 'Attendance this week' : 'My week'}</h2>
                <p className="sub">{isAdmin ? 'People marked in each day' : 'Days you were marked in'}</p>
              </div>
              <span className="chip"><Icon name="trend" size={13} /> Last 7 days</span>
            </div>
            <div className="card-body">
              {loading ? <span className="skel" style={{ display: 'block', height: 132 }} />
                       : <MiniBars data={week} valueLabel={isAdmin ? 'marked in' : 'day'} />}
            </div>
          </section>

          {isAdmin && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Waiting on you</h2>
                  <p className="sub">Leave requests still to review</p>
                </div>
                <Link className="btn btn-2 btn-sm" to="/leave">Open leave <Icon name="arrowRight" size={14} /></Link>
              </div>
              <div className="card-body flush">
                {loading ? <SkeletonRows rows={3} />
                  : pending.length === 0 ? (
                    <EmptyState icon="checkCircle" title="All caught up" hint="Every request has been reviewed." />
                  ) : (
                    <div className="list">
                      {pending.map((req) => (
                        <div className="list-item" key={req.id}>
                          <Avatar name={req.employee?.full_name || '?'} size="sm" />
                          <div className="grow">
                            <strong style={{ fontSize: '.9rem' }}>{req.employee?.full_name || '—'}</strong>
                            <div className="dim" style={{ fontSize: '.79rem' }}>
                              {labelOf(LEAVE_TYPES, req.leave_type)} · {formatRange(req.start_date, req.end_date)}
                            </div>
                          </div>
                          <span className="chip">{req.days}d</span>
                          <Link className="btn btn-2 btn-sm" to="/leave">Review</Link>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          {isAdmin && (
            <section className="card">
              <div className="card-head"><h2>Out today</h2></div>
              <div className="card-body flush">
                {loading ? <SkeletonRows rows={2} />
                  : outToday.length === 0 ? (
                    <EmptyState icon="users" title="Everyone’s in" hint="Nobody is on approved leave today." />
                  ) : (
                    <div className="list">
                      {outToday.map((row) => (
                        <div className="list-item" key={row.id}>
                          <Avatar name={row.employee?.full_name || '?'} size="sm" />
                          <div className="grow">
                            <strong style={{ fontSize: '.88rem' }}>{row.employee?.full_name}</strong>
                            <div className="dim" style={{ fontSize: '.78rem' }}>{row.employee?.department || '—'}</div>
                          </div>
                          <Badge value={row.leave_type} tone="info" label={labelOf(LEAVE_TYPES, row.leave_type)} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>My leave</h2>
              <Link className="btn btn-ghost btn-sm" to="/leave">All <Icon name="arrowRight" size={13} /></Link>
            </div>
            <div className="card-body flush">
              {loading ? <SkeletonRows rows={3} avatar={false} />
                : myLeave.length === 0 ? (
                  <EmptyState icon="calendar" title="No requests yet" hint="Time off you apply for shows up here." />
                ) : (
                  <div className="list">
                    {myLeave.map((req) => (
                      <div className="list-item" key={req.id}>
                        <div className="grow">
                          <strong style={{ fontSize: '.88rem' }}>{labelOf(LEAVE_TYPES, req.leave_type)}</strong>
                          <div className="dim" style={{ fontSize: '.78rem' }}>{formatRange(req.start_date, req.end_date)} · {req.days}d</div>
                        </div>
                        <Badge value={req.status} />
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
