import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from './Toast.jsx'
import { formatDate, formatTime } from '../lib/format.js'
import { lateAfterLabel } from '../lib/policy.js'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'

const KINDS = {
  late: {
    title: 'Regularize a late arrival',
    blurb: `Explain why you arrived after ${lateAfterLabel}. If your manager or HR approves, the day stops counting as late.`
  },
  absent: {
    title: 'Regularize a missed day',
    blurb: 'Explain why the day was not marked. If approved, it is recorded as present.'
  },
  missed_checkout: {
    title: 'Regularize a missing check-out',
    blurb: 'Explain why you did not check out. HR will correct the record.'
  }
}

export default function RegularizationForm({ record, kind = 'late', onClose, onSaved }) {
  const { employee } = useAuth()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const copy = KINDS[kind] ?? KINDS.late

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (reason.trim().length < 10) {
      setError('Please give a real reason — at least a sentence.')
      return
    }

    setBusy(true)
    const { error: saveError } = await supabase.from('regularizations').insert({
      employee_id: employee.id,
      work_date: record.work_date,
      kind,
      reason: reason.trim(),
      status: 'pending'
    })
    setBusy(false)

    if (saveError) {
      setError(saveError.code === '23505'
        ? 'You have already raised a request for this day.'
        : saveError.message)
      return
    }
    toast.success('Request sent for approval.')
    onSaved()
  }

  return (
    <Modal title={copy.title} subtitle={formatDate(record.work_date)} onClose={onClose}>
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <p className="muted" style={{ fontSize: '.88rem' }}>{copy.blurb}</p>

      {record.check_in && (
        <div className="alert alert-info">
          <Icon name="clock" size={16} />
          <span>Checked in at <strong>{formatTime(record.check_in)}</strong>
            {record.check_out ? `, out at ${formatTime(record.check_out)}` : ', no check-out recorded'}.</span>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="reg_reason">Reason</label>
          <textarea id="reg_reason" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Client call ran over from the previous evening, informed my manager on Slack" required />
          <span className="hint">Your manager and HR both see this.</span>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} Submit request
          </button>
        </div>
      </form>
    </Modal>
  )
}
