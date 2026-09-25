import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import SuperRoute from './components/SuperRoute.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Employees from './pages/Employees.jsx'
import Attendance from './pages/Attendance.jsx'
import Leave from './pages/Leave.jsx'
import Reimbursements from './pages/Reimbursements.jsx'
import Holidays from './pages/Holidays.jsx'
import Activity from './pages/Activity.jsx'
import Profile from './pages/Profile.jsx'
import Policies from './pages/Policies.jsx'
import Departments from './pages/Departments.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route element={<AdminRoute />}>
            <Route path="/employees" element={<Employees />} />
            {/* the directory is HR-only, and so is the org chart built from it */}
            <Route path="/departments" element={<Departments />} />
            <Route path="/departments/:managerId" element={<Departments />} />
          </Route>
          <Route element={<SuperRoute />}>
            <Route path="/activity" element={<Activity />} />
          </Route>
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/reimbursements" element={<Reimbursements />} />
          <Route path="/holidays" element={<Holidays />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
