import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function EarnedLeaveSchedule() {
  const [policies, setPolicies] = useState([])
  const [employees, setEmployees] = useState([])
  const [allocations, setAllocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [policyId, setPolicyId] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [polRes, empRes, allocRes] = await Promise.all([
      supabase.from('leave_policies').select('*').order('name').then(r => r).catch(() => ({ data: [] })),
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
      supabase.from('leave_allocations').select('*').then(r => r).catch(() => ({ data: [] })),
    ])
    setPolicies(polRes.data || [])
    setEmployees(empRes.data || [])
    setAllocations(allocRes.data || [])
    if (!policyId && polRes.data?.[0]) setPolicyId(polRes.data[0].id)
    setLoading(false)
  }, [policyId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const policy = useMemo(() => policies.find(p => p.id === policyId), [policies, policyId])

  // Calculate monthly accrual from policy
  const monthlyAccrual = useMemo(() => {
    if (!policy) return 0
    const annual = Number(policy.max_leaves_allowed || policy.annual_allocation || 0)
    return annual / 12
  }, [policy])

  // Build per-employee projected schedule for the year
  const schedule = useMemo(() => {
    if (!policy) return []
    return employees.map(emp => {
      const existingAlloc = allocations.find(a => a.employee_id === emp.id && a.leave_policy_id === policy.id)
      const startBalance = Number(existingAlloc?.balance || 0)
      const monthlyValues = MONTHS.map((_, idx) => startBalance + monthlyAccrual * (idx + 1))
      return { emp, startBalance, monthlyValues, yearEnd: monthlyValues[11] }
    })
  }, [employees, policy, monthlyAccrual, allocations])

  if (loading) return <div><PageHeader title="Earned Leave Schedule" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Earned Leave Schedule" subtitle="Projected monthly leave accrual per employee" />

      <div style={{ display: 'flex', gap: 12, marginTop: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Leave Policy</label>
          <select className="form-control" value={policyId} onChange={e => setPolicyId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Select policy…</option>
            {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Year</label>
          <input className="form-control" type="number" min={2020} max={2100} value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 110 }} />
        </div>
      </div>

      {!policy
        ? <EmptyState icon="event_repeat" message="Select a leave policy to view the accrual schedule" />
        : (
          <>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Policy</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{policy.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Annual Allowance</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{policy.max_leaves_allowed || policy.annual_allocation || 0} days</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Monthly Accrual</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: 'var(--green)' }}>+{monthlyAccrual.toFixed(2)} days</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Employees</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{employees.length}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: '60vh' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 3, minWidth: 180, borderRight: '1px solid var(--border)' }}>Employee</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', borderRight: '1px solid var(--border)' }}>Opening</th>
                    {MONTHS.map(m => (
                      <th key={m} style={{ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid var(--border)', minWidth: 60 }}>{m}</th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'right', background: 'var(--gold)22', color: 'var(--gold)', fontWeight: 700 }}>Year End</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(({ emp, startBalance, monthlyValues, yearEnd }) => (
                    <tr key={emp.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', fontWeight: 500 }}>{emp.name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', borderRight: '1px solid var(--border)', color: 'var(--text-dim)' }}>{startBalance.toFixed(1)}</td>
                      {monthlyValues.map((v, idx) => (
                        <td key={idx} style={{ padding: '8px 8px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>{v.toFixed(1)}</td>
                      ))}
                      <td style={{ padding: '8px 12px', textAlign: 'right', background: 'var(--gold)11', fontWeight: 700, color: 'var(--gold)' }}>{yearEnd.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)' }}>
              Projections assume monthly accrual = annual allowance ÷ 12. Actual accrual depends on the Supabase Edge Function cron (configured separately).
            </div>
          </>
        )}
    </div>
  )
}
