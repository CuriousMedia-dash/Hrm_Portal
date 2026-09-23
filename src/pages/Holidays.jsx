import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatDate, shortDate, todayISO } from '../lib/format.js'
import { daysUntil, describeDays } from '../lib/policy.js'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import Confirm from '../components/Confirm.jsx'
import StatTile from '../components/StatTile.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import DateField from '../components/DateField.jsx'

const KINDS = [
  { value: 'public',   label: 'Public holiday' },
  { value: 'break',    label: 'Company break' },
  { value: 'optional', label: 'Optional holiday' }
]

const BLANK = { name: '', start_date: todayISO(), end_date: todayISO(), kind: 'public', note: '' }

export default function Holidays() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('holidays').select('*').order('start_date')
    if (error) toast.error(error.message)
    else setRows(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => Number(r.start_date.slice(0, 4))))
    set.add(new Date().getFullYear())
    return [...set].sort()
  }, [rows])

  const inYear = useMemo(
    () => rows.filter((r) => Number(r.start_date.slice(0, 4)) === year),
    [rows, year]
  )

  const upcoming = useMemo(
    () => rows.filter((r) => r.end_date >= todayISO()).slice(0, 1)[0] || null,
    [rows]
  )

  /** How many calendar days the company is closed for, in this year. */
  const totals = useMemo(() => {
    const days = inYear.reduce((sum, r) => {
      const a = new Date(`${r.start_date}T00:00:00`)
      const b = new Date(`${r.end_date}T00:00:00`)
      return sum + Math.round((b - a) / 86400000) + 1
    }, 0)
    return {
      occasions: inYear.length,
      days,
      breaks: inYear.filter((r) => r.kind === 'break').length
    }
  }, [inYear])

  const byMonth = useMemo(() => {
    const groups = {}
    for (const row of inYear) {
      const key = new Date(`${row.start_date}T00:00:00`)
        .toLocaleDateString('en-IN', { month: 'long' })
      groups[key] = groups[key] || []
      groups[key].push(row)
    }
    return groups
  }, [inYear])

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('holidays').delete().eq('id', removing.id)
    setBusy(false); setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success('Holiday removed.'); load() }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Holiday calendar</h1>
          <p className="sub">
            {isAdmin ? 'Everyone sees this list. Only you can change it.' : 'Company holidays and breaks for the year.'}
          </p>
        </div>
        <div className="page-actions">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <button type="button" className="btn" onClick={() => setEditing({ ...BLANK })}>
              <Icon name="plus" size={16} /> Add holiday
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile icon="calendar" tone="brand" label="Occasions" value={totals.occasions}
          hint={`in ${year}`} />
        <StatTile icon="gift" tone="good" label="Days off" value={totals.days}
          hint="including multi-day festivals" />
        <StatTile icon="palm" tone="info" label="Company breaks" value={totals.breaks}
          hint="summer and winter" />
        <StatTile icon="clock" tone="warn" label="Next holiday"
          value={upcoming ? upcoming.name : '—'}
          hint={upcoming ? `${shortDate(upcoming.start_date)} · ${describeDays(daysUntil(upcoming.start_date))}` : undefined} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{year}</h2>
          <span className="chip"><Icon name="info" size={13} /> Leave requests skip these days</span>
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={6} avatar={false} />
            : inYear.length === 0 ? (
              <EmptyState icon="calendar" title={`No holidays listed for ${year}`}
                hint={isAdmin ? 'Add them so leave requests count correctly.' : 'HR has not published this year yet.'} />
            ) : (
              Object.entries(byMonth).map(([month, list]) => (
                <div key={month}>
                  <div className="doc-group">{month}</div>
                  {list.map((row) => {
                    const days = daysUntil(row.start_date)
                    const past = row.end_date < todayISO()
                    const isNow = row.start_date <= todayISO() && row.end_date >= todayISO()
                    return (
                      <div className={past ? 'holiday-row is-past' : 'holiday-row'} key={row.id}>
                        <span className={`holiday-date ${row.kind === 'break' ? 'is-break' : ''}`}>
                          <strong>{row.start_date.slice(8, 10)}</strong>
                          <span>{new Date(`${row.start_date}T00:00:00`)
                            .toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                        </span>

                        <div className="holiday-meta">
                          <strong>
                            {row.name}
                            {row.kind === 'break' && <span className="chip">break</span>}
                            {isNow && <span className="chip chip-brand">today</span>}
                          </strong>
                          <span>
                            {row.start_date === row.end_date
                              ? formatDate(row.start_date)
                              : `${formatDate(row.start_date)} → ${formatDate(row.end_date)}`}
                            {!past && days > 0 && ` · ${describeDays(days)}`}
                            {row.note ? ` · ${row.note}` : ''}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className="row-actions">
                            <button type="button" className="btn btn-2 btn-sm" onClick={() => setEditing(row)}>
                              <Icon name="edit" size={13} /> Edit
                            </button>
                            <button type="button" className="icon-btn" onClick={() => setRemoving(row)} title="Remove">
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
        </div>
      </section>

      {editing && (
        <HolidayForm value={editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast.success(msg); load() }} />
      )}

      {removing && (
        <Confirm title={`Remove ${removing.name}?`}
          body="It disappears from everyone's calendar and stops being skipped in leave counts."
          confirmLabel="Remove" danger busy={busy}
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </>
  )
}

function HolidayForm({ value, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const merged = { ...BLANK, ...value }
    return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v ?? '']))
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isNew = !value.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    if ((form.name ?? '').trim().length < 2) { setError('Give the holiday a name.'); return }
    if (form.end_date < form.start_date) { setError('The end date cannot be before the start date.'); return }

    setBusy(true)
    const payload = {
      name: (form.name ?? '').trim(),
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      kind: form.kind,
      note: (form.note ?? '').trim() || null
    }
    const { error: saveError } = isNew
      ? await supabase.from('holidays').insert(payload)
      : await supabase.from('holidays').update(payload).eq('id', value.id)
    setBusy(false)

    if (saveError) {
      setError(saveError.code === '23505'
        ? 'That holiday is already on the calendar for this date.'
        : saveError.message)
      return
    }
    onSaved(isNew ? `${payload.name} added.` : 'Holiday updated.')
  }

  return (
    <Modal title={isNew ? 'Add holiday' : `Edit ${value.name}`} onClose={onClose}>
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="h_name">Occasion</label>
          <input id="h_name" value={form.name} onChange={set('name')} placeholder="Diwali" required />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="h_start">From</label>
            <DateField id="h_start" value={form.start_date} required
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  start_date: e.target.value,
                  end_date: f.end_date < e.target.value ? e.target.value : f.end_date
                }))
              }} />
          </div>
          <div className="field">
            <label htmlFor="h_end">To</label>
            <DateField id="h_end" value={form.end_date} min={form.start_date}
              onChange={set('end_date')} required />
            <span className="hint">Same date for a single day.</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="h_kind">Type</label>
          <select id="h_kind" value={form.kind} onChange={set('kind')}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="h_note">Note</label>
          <input id="h_note" value={form.note || ''} onChange={set('note')} placeholder="Optional" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} {isNew ? 'Add holiday' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
