import Icon from './Icon.jsx'

export default function EmptyState({ icon = 'inbox', title, hint, action }) {
  return (
    <div className="empty">
      <span className="art"><Icon name={icon} size={24} /></span>
      <p className="t">{title}</p>
      {hint && <p className="h">{hint}</p>}
      {action}
    </div>
  )
}
