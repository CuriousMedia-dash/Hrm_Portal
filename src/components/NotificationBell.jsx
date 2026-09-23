import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import {
  formatRange, formatDate, labelOf, LEAVE_TYPES, shortDate, timeAgo, daysAgoISO
} from '../lib/format.js'
import { formatMoney, EXPENSE_CATEGORIES } from '../lib/reimbursements.js'
import { REQUIRED_DOCS } from '../lib/documents.js'
import {
  conversionDate, daysUntil, describeDays, INTERN_WARN_DAYS, NOTICE_WARN_DAYS
} from '../lib/policy.js'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'

const REFRESH_MS = 5 * 60 * 1000
const HISTORY_DAYS = 7

/**
 * Everything that needs someone's attention, plus what happened lately.
 *
 * Two sections. "Needs attention" is live — it empties as things get
 * approved. "Last 7 days" is the record of what was decided, so approving a
 * request no longer makes it vanish without trace.
 *
 * HR sees the queues and the whole company's activity; employees see only
 * their own requests and profile gaps, which is all the RLS lets through.
 */

/** How many days ago this person's birthday fell — 0 today, null if unknown. */
function birthdayDaysPast(dob) {
  if (!dob) return null
  const born = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let marker = new Date(today.getFullYear(), born.getMonth(), born.getDate())
  if (marker > today) marker = new Date(today.getFullYear() - 1, born.getMonth(), born.getDate())
  return Math.round((today - marker) / 86400000)
}

const reviewerLabel = (reviewer) => {
  if (!reviewer?.full_name) return ''
  const who = reviewer.role === 'manager' ? 'manager' : reviewer.role === 'employee' ? '' : 'HR'
  return who ? `${reviewer.full_name} (${who})` : reviewer.full_name
}

