import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { currentMonth, monthBounds } from '../lib/format.js'
import { lateAfterLabel } from '../lib/policy.js'
import Icon from './Icon.jsx'

/**
 * Your late arrivals this month, sitting beside the notification bell.
 * Counts what the database marked late (after 10:20 IST), not a guess.
 */
export default function LateCounter() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!employee?.id) { setCount(0); return }
    const { from, to } = monthBounds(currentMonth())
    const { count: n } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .eq('is_late', true)
      .gte('work_date', from)
      .lte('work_date', to)
    setCount(n || 0)
  }, [employee?.id])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  if (!employee) return null

  return (
    <button
      type="button"
      className={count > 0 ? 'late-chip has-late' : 'late-chip'}
      onClick={() => navigate('/attendance')}
      title={`Arrivals after ${lateAfterLabel} this month`}
    >
      <Icon name="clock" size={14} />
      <span className="late-n">{count}</span>
      <span className="late-word">late</span>
    </button>
  )
}
