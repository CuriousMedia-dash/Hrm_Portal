import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { getTheme, applyTheme } from '../lib/theme.js'
import { formatDate, todayISO } from '../lib/format.js'
import Icon from './Icon.jsx'
import Avatar from './Avatar.jsx'
import NotificationBell from './NotificationBell.jsx'
import LateCounter from './LateCounter.jsx'

const NAV = [
  { to: '/',           label: 'Dashboard',  icon: 'grid',     end: true, section: 'Overview' },
  { to: '/employees',  label: 'Employees',  icon: 'users',    section: 'People', adminOnly: true },
  { to: '/attendance', label: 'Attendance', icon: 'clock',    section: 'People' },
  { to: '/leave',      label: 'Leave',      icon: 'calendar', section: 'People' },
  { to: '/reimbursements', label: 'Reimbursements', icon: 'wallet', section: 'People' },
  { to: '/profile',    label: 'My profile', icon: 'user',     section: 'Account' }
]

const TITLES = {
  '/': 'Dashboard',
  '/employees': 'Employees',
  '/attendance': 'Attendance',
  '/leave': 'Leave',
  '/reimbursements': 'Reimbursements',
  '/profile': 'My profile'
}

export default function Layout() {
  const { employee, user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(getTheme)
  const [pendingCount, setPendingCount] = useState(0)

  const name = employee?.full_name || user?.email || 'Employee'

  useEffect(() => { setOpen(false) }, [location.pathname])

  // Badge the Leave nav item with whatever is waiting on HR.
  useEffect(() => {
    if (!isAdmin) { setPendingCount(0); return }
    let active = true
    supabase
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => { if (active) setPendingCount(count || 0) })
    return () => { active = false }
  }, [isAdmin, location.pathname])

  function pickTheme(choice) {
    setTheme(choice)
    applyTheme(choice)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const visibleNav = NAV.filter((item) => !item.adminOnly || isAdmin)
  const sections = [...new Set(visibleNav.map((n) => n.section))]

  return (
    <div className="shell">
      <aside className={open ? 'rail open' : 'rail'}>
        <div className="rail-brand">
          <span className="logo">CM</span>
          <div>
            <strong>HRM Portal</strong>
            <span>Curious Media</span>
          </div>
        </div>

        <div className="rail-scroll">
          {sections.map((section) => (
            <div key={section}>
              <div className="rail-section">{section}</div>
              {visibleNav.filter((item) => item.section === section).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'rail-link on' : 'rail-link')}
                >
                  <Icon name={item.icon} size={17} />
                  {item.label}
                  {item.to === '/leave' && pendingCount > 0 && <span className="count">{pendingCount}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="rail-foot">
          <div className="theme-switch" role="group" aria-label="Colour theme">
            {[['light', 'sun'], ['dark', 'moon'], ['system', 'monitor']].map(([value, icon]) => (
              <button
                key={value}
                type="button"
                className={theme === value ? 'on' : ''}
                onClick={() => pickTheme(value)}
                aria-label={`${value} theme`}
                title={`${value[0].toUpperCase()}${value.slice(1)} theme`}
              >
                <Icon name={icon} size={15} />
              </button>
            ))}
          </div>

          <div className="rail-user">
            <Avatar name={name} size="sm" />
            <div className="who">
              <strong>{name}</strong>
              <span>{isAdmin ? 'HR admin' : 'Employee'}</span>
            </div>
          </div>

          <button type="button" className="rail-signout" onClick={handleSignOut}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn rail-toggle" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Icon name="menu" size={19} />
          </button>
          <h1>{TITLES[location.pathname] || 'HRM Portal'}</h1>
          <div className="topbar-right">
            <span className="topbar-date">{formatDate(todayISO())}</span>
            <LateCounter />
            <NotificationBell />
            <Avatar name={name} size="sm" />
          </div>
        </header>

        {!employee && (
          <div className="banner warn">
            <Icon name="alert" size={16} />
            <span>
              No employee record is linked to <strong>{user?.email}</strong> yet. Ask HR to add you
              with this email, or run <code>supabase/make_admin.sql</code> if this is the first account.
            </span>
          </div>
        )}

        {employee?.status === 'pending' && !isAdmin && (
          <div className="banner">
            <Icon name="info" size={16} />
            <span>Your record is waiting for HR to fill in the details. You can look around in the meantime.</span>
          </div>
        )}

        <main className="content">
          <Outlet />
        </main>
      </div>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </div>
  )
}