export default function NotificationBell() {
  const { employee, isApprover } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const panelRef = useRef(null)

  const load = useCallback(async () => {
    if (!employee?.id) { setItems([]); setLoading(false); return }
    setLoading(true)
    const next = []
    const since = daysAgoISO(HISTORY_DAYS)

    try {
      if (isApprover) {
        const [leave, claims, birthdays, staff, regs, doneLeave, doneClaims, doneRegs] =
          await Promise.all([
            supabase.from('leave_requests')
              .select('id, leave_type, start_date, end_date, days, created_at, employee:employees!leave_requests_employee_id_fkey(full_name)')
              .eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
            supabase.from('reimbursements')
              .select('id, category, amount, claim_date, created_at, employee:employees!reimbursements_employee_id_fkey(full_name)')
              .eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
            supabase.rpc('upcoming_birthdays', { days_ahead: 7 }),
            supabase.from('employees')
              .select('id, full_name, department, designation, employment_type, status, date_of_birth, date_of_joining, internship_end_date, notice_end_date')
              .in('status', ['active', 'on_notice']),
            supabase.from('regularizations')
              .select('id, work_date, kind, reason, created_at, employee:employees!regularizations_employee_id_fkey(full_name, department)')
              .eq('status', 'pending').order('created_at', { ascending: false }).limit(20),

            // ---- the last seven days, whoever decided them ----
            supabase.from('leave_requests')
              .select('id, leave_type, start_date, end_date, status, reviewed_at, employee:employees!leave_requests_employee_id_fkey(full_name), reviewer:employees!leave_requests_reviewed_by_fkey(full_name, role)')
              .in('status', ['approved', 'rejected', 'cancelled'])
              .gte('reviewed_at', since).order('reviewed_at', { ascending: false }).limit(30),
            supabase.from('reimbursements')
              .select('id, category, amount, status, reviewed_at, employee:employees!reimbursements_employee_id_fkey(full_name), reviewer:employees!reimbursements_reviewed_by_fkey(full_name, role)')
              .in('status', ['approved', 'rejected', 'paid'])
              .gte('reviewed_at', since).order('reviewed_at', { ascending: false }).limit(30),
            supabase.from('regularizations')
              .select('id, work_date, kind, status, reviewed_at, employee:employees!regularizations_employee_id_fkey(full_name), reviewer:employees!regularizations_reviewed_by_fkey(full_name, role)')
              .in('status', ['approved', 'rejected'])
              .gte('reviewed_at', since).order('reviewed_at', { ascending: false }).limit(30)
          ])

        for (const row of leave.data || []) {
          next.push({
            id: `leave-${row.id}`, kind: 'leave', person: row.employee?.full_name, at: row.created_at,
            title: `${row.employee?.full_name || 'Someone'} requested leave`,
            detail: `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)} · ${row.days}d`,
            to: '/leave'
          })
        }

        for (const row of claims.data || []) {
          next.push({
            id: `claim-${row.id}`, kind: 'claim', person: row.employee?.full_name, at: row.created_at,
            title: `${row.employee?.full_name || 'Someone'} claimed ${formatMoney(row.amount)}`,
            detail: `${labelOf(EXPENSE_CATEGORIES, row.category)} · ${formatDate(row.claim_date)}`,
            to: '/reimbursements'
          })
        }

        for (const row of regs.data || []) {
          next.push({
            id: `reg-${row.id}`, kind: 'doc', person: row.employee?.full_name, at: row.created_at,
            title: `${row.employee?.full_name || 'Someone'} asked to regularize ${row.kind === 'late' ? 'a late arrival' : 'a missed day'}`,
            detail: `${formatDate(row.work_date)} · ${row.reason.slice(0, 60)}${row.reason.length > 60 ? '…' : ''}`,
            to: '/attendance'
          })
        }

        // interns coming up on their conversion date
        for (const person of (staff.data || []).filter((p) => p.employment_type === 'intern')) {
          const days = daysUntil(conversionDate(person))
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

        // ---- history ----
        for (const row of doneLeave.data || []) {
          const by = reviewerLabel(row.reviewer)
          next.push({
            id: `h-leave-${row.id}`, recent: true, at: row.reviewed_at,
            kind: row.status === 'approved' ? 'ok' : 'bad', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'}'s leave was ${row.status}`,
            detail: [
              `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
              by && `by ${by}`
            ].filter(Boolean).join(' · '),
            to: '/leave'
          })
        }

        for (const row of doneClaims.data || []) {
          const by = reviewerLabel(row.reviewer)
          next.push({
            id: `h-claim-${row.id}`, recent: true, at: row.reviewed_at,
            kind: row.status === 'rejected' ? 'bad' : 'ok', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'}'s ${formatMoney(row.amount)} claim was ${row.status}`,
            detail: [labelOf(EXPENSE_CATEGORIES, row.category), by && `by ${by}`].filter(Boolean).join(' · '),
            to: '/reimbursements'
          })
        }

        for (const row of doneRegs.data || []) {
          const by = reviewerLabel(row.reviewer)
          next.push({
            id: `h-reg-${row.id}`, recent: true, at: row.reviewed_at,
            kind: row.status === 'approved' ? 'ok' : 'bad', person: row.employee?.full_name,
            title: `${row.employee?.full_name || 'Someone'}'s regularization was ${row.status}`,
            detail: [
              `${row.kind === 'late' ? 'Late arrival' : 'Missed day'} · ${formatDate(row.work_date)}`,
              by && `by ${by}`
            ].filter(Boolean).join(' · '),
            to: '/attendance'
          })
        }

        // birthdays that have just gone by
        for (const person of staff.data || []) {
          const ago = birthdayDaysPast(person.date_of_birth)
          if (ago === null || ago < 1 || ago > HISTORY_DAYS) continue
          next.push({
            id: `h-bday-${person.id}`, recent: true, kind: 'birthday', person: person.full_name,
            at: new Date(Date.now() - ago * 86400000).toISOString(),
            title: `${person.full_name}'s birthday was ${ago === 1 ? 'yesterday' : `${ago} days ago`}`,
            detail: [person.designation, person.department].filter(Boolean).join(' · ') || 'Birthday',
            to: '/employees'
          })
        }
      } else {
        const [mine, myClaims, docs, contacts, myRegs] = await Promise.all([
          supabase.from('leave_requests')
            .select('id, leave_type, start_date, end_date, status, review_note, created_at, reviewed_at, reviewer:employees!leave_requests_reviewed_by_fkey(full_name, role)')
            .eq('employee_id', employee.id)
            .order('updated_at', { ascending: false }).limit(25),
          supabase.from('reimbursements')
            .select('id, category, amount, status, review_note, created_at, reviewed_at, reviewer:employees!reimbursements_reviewed_by_fkey(full_name, role)')
            .eq('employee_id', employee.id)
            .order('updated_at', { ascending: false }).limit(25),
          supabase.from('employee_documents').select('doc_type').eq('employee_id', employee.id),
          supabase.from('emergency_contacts').select('id').eq('employee_id', employee.id),
          supabase.from('regularizations')
            .select('id, work_date, kind, status, review_note, created_at, reviewed_at, reviewer:employees!regularizations_reviewed_by_fkey(full_name, role)')
            .eq('employee_id', employee.id)
            .order('updated_at', { ascending: false }).limit(25)
        ])

        // decided more than a week ago is old news; pending never expires
        const stillRelevant = (row) => row.status === 'pending' || (row.reviewed_at || '') >= since

        for (const row of (mine.data || []).filter(stillRelevant)) {
          const by = reviewerLabel(row.reviewer)
          if (row.status === 'pending') {
            next.push({
              id: `ml-${row.id}`, kind: 'leave', at: row.created_at,
              title: 'Your leave request is awaiting approval',
              detail: `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
              to: '/leave'
            })
          } else {
            next.push({
              id: `ml-${row.id}`, recent: true, at: row.reviewed_at,
              kind: row.status === 'approved' ? 'ok' : 'bad',
              title: `Your leave was ${row.status}`,
              detail: [
                `${labelOf(LEAVE_TYPES, row.leave_type)} · ${formatRange(row.start_date, row.end_date)}`,
                by && `by ${by}`, row.review_note
              ].filter(Boolean).join(' · '),
              to: '/leave'
            })
          }
        }

        for (const row of (myClaims.data || []).filter(stillRelevant)) {
          const by = reviewerLabel(row.reviewer)
          next.push({
            id: `mc-${row.id}`, recent: row.status !== 'pending',
            at: row.status === 'pending' ? row.created_at : row.reviewed_at,
            kind: row.status === 'pending' ? 'claim' : row.status === 'rejected' ? 'bad' : 'ok',
            title: row.status === 'pending'
              ? `Your ${formatMoney(row.amount)} claim is awaiting approval`
              : `Your ${formatMoney(row.amount)} claim was ${row.status}`,
            detail: [labelOf(EXPENSE_CATEGORIES, row.category), by && `by ${by}`, row.review_note]
              .filter(Boolean).join(' · '),
            to: '/reimbursements'
          })
        }

        for (const row of (myRegs.data || []).filter(stillRelevant)) {
          const by = reviewerLabel(row.reviewer)
          next.push({
            id: `mr-${row.id}`, recent: row.status !== 'pending',
            at: row.status === 'pending' ? row.created_at : row.reviewed_at,
            kind: row.status === 'pending' ? 'doc' : row.status === 'approved' ? 'ok' : 'bad',
            title: row.status === 'pending'
              ? 'Your regularization request is awaiting approval'
              : `Your regularization was ${row.status}`,
            detail: [formatDate(row.work_date), by && `by ${by}`, row.review_note]
              .filter(Boolean).join(' · '),
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

  const byNewest = (a, b) => String(b.at || '').localeCompare(String(a.at || ''))
  const attention = useMemo(() => items.filter((i) => !i.recent).sort(byNewest), [items])
  const history = useMemo(() => items.filter((i) => i.recent).sort(byNewest), [items])

  const ICONS = {
    leave: 'palm', claim: 'wallet', birthday: 'gift', doc: 'inbox',
    intern: 'trend', ok: 'checkCircle', bad: 'alert'
  }

  const renderItem = (item) => (
    <button
      type="button"
      className={`bell-item k-${item.kind}${item.recent ? ' is-past' : ''}`}
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
      {item.at && <span className="bell-when">{timeAgo(item.at)}</span>}
      <Icon name="arrowRight" size={14} className="bell-go" />
    </button>
  )

  return (
    <div className="bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="icon-btn bell-btn"
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        aria-label={`Notifications${attention.length ? `, ${attention.length} needing attention` : ''}`}
      >
        <Icon name="bell" size={18} />
        {attention.length > 0 && <span className="bell-dot">{attention.length > 9 ? '9+' : attention.length}</span>}
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
            ) : (
              <>
                {attention.length > 0 ? (
                  <>
                    <div className="bell-section">Needs attention</div>
                    {attention.map(renderItem)}
                  </>
                ) : (
                  <div className="bell-empty">
                    <Icon name="checkCircle" size={20} />
                    <span>Nothing needs your attention.</span>
                  </div>
                )}

                {history.length > 0 && (
                  <>
                    <div className="bell-section">Last {HISTORY_DAYS} days</div>
                    {history.map(renderItem)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
