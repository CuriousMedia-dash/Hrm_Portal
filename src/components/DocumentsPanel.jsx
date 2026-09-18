import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'
import Confirm from './Confirm.jsx'
import { SkeletonRows } from './Skeleton.jsx'
import {
  DOC_TYPES, DOC_GROUPS, BUCKET, MAX_FILE_BYTES, ACCEPTED, ACCEPTED_MIME,
  buildPath, completionOf, formatBytes
} from '../lib/documents.js'
import { formatDate } from '../lib/format.js'

/**
 * The document checklist.
 * `readOnly` renders the HR view: download only, no upload or delete.
 */
export default function DocumentsPanel({ employeeId, readOnly = false, title = 'Documents' }) {
  const toast = useToast()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyType, setBusyType] = useState(null)
  const [removing, setRemoving] = useState(null)
  const inputs = useRef({})

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_documents').select('*').eq('employee_id', employeeId)
    if (error) toast.error(error.message)
    else setDocs(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  useEffect(() => { load() }, [load])

  const byType = useMemo(
    () => Object.fromEntries(docs.map((d) => [d.doc_type, d])), [docs]
  )
  const progress = completionOf(docs)

  async function upload(docType, file) {
    if (!file) return

    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error('Only PDF, JPG, PNG or WebP files are accepted.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`That file is ${formatBytes(file.size)}. The limit is 10 MB.`)
      return
    }

    setBusyType(docType)
    const existing = byType[docType]
    const path = buildPath(employeeId, docType, file.name)

    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false })

    if (upErr) {
      setBusyType(null)
      toast.error(upErr.message)
      return
    }

    const { error: rowErr } = await supabase.from('employee_documents').upsert({
      employee_id: employeeId,
      doc_type: docType,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      uploaded_at: new Date().toISOString()
    }, { onConflict: 'employee_id,doc_type' })

    if (rowErr) {
      // don't leave an orphan file behind if the row failed
      await supabase.storage.from(BUCKET).remove([path])
      setBusyType(null)
      toast.error(rowErr.message)
      return
    }

    // the replaced file is no longer referenced by anything
    if (existing?.file_path) await supabase.storage.from(BUCKET).remove([existing.file_path])

    setBusyType(null)
    toast.success(`${file.name} uploaded.`)
    load()
  }

  async function view(doc) {
    const { data, error } = await supabase.storage
      .from(BUCKET).createSignedUrl(doc.file_path, 120)
    if (error) { toast.error(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove() {
    const doc = removing
    setBusyType(doc.doc_type)
    const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id)
    if (!error) await supabase.storage.from(BUCKET).remove([doc.file_path])
    setBusyType(null)
    setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success('Document removed.'); load() }
  }

  if (loading) {
    return (
      <section className="card">
        <div className="card-head"><h2>{title}</h2></div>
        <div className="card-body flush"><SkeletonRows rows={5} avatar={false} /></div>
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            <p className="sub">
              {progress.done} of {progress.total} required documents on file
              {docs.length > progress.done && ` · ${docs.length - progress.done} optional uploaded`}
            </p>
          </div>
          <span className={`chip ${progress.pct === 100 ? 'chip-brand' : ''}`}>
            <Icon name={progress.pct === 100 ? 'checkCircle' : 'inbox'} size={13} />
            {progress.pct}% complete
          </span>
        </div>

        <div style={{ padding: '14px 18px 0' }}>
          <div className={`meter ${progress.pct === 100 ? '' : progress.pct < 40 ? 'is-out' : 'is-low'}`}>
            <span style={{ width: `${progress.pct}%` }} />
          </div>
        </div>

        <div className="card-body flush" style={{ marginTop: 8 }}>
          {DOC_GROUPS.map((group) => (
            <div key={group}>
              <div className="doc-group">{group}</div>
              {DOC_TYPES.filter((d) => d.group === group).map((type) => {
                const doc = byType[type.value]
                const busy = busyType === type.value
                return (
                  <div className="doc-row" key={type.value}>
                    <span className={`doc-icon ${doc ? 'has' : type.required ? 'need' : ''}`}>
                      <Icon name={doc ? 'checkCircle' : 'inbox'} size={16} />
                    </span>

                    <div className="doc-meta">
                      <strong>
                        {type.label}
                        {!type.required && <span className="doc-optional">optional</span>}
                      </strong>
                      <span>
                        {doc
                          ? `${doc.file_name} · ${formatBytes(doc.file_size)} · ${formatDate(doc.uploaded_at)}`
                          : type.hint}
                      </span>
                    </div>

                    <div className="doc-actions">
                      {doc && (
                        <button type="button" className="btn btn-2 btn-sm" onClick={() => view(doc)}>
                          <Icon name="eye" size={13} /> View
                        </button>
                      )}
                      {!readOnly && (
                        <>
                          <input
                            type="file"
                            accept={ACCEPTED}
                            style={{ display: 'none' }}
                            ref={(el) => { inputs.current[type.value] = el }}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              upload(type.value, file)
                            }}
                          />
                          <button
                            type="button"
                            className={doc ? 'btn btn-ghost btn-sm' : 'btn btn-sm'}
                            disabled={busy}
                            onClick={() => inputs.current[type.value]?.click()}
                          >
                            {busy ? <span className="spinner" /> : <Icon name={doc ? 'edit' : 'plus'} size={13} />}
                            {doc ? 'Replace' : 'Upload'}
                          </button>
                          {doc && (
                            <button type="button" className="icon-btn" title="Remove"
                              onClick={() => setRemoving(doc)} disabled={busy}>
                              <Icon name="trash" size={15} />
                            </button>
                          )}
                        </>
                      )}
                      {readOnly && !doc && <span className="chip">Not uploaded</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {!readOnly && (
          <div className="card-foot dim" style={{ fontSize: '.82rem' }}>
            PDF, JPG, PNG or WebP · up to 10 MB each. Uploading again replaces the previous file.
            Only you and HR can open these.
          </div>
        )}
      </section>

      {removing && (
        <Confirm
          title={`Remove ${removing.file_name}?`}
          body="The file is deleted from storage and HR will see this document as missing again."
          confirmLabel="Remove document"
          danger
          busy={busyType === removing.doc_type}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}
