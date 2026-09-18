import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, labelOf, formatDate
} from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import Confirm from '../components/Confirm.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import {
  INTERNSHIP_MONTHS, INTERN_WARN_DAYS, NOTICE_WARN_DAYS, addMonths, conversionDate
} from '../lib/policy.js'
import DocumentsPanel from '../components/DocumentsPanel.jsx'
import EmergencyContacts from '../components/EmergencyContacts.jsx'

const BLANK = {
  full_name: '', email: '', employee_code: '', phone: '', department: '',
  designation: '', employment_type: 'full_time', date_of_joining: '',
  date_of_birth: '', location: '', address: '', manager_id: '',
  status: 'active', role: 'employee',
  notice_end_date: '', internship_end_date: ''
}

export default function Employees() {
  const { isAdmin, employee: me, refreshEmployee } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [status, setStatus] = useState('active')
  const [view, setView] = useState('table')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('employees').select('*').order('full_name')
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), [rows]
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (department !== 'all' && row.department !== department) return false
      if (status !== 'all' && row.status !== status) return false
      if (!term) return true
      return [row.full_name, row.email, row.employee_code, row.designation, row.department]
        .filter(Boolean).some((f) => f.toLowerCase().includes(term))
    })
  }, [rows, search, department, status])

  const nameOf = (id) => rows.find((r) => r.id === id)?.full_name || '—'
  const clearFilters = () => { setSearch(''); setDepartment('all'); setStatus('active') }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Employees</h1>
          <p className="sub">
            {loading ? 'Loading the directory…'
              : `${filtered.length} of ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
            {!isAdmin && ' · directory is read-only for you'}
          </p>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>
              <Icon name="list" size={14} /> List
            </button>
            <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>
              <Icon name="cards" size={14} /> Cards
            </button>
          </div>
          {isAdmin && (
            <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
              <Icon name="plus" size={16} /> Add employee
            </button>
          )}
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={16} />
              <input placeholder="Search name, email, code or role…" value={search}
                onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
            </label>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
              <option value="all">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">All statuses</option>
              {EMPLOYEE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {(search || department !== 'all' || status !== 'active') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
            )}
          </div>
        </div>

        <div className="card-body flush">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={rows.length === 0 ? 'users' : 'search'}
              title={rows.length === 0 ? 'The directory is empty' : 'Nothing matches those filters'}
              hint={rows.length === 0
                ? 'Add your first employee, or run supabase/seed_sample_data.sql for a few examples.'
                : 'Try a different search term or clear the filters.'}
              action={rows.length === 0 && isAdmin
                ? <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
                    <Icon name="plus" size={16} /> Add employee
                  </button>
                : <button type="button" className="btn btn-2" onClick={clearFilters}>Clear filters</button>}
            />
          ) : view === 'cards' ? (
            <div className="people-grid">
              {filtered.map((row) => (
                <div className="people-card" key={row.id} onClick={() => setViewing(row)}
                     role="button" tabIndex={0}
                     onKeyDown={(e) => { if (e.key === 'Enter') setViewing(row) }}>
                  <Avatar name={row.full_name} size="lg" />
                  <div>
                    <div className="name">{row.full_name}</div>
                    <div className="role">{row.designation || '—'}</div>
                  </div>
                  <Badge value={row.status} label={labelOf(EMPLOYEE_STATUSES, row.status)} />
                  <div className="meta">{row.department || 'No department'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th><th>Code</th><th>Department</th>
                    <th>Designation</th><th>Joined</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} onClick={() => setViewing(row)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="person">
                          <Avatar name={row.full_name} size="sm" />
                          <div className="who">
                            <strong>{row.full_name}</strong>
                            <span>{row.email || 'No login yet'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="tnum dim">{row.employee_code || '—'}</td>
                      <td>{row.department || '—'}</td>
                      <td>{row.designation || '—'}</td>
                      <td className="nowrap dim">{formatDate(row.date_of_joining)}</td>
                      <td><Badge value={row.status} label={labelOf(EMPLOYEE_STATUSES, row.status)} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          {isAdmin && (
                            <button type="button" className="btn btn-2 btn-sm" onClick={() => setEditing(row)}>
                              <Icon name="edit" size={13} /> Edit
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

      {viewing && (
        <Modal
          title={viewing.full_name}
          subtitle={[viewing.designation, viewing.department].filter(Boolean).join(' · ') || 'No role set'}
          onClose={() => setViewing(null)}
          wide
        >
          <div className="row" style={{ marginBottom: 20 }}>
            <Avatar name={viewing.full_name} size="lg" />
            <div>
              <div className="row" style={{ gap: 7 }}>
                <Badge value={viewing.status} label={labelOf(EMPLOYEE_STATUSES, viewing.status)} />
                {viewing.role === 'hr_admin' && <span className="chip chip-brand"><Icon name="shield" size={12} /> HR admin</span>}
              </div>
              <div className="dim" style={{ fontSize: '.84rem', marginTop: 5 }}>
                {viewing.email
                  ? (viewing.employee_code ? `Employee ${viewing.employee_code}` : 'No employee code')
                  : 'No email on file — add one before they can sign in'}
              </div>
            </div>
            {isAdmin && (
              <button type="button" className="btn btn-2" style={{ marginLeft: 'auto' }}
                onClick={() => { setEditing(viewing); setViewing(null) }}>
                <Icon name="edit" size={15} /> Edit
              </button>
            )}
          </div>

          <dl className="facts">
            <Fact icon="mail" label="Email" value={viewing.email} />
            <Fact icon="phone" label="Phone" value={viewing.phone} />
            <Fact icon="building" label="Employment" value={labelOf(EMPLOYMENT_TYPES, viewing.employment_type)} />
            <Fact icon="calendar" label="Joined" value={formatDate(viewing.date_of_joining)} />
            <Fact icon="users" label="Reports to" value={nameOf(viewing.manager_id)} />
            <Fact icon="pin" label="Location" value={viewing.location} />
            {viewing.employment_type === 'intern' && (
              <Fact icon="trend" label="Converts on" value={formatDate(conversionDate(viewing))} />
            )}
            {viewing.status === 'on_notice' && (
              <Fact icon="alert" label="Last working day" value={formatDate(viewing.notice_end_date)} />
            )}
          </dl>

          {viewing.address && (
            <>
              <h3 style={{ marginTop: 20, marginBottom: 6 }}>Address</h3>
              <p className="muted" style={{ fontSize: '.88rem' }}>{viewing.address}</p>
            </>
          )}

          <div className="stack" style={{ marginTop: 22 }}>
            <DocumentsPanel employeeId={viewing.id} readOnly title="Submitted documents" />
            <EmergencyContacts employeeId={viewing.id} readOnly />
          </div>
        </Modal>
      )}

      {editing && (
        <EmployeeForm
          value={editing}
          people={rows}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            const wasMe = editing.id && editing.id === me?.id
            setEditing(null)
            toast.success(message)
            await load()
            if (wasMe) refreshEmployee()
          }}
        />
      )}
    </>
  )
}

function Fact({ icon, label, value }) {
  return (
    <div>
      <dt><span className="row" style={{ gap: 5 }}><Icon name={icon} size={12} /> {label}</span></dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

function EmployeeForm({ value, people, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ ...BLANK, ...value, manager_id: value.manager_id || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isNew = !value.id

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(''); setBusy(true)

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase() || null,
      employee_code: form.employee_code.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      designation: form.designation.trim() || null,
      employment_type: form.employment_type,
      date_of_joining: form.date_of_joining || null,
      date_of_birth: form.date_of_birth || null,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      manager_id: form.manager_id || null,
      status: form.status,
      role: form.role,
      notice_end_date: form.status === 'on_notice' ? (form.notice_end_date || null) : null,
      internship_end_date: form.employment_type === 'intern' ? (form.internship_end_date || null) : null
    }

    const { error: saveError } = isNew
      ? await supabase.from('employees').insert(payload)
      : await supabase.from('employees').update(payload).eq('id', value.id)

    setBusy(false)
    if (saveError) {
      setError(saveError.code === '23505'
        ? 'That email or employee code already belongs to another record.'
        : saveError.message)
      return
    }
    onSaved(isNew ? `${payload.full_name} added to the directory.` : 'Changes saved.')
  }

  async function handleDelete() {
    setBusy(true)
    const { error: delError } = await supabase.from('employees').delete().eq('id', value.id)
    setBusy(false)
    setConfirmDelete(false)
    if (delError) { setError(delError.message); toast.error(delError.message) }
    else onSaved(`${form.full_name} removed.`)
  }

  return (
    <>
      <Modal
        title={isNew ? 'Add employee' : `Edit ${value.full_name}`}
        subtitle={isNew ? 'They sign up with this email to get portal access.' : undefined}
        onClose={onClose}
        wide
      >
        {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="full_name">Full name *</label>
              <input id="full_name" value={form.full_name} onChange={set('full_name')} required />
            </div>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" value={form.email} onChange={set('email')}
                placeholder="name@curiousmedia.in" />
              <span className="hint">Needed only when they should get portal access.</span>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="employee_code">Employee code</label>
              <input id="employee_code" value={form.employee_code} onChange={set('employee_code')} placeholder="CM-006" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="department">Department</label>
              <input id="department" value={form.department} onChange={set('department')} placeholder="Growth" list="dept-list" />
              <datalist id="dept-list">
                {[...new Set(people.map((p) => p.department).filter(Boolean))].map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="designation">Designation</label>
              <input id="designation" value={form.designation} onChange={set('designation')} placeholder="Growth Manager" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="employment_type">Employment type</label>
              <select id="employment_type" value={form.employment_type} onChange={set('employment_type')}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={form.status} onChange={set('status')}>
                {EMPLOYEE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="date_of_joining">Date of joining</label>
              <input id="date_of_joining" type="date" value={form.date_of_joining || ''} onChange={set('date_of_joining')} />
            </div>
            <div className="field">
              <label htmlFor="date_of_birth">Date of birth</label>
              <input id="date_of_birth" type="date" value={form.date_of_birth || ''} onChange={set('date_of_birth')} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="manager_id">Reports to</label>
              <select id="manager_id" value={form.manager_id} onChange={set('manager_id')}>
                <option value="">—</option>
                {people.filter((p) => p.id !== value.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="role">Portal role</label>
              <select id="role" value={form.role} onChange={set('role')}>
                <option value="employee">Employee</option>
                <option value="hr_admin">HR admin</option>
              </select>
              <span className="hint">HR admins can manage everyone’s records.</span>
            </div>
          </div>

          {form.employment_type === 'intern' && (
            <div className="field">
              <label htmlFor="internship_end_date">Internship converts on</label>
              <input id="internship_end_date" type="date" value={form.internship_end_date || ''}
                onChange={set('internship_end_date')} />
              <span className="hint">
                Leave empty to use {INTERNSHIP_MONTHS} months from the joining date
                {form.date_of_joining && ` — ${formatDate(addMonths(form.date_of_joining, INTERNSHIP_MONTHS))}`}.
                You are alerted {INTERN_WARN_DAYS} days ahead.
              </span>
            </div>
          )}

          {form.status === 'on_notice' && (
            <div className="field">
              <label htmlFor="notice_end_date">Last working day</label>
              <input id="notice_end_date" type="date" value={form.notice_end_date || ''}
                onChange={set('notice_end_date')} />
              <span className="hint">You are alerted {NOTICE_WARN_DAYS} days before this date.</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="location">Work location</label>
            <input id="location" value={form.location} onChange={set('location')} placeholder="Bengaluru" />
          </div>

          <div className="field">
            <label htmlFor="address">Address</label>
            <textarea id="address" value={form.address} onChange={set('address')} />
          </div>

          <div className="form-actions">
            {!isNew && (
              <button type="button" className="btn btn-danger-ghost push" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Icon name="trash" size={14} /> Delete
              </button>
            )}
            <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={busy}>
              {busy && <span className="spinner" />}
              {isNew ? 'Add employee' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>

      {confirmDelete && (
        <Confirm
          title={`Remove ${form.full_name}?`}
          body="Their attendance records and leave history are deleted along with the profile. This cannot be undone."
          confirmLabel="Delete employee"
          danger
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
