import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from './Toast.jsx'
import { formatDate } from '../lib/format.js'
import Avatar from './Avatar.jsx'
import Badge from './Badge.jsx'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import EmptyState from './EmptyState.jsx'
import { SkeletonRows } from './Skeleton.jsx'

const KIND_LABEL = { late: 'Late arrival', absent: 'Missed day', missed_checkout: 'No check-out' }

/** What managers and HR act on. RLS decides whose requests arrive here. */
export default function RegularizationQueue() {
  const { employee: me, isAdmin } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('regularizations')
      .select('*, employee:employees!regularizations_employee_id_fkey(full_name, department, designation), reviewer:employees!regularizations_reviewed_by_fkey(full_name, role)')
      .order('work_date', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => { load() }, [load])

  async function decide(row, decision, reviewNote = '') {
    setBusyId(row.id)
    const { error } = await supabase.from('regularizations').update({
      status: decision,
      reviewed_by: me?.id ?? null,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null
    }).eq('id', row.id)
    setBusyId(null)
    if (error) toast.error(error.message)
    else {
      toast.success(decision === 'approved'
        ? `Approved — ${formatDate(row.work_date)} no longer counts as late.`
        : 'Request rejected.')
      load()
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Regularization requests</h2>
            <p className="sub">
              {isAdmin ? 'Everyone’s requests' : 'Requests from your department'} ·{' '}
              approving a late arrival removes it from that person’s count
            </p>
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
          {loading ? <SkeletonRows rows={4} />
            : rows.length === 0 ? (
              <EmptyState icon="checkCircle"
                title={status === 'pending' ? 'Nothing waiting on you' : 'Nothing here'}
                hint={status === 'pending'
                  ? 'Requests to excuse a late arrival or a missed day appear here.'
                  : 'No requests match this filter.'} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Date</th><th>Type</th><th>Reason</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="person">
                            <Avatar name={row.employee?.full_name || '?'} size="sm" />
                            <div className="who">
                              <strong>{row.employee?.full_name || '—'}</strong>
                              <span>{row.employee?.department || ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className="nowrap">{formatDate(row.work_date)}</td>
                        <td className="nowrap">{KIND_LABEL[row.kind] || row.kind}</td>
                        <td style={{ maxWidth: 320 }}>{row.reason}</td>
                        <td>
                          <Badge value={row.status} />
                          {row.reviewer?.full_name && (
                            <div className="dim" style={{ fontSize: '.75rem', marginTop: 3 }}>
                              by {row.reviewer.full_name}{row.reviewer.role === 'manager' ? ' (manager)' : ' (HR)'}
                            </div>
                          )}
                          {row.review_note && <div className="dim" style={{ fontSize: '.75rem' }}>{row.review_note}</div>}
                        </td>
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
        <Modal title={`Reject ${rejecting.employee?.full_name || 'request'}?`}
          subtitle={`${KIND_LABEL[rejecting.kind]} · ${formatDate(rejecting.work_date)}`}
          onClose={() => setRejecting(null)}>
          <div className="field">
            <label htmlFor="reg_reject_note">Reason (they will see this)</label>
            <textarea id="reg_reject_note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Optional" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-2" onClick={() => setRejecting(null)}>Cancel</button>
            <button type="button" className="btn btn-bad"
              onClick={async () => { const r = rejecting; setRejecting(null); await decide(r, 'rejected', note.trim()) }}>
              Reject request
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
