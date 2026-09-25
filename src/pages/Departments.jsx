import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from '../components/Toast.jsx'
import { EMPLOYMENT_TYPES, labelOf, formatDate } from '../lib/format.js'
import { tierOf } from '../lib/policy.js'
import Avatar from '../components/Avatar.jsx'
import Badge from '../components/Badge.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'

const ACTIVE = ['active', 'on_notice', 'pending']

/**
 * Who reports to whom. The landing view is the list of managers with
 * their headcount; opening one shows that manager's team.
 *
 * "Manager" here means anyone other people report to — the role, plus
 * anyone who happens to have direct reports, so nobody's team is hidden
 * just because their role says something else.
 */
export default function Departments() {
  const { managerId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email, department, designation, role, employment_type, status, manager_id, date_of_joining')
      .in('status', ACTIVE)
      .order('full_name')
    if (error) toast.error(error.message)
    else setPeople(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const reportsBy = useMemo(() => {
    const map = {}
    for (const p of people) {
      if (!p.manager_id) continue
      ;(map[p.manager_id] ||= []).push(p)
    }
    return map
  }, [people])

  const managers = useMemo(() => {
    const isManager = (p) => p.role === 'manager' || (reportsBy[p.id]?.length > 0)
    return people.filter(isManager).sort((a, b) => {
      const byDept = (a.department || 'zzz').localeCompare(b.department || 'zzz')
      return byDept || a.full_name.localeCompare(b.full_name)
    })
  }, [people, reportsBy])

  const unassigned = useMemo(
    () => people.filter((p) => !p.manager_id && !managers.some((m) => m.id === p.id)),
    [people, managers]
  )

  if (loading) {
    return (
      <>
        <PageHead />
        <section className="card"><div className="card-body"><SkeletonRows rows={5} /></div></section>
      </>
    )
  }

  // ---- one manager's team ----
  if (managerId) {
    const manager = people.find((p) => p.id === managerId)
    const team = reportsBy[managerId] || []

    if (!manager) {
      return (
        <>
          <PageHead />
          <section className="card">
            <div className="card-body">
              <EmptyState icon="users" title="No such manager"
                hint="They may have left, or the link is out of date." />
              <div style={{ textAlign: 'center' }}>
                <Link className="btn btn-2" to="/departments">Back to all teams</Link>
              </div>
            </div>
          </section>
        </>
      )
    }

    return (
      <>
        <div className="page-head">
          <div>
            <button type="button" className="link-btn" onClick={() => navigate('/departments')}>
              ← All teams
            </button>
            <h1>{manager.full_name}</h1>
            <p className="sub">
              {[manager.designation, manager.department].filter(Boolean).join(' · ') || 'Manager'}
              {' · '}{team.length} {team.length === 1 ? 'person reports' : 'people report'} to them
            </p>
          </div>
        </div>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Team</h2>
              <p className="sub">Everyone who reports to {manager.full_name.split(' ')[0]}</p>
            </div>
          </div>
          <div className="card-body flush">
            {team.length === 0 ? (
              <EmptyState icon="users" title="Nobody reports to them yet"
                hint="Set this person as someone's manager in Employees > Edit > Reports to." />
            ) : (
              <PeopleTable people={team} reportsBy={reportsBy} />
            )}
          </div>
        </section>
      </>
    )
  }

  // ---- all managers ----
  return (
    <>
      <PageHead count={managers.length} />

      {managers.length === 0 ? (
        <section className="card">
          <div className="card-body">
            <EmptyState icon="users" title="No managers set up yet"
              hint="Give someone the Manager role, or set them as another person's manager in Employees > Edit > Reports to." />
          </div>
        </section>
      ) : (
        <div className="grid grid-3">
          {managers.map((m) => {
            const team = reportsBy[m.id] || []
            return (
              <Link className="tile tile-clickable" to={`/departments/${m.id}`} key={m.id}>
                <div className="tile-top">
                  <Avatar name={m.full_name} size="sm" />
                  <span className="tile-label">{m.department || 'No department'}</span>
                  <Icon name="arrowRight" size={14} className="tile-go" />
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: '.98rem' }}>{m.full_name}</strong>
                  <div className="dim" style={{ fontSize: '.79rem' }}>
                    {m.designation || tierOf(m)}
                  </div>
                </div>
                <div className="tile-hint" style={{ marginTop: 10 }}>
                  {team.length === 0
                    ? 'No direct reports yet'
                    : `${team.length} ${team.length === 1 ? 'report' : 'reports'} · ${
                        [...new Set(team.map((t) => t.department).filter(Boolean))].join(', ') || '—'}`}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h2>Not assigned to a manager</h2>
              <p className="sub">
                {unassigned.length} {unassigned.length === 1 ? 'person has' : 'people have'} nobody
                set as their manager — their leave goes to HR only
              </p>
            </div>
          </div>
          <div className="card-body flush">
            <PeopleTable people={unassigned} reportsBy={reportsBy} />
          </div>
        </section>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function PageHead({ count }) {
  return (
    <div className="page-head">
      <div>
        <h1>Departments</h1>
        <p className="sub">
          {count === undefined
            ? 'Who reports to whom.'
            : `${count} ${count === 1 ? 'manager' : 'managers'} · open one to see their team`}
        </p>
      </div>
    </div>
  )
}

function PeopleTable({ people, reportsBy }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Type</th>
            <th>Joined</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="person">
                  <Avatar name={p.full_name} size="sm" />
                  <div className="who">
                    <strong>{p.full_name}</strong>
                    <span>{p.designation || p.email}</span>
                  </div>
                </div>
              </td>
              <td className="dim">{p.department || '—'}</td>
              <td className="dim nowrap">
                {labelOf(EMPLOYMENT_TYPES, p.employment_type)}
                {reportsBy[p.id]?.length > 0 && (
                  <Link to={`/departments/${p.id}`} className="link-btn" style={{ marginLeft: 8 }}>
                    +{reportsBy[p.id].length} below
                  </Link>
                )}
              </td>
              <td className="dim nowrap">{p.date_of_joining ? formatDate(p.date_of_joining) : '—'}</td>
              <td><Badge value={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
