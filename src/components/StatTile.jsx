import Icon from './Icon.jsx'

export default function StatTile({ icon, tone = '', label, value, suffix, hint, children }) {
  return (
    <div className="tile">
      <div className="tile-top">
        {icon && <span className={`tile-icon ${tone}`}><Icon name={icon} size={16} /></span>}
        <span className="tile-label">{label}</span>
      </div>
      <div className="tile-value">
        {value}{suffix && <small> {suffix}</small>}
      </div>
      {hint && <div className="tile-hint">{hint}</div>}
      {children}
    </div>
  )
}
