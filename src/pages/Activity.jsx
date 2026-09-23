import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from '../components/Toast.jsx'
import {
  formatDate, formatRange, labelOf, todayISO, LEAVE_TYPES, currentMonth, monthBounds
} from '../lib/format.js'
import { EXPENSE_CATEGORIES, formatMoney } from '../lib/reimbursements.js'
import { tierOf } from '../lib/policy.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Icon from '../components/Icon.jsx'
import StatTile from '../components/StatTile.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows, SkeletonTiles } from '../components/Skeleton.jsx'
import NetworkSettings from '../components/NetworkSettings.jsx'

/**
 * Everything in flight, company-wide. Super admin only — HR has the same
 * reach in the database, but this page is about seeing the whole board at
 * once rather than working a single queue.
 */
export default function Activity() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [leave, setLeave] = useState([])
  const [claims, setClaims] = useState([])
  const [regs, setRegs] = useState([])
  const [people, setPeople] = useState([])
  const [presentToday, setPresentToday] = useState(0)
  const [monthLates, setMonthLates] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayISO()
    const { from, to } = monthBounds(currentMonth())

    const [l, c, r, staff, att, lates] = await Promise.all([
      supabase.from('leave_requests')
        .select('*, employee:employees!leave_requests_employee_id_fkey(full_name, department)')
        .eq('status', 'pending').order('start_date'),
      supabase.from('reimbursements')
        .select('*, employee:employees!reimbursements_employee_id_fkey(full_name, department)')
        .in('status', ['pending', 'approved']).order('claim_date'),
      supabase.from('regularizations')
        .select('*, employee:employees!regularizations_employee_id_fkey(full_name, department)')
        .eq('status', 'pending').order('work_date'),
      supabase.from('employees').select('id, full_name, department, role, employment_type, status'),
      supabase.from('attendance').select('status').eq('work_date', today),
      supabase.from('attendance').select('id', { count: 'exact', head: true })
        .eq('is_late', true).gte('work_date', from).lte('work_date', to)
    ])

    const failed = l.error || c.error || r.error || staff.error
    if (failed) toast.error(failed.message)
    else {
      setLeave(l.data || [])
      setClaims(c.data || [])
      setRegs(r.data || [])
      setPeople((staff.data || []).filter((p) => p.status === 'active'))
      setPresentToday((att.data || []).filter((a) => ['present', 'wfh', 'half_day'].includes(a.status)).length)
      setMonthLates(lates.count || 0)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const pendingClaims = claims.filter((c) => c.status === 'pending')
  const owed = claims.filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + Number(c.amount || 0), 0)

  const byDepartment = people.reduce((acc, p) => {
    const key = p.department || 'Unassigned'
    acc[key] = acc[key] || { people: 0, leads: [] }
    acc[key].people += 1
    if (p.role === 'manager') acc[key].leads.push(p.full_name)
    return acc
  }, {})

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Company activity</h1>
          <p className="sub">Everything in flight right now, across every department.</p>
        </div>
        <button type="button" className="btn btn-2" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="trend" size={15} />} Refresh
        </button>
      </div>

      {loading ? <SkeletonTiles count={4} /> : (
        <div className="grid grid-4">
          <StatTile icon="users" tone="brand" label="Active headcount" value={people.length}
            hint={`${Object.keys(byDepartment).length} departments`} />
          <StatTile icon="checkCircle" tone="good" label="In today" value={presentToday}
            suffix={`of ${people.length}`} />
          <StatTile icon="inbox" tone="warn" label="Awaiting a decision"
            value={leave.length + pendingClaims.length + regs.length}
            hint={`${leave.length} leave · ${pendingClaims.length} claims · ${regs.length} regularizations`} />
          <StatTile icon="wallet" tone="info" label="Approved, unpaid" value={formatMoney(owed)}
            hint={`${monthLates} late arrivals this month`} />
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Queue title="Leave awaiting approval" to="/leave" rows={leave} loading={loading}
          empty="No leave requests pending."
          render={(row) => ({
            who: row.employee?.full_name,
            sub: `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
            tail: `${row.days}d`
          })} />

        <Queue title="Claims awaiting approval" to="/reimbursements" rows={pendingClaims} loading={loading}
          empty="No reimbursement claims pending."
          render={(row) => ({
            who: row.employee?.full_name,
            sub: `${labelOf(EXPENSE_CATEGORIES, row.category)} · ${formatDate(row.claim_date)}`,
            tail: formatMoney(row.amount)
          })} />

        <Queue title="Regularizations awaiting approval" to="/attendance" rows={regs} loading={loading}
          empty="No regularization requests pending."
          render={(row) => ({
            who: row.employee?.full_name,
            sub: `${row.kind === 'late' ? 'Late arrival' : 'Missed day'} · ${formatDate(row.work_date)}`,
            tail: null
          })} />

        <NetworkSettings />

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Departments</h2>
              <p className="sub">Headcount and who approves for each</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/employees">
              Directory <Icon name="arrowRight" size={13} />
            </Link>
          </div>
          <div className="card-body flush">
            {loading ? <SkeletonRows rows={4} avatar={false} />
              : Object.keys(byDepartment).length === 0 ? (
                <EmptyState icon="building" title="No departments yet" />
              ) : (
                <div className="list">
                  {Object.entries(byDepartment).sort().map(([name, info]) => (
                    <div className="list-item" key={name}>
                      <span className="tile-icon"><Icon name="building" size={15} /></span>
                      <div className="grow">
                        <strong style={{ fontSize: '.9rem' }}>{name}</strong>
                        <div className="dim" style={{ fontSize: '.78rem' }}>
                          {info.leads.length
                            ? `Manager: ${info.leads.join(', ')}`
                            : 'No manager — approvals fall to HR'}
                        </div>
                      </div>
                      <span className="chip">{info.people}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </section>
      </div>
    </>
  )
}

function Queue({ title, to, rows, loading, empty, render }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <Link className="btn btn-ghost btn-sm" to={to}>Open <Icon name="arrowRight" size={13} /></Link>
      </div>
      <div className="card-body flush">
        {loading ? <SkeletonRows rows={3} />
          : rows.length === 0 ? <EmptyState icon="checkCircle" title="All clear" hint={empty} />
          : (
            <div className="list">
              {rows.slice(0, 8).map((row) => {
                const item = render(row)
                return (
                  <div className="list-item" key={row.id}>
                    <Avatar name={item.who || '?'} size="sm" />
                    <div className="grow">
                      <strong style={{ fontSize: '.89rem' }}>{item.who || '—'}</strong>
                      <div className="dim" style={{ fontSize: '.78rem' }}>{item.sub}</div>
                    </div>
                    {item.tail && <span className="chip">{item.tail}</span>}
                  </div>
                )
              })}
              {rows.length > 8 && (
                <div className="list-item dim" style={{ fontSize: '.82rem' }}>
                  and {rows.length - 8} more…
                </div>
              )}
            </div>
          )}
      </div>
    </section>
  )
}
