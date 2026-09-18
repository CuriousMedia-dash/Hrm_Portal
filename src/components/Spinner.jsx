export default function Spinner({ full = false, label = 'Loading…' }) {
  return (
    <div className={full ? 'spinner-wrap spinner-full' : 'spinner-wrap'}>
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  )
}
