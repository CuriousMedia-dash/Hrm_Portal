import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { formatRange, formatDate, labelOf, LEAVE_TYPES, shortDate } from '../lib/format.js'
import { formatMoney, EXPENSE_CATEGORIES } from '../lib/reimbursements.js'
import { REQUIRED_DOCS } from '../lib/documents.js'
import {
  conversionDate, daysUntil, describeDays, INTERN_WARN_DAYS, NOTICE_WARN_DAYS
} from '../lib/policy.js'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'

const REFRESH_MS = 5 * 60 * 1000

/**
 * Everything that needs someone's attention, in one panel.
 *
 * HR sees the queues (pending leave, pending claims) and upcoming birthdays.
 * Employees see the state of their own requests and what is missing from
 * their profile — never anyone else's data, which is what the RLS allows.
 */
export default function NotificationBell() {
  const { employee, isAdmin, isApprover } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const panelRef = useRef(null)

  const load = useCallback(async () => {
    if (!employee?.id) { setItems([]); setLoading(false); return }
    setLoading(true)
    const next = []

    try {
      if (isApprover) {
        const [leave, claims, birthdays, staff, regs] = await Promise.all([
          supabase.from('leave_requests')
            .select('id, leave_type, start_date, end_date, days, employee:employees!leave_requests_employee_id_fkey(full_name)')
            .eq('status', 'pending').order('created_at').limit(20),
          supabase.from('reimbursements')
            .select('id, category, amount, claim_date, employee:employees!reimbursements_employee_id_fkey(full_name)')
            .eq('status', 'pending').order('created_at').limit(20),
          supabase.rpc('upcoming_birthdays', { days_ahead: 7 }),
          supabase.from('employees')
            .select('id, full_name, department, designation, employment_type, status, date_of_joining, internship_end_date, notice_end_date')
            .in('status', ['active', 'on_notice']),
          supabase.from('regularizations')
            .select('id, work_date, kind, reason, employee:employees!regularizations_employee_id_fkey(full_name, department)')
            .eq('status', 'pending').order('created_at').limit(20)
        ])

        for (const row of leave.data || []) {
          next.push({
            id: `leave-${row.id}`, kind: 'leave', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'} requested leave`,
            detail: `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)} · ${row.days}d`,
            to: '/leave'
          })
        }

        for (const row of claims.data || []) {
          next.push({
            id: `claim-${row.id}`, kind: 'claim', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'} claimed ${formatMoney(row.amount)}`,
            detail: `${labelOf(EXPENSE_CATEGORIES, row.category)} · ${formatDate(row.claim_date)}`,
            to: '/reimbursements'
          })
        }

        for (const row of regs.data || []) {
          next.push({
            id: `reg-${row.id}`, kind: 'doc', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'} asked to regularize ${row.kind === 'late' ? 'a late arrival' : 'a missed day'}`,
            detail: `${formatDate(row.work_date)} · ${row.reason.slice(0, 60)}${row.reason.length > 60 ? '…' : ''}`,
            to: '/attendance'
          })
        }

        // interns coming up on their 6-month mark
        for (const person of (staff.data || []).filter((p) => p.employment_type === 'intern')) {
          const due = conversionDate(person)
          const days = daysUntil(due)
          if (days === null || days > INTERN_WARN_DAYS) continue
          next.push({
            id: `intern-${person.id}`, kind: days < 0 ? 'bad' : 'intern', person: person.full_name,
            title: days < 0
              ? `${person.full_name}'s internship ended ${describeDays(days)}`
              : `${person.full_name} converts to full time ${describeDays(days)}`,
            detail: [person.designation, person.department].filter(Boolean).join(' · ') || 'Internship milestone',
            to: '/employees'
          })
        }

        // people working out their notice
        for (const person of (staff.data || []).filter((p) => p.status === 'on_notice')) {
          const days = daysUntil(person.notice_end_date)
          if (days === null || days > NOTICE_WARN_DAYS) continue
          next.push({
            id: `notice-${person.id}`, kind: 'bad', person: person.full_name,
            title: days < 0
              ? `${person.full_name}'s last working day was ${describeDays(days)}`
              : `${person.full_name}'s last working day is ${describeDays(days)}`,
            detail: [person.designation, person.department].filter(Boolean).join(' · ') || 'Notice period ending',
            to: '/employees'
          })
        }

        for (const row of birthdays.data || []) {
          next.push({
            id: `bday-${row.id}`, kind: 'birthday', person: row.full_name,
            title: row.days_away === 0
              ? `${row.full_name}'s birthday is today`
              : `${row.full_name}'s birthday ${row.days_away === 1 ? 'is tomorrow' : `in ${row.days_away} days`}`,
            detail: [row.designation, row.department].filter(Boolean).join(' · ') || shortDate(row.birthday),
            to: '/employees'
          })
        }
      } else {
        const [mine, myClaims, docs, contacts, myRegs] = await Promise.all([
          supabase.from('leave_requests').select('id, leave_type, start_date, end_date, status, review_note')
            .eq('employee_id', employee.id).in('status', ['pending', 'approved', 'rejected'])
            .order('updated_at', { ascending: false }).limit(5),
          supabase.from('reimbursements').select('id, category, amount, status, review_note')
            .eq('employee_id', employee.id).in('status', ['pending', 'approved', 'rejected', 'paid'])
            .order('updated_at', { ascending: false }).limit(5),
          supabase.from('employee_documents').select('doc_type').eq('employee_id', employee.id),
          supabase.from('emergency_contacts').select('id').eq('employee_id', employee.id),
          supabase.from('regularizations').select('id, work_date, kind, status, review_note')
            .eq('employee_id', employee.id).order('updated_at', { ascending: false }).limit(5)
        ])

        for (const row of mine.data || []) {
          if (row.status === 'pending') {
            next.push({
              id: `ml-${row.id}`, kind: 'leave',
              title: 'Your leave request is awaiting approval',
              detail: `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
              to: '/leave'
            })
          } else {
            next.push({
              id: `ml-${row.id}`, kind: row.status === 'approved' ? 'ok' : 'bad',
              title: `Your leave was ${row.status}`,
              detail: row.review_note || `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
              to: '/leave'
            })
          }
        }

        for (const row of myClaims.data || []) {
          next.push({
            id: `mc-${row.id}`,
            kind: row.status === 'pending' ? 'claim' : row.status === 'rejected' ? 'bad' : 'ok',
            title: row.status === 'pending'
              ? `Your ${formatMoney(row.amount)} claim is awaiting approval`
              : `Your ${formatMoney(row.amount)} claim was ${row.status}`,
            detail: row.review_note || labelOf(EXPENSE_CATEGORIES, row.category),
            to: '/reimbursements'
          })
        }

        for (const row of myRegs.data || []) {
          next.push({
            id: `mr-${row.id}`,
            kind: row.status === 'pending' ? 'doc' : row.status === 'approved' ? 'ok' : 'bad',
            title: row.status === 'pending'
              ? 'Your regularization request is awaiting approval'
              : `Your regularization was ${row.status}`,
            detail: row.review_note || formatDate(row.work_date),
            to: '/attendance'
          })
        }

        const have = new Set((docs.data || []).map((d) => d.doc_type))
        const missing = REQUIRED_DOCS.filter((d) => !have.has(d.value))
        if (missing.length > 0) {
          next.push({
            id: 'docs-missing', kind: 'doc',
            title: `${missing.length} required document${missing.length === 1 ? '' : 's'} missing`,
            detail: missing.slice(0, 3).map((d) => d.label).join(', ') + (missing.length > 3 ? '…' : ''),
            to: '/profile'
          })
        }

        const contactCount = (contacts.data || []).length
        if (contactCount < 2) {
          next.push({
            id: 'contacts-missing', kind: 'doc',
            title: `Add ${2 - contactCount} more emergency contact${2 - contactCount === 1 ? '' : 's'}`,
            detail: 'Two are required — parent, sibling or guardian',
            to: '/profile'
          })
        }
      }
    } catch {
      // a failed panel should never break the page it sits on
    }

    setItems(next)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, isApprover])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ICONS = {
    leave: 'palm', claim: 'wallet', birthday: 'gift', doc: 'inbox',
    intern: 'trend', ok: 'checkCircle', bad: 'alert'
  }
  const actionable = items.filter((i) => i.kind !== 'ok').length

  return (
    <div className="bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="icon-btn bell-btn"
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        aria-label={`Notifications${actionable ? `, ${actionable} needing attention` : ''}`}
      >
        <Icon name="bell" size={18} />
        {actionable > 0 && <span className="bell-dot">{actionable > 9 ? '9+' : actionable}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <header className="bell-head">
            <strong>Notifications</strong>
            <button type="button" className="link-btn" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </header>

          <div className="bell-list">
            {loading && items.length === 0 ? (
              <div className="bell-empty"><span className="spinner" /> Checking…</div>
            ) : items.length === 0 ? (
              <div className="bell-empty">
                <Icon name="checkCircle" size={20} />
                <span>Nothing needs your attention.</span>
              </div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  className={`bell-item k-${item.kind}`}
                  key={item.id}
                  onClick={() => { setOpen(false); navigate(item.to) }}
                >
                  <span className="bell-ico">
                    {item.kind === 'birthday' && item.person
                      ? <Avatar name={item.person} size="sm" />
                      : <Icon name={ICONS[item.kind] || 'info'} size={16} />}
                  </span>
                  <span className="bell-text">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <Icon name="arrowRight" size={14} className="bell-go" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
