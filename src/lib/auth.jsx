import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, supabaseConfigured } from './supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadEmployee = useCallback(async (userId) => {
    if (!userId) {
      setEmployee(null)
      return null
    }
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Could not load employee record:', error.message)
      setEmployee(null)
      return null
    }
    setEmployee(data ?? null)
    return data ?? null
  }, [])

  useEffect(() => {
    let active = true
    if (!supabaseConfigured) {
      setLoading(false)
      return () => { active = false }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      await loadEmployee(data.session?.user?.id)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return
      setSession(newSession)
      await loadEmployee(newSession?.user?.id)
      if (active) setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadEmployee])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    employee,
    loading,
    // a super admin satisfies every HR check, matching is_hr_admin() in the database
    isSuperAdmin: employee?.role === 'super_admin',
    isAdmin: employee?.role === 'hr_admin' || employee?.role === 'super_admin',
    isManager: employee?.role === 'manager',
    // anyone who can approve something: HR, super admin, or a manager for their department
    isApprover: ['hr_admin', 'super_admin', 'manager'].includes(employee?.role),
    configured: supabaseConfigured,
    refreshEmployee: () => loadEmployee(session?.user?.id),
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email: email.trim(), password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } }
      }),
    signOut: () => supabase.auth.signOut()
  }), [session, employee, loading, loadEmployee])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
