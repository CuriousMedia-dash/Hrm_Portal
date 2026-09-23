import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from './Toast.jsx'
import {
  ISSUED_TYPES, issuedLabel, isRecurring, issuedPath, periodLabel,
  BUCKET, MAX_FILE_BYTES, ACCEPTED, ACCEPTED_MIME, formatBytes
} from '../lib/documents.js'
import { formatDate, currentMonth } from '../lib/format.js'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import Confirm from './Confirm.jsx'
import EmptyState from './EmptyState.jsx'
import { SkeletonRows } from './Skeleton.jsx'

/**
 * Documents the company issues to an employee: offer letter, payslips,
 * insurance and so on. HR uploads; the employee downloads and cannot
 * change anything. Unlike the upload checklist, a type can hold many
 * files — payslips arrive every month.
 */
export default function DocumentWallet({ employeeId, canManage = false, title = 'Document wallet' }) {
  const { employee: me } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('issued_documents').select('*')
      .eq('employee_id', employeeId)
      .order('issued_at', { ascending: false })
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const out = new Map()
    for (const type of ISSUED_TYPES) {
      const items = rows.filter((r) => r.doc_type === type.value)
      if (items.length) out.set(type.value, items)
    }
    return out
  }, [rows])

  async function download(row) {
    const { data, error } = await supabase.storage
      .from(BUCKET).createSignedUrl(row.file_path, 120, { download: row.file_name })
    if (error) { toast.error(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('issued_documents').delete().eq('id', removing.id)
    if (!error) await supabase.storage.from(BUCKET).remove([removing.file_path])
    setBusy(false); setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success('Document removed.'); load() }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            <p className="sub">
              {rows.length === 0
                ? (canManage ? 'Nothing issued yet' : 'Documents from the company appear here')
                : `${rows.length} document${rows.length === 1 ? '' : 's'} · download any time`}
            </p>
          </div>
          {canManage && (
            <button type="button" className="btn btn-2 btn-sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Issue document
            </button>
          )}
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={4} avatar={false} />
            : rows.length === 0 ? (
              <EmptyState icon="shield"
                title={canManage ? 'No documents issued yet' : 'Nothing here yet'}
                hint={canManage
                  ? 'Upload the offer letter, appointment letter, insurance papers and payslips.'
                  : 'Your offer letter, payslips and other company documents will appear here when HR uploads them.'} />
            ) : (
              [...grouped.entries()].map(([type, items]) => (
                <div key={type}>
                  <div className="doc-group">
                    {issuedLabel(type)}
                    {items.length > 1 && <span className="dim"> · {items.length} files</span>}
                  </div>
                  {items.map((row) => (
                    <div className="doc-row" key={row.id}>
                      <span className="doc-icon has"><Icon name="checkCircle" size={16} /></span>
                      <div className="doc-meta">
                        <strong>
                          {row.title || periodLabel(row.period) || row.file_name}
                        </strong>
                        <span>
                          {row.file_name} · {formatBytes(row.file_size)} · issued {formatDate(row.issued_at)}
                          {row.note ? ` · ${row.note}` : ''}
                        </span>
                      </div>
                      <div className="doc-actions">
                        <button type="button" className="btn btn-2 btn-sm" onClick={() => download(row)}>
                          <Icon name="arrowRight" size={13} /> Download
                        </button>
                        {canManage && (
                          <button type="button" className="icon-btn" title="Remove"
                            onClick={() => setRemoving(row)}>
                            <Icon name="trash" size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
        </div>

        {!canManage && rows.length > 0 && (
          <div className="card-foot dim" style={{ fontSize: '.82rem' }}>
            These are issued by HR. You can download them any time — only HR can add or remove them.
          </div>
        )}
      </section>

      {adding && (
        <IssueForm
          employeeId={employeeId}
          issuedBy={me?.id}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}

      {removing && (
        <Confirm
          title={`Remove ${removing.title || removing.file_name}?`}
          body="The employee will no longer be able to download it, and the file is deleted from storage."
          confirmLabel="Remove" danger busy={busy}
          onConfirm={remove} onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

function IssueForm({ employeeId, issuedBy, onClose, onSaved }) {
  const toast = useToast()
  const [docType, setDocType] = useState('offer_letter')
  const [period, setPeriod] = useState(currentMonth())
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)

  const recurring = isRecurring(docType)

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!file) { setError('Choose a file to upload.'); return }
    if (!ACCEPTED_MIME.includes(file.type)) { setError('Only PDF, JPG, PNG or WebP files are accepted.'); return }
    if (file.size > MAX_FILE_BYTES) { setError(`That file is ${formatBytes(file.size)}. The limit is 10 MB.`); return }

    setBusy(true)
    const path = issuedPath(employeeId, docType, file.name)
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) { setBusy(false); setError(upErr.message); return }

    const { error: rowErr } = await supabase.from('issued_documents').insert({
      employee_id: employeeId,
      doc_type: docType,
      title: title.trim() || null,
      period: recurring ? period : null,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      note: note.trim() || null,
      issued_by: issuedBy ?? null
    })

    setBusy(false)
    if (rowErr) {
      await supabase.storage.from(BUCKET).remove([path])
      setError(rowErr.message)
      return
    }
    toast.success(`${issuedLabel(docType)} issued.`)
    onSaved()
  }

  return (
    <Modal title="Issue a document" subtitle="The employee can download this, but not change it" onClose={onClose}>
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="issued_type">Document</label>
          <select id="issued_type" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {ISSUED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {recurring && (
          <div className="field">
            <label htmlFor="issued_period">Month</label>
            <input id="issued_period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <span className="hint">Payslips are listed by month.</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="issued_title">Title</label>
          <input id="issued_title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={recurring ? 'Leave empty to use the month' : 'Optional — defaults to the file name'} />
        </div>

        <div className="field">
          <label htmlFor="issued_file">File</label>
          <input id="issued_file" type="file" accept={ACCEPTED} ref={input}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="hint">
            {file ? `${file.name} · ${formatBytes(file.size)}` : 'PDF or image, up to 10 MB.'}
          </span>
        </div>

        <div className="field">
          <label htmlFor="issued_note">Note</label>
          <input id="issued_note" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — shown to the employee" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} Issue document
          </button>
        </div>
      </form>
    </Modal>
  )
}
