import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, Spinner, EmptyState } from '../../components/ui'
import { exportXLSX, dateTag } from '../../engine/reportingEngine'

export default function OrgChart() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('')

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, designation_id, designations:designation_id(title), department_id, departments:department_id(name), status')
      .eq('status', 'Active')
      .order('name')
    if (error) toast.error(error.message)
    setEmployees(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const departments = Array.from(
    new Map(
      employees
        .filter(e => e.department_id)
        .map(e => [e.department_id, e.departments?.name || 'Unknown'])
    ).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

  const grouped = departments.reduce((acc, dept) => {
    acc[dept.id] = {
      name: dept.name,
      employees: employees.filter(e => e.department_id === dept.id),
    }
    return acc
  }, {})

  const unassigned = employees.filter(e => !e.department_id)

  const displayDepts = filterDept
    ? departments.filter(d => d.id === filterDept)
    : departments

  const deptWithMost = departments.reduce((best, d) => {
    const count = grouped[d.id]?.employees.length || 0
    if (!best || count > (grouped[best.id]?.employees.length || 0)) return d
    return best
  }, null)

  const handleExport = () => {
    const rows = employees.map(e => ({
      Name: e.name,
      Department: e.departments?.name || '—',
      Designation: e.designations?.title || '—',
      Status: e.status,
    }))
    exportXLSX(rows, `OrgChart_${dateTag()}`)
  }

  return (
    <div>
      <PageHeader title="Organisation Chart">
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>
          <span className="material-icons">download</span> Export
        </button>
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
            <KPICard label="Total Employees" value={employees.length} icon="groups" />
            <KPICard label="Total Departments" value={departments.length} icon="account_tree" color="blue" />
            <KPICard
              label="Largest Department"
              value={deptWithMost ? deptWithMost.name : '—'}
              sub={deptWithMost ? `${grouped[deptWithMost.id]?.employees.length || 0} staff` : undefined}
              icon="star"
              color="gold"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <select className="form-control" style={{ width: 'auto', minWidth: 200 }}
              value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {filterDept && (
              <button className="btn btn-secondary btn-sm" onClick={() => setFilterDept('')}>
                Clear
              </button>
            )}
          </div>

          {displayDepts.length === 0 && unassigned.length === 0 ? (
            <EmptyState icon="account_tree" message="No active employees found." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {displayDepts.map(dept => {
                const deptEmployees = grouped[dept.id]?.employees || []
                return (
                  <div key={dept.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: 'var(--surface)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--gold)10',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>
                          corporate_fare
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{dept.name}</span>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
                        background: 'var(--gold)22', color: 'var(--gold)',
                        border: '1px solid var(--gold)44',
                      }}>
                        {deptEmployees.length} {deptEmployees.length === 1 ? 'employee' : 'employees'}
                      </span>
                    </div>
                    {deptEmployees.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                        No active employees
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16,
                      }}>
                        {deptEmployees.map(emp => (
                          <div key={emp.id} style={{
                            minWidth: 160, maxWidth: 200,
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '12px 14px',
                            background: 'var(--surface)',
                            display: 'flex', flexDirection: 'column', gap: 4,
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'var(--gold)22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              marginBottom: 6,
                            }}>
                              <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>person</span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{emp.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                              {emp.designations?.title || '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {!filterDept && unassigned.length > 0 && (
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--surface)',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--text-dim)08',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 20 }}>
                        help_outline
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-dim)' }}>
                        Unassigned
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
                      background: 'var(--text-dim)18', color: 'var(--text-dim)',
                      border: '1px solid var(--text-dim)44',
                    }}>
                      {unassigned.length} {unassigned.length === 1 ? 'employee' : 'employees'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16 }}>
                    {unassigned.map(emp => (
                      <div key={emp.id} style={{
                        minWidth: 160, maxWidth: 200,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '12px 14px',
                        background: 'var(--surface)',
                        display: 'flex', flexDirection: 'column', gap: 4,
                        opacity: 0.75,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'var(--text-dim)18',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginBottom: 6,
                        }}>
                          <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 20 }}>person</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          {emp.designations?.title || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
