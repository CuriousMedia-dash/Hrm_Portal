import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  LEAVE_TYPES, labelOf, formatDate, formatRange, todayISO, workingDaysBetween
} from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import Confirm from '../components/Confirm.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'

export default function Leave() {
  const { isAdmin, isApprover } = useAuth()
  const [tab, setTab] = useState('me')
  const [applyOpen, setApplyOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leave</h1>
          <p className="sub">
            {isApprover
              ? (isAdmin
                  ? 'Your own time off, and every request across the company.'
                  : 'Your own time off, and requests from your department.')
              : 'Apply for time off and track your balance.'}
          </p>
        </div>
        <div className="page-actions">
          {isApprover && (
            <div className="seg">
              <button type="button" className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
                <Icon name="user" size={14} /> Mine
              </button>
              <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
                <Icon name="inbox" size={14} /> Approvals
              </button>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setApplyOpen(true)}>
            <Icon name="plus" size={16} /> Apply for leave
          </button>
        </div>
      </div>

      {isApprover && tab === 'team'
        ? <Approvals key={`t${reloadKey}`} />
        : <MyLeave key={`m${reloadKey}`} />}

      {applyOpen && (
        <ApplyForm onClose={() => setApplyOpen(false)}
          onSaved={() => { setApplyOpen(false); setReloadKey((k) => k + 1) }} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function MyLeave() {
  const { employee } = useAuth()
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState(null)
  const [busy, setBusy] = useState(false)

  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    if (!employee?.id) { setLoading(false); return }
    setLoading(true)
    const [reqs, bals] = await Promise.all([
      supabase.from('leave_requests')
        .select('*, reviewer:employees!leave_requests_reviewed_by_fkey(full_name, role)')
        .eq('employee_id', employee.id).order('start_date', { ascending: false }),
      supabase.from('leave_balance_summary').select('*')
        .eq('employee_id', employee.id).eq('year', year)
    ])
    if (reqs.error || bals.error) toast.error((reqs.error || bals.error).message)
    else { setRequests(reqs.data || []); setBalances(bals.data || []) }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, year])

  useEffect(() => { load() }, [load])

  async function withdraw() {
    setBusy(true)
    const { error } = await supabase.from('leave_requests')
      .update({ status: 'cancelled' }).eq('id', withdrawing.id)
    setBusy(false)
    setWithdrawing(null)
    if (error) toast.error(error.message)
    else { toast.success('Request withdrawn.'); load() }
  }

  if (!employee) {
    return (
      <section className="card">
        <EmptyState icon="user" title="No employee record linked"
          hint="Ask HR to add you to the directory with the email you signed in with." />
      </section>
    )
  }

  const ordered = LEAVE_TYPES
    .map((t) => balances.find((b) => b.leave_type === t.value))
    .filter(Boolean)

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Balance</h2>
            <p className="sub">Entitlement for {year}, minus days already approved</p>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="balance-grid">
              {[0, 1, 2, 3].map((i) => <span className="skel" key={i} style={{ height: 96 }} />)}
            </div>
          ) : ordered.length === 0 ? (
            <EmptyState icon="calendar" title="No allowance set yet"
              hint="HR assigns your yearly leave entitlement." />
          ) : (
            <div className="balance-grid">
              {ordered.map((b) => {
                const entitled = Number(b.entitled)
                const used = Number(b.used)
                const left = entitled - used
                const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0
                const tone = entitled === 0 ? '' : left <= 0 ? 'is-out' : left <= entitled * 0.25 ? 'is-low' : ''
                return (
                  <div className="balance" key={b.leave_type}>
                    <div className="type">{labelOf(LEAVE_TYPES, b.leave_type)}</div>
                    <div className="num">{left}<small> / {entitled} days</small></div>
                    <div className={`meter ${tone}`}><span style={{ width: `${pct}%` }} /></div>
                    <div className="note">{used} used this year</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>My requests</h2></div>
        <div className="card-body flush">
          {loading ? <SkeletonRows rows={4} avatar={false} />
            : requests.length === 0 ? (
              <EmptyState icon="palm" title="No leave requests yet"
                hint="Everything you apply for shows up here with its status." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Type</th><th>Dates</th><th className="right">Days</th><th>Reason</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {requests.map((req) => (
                      <tr key={req.id}>
                        <td className="nowrap">{labelOf(LEAVE_TYPES, req.leave_type)}</td>
                        <td className="nowrap">{formatRange(req.start_date, req.end_date)}</td>
                        <td className="right tnum">{req.days}</td>
                        <td className="dim">{req.reason || '—'}</td>
                        <td>
                          <Badge value={req.status} />
                          {req.reviewer?.full_name && (
                            <div className="dim" style={{ fontSize: '.75rem', marginTop: 3 }}>
                              by {req.reviewer.full_name}
                              {req.reviewer.role === 'manager' ? ' (manager)' : ' (HR)'}
                              {req.reviewed_at ? ` · ${formatDate(req.reviewed_at)}` : ''}
                            </div>
                          )}
                          {req.review_note && <div className="dim" style={{ fontSize: '.76rem', marginTop: 3 }}>{req.review_note}</div>}
                        </td>
                        <td>
                          <div className="row-actions">
                            {req.status === 'pending' && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWithdrawing(req)}>
                                Withdraw
                              </button>
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

      {withdrawing && (
        <Confirm
          title="Withdraw this request?"
          body={`${labelOf(LEAVE_TYPES, withdrawing.leave_type)} · ${formatRange(withdrawing.start_date, withdrawing.end_date)}. HR will no longer see it in the approval queue.`}
          confirmLabel="Withdraw"
          danger
          busy={busy}
          onConfirm={withdraw}
          onClose={() => setWithdrawing(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function Approvals() {
  const { employee: me, isAdmin: isAdminView } = useAuth()
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('leave_requests')
      .select('*, employee:employees!leave_requests_employee_id_fkey(full_name, department, email), reviewer:employees!leave_requests_reviewed_by_fkey(full_name, role)')
      .order('start_date', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) toast.error(error.message)
    else setRequests(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => { load() }, [load])

  async function decide(req, decision, reviewNote = '') {
    setBusyId(req.id)
    const { error } = await supabase.from('leave_requests').update({
      status: decision,
      reviewed_by: me?.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null
    }).eq('id', req.id)
    setBusyId(null)
    if (error) toast.error(error.message)
    else {
      toast.success(`${req.employee?.full_name || 'Request'} — leave ${decision}.`)
      load()
    }
  }

  const totals = useMemo(() => ({
    count: requests.length,
    days: requests.reduce((sum, r) => sum + Number(r.days || 0), 0)
  }), [requests])

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{isAdminView ? 'All requests' : 'My department'}</h2>
            <p className="sub">{totals.count} request{totals.count === 1 ? '' : 's'} · {totals.days} days</p>
          </div>
          <div className="seg">
            {['pending', 'approved', 'rejected', 'all'].map((s) => (
              <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={5} />
            : requests.length === 0 ? (
              <EmptyState icon="checkCircle"
                title={status === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
                hint={status === 'pending' ? 'Every request has been reviewed.' : 'No requests match this filter.'} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Type</th><th>Dates</th><th className="right">Days</th><th>Reason</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {requests.map((req) => (
                      <tr key={req.id}>
                        <td>
                          <div className="person">
                            <Avatar name={req.employee?.full_name || '?'} size="sm" />
                            <div className="who">
                              <strong>{req.employee?.full_name || '—'}</strong>
                              <span>{req.employee?.department || req.employee?.email || ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className="nowrap">{labelOf(LEAVE_TYPES, req.leave_type)}</td>
                        <td className="nowrap">{formatRange(req.start_date, req.end_date)}</td>
                        <td className="right tnum">{req.days}</td>
                        <td className="dim">{req.reason || '—'}</td>
                        <td>
                          <Badge value={req.status} />
                          {req.reviewer?.full_name && (
                            <div className="dim" style={{ fontSize: '.75rem', marginTop: 3 }}>
                              by {req.reviewer.full_name}{req.reviewer.role === 'manager' ? ' (manager)' : ' (HR)'}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            {req.status === 'pending' && (
                              <>
                                <button type="button" className="btn btn-good btn-sm" disabled={busyId === req.id}
                                  onClick={() => decide(req, 'approved')}>
                                  <Icon name="check" size={13} /> Approve
                                </button>
                                <button type="button" className="btn btn-2 btn-sm" disabled={busyId === req.id}
                                  onClick={() => { setRejecting(req); setNote('') }}>
                                  Reject
                                </button>
                              </>
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

      {rejecting && (
        <Modal
          title={`Reject ${rejecting.employee?.full_name || 'request'}?`}
          subtitle={`${labelOf(LEAVE_TYPES, rejecting.leave_type)} · ${formatRange(rejecting.start_date, rejecting.end_date)}`}
          onClose={() => setRejecting(null)}
        >
          <div className="field">
            <label htmlFor="reject_note">Reason (they will see this)</label>
            <textarea id="reject_note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. clashes with the campaign launch" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-2" onClick={() => setRejecting(null)}>Cancel</button>
            <button type="button" className="btn btn-bad" disabled={busyId === rejecting.id}
              onClick={async () => { const r = rejecting; setRejecting(null); await decide(r, 'rejected', note.trim()) }}>
              Reject request
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ApplyForm({ onClose, onSaved }) {
  const { employee } = useAuth()
  const toast = useToast()
  const [leaveType, setLeaveType] = useState('casual')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const days = useMemo(
    () => workingDaysBetween(startDate, endDate),
    [startDate, endDate]
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!employee?.id) { setError('No employee record is linked to your login yet.'); return }
    if (new Date(endDate) < new Date(startDate)) { setError('The end date cannot be before the start date.'); return }
    if (days <= 0) { setError('That range has no working days in it.'); return }

    setBusy(true)
    const { error: saveError } = await supabase.from('leave_requests').insert({
      employee_id: employee.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      days,
      reason: reason.trim() || null,
      status: 'pending'
    })
    setBusy(false)
    if (saveError) setError(saveError.message)
    else { toast.success('Request sent to HR.'); onSaved() }
  }

  return (
    <Modal title="Apply for leave" subtitle="Weekends are excluded from the day count" onClose={onClose}>
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="leave_type">Leave type</label>
          <select id="leave_type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="start_date">From</label>
            <input id="start_date" type="date" value={startDate} required
              onChange={(e) => {
                setStartDate(e.target.value)
                if (new Date(e.target.value) > new Date(endDate)) setEndDate(e.target.value)
              }} />
          </div>
          <div className="field">
            <label htmlFor="end_date">To</label>
            <input id="end_date" type="date" value={endDate} min={startDate} required
              onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="reason">Reason</label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="A short note for your manager" />
        </div>

        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          <Icon name="info" size={16} />
          <span>
            {formatDate(startDate)} → {formatDate(endDate)} · <strong>{days}</strong> working day{days === 1 ? '' : 's'}
          </span>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy || days <= 0}>
            {busy && <span className="spinner" />} Submit request
          </button>
        </div>
      </form>
    </Modal>
  )
}
