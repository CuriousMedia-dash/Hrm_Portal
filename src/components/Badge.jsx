const TONE = {
  present: 'good', active: 'good', approved: 'good', hr_admin: 'brand',
  wfh: 'info', leave: 'info', holiday: 'info',
  pending: 'warn', half_day: 'warn', on_notice: 'warn',
  absent: 'bad', inactive: 'bad', rejected: 'bad',
  cancelled: 'muted'
}

export default function Badge({ value, label, tone }) {
  const t = tone || TONE[value] || 'muted'
  return (
    <span className={`badge badge-${t === 'brand' ? 'info' : t}`}>
      <span className="dot" />
      {label ?? String(value ?? '').replace(/_/g, ' ')}
    </span>
  )
}
