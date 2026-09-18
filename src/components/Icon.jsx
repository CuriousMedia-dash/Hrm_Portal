/**
 * Inline icon set — no icon library, so nothing to install and nothing
 * loads from a CDN at runtime. Stroke icons on a 24px grid.
 */
const PATHS = {
  grid:      <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  users:     <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clock:     <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  calendar:  <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><line x1="3" y1="9.5" x2="21" y2="9.5" /><line x1="8" y1="2.5" x2="8" y2="6.5" /><line x1="16" y1="2.5" x2="16" y2="6.5" /></>,
  user:      <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  search:    <><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></>,
  plus:      <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  check:     <polyline points="20 6 9 17 4 12" />,
  x:         <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  menu:      <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  sun:       <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon:      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  monitor:   <><rect x="2" y="3.5" width="20" height="14" rx="2.5" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17.5" x2="12" y2="21" /></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
  login:     <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></>,
  alert:     <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12" y2="16.6" /></>,
  info:      <><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="7.5" x2="12" y2="7.6" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><polyline points="8 12.2 11 15 16 9.5" /></>,
  trend:     <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>,
  inbox:     <><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-5z" /></>,
  building:  <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="9" y1="8" x2="9" y2="8.1" /><line x1="15" y1="8" x2="15" y2="8.1" /><line x1="9" y1="12" x2="9" y2="12.1" /><line x1="15" y1="12" x2="15" y2="12.1" /><path d="M10 21v-4h4v4" /></>,
  mail:      <><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><polyline points="3 7 12 13 21 7" /></>,
  phone:     <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19 19 0 0 1-5.9-5.9 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.4 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.8a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z" />,
  pin:       <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  edit:      <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash:     <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  eye:       <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  shield:    <><path d="M12 2.5l8 3.2v6c0 4.7-3.3 8.9-8 10-4.7-1.1-8-5.3-8-10v-6z" /><polyline points="9 12 11.2 14.2 15.2 10" /></>,
  key:       <><circle cx="7.5" cy="15.5" r="4" /><path d="M10.5 12.5L20 3M17 6l2.5 2.5M14.5 8.5L17 11" /></>,
  list:      <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3.5" y1="6" x2="3.6" y2="6" /><line x1="3.5" y1="12" x2="3.6" y2="12" /><line x1="3.5" y1="18" x2="3.6" y2="18" /></>,
  cards:     <><rect x="3" y="4" width="8" height="7" rx="1.6" /><rect x="13" y="4" width="8" height="7" rx="1.6" /><rect x="3" y="13" width="8" height="7" rx="1.6" /><rect x="13" y="13" width="8" height="7" rx="1.6" /></>,
  arrowRight: <><line x1="4" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></>,
  sparkle:   <path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" />,
  bell:      <><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" /><path d="M13.7 20.5a2 2 0 0 1-3.4 0" /></>,
  gift:      <><rect x="3" y="9" width="18" height="12" rx="2" /><line x1="12" y1="9" x2="12" y2="21" /><path d="M3 13h18" /><path d="M12 9S11 3.5 8 4.2 8.5 9 12 9zM12 9s1-5.5 4-4.8S15.5 9 12 9z" /></>,
  wallet:    <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="14" r="1.3" /></>,
  paperclip: <path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3" />,
  palm:      <><path d="M12 21v-8.5" /><path d="M3.2 12.5a8.8 8.8 0 0 1 17.6 0z" /><path d="M12 21a2.6 2.6 0 0 0 4.4-1.6" /></>
}

export default function Icon({ name, size = 18, strokeWidth = 1.8, className = '', ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" focusable="false" {...rest}
    >
      {path}
    </svg>
  )
}
