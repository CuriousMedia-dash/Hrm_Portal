import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import {
  EMPLOYMENT_TYPES, EMPLOYEE_STATUSES, labelOf, formatDate
} from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import DocumentsPanel from '../components/DocumentsPanel.jsx'
import DocumentWallet from '../components/DocumentWallet.jsx'
import EmergencyContacts from '../components/EmergencyContacts.jsx'
import DateField from '../components/DateField.jsx'

export default function Profile() {
  const { employee, user, isAdmin, refreshEmployee } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', phone: '', location: '', address: '', date_of_birth: '' })
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')

  useEffect(() => {
    if (!employee) return
    setForm({
      full_name: employee.full_name || '',
      phone: employee.phone || '',
      location: employee.location || '',
      address: employee.address || '',
      date_of_birth: employee.date_of_birth || ''
    })
  }, [employee])

  if (!employee) {
    return (
      <>
        <div className="page-head"><h1>My profile</h1></div>
        <section className="card">
          <EmptyState icon="user" title="No employee record linked to this login"
            hint={`You are signed in as ${user?.email || 'an unknown account'}. Ask HR to add you with this exact email address.`} />
        </section>
      </>
    )
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function saveProfile(event) {
    event.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('employees').update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      date_of_birth: form.date_of_birth || null
    }).eq('id', employee.id)
    setBusy(false)
    if (error) toast.error(error.message)
    else { toast.success('Profile updated.'); refreshEmployee() }
  }

  async function changePassword(event) {
    event.preventDefault()
    setPwError('')
    if (password.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setPwError('The two passwords do not match.'); return }

    setPwBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPwBusy(false)
    if (error) { setPwError(error.message); return }
    setPassword(''); setConfirm('')
    toast.success('Password changed.')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p className="sub">What HR holds on file, and what you can change yourself.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-body">
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Avatar name={employee.full_name} size="lg" />
            <div style={{ minWidth: 0 }}>
              <h2>{employee.full_name}</h2>
              <p className="muted" style={{ margin: '2px 0 8px', fontSize: '.88rem' }}>
                {[employee.designation, employee.department].filter(Boolean).join(' · ') || 'No role set'}
              </p>
              <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
                <Badge value={employee.status} label={labelOf(EMPLOYEE_STATUSES, employee.status)} />
                {employee.email && <span className="chip"><Icon name="mail" size={12} /> {employee.email}</span>}
                {isAdmin && <span className="chip chip-brand"><Icon name="shield" size={12} /> HR admin</span>}
              </div>
            </div>
          </div>

          <dl className="facts" style={{ marginTop: 22 }}>
            <div><dt>Employee code</dt><dd>{employee.employee_code || '—'}</dd></div>
            <div><dt>Date of joining</dt><dd>{formatDate(employee.date_of_joining)}</dd></div>
            <div><dt>Employment type</dt><dd>{labelOf(EMPLOYMENT_TYPES, employee.employment_type)}</dd></div>
            <div><dt>Work location</dt><dd>{employee.location || '—'}</dd></div>
          </dl>

          <p className="dim" style={{ fontSize: '.83rem', marginTop: 18, marginBottom: 0 }}>
            Department, designation, joining date and role are maintained by HR — ask them if something looks wrong.
          </p>
        </div>
      </section>

      <DocumentWallet employeeId={employee.id} title="My documents from HR" />

      <DocumentsPanel employeeId={employee.id} />

      <EmergencyContacts employeeId={employee.id} />

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head"><h2>Contact details</h2></div>
          <div className="card-body">
            <form onSubmit={saveProfile}>
              <div className="field">
                <label htmlFor="full_name">Full name</label>
                <input id="full_name" value={form.full_name} onChange={set('full_name')} required />
              </div>
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input id="phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="location">Work location</label>
                  <input id="location" value={form.location} onChange={set('location')} />
                </div>
                <div className="field">
                  <label htmlFor="date_of_birth">Date of birth</label>
                  <DateField id="date_of_birth" value={form.date_of_birth} onChange={set('date_of_birth')} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="address">Address</label>
                <textarea id="address" value={form.address} onChange={set('address')} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={busy}>
                  {busy && <span className="spinner" />} Save changes
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Password</h2>
              <p className="sub">At least 8 characters</p>
            </div>
            <span className="tile-icon brand"><Icon name="key" size={15} /></span>
          </div>
          <div className="card-body">
            {pwError && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{pwError}</span></div>}
            <form onSubmit={changePassword}>
              <div className="field">
                <label htmlFor="new_password">New password</label>
                <input id="new_password" type="password" autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="confirm_password">Confirm password</label>
                <input id="confirm_password" type="password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-2" disabled={pwBusy}>
                  {pwBusy && <span className="spinner" />} Update password
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
