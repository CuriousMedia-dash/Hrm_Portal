import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from './Toast.jsx'
import { fetchNetworkStatus } from '../lib/network.js'
import { formatDate } from '../lib/format.js'
import Icon from './Icon.jsx'
import Confirm from './Confirm.jsx'
import EmptyState from './EmptyState.jsx'
import { SkeletonRows } from './Skeleton.jsx'

/**
 * Which networks may mark attendance. Super admin only.
 * Shows the current IP so adding the office is one click.
 */
export default function NetworkSettings() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState({ ip: null, allowed: true, configured: false })
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('Office Wi-Fi')
  const [cidr, setCidr] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [list, net] = await Promise.all([
      supabase.from('allowed_networks').select('*').order('created_at'),
      fetchNetworkStatus()
    ])
    if (list.error) toast.error(list.error.message)
    else setRows(list.data || [])
    setStatus(net)
    if (!cidr && net.ip) setCidr(`${net.ip}/32`)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  async function add(event) {
    event.preventDefault()
    if (!cidr.trim()) { toast.error('Enter an IP address or range.'); return }
    setBusy(true)
    const { error } = await supabase.from('allowed_networks').insert({
      label: label.trim() || 'Office',
      cidr: cidr.trim()
    })
    setBusy(false)
    if (error) {
      toast.error(error.code === '23505' ? 'That network is already on the list.' : error.message)
      return
    }
    toast.success('Network added. Attendance is now restricted to it.')
    setLabel('Office Wi-Fi')
    load()
  }

  async function toggle(row) {
    const { error } = await supabase.from('allowed_networks')
      .update({ is_active: !row.is_active }).eq('id', row.id)
    if (error) toast.error(error.message)
    else load()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('allowed_networks').delete().eq('id', removing.id)
    setBusy(false); setRemoving(null)
    if (error) toast.error(error.message)
    else { toast.success('Network removed.'); load() }
  }

  const activeCount = rows.filter((r) => r.is_active).length

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Office network</h2>
            <p className="sub">
              {activeCount === 0
                ? 'Nothing configured — attendance can be marked from anywhere'
                : `Check-in and check-out require one of these ${activeCount} network${activeCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className={status.allowed ? 'chip chip-brand' : 'chip'}>
            <Icon name={status.allowed ? 'checkCircle' : 'alert'} size={13} />
            You are at {status.ip || 'an unknown address'}
          </span>
        </div>

        <div className="card-body flush">
          {loading ? <SkeletonRows rows={2} avatar={false} />
            : rows.length === 0 ? (
              <EmptyState icon="shield" title="No network restriction"
                hint="Add your office IP below. Until you do, anyone can mark attendance from anywhere." />
            ) : (
              <div className="list">
                {rows.map((row) => (
                  <div className="list-item" key={row.id}>
                    <span className={`tile-icon ${row.is_active ? 'good' : ''}`}>
                      <Icon name="shield" size={15} />
                    </span>
                    <div className="grow">
                      <strong style={{ fontSize: '.9rem' }}>{row.label}</strong>
                      <div className="dim" style={{ fontSize: '.78rem' }}>
                        <code>{row.cidr}</code> · added {formatDate(row.created_at)}
                        {!row.is_active && ' · disabled'}
                      </div>
                    </div>
                    <button type="button" className="btn btn-2 btn-sm" onClick={() => toggle(row)}>
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" className="icon-btn" title="Remove" onClick={() => setRemoving(row)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="card-foot">
          <form onSubmit={add} className="contact-form">
            <input placeholder="Label — e.g. Office Wi-Fi" value={label}
              onChange={(e) => setLabel(e.target.value)} />
            <input placeholder="203.0.113.45/32" value={cidr}
              onChange={(e) => setCidr(e.target.value)} />
            <button type="submit" className="btn" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="plus" size={15} />} Allow
            </button>
          </form>
          <p className="dim" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>
            A single static IP ends in <code>/32</code>. A whole range uses a smaller prefix,
            such as <code>203.0.113.0/24</code>. HR and managers are never restricted — they
            correct the roster from anywhere.
          </p>
        </div>
      </section>

      {removing && (
        <Confirm title={`Remove ${removing.label}?`}
          body={`${removing.cidr} will no longer be able to mark attendance. If this is the last network, the restriction lifts entirely.`}
          confirmLabel="Remove" danger busy={busy}
          onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </>
  )
}
