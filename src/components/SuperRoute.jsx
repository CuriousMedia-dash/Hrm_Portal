import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

/** Super-admin-only routes. Everyone else goes back to the dashboard. */
export default function SuperRoute() {
  const { isSuperAdmin, loading } = useAuth()
  if (loading) return null
  return isSuperAdmin ? <Outlet /> : <Navigate to="/" replace />
}
