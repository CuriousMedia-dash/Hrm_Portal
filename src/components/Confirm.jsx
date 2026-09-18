import Modal from './Modal.jsx'

/**
 * Replaces window.confirm so destructive actions look like the rest of the app.
 * Usage: const [ask, setAsk] = useState(null) ... {ask && <Confirm {...ask} />}
 */
export default function Confirm({ title, body, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 20 }}>{body}</p>
      <div className="form-actions">
        <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className={danger ? 'btn btn-bad' : 'btn'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <span className="spinner" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
