import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import Confirm from './Confirm.jsx'
import EmptyState from './EmptyState.jsx'
import { SkeletonRows } from './Skeleton.jsx'
import { RELATIONSHIPS } from '../lib/documents.js'
import { labelOf } from '../lib/format.js'

const BLANK = { full_name: '', relationship: 'father', phone: '' }

/** Two contacts are required; `readOnly` is the HR view. */
export default function EmergencyContacts({ employeeId, readOnly = false }) {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('emergency_contacts').select('*').eq('employee_id', employeeId).order('created_at')
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  useEffect(() => { load() }, [load])

  async function add(event) {
    event.preventDefault()
    const phone = form.phone.trim()
    if (form.full_name.trim().length < 2) { toast.error('Enter the contact’s name.'); return }
    if (phone.replace(/\D/g, '').length < 10) { toast.error('Enter a valid phone number.'); return }

    setBusy(true)
    const { error } = await supabase.from('emergency_contacts').insert({
      employee_id: employeeId,
      full_name: form.full_name.trim(),
      relationship: form.relationship,
      phone
    })
    setBusy(false)
    if (error) toast.error(error.message)
    else { setForm(BLANK); toast.success('Contact added.'); load() }
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('emergency_contacts').delete().eq('id', removing.id)
    setBusy(false)
    setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success('Contact removed.'); load() }
  }

  const short = rows.length < 2

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Emergency contacts</h2>
            <p className="sub">Two are required — parent, sibling or guardian</p>
          </div>
          <span className={short ? 'chip' : 'chip chip-brand'}>
            <Icon name={short ? 'alert' : 'checkCircle'} size={13} />
            {rows.length} of 2
          </span>
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={2} avatar={false} />
            : rows.length === 0 ? (
              <EmptyState icon="phone" title="No contacts yet"
                hint={readOnly ? 'This employee has not added any.' : 'Add two people we can reach in an emergency.'} />
            ) : (
              <div className="list">
                {rows.map((row) => (
                  <div className="list-item" key={row.id}>
                    <span className="tile-icon"><Icon name="phone" size={15} /></span>
                    <div className="grow">
                      <strong style={{ fontSize: '.9rem' }}>{row.full_name}</strong>
                      <div className="dim" style={{ fontSize: '.79rem' }}>
                        {labelOf(RELATIONSHIPS, row.relationship)} · {row.phone}
                      </div>
                    </div>
                    {!readOnly && (
                      <button type="button" className="icon-btn" title="Remove"
                        onClick={() => setRemoving(row)}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>

        {!readOnly && (
          <div className="card-foot">
            <form onSubmit={add} className="contact-form">
              <input placeholder="Full name" value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
              <select value={form.relationship}
                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}>
                {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input placeholder="Phone number" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <button type="submit" className="btn" disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="plus" size={15} />} Add
              </button>
            </form>
          </div>
        )}
      </section>

      {removing && (
        <Confirm
          title={`Remove ${removing.full_name}?`}
          body="This emergency contact will be deleted."
          confirmLabel="Remove"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}
