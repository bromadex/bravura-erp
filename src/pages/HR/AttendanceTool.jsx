import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

const STATUSES = [
  { code: 'P', label: 'Present',     color: 'var(--green)' },
  { code: 'A', label: 'Absent',      color: 'var(--red)' },
  { code: 'L', label: 'Leave',       color: 'var(--blue)' },
  { code: 'H', label: 'Half Day',    color: 'var(--gold)' },
  { code: 'O', label: 'Holiday/Off', color: 'var(--text-dim)' },
]
const STATUS_MAP = { P: 'Present', A: 'Absent', L: 'On Leave', H: 'Half Day', O: 'Holiday' }
const REV_MAP    = { Present: 'P', Absent: 'A', 'On Leave': 'L', 'Half Day': 'H', Holiday: 'O' }

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
const aWeekAgo = () => {
  const d = new Date(); d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

export default function AttendanceTool() {
  const canEdit = useCanEdit('hr', 'attendance')
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [existing, setExisting] = useState([])
  const [grid, setGrid] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fromDate, setFromDate] = useState(aWeekAgo())
  const [toDate, setToDate] = useState(todayStr())
  const [deptFilter, setDeptFilter] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empRes, deptRes, attRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id').eq('status', 'Active').order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('attendance').select('id, employee_id, date, status').gte('date', fromDate).lte('date', toDate),
    ])
    if (empRes.error) toast.error(empRes.error.message)
    setEmployees(empRes.data || [])
    setDepartments(deptRes.data || [])
    setExisting(attRes.data || [])
    const g = {}
    for (const a of (attRes.data || [])) {
      g[`${a.employee_id}__${a.date}`] = REV_MAP[a.status] || 'P'
    }
    setGrid(g)
    setLoading(false)
  }, [fromDate, toDate])

  useEffect(() => { fetchAll() }, [fetchAll])

  const dates = useMemo(() => dateRange(fromDate, toDate), [fromDate, toDate])
  const filteredEmps = useMemo(() => deptFilter ? employees.filter(e => e.department_id === deptFilter) : employees, [employees, deptFilter])

  const cycleCell = (empId, date) => {
    if (!canEdit) return
    const key = `${empId}__${date}`
    const current = grid[key]
    const codes = STATUSES.map(s => s.code)
    if (!current) { setGrid(g => ({ ...g, [key]: 'P' })); return }
    const idx = codes.indexOf(current)
    const next = idx === codes.length - 1 ? null : codes[idx + 1]
    setGrid(g => {
      const ng = { ...g }
      if (next) ng[key] = next; else delete ng[key]
      return ng
    })
  }

  const bulkFill = (code) => {
    if (!canEdit) return
    const ng = { ...grid }
    for (const emp of filteredEmps) {
      for (const d of dates) {
        ng[`${emp.id}__${d}`] = code
      }
    }
    setGrid(ng)
    toast.success(`Filled grid with ${STATUS_MAP[code]}`)
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      const rows = []
      for (const [key, code] of Object.entries(grid)) {
        const [employee_id, date] = key.split('__')
        rows.push({ employee_id, date, status: STATUS_MAP[code] })
      }
      const existingByKey = {}
      for (const e of existing) existingByKey[`${e.employee_id}__${e.date}`] = e

      const inserts = []
      const updates = []
      for (const r of rows) {
        const key = `${r.employee_id}__${r.date}`
        const ex = existingByKey[key]
        if (ex) {
          if (ex.status !== r.status) updates.push({ ...r, id: ex.id })
        } else {
          inserts.push({ ...r, id: crypto.randomUUID() })
        }
      }
      // Deletes — existing keys not in grid
      const gridKeys = new Set(Object.keys(grid))
      const deletes = existing.filter(e => !gridKeys.has(`${e.employee_id}__${e.date}`)).map(e => e.id)

      if (inserts.length) {
        const { error } = await supabase.from('attendance').insert(inserts)
        if (error) throw error
      }
      for (const u of updates) {
        const { id, ...rest } = u
        const { error } = await supabase.from('attendance').update(rest).eq('id', id)
        if (error) throw error
      }
      if (deletes.length) {
        const { error } = await supabase.from('attendance').delete().in('id', deletes)
        if (error) throw error
      }
      toast.success(`Saved: ${inserts.length} new, ${updates.length} updated, ${deletes.length} removed`)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div><PageHeader title="Attendance Tool" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Attendance Tool" subtitle="Bulk-mark daily attendance across a date range. Click cells to cycle status.">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save All'}
          </button>
        )}
      </PageHeader>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginTop: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>From</label>
          <input className="form-control" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>To</label>
          <input className="form-control" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Department</label>
          <select className="form-control" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 6, alignSelf: 'center' }}>Bulk fill:</span>
            {STATUSES.map(s => (
              <button key={s.code} className="btn btn-secondary btn-xs" onClick={() => bulkFill(s.code)} style={{ color: s.color, fontWeight: 700 }}>
                {s.code} {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: 'var(--text-dim)' }}>
        {STATUSES.map(s => (
          <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, background: s.color, borderRadius: 3 }} />
            <span>{s.code} = {s.label}</span>
          </div>
        ))}
      </div>

      {filteredEmps.length === 0
        ? <EmptyState icon="people" message="No employees match the filter" />
        : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: '70vh' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 3, minWidth: 180, borderRight: '1px solid var(--border)' }}>Employee</th>
                  {dates.map(d => (
                    <th key={d} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, minWidth: 38, borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                      <div>{d.slice(8)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmps.map(emp => (
                  <tr key={emp.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px', position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', fontWeight: 500 }}>{emp.name}</td>
                    {dates.map(d => {
                      const code = grid[`${emp.id}__${d}`]
                      const s = STATUSES.find(x => x.code === code)
                      return (
                        <td key={d} style={{ padding: 2, textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                          <button
                            onClick={() => cycleCell(emp.id, d)}
                            disabled={!canEdit}
                            style={{ width: '100%', height: 28, border: 'none', background: s ? s.color : 'transparent', color: s ? '#fff' : 'var(--text-dim)', cursor: canEdit ? 'pointer' : 'default', fontWeight: 700, fontSize: 11, borderRadius: 4 }}
                          >
                            {code || ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
        Showing {filteredEmps.length} employee(s) × {dates.length} day(s) = {filteredEmps.length * dates.length} cells. {Object.keys(grid).length} marked.
      </div>
    </div>
  )
}
