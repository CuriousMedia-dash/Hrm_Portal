import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'

/**
 * A single headline number. Pass `to` to make the whole tile a link —
 * used where the number is a question the next page answers.
 */
export default function StatTile({ icon, tone = '', label, value, suffix, hint, children, to }) {
  const body = (
    <>
      <div className="tile-top">
        {icon && <span className={`tile-icon ${tone}`}><Icon name={icon} size={16} /></span>}
        <span className="tile-label">{label}</span>
        {to && <Icon name="arrowRight" size={14} className="tile-go" />}
      </div>
      <div className="tile-value">
        {value}{suffix && <small> {suffix}</small>}
      </div>
      {hint && <div className="tile-hint">{hint}</div>}
      {children}
    </>
  )

  if (to) return <Link to={to} className="tile tile-clickable">{body}</Link>
  return <div className="tile">{body}</div>
}
