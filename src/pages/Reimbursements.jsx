import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import { EXPENSE_CATEGORIES, formatMoney, receiptPath } from '../lib/reimbursements.js'
import { BUCKET, MAX_FILE_BYTES, ACCEPTED, ACCEPTED_MIME, formatBytes } from '../lib/documents.js'
import { labelOf, formatDate, todayISO } from '../lib/format.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Modal from '../components/Modal.jsx'
import Confirm from '../components/Confirm.jsx'
import Icon from '../components/Icon.jsx'
import StatTile from '../components/StatTile.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'

export default function Reimbursements() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('me')
  const [formOpen, setFormOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reimbursements</h1>
          <p className="sub">
            {isAdmin ? 'Your own claims, and everything waiting on your approval.' : 'Claim expenses back and track where they are.'}
          </p>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <div className="seg">
              <button type="button" className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
                <Icon name="user" size={14} /> Mine
              </button>
              <button type="button" className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
                <Icon name="inbox" size={14} /> Approvals
              </button>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={16} /> New claim
          </button>
        </div>
      </div>

      {isAdmin && tab === 'team'
        ? <ClaimApprovals key={`t${reloadKey}`} />
        : <MyClaims key={`m${reloadKey}`} />}

      {formOpen && (
        <ClaimForm onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); setReloadKey((k) => k + 1) }} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function MyClaims() {
  const { employee } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!employee?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('reimbursements').select('*')
      .eq('employee_id', employee.id).order('claim_date', { ascending: false })
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id])

  useEffect(() => { load() }, [load])

  const totals = useMemo(() => ({
    pending:  rows.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0),
    approved: rows.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0),
    paid:     rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0),
    count:    rows.length
  }), [rows])

  async function withdraw() {
    setBusy(true)
    const { error } = await supabase.from('reimbursements').delete().eq('id', withdrawing.id)
    if (!error && withdrawing.receipt_path) {
      await supabase.storage.from(BUCKET).remove([withdrawing.receipt_path])
    }
    setBusy(false); setWithdrawing(null)
    if (error) toast.error(error.message)
    else { toast.success('Claim withdrawn.'); load() }
  }

  if (!employee) {
    return <section className="card"><EmptyState icon="user" title="No employee record linked"
      hint="Ask HR to add you to the directory with the email you signed in with." /></section>
  }

  return (
    <div className="stack">
      <div className="grid grid-4">
        <StatTile icon="clock" tone="warn" label="Awaiting approval" value={formatMoney(totals.pending)} />
        <StatTile icon="checkCircle" tone="good" label="Approved, not paid" value={formatMoney(totals.approved)} />
        <StatTile icon="wallet" tone="brand" label="Paid out" value={formatMoney(totals.paid)} />
        <StatTile icon="list" tone="info" label="Claims raised" value={totals.count} />
      </div>

      <section className="card">
        <div className="card-head"><h2>My claims</h2></div>
        <div className="card-body flush">
          {loading ? <SkeletonRows rows={4} avatar={false} />
            : rows.length === 0 ? (
              <EmptyState icon="wallet" title="No claims yet"
                hint="Raise one with the New claim button — attach the receipt and HR takes it from there." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Category</th><th className="right">Amount</th><th>Description</th>
                      <th>Receipt</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="nowrap">{formatDate(row.claim_date)}</td>
                        <td className="nowrap">{labelOf(EXPENSE_CATEGORIES, row.category)}</td>
                        <td className="right tnum">{formatMoney(row.amount)}</td>
                        <td className="dim">{row.description || '—'}</td>
                        <td><Receipt row={row} /></td>
                        <td>
                          <Badge value={row.status} />
                          {row.review_note && <div className="dim" style={{ fontSize: '.76rem', marginTop: 3 }}>{row.review_note}</div>}
                        </td>
                        <td>
                          <div className="row-actions">
                            {row.status === 'pending' && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWithdrawing(row)}>
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
        <Confirm title="Withdraw this claim?"
          body={`${labelOf(EXPENSE_CATEGORIES, withdrawing.category)} · ${formatMoney(withdrawing.amount)}. The receipt is deleted too.`}
          confirmLabel="Withdraw" danger busy={busy}
          onConfirm={withdraw} onClose={() => setWithdrawing(null)} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ClaimApprovals() {
  const { employee: me } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('reimbursements')
      .select('*, employee:employees!reimbursements_employee_id_fkey(full_name, department, email)')
      .order('claim_date', { ascending: false })
    if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => { load() }, [load])

  async function decide(row, decision, reviewNote = '') {
    setBusyId(row.id)
    const { error } = await supabase.from('reimbursements').update({
      status: decision,
      reviewed_by: me?.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null
    }).eq('id', row.id)
    setBusyId(null)
    if (error) toast.error(error.message)
    else { toast.success(`Claim ${decision}.`); load() }
  }

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Team claims</h2>
            <p className="sub">{rows.length} claim{rows.length === 1 ? '' : 's'} · {formatMoney(total)}</p>
          </div>
          <div className="seg">
            {['pending', 'approved', 'paid', 'rejected', 'all'].map((s) => (
              <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={5} />
            : rows.length === 0 ? (
              <EmptyState icon="checkCircle"
                title={status === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
                hint={status === 'pending' ? 'Every claim has been reviewed.' : 'No claims match this filter.'} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Date</th><th>Category</th><th className="right">Amount</th>
                      <th>Description</th><th>Receipt</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="person">
                            <Avatar name={row.employee?.full_name || '?'} size="sm" />
                            <div className="who">
                              <strong>{row.employee?.full_name || '—'}</strong>
                              <span>{row.employee?.department || row.employee?.email || ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className="nowrap">{formatDate(row.claim_date)}</td>
                        <td className="nowrap">{labelOf(EXPENSE_CATEGORIES, row.category)}</td>
                        <td className="right tnum">{formatMoney(row.amount)}</td>
                        <td className="dim">{row.description || '—'}</td>
                        <td><Receipt row={row} /></td>
                        <td><Badge value={row.status} /></td>
                        <td>
                          <div className="row-actions">
                            {row.status === 'pending' && (
                              <>
                                <button type="button" className="btn btn-good btn-sm" disabled={busyId === row.id}
                                  onClick={() => decide(row, 'approved')}>
                                  <Icon name="check" size={13} /> Approve
                                </button>
                                <button type="button" className="btn btn-2 btn-sm" disabled={busyId === row.id}
                                  onClick={() => { setRejecting(row); setNote('') }}>Reject</button>
                              </>
                            )}
                            {row.status === 'approved' && (
                              <button type="button" className="btn btn-2 btn-sm" disabled={busyId === row.id}
                                onClick={() => decide(row, 'paid')}>
                                <Icon name="wallet" size={13} /> Mark paid
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

      {rejecting && (
        <Modal title={`Reject ${rejecting.employee?.full_name || 'claim'}?`}
          subtitle={`${labelOf(EXPENSE_CATEGORIES, rejecting.category)} · ${formatMoney(rejecting.amount)}`}
          onClose={() => setRejecting(null)}>
          <div className="field">
            <label htmlFor="reject_note">Reason (they will see this)</label>
            <textarea id="reject_note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. receipt is unreadable" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-2" onClick={() => setRejecting(null)}>Cancel</button>
            <button type="button" className="btn btn-bad"
              onClick={async () => { const r = rejecting; setRejecting(null); await decide(r, 'rejected', note.trim()) }}>
              Reject claim
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function Receipt({ row }) {
  const toast = useToast()
  if (!row.receipt_path) return <span className="dim">—</span>

  async function open() {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.receipt_path, 120)
    if (error) toast.error(error.message)
    else window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={open}>
      <Icon name="paperclip" size={13} /> View
    </button>
  )
}

/* ------------------------------------------------------------------ */
function ClaimForm({ onClose, onSaved }) {
  const { employee } = useAuth()
  const toast = useToast()
  const [claimDate, setClaimDate] = useState(todayISO())
  const [category, setCategory] = useState('travel')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!employee?.id) { setError('No employee record is linked to your login yet.'); return }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Enter the amount you spent.'); return }
    if (file) {
      if (!ACCEPTED_MIME.includes(file.type)) { setError('The receipt must be a PDF or an image.'); return }
      if (file.size > MAX_FILE_BYTES) { setError(`That receipt is ${formatBytes(file.size)}. The limit is 10 MB.`); return }
    }

    setBusy(true)
    let path = null
    if (file) {
      path = receiptPath(employee.id, file.name)
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) { setBusy(false); setError(upErr.message); return }
    }

    const { error: insErr } = await supabase.from('reimbursements').insert({
      employee_id: employee.id,
      claim_date: claimDate,
      category,
      amount: value,
      description: description.trim() || null,
      receipt_path: path,
      receipt_name: file?.name ?? null,
      status: 'pending'
    })

    setBusy(false)
    if (insErr) {
      if (path) await supabase.storage.from(BUCKET).remove([path])
      setError(insErr.message)
      return
    }
    toast.success('Claim sent to HR.')
    onSaved()
  }

  return (
    <Modal title="New reimbursement claim" subtitle="Attach the receipt so HR can approve it in one pass" onClose={onClose}>
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="claim_date">Date of expense</label>
            <input id="claim_date" type="date" value={claimDate} max={todayISO()}
              onChange={(e) => setClaimDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (₹)</label>
            <input id="amount" type="number" min="1" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="1250" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="description">What was it for?</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Cab to the client shoot in Whitefield" />
        </div>

        <div className="field">
          <label htmlFor="receipt">Receipt</label>
          <input id="receipt" type="file" accept={ACCEPTED}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="hint">
            {file ? `${file.name} · ${formatBytes(file.size)}` : 'PDF or photo, up to 10 MB. Optional but HR will usually ask.'}
          </span>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} Submit claim
          </button>
        </div>
      </form>
    </Modal>
  )
}
