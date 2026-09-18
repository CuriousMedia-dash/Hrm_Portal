import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

/** Routes only HR admins may open. Everyone else is sent to the dashboard. */
export default function AdminRoute() {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />
}
