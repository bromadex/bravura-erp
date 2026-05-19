import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

function dateRange(start, end) {
  const out = []
  const cur = new Date(start)
  const stop = new Date(end)
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const aWeekFromNow = () => {
  const d = new Date(); d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

export default function ShiftAssignmentTool() {
  const canEdit = useCanEdit('hr', 'shift-assignments')
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [shiftTypes, setShiftTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shiftTypeId, setShiftTypeId] = useState('')
  const [fromDate, setFromDate] = useState(todayStr())
  const [toDate, setToDate] = useState(aWeekFromNow())
  const [deptFilter, setDeptFilter] = useState('')
  const [selected, setSelected] = useState(new Set())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empRes, deptRes, stRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id').eq('status', 'Active').order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('shift_types').select('id, name').order('name'),
    ])
    if (empRes.error) toast.error(empRes.error.message)
    setEmployees(empRes.data || [])
    setDepartments(deptRes.data || [])
    setShiftTypes(stRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filteredEmps = useMemo(() => deptFilter ? employees.filter(e => e.department_id === deptFilter) : employees, [employees, deptFilter])

  const toggleEmp = (id) => {
    setSelected(s => {
      const ns = new Set(s)
      if (ns.has(id)) ns.delete(id); else ns.add(id)
      return ns
    })
  }

  const toggleAll = () => {
    if (selected.size === filteredEmps.length) setSelected(new Set())
    else setSelected(new Set(filteredEmps.map(e => e.id)))
  }

  const apply = async () => {
    if (!shiftTypeId) { toast.error('Select a shift type'); return }
    if (selected.size === 0) { toast.error('Select at least one employee'); return }
    if (!fromDate || !toDate) { toast.error('Select date range'); return }

    setSaving(true)
    try {
      const dates = dateRange(fromDate, toDate)
      const rows = []
      for (const empId of selected) {
        for (const d of dates) {
          rows.push({
            id: crypto.randomUUID(),
            employee_id: empId,
            shift_type_id: shiftTypeId,
            start_date: d,
            end_date: d,
          })
        }
      }
      const { error } = await supabase.from('shift_assignments').insert(rows)
      if (error) throw error
      toast.success(`Created ${rows.length} shift assignment(s)`)
      setSelected(new Set())
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div><PageHeader title="Shift Assignment Tool" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Shift Assignment Tool" subtitle="Bulk-assign a shift type to multiple employees over a date range">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={apply} disabled={saving || selected.size === 0}>
            <span className="material-icons">done_all</span>
            {saving ? 'Applying…' : `Apply to ${selected.size} employee(s)`}
          </button>
        )}
      </PageHeader>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div className="form-group">
            <label>Shift Type *</label>
            <select className="form-control" value={shiftTypeId} onChange={e => setShiftTypeId(e.target.value)}>
              <option value="">Select shift…</option>
              {shiftTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>From Date *</label>
            <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To Date *</label>
            <input className="form-control" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Department Filter</label>
            <select className="form-control" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        {fromDate && toDate && shiftTypeId && selected.size > 0 && (
          <div style={{ marginTop: 14, padding: 10, background: 'var(--blue)11', border: '1px solid var(--blue)44', borderRadius: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Preview:</span> {selected.size} employee(s) × {dateRange(fromDate, toDate).length} day(s) = <strong>{selected.size * dateRange(fromDate, toDate).length} shift assignment(s)</strong>
          </div>
        )}
      </div>

      {filteredEmps.length === 0
        ? <EmptyState icon="people" message="No employees match the filter" />
        : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.size === filteredEmps.length && filteredEmps.length > 0} onChange={toggleAll} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Select All ({filteredEmps.length})</span>
              </label>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{selected.size} selected</span>
            </div>
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {filteredEmps.map(emp => (
                <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected.has(emp.id) ? 'var(--gold)11' : 'transparent' }}>
                  <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{emp.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>{departments.find(d => d.id === emp.department_id)?.name || ''}</span>
                </label>
              ))}
            </div>
          </div>
        )}
    </div>
  )
}
