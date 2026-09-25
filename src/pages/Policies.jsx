import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatDate } from '../lib/format.js'
import { formatBytes } from '../lib/documents.js'
import {
  POLICY_KINDS, policyLabel, POLICY_BUCKET,
  POLICY_MAX_BYTES, POLICY_ACCEPTED, POLICY_ACCEPTED_MIME
} from '../lib/policies.js'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import Confirm from '../components/Confirm.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import DateField from '../components/DateField.jsx'

const ICON_FOR = {
  late_policy: 'clock', leave_policy: 'palm', confidentiality: 'shield',
  code_of_conduct: 'users', posh: 'alert', wfh_policy: 'grid',
  expense_policy: 'wallet', exit_policy: 'logout', other: 'inbox'
}

/**
 * The company rule book. HR uploads each document once; everyone can
 * open it. Files live in a private bucket and are handed out through a
 * short-lived signed URL, so a link cannot be forwarded outside.
 */
export default function Policies() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(null)      // the kind being uploaded
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('policies').select('*').eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  // newest document of each kind, in the order the kinds are listed
  const byKind = useMemo(() => {
    const map = {}
    for (const row of rows) if (!map[row.kind]) map[row.kind] = row
    return map
  }, [rows])

  const sections = useMemo(() => {
    const known = POLICY_KINDS.filter((k) => k.value !== 'other')
    const knownValues = new Set(known.map((k) => k.value))
    // 'Other' documents, and anything whose kind predates this list,
    // are listed individually rather than folded into a single slot
    const others = rows.filter((r) => !knownValues.has(r.kind))
    return { known, others }
  }, [rows])

  async function open(row) {
    const { data, error } = await supabase.storage
      .from(POLICY_BUCKET).createSignedUrl(row.file_path, 300)
    if (error) { toast.error(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove() {
    const row = removing
    const { error } = await supabase.from('policies').delete().eq('id', row.id)
    if (!error) await supabase.storage.from(POLICY_BUCKET).remove([row.file_path])
    setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success(`${row.title} removed.`); load() }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Policies</h1>
          <p className="sub">
            {isAdmin
              ? 'Upload the documents everyone is expected to have read.'
              : 'The rules that apply to everyone here. Open one to read it.'}
          </p>
        </div>
      </div>

      {loading ? (
        <section className="card"><div className="card-body"><SkeletonRows rows={4} avatar={false} /></div></section>
      ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Company policies</h2>
              <p className="sub">{rows.length} document{rows.length === 1 ? '' : 's'} on file</p>
            </div>
          </div>

          <div className="card-body flush">
            <div className="list">
              {sections.known.map((kind) => {
                const doc = byKind[kind.value]
                return (
                  <div className="list-item" key={kind.value}>
                    <span className={`tile-icon ${doc ? 'good' : ''}`}>
                      <Icon name={ICON_FOR[kind.value] || 'inbox'} size={15} />
                    </span>
                    <div className="grow">
                      <strong style={{ fontSize: '.9rem' }}>{doc?.title || kind.label}</strong>
                      <div className="dim" style={{ fontSize: '.78rem' }}>
                        {doc
                          ? <>
                              {doc.file_name} · {formatBytes(doc.file_size)} · added {formatDate(doc.created_at)}
                              {doc.effective_from && ` · effective ${formatDate(doc.effective_from)}`}
                            </>
                          : kind.hint}
                      </div>
                      {doc?.description && (
                        <div className="dim" style={{ fontSize: '.78rem', marginTop: 2 }}>{doc.description}</div>
                      )}
                    </div>

                    {doc ? (
                      <>
                        <button type="button" className="btn btn-2 btn-sm" onClick={() => open(doc)}>
                          <Icon name="eye" size={14} /> Read
                        </button>
                        {isAdmin && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(kind.value)}>
                              Replace
                            </button>
                            <button type="button" className="icon-btn" title="Remove"
                              onClick={() => setRemoving(doc)}>
                              <Icon name="trash" size={15} />
                            </button>
                          </>
                        )}
                      </>
                    ) : isAdmin ? (
                      <button type="button" className="btn btn-2 btn-sm" onClick={() => setAdding(kind.value)}>
                        <Icon name="plus" size={14} /> Upload
                      </button>
                    ) : (
                      <span className="chip">Not uploaded yet</span>
                    )}
                  </div>
                )
              })}

              {sections.others.map((doc) => (
                <div className="list-item" key={doc.id}>
                  <span className="tile-icon good"><Icon name="inbox" size={15} /></span>
                  <div className="grow">
                    <strong style={{ fontSize: '.9rem' }}>{doc.title}</strong>
                    <div className="dim" style={{ fontSize: '.78rem' }}>
                      {doc.file_name} · {formatBytes(doc.file_size)} · added {formatDate(doc.created_at)}
                    </div>
                    {doc.description && (
                      <div className="dim" style={{ fontSize: '.78rem', marginTop: 2 }}>{doc.description}</div>
                    )}
                  </div>
                  <button type="button" className="btn btn-2 btn-sm" onClick={() => open(doc)}>
                    <Icon name="eye" size={14} /> Read
                  </button>
                  {isAdmin && (
                    <button type="button" className="icon-btn" title="Remove" onClick={() => setRemoving(doc)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {rows.length === 0 && !isAdmin && (
              <EmptyState icon="inbox" title="No policies uploaded yet"
                hint="HR has not added any documents. Check back later." />
            )}
          </div>

          {isAdmin && (
            <div className="card-foot">
              <button type="button" className="btn btn-2" onClick={() => setAdding('other')}>
                <Icon name="plus" size={15} /> Add another document
              </button>
              <p className="dim" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>
                PDF, Word, JPG or PNG, up to 20 MB. Everyone signed in can read these;
                only HR and super admins can change them.
              </p>
            </div>
          )}
        </section>
      )}

      {adding && (
        <PolicyUpload
          kind={adding}
          existing={byKind[adding]}
          onClose={() => setAdding(null)}
          onDone={() => { setAdding(null); load() }}
        />
      )}

      {removing && (
        <Confirm title={`Remove ${removing.title}?`}
          body="The file is deleted and nobody will be able to open it. You can upload a new one afterwards."
          confirmLabel="Remove" danger
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function PolicyUpload({ kind, existing, onClose, onDone }) {
  const toast = useToast()
  const { employee } = useAuth()
  const fileRef = useRef(null)
  const [chosenKind, setChosenKind] = useState(kind)
  const [title, setTitle] = useState(existing?.title || policyLabel(kind))
  const [description, setDescription] = useState(existing?.description || '')
  const [effective, setEffective] = useState(existing?.effective_from || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // keep the title in step with the kind until it has been typed over
  const [titleTouched, setTitleTouched] = useState(Boolean(existing))
  useEffect(() => {
    if (!titleTouched) setTitle(policyLabel(chosenKind))
  }, [chosenKind, titleTouched])

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!file) { setError('Choose a file to upload.'); return }
    if (!POLICY_ACCEPTED_MIME.includes(file.type)) {
      setError('Only PDF, Word, JPG or PNG files are accepted.'); return
    }
    if (file.size > POLICY_MAX_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. The limit is 20 MB.`); return
    }
    if (!title.trim()) { setError('Give the document a title.'); return }

    setBusy(true)
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${chosenKind}/${Date.now()}-${safe}`

    const { error: upErr } = await supabase.storage
      .from(POLICY_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false })
    if (upErr) { setBusy(false); setError(upErr.message); return }

    const payload = {
      kind: chosenKind,
      title: title.trim(),
      description: description.trim() || null,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      effective_from: effective || null,
      uploaded_by: employee?.id ?? null
    }

    const { error: rowErr } = existing
      ? await supabase.from('policies').update(payload).eq('id', existing.id)
      : await supabase.from('policies').insert(payload)

    if (rowErr) {
      // never leave a file behind that no row points at
      await supabase.storage.from(POLICY_BUCKET).remove([path])
      setBusy(false)
      setError(rowErr.message)
      return
    }

    // the replaced file is now unreferenced
    if (existing?.file_path) await supabase.storage.from(POLICY_BUCKET).remove([existing.file_path])

    setBusy(false)
    toast.success(`${title.trim()} uploaded.`)
    onDone()
  }

  return (
    <Modal
      title={existing ? `Replace ${existing.title}` : 'Upload a policy'}
      subtitle="Everyone signed in will be able to read this"
      onClose={onClose}
    >
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="p_kind">Policy</label>
          <select id="p_kind" value={chosenKind} onChange={(e) => setChosenKind(e.target.value)}>
            {POLICY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <span className="hint">{POLICY_KINDS.find((k) => k.value === chosenKind)?.hint}</span>
        </div>

        <div className="field">
          <label htmlFor="p_title">Title</label>
          <input id="p_title" value={title} required
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }} />
        </div>

        <div className="field">
          <label htmlFor="p_desc">Short note <span className="dim">(optional)</span></label>
          <input id="p_desc" value={description} placeholder="What changed, or who to ask about it"
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="p_effective">In force from <span className="dim">(optional)</span></label>
          <DateField id="p_effective" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="p_file">Document</label>
          <input id="p_file" type="file" ref={fileRef} accept={POLICY_ACCEPTED}
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <span className="hint">
            {file ? `${file.name} · ${formatBytes(file.size)}` : 'PDF, Word, JPG or PNG · up to 20 MB'}
          </span>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} {existing ? 'Replace' : 'Upload'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
