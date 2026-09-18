import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

/** Routes only approvers (HR or a manager) may open. Everyone else goes home. */
export default function AdminRoute() {
  const { isApprover, loading } = useAuth()
  if (loading) return null
  // HR and managers both reach the directory; row level security decides
  // that a manager only sees their own department.
  return isApprover ? <Outlet /> : <Navigate to="/" replace />
}
