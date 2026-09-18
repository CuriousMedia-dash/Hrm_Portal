import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function ProtectedRoute() {
  const { session, loading, configured } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="setup">
        <div className="setup-card">
          <h1>One step left</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            The portal can’t reach Supabase because its keys are missing.
          </p>
          <ol style={{ marginTop: 18 }}>
            <li>In the project folder, copy <code>.env.example</code> to <code>.env</code>.</li>
            <li>Paste your project URL and anon key from <strong>Supabase → Project Settings → API</strong>.</li>
            <li>Restart <code>npm run dev</code>.</li>
          </ol>
          <p className="dim" style={{ fontSize: '.85rem', marginTop: 14, marginBottom: 0 }}>
            The full setup walkthrough is in README.md.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" style={{ width: 22, height: 22 }} />
        <span>Loading your workspace…</span>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
