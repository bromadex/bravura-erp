import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, ModalDialog, ModalActions, KPICard } from '../../components/ui'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]
const SHIFTS = ['Day', 'Night', 'AM', 'PM']

const SHIFT_COLORS = {
  Day:   { c:'var(--yellow)', b:'color-mix(in srgb,var(--yellow) 12%,var(--surface2))', border:'color-mix(in srgb,var(--yellow) 30%,transparent)' },
  Night: { c:'var(--blue)',   b:'color-mix(in srgb,var(--blue)   12%,var(--surface2))', border:'color-mix(in srgb,var(--blue)   30%,transparent)' },
  AM:    { c:'var(--teal)',   b:'color-mix(in srgb,var(--teal)   12%,var(--surface2))', border:'color-mix(in srgb,var(--teal)   30%,transparent)' },
  PM:    { c:'var(--green)',  b:'color-mix(in srgb,var(--green)  12%,var(--surface2))', border:'color-mix(in srgb,var(--green)  30%,transparent)' },
}

function ShiftBadge({ shift }) {
  const cfg = SHIFT_COLORS[shift] || { c:'var(--text-dim)', b:'var(--surface2)', border:'var(--border)' }
  return <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:cfg.b, color:cfg.c, border:`1px solid ${cfg.border}` }}>{shift || '—'}</span>
}

export default function OperatorAssignments() {
  const { user } = useAuth()

  const [assignments, setAssignments] = useState([])
  const [assets,      setAssets]      = useState([])
  const [employees,   setEmployees]   = useState([])
  const [sites,       setSites]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('current')

  // filters (history tab)
  const [assetFilter, setAssetFilter] = useState('')
  const [empFilter,   setEmpFilter]   = useState('')
  const [fromDate,    setFromDate]    = useState('')
  const [toDate,      setToDate]      = useState('')

  // assign modal
  const [assignOpen,  setAssignOpen]  = useState(false)
  const [form,        setForm]        = useState({ asset_id:'', operator_id:'', assigned_from:new Date().toISOString().slice(0,16), shift:'Day', km_start:'', project_id:'', site_id:'', notes:'' })
  const [saving,      setSaving]      = useState(false)

  // end modal
  const [endRow,      setEndRow]      = useState(null)
  const [endForm,     setEndForm]     = useState({ km_end:'', hours_logged:'', notes:'' })

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [aRes, eRes, sRes, asRes] = await Promise.all([
      supabase.from('asset_operator_assignments').select('*').order('assigned_from', { ascending:false }),
      supabase.from('employees').select('id,name,employee_number').neq('status','Terminated').order('name'),
      supabase.from('sites').select('id,name,code').order('name'),
      supabase.from('asset_registry').select('id,asset_code,plate_number,asset_name').eq('status','Active').order('plate_number'),
    ])
    if (aRes.data)  setAssignments(aRes.data)
    if (eRes.data)  setEmployees(eRes.data)
    if (sRes.data)  setSites(sRes.data)
    if (asRes.data) setAssets(asRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const current = assignments.filter(a => !a.assigned_to)
  const history = assignments.filter(a => {
    if (a.assigned_to === null) return false  // current only in history tab
    if (assetFilter && a.asset_id !== assetFilter) return false
    if (empFilter   && a.operator_id !== empFilter) return false
    if (fromDate && a.assigned_from.slice(0,10) < fromDate) return false
    if (toDate   && a.assigned_from.slice(0,10) > toDate)   return false
    return true
  })

  const assetLabel = (id) => {
    const a = assets.find(x => x.id === id)
    return a ? (a.plate_number || a.asset_name) : id
  }

  const todayAssigned  = new Set(assignments.filter(a => !a.assigned_to).map(a => a.operator_id)).size
  const assetsDeployed = new Set(assignments.filter(a => !a.assigned_to).map(a => a.asset_id)).size

  // ── Utilization per operator (this month) ────────────────────────────────
  const monthStart = today.slice(0, 7) + '-01'
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const workingDays = Math.round(daysInMonth * (5 / 7)) // approximate

  const utilizationMap = {}
  assignments
    .filter(a => a.assigned_from && a.assigned_from.slice(0, 10) >= monthStart)
    .forEach(a => {
      const opId = a.operator_id
      if (!utilizationMap[opId]) utilizationMap[opId] = { name: a.operator_name, daysSet: new Set(), totalHours: 0 }
      // Count each unique day assigned as 1 working day
      const fromDate2 = new Date(a.assigned_from)
      const toDate2   = a.assigned_to ? new Date(a.assigned_to) : new Date()
      // Walk each day in the range
      let d = new Date(fromDate2)
      while (d <= toDate2) {
        const dayStr = d.toISOString().slice(0, 10)
        if (dayStr >= monthStart && d.getDay() !== 0 && d.getDay() !== 6) {
          utilizationMap[opId].daysSet.add(dayStr)
        }
        d.setDate(d.getDate() + 1)
      }
      if (a.hours_logged) utilizationMap[opId].totalHours += parseFloat(a.hours_logged)
    })

  const utilizationList = Object.entries(utilizationMap).map(([id, v]) => ({
    operator_id:   id,
    operator_name: v.name,
    daysAssigned:  v.daysSet.size,
    totalHours:    v.totalHours,
    utilPct:       workingDays > 0 ? Math.min(100, Math.round((v.daysSet.size / workingDays) * 100)) : 0,
  })).sort((a, b) => b.utilPct - a.utilPct)

  const handleAssign = async () => {
    if (!form.asset_id)    return toast.error('Select an asset')
    if (!form.operator_id) return toast.error('Select an operator')
    setSaving(true)
    try {
      const emp = employees.find(e => e.id === form.operator_id)
      const { error } = await supabase.from('asset_operator_assignments').insert([{
        asset_id:      form.asset_id,
        operator_id:   form.operator_id,
        operator_name: emp?.name || '',
        assigned_from: new Date(form.assigned_from).toISOString(),
        shift:         form.shift || null,
        km_start:      form.km_start ? parseFloat(form.km_start) : null,
        project_id:    form.project_id || null,
        site_id:       form.site_id || null,
        notes:         form.notes || null,
        created_by:    user?.name || '',
        created_at:    new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Operator assigned')
      setAssignOpen(false)
      setForm({ asset_id:'', operator_id:'', assigned_from:new Date().toISOString().slice(0,16), shift:'Day', km_start:'', project_id:'', site_id:'', notes:'' })
      await loadAll()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleEndAssignment = async () => {
    const { error } = await supabase.from('asset_operator_assignments').update({
      assigned_to:  new Date().toISOString(),
      km_end:       endForm.km_end      ? parseFloat(endForm.km_end)      : null,
      hours_logged: endForm.hours_logged? parseFloat(endForm.hours_logged): null,
      notes:        endForm.notes       || endRow.notes || null,
    }).eq('id', endRow.id)
    if (error) return toast.error(error.message)
    toast.success('Assignment ended')
    setEndRow(null)
    await loadAll()
  }

  const exportXLSX = () => {
    const rows = (tab === 'current' ? current : history).map(a => ({
      'Asset':        assetLabel(a.asset_id),
      'Operator':     a.operator_name,
      'From':         a.assigned_from,
      'To':           a.assigned_to || '',
      'Shift':        a.shift || '',
      'KM Start':     a.km_start ?? '',
      'KM End':       a.km_end   ?? '',
      'Hours Logged': a.hours_logged ?? '',
      'Project':      a.project_id || '',
      'Notes':        a.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assignments')
    XLSX.writeFile(wb, `OperatorAssignments_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div className="page-container">
      <PageHeader title="Operator Assignments" subtitle="Fleet operator-to-asset assignment ledger" icon="person_pin">
        <button className="btn btn-ghost" onClick={exportXLSX}>
          <span className="material-icons" style={{ fontSize:16 }}>download</span>Export
        </button>
        <button className="btn btn-primary" onClick={() => setAssignOpen(true)}>
          <span className="material-icons" style={{ fontSize:16 }}>person_add</span>Assign Operator
        </button>
      </PageHeader>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24, maxWidth:700 }}>
        <KPICard label="Active Assignments" value={current.length}  icon="engineering"    color="var(--blue)"   />
        <KPICard label="Operators On Duty"  value={todayAssigned}   icon="people"         color="var(--teal)"   />
        <KPICard label="Assets Deployed"    value={assetsDeployed}  icon="directions_car" color="var(--yellow)" />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[['current','Current Assignments'],['history','Assignment History'],['utilization','Utilization']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background:'none', border:'none', cursor:'pointer', padding:'7px 16px',
            fontSize:13, fontWeight: tab===k ? 700 : 500,
            color: tab===k ? 'var(--primary)' : 'var(--text-dim)',
            borderBottom: tab===k ? '2px solid var(--primary)' : '2px solid transparent',
          }}>{l}</button>
        ))}
      </div>

      {/* ── Current ── */}
      {tab === 'current' && (
        loading ? <div style={{ textAlign:'center', padding:60, color:'var(--text-dim)' }}>Loading…</div>
        : current.length === 0 ? <EmptyState icon="engineering" message="No active operator assignments" />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Asset</th><th>Operator</th><th>From</th><th>Shift</th><th>KM Start</th><th>Project</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {current.map(a => (
                  <tr key={a.id}
                    onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                    onMouseOut={e  => e.currentTarget.style.background=''}>
                    <td style={{ fontWeight:600 }}>{assetLabel(a.asset_id)}</td>
                    <td style={{ fontWeight:600 }}>{a.operator_name}</td>
                    <td style={{ fontSize:12 }}>{new Date(a.assigned_from).toLocaleString()}</td>
                    <td><ShiftBadge shift={a.shift} /></td>
                    <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.km_start != null ? Number(a.km_start).toLocaleString() : '—'}</td>
                    <td style={{ fontSize:12 }}>{a.project_id || '—'}</td>
                    <td style={{ fontSize:12, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.notes || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEndRow(a); setEndForm({ km_end:'', hours_logged:'', notes:'' }) }}>
                        End
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── History ── */}
      {tab === 'history' && (
        <div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
            <select className="form-control" style={{ maxWidth:200 }} value={assetFilter} onChange={e => setAssetFilter(e.target.value)}>
              <option value="">All assets</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.plate_number||a.asset_name}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth:200 }} value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
              <option value="">All operators</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input type="date" className="form-control" style={{ width:145 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <input type="date" className="form-control" style={{ width:145 }} value={toDate}   onChange={e => setToDate(e.target.value)} />
            {(assetFilter||empFilter||fromDate||toDate) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setAssetFilter(''); setEmpFilter(''); setFromDate(''); setToDate('') }}>Clear</button>
            )}
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-dim)' }}>{history.length} records</span>
          </div>
          {history.length === 0
            ? <EmptyState icon="history" message="No assignment history matches the filters" />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Asset</th><th>Operator</th><th>From</th><th>To</th><th>Shift</th><th>Hours</th><th>KM Start</th><th>KM End</th><th>Duration</th></tr></thead>
                  <tbody>
                    {history.map(a => {
                      const durationHrs = a.assigned_to && a.assigned_from
                        ? ((new Date(a.assigned_to) - new Date(a.assigned_from)) / 3600000).toFixed(1)
                        : null
                      return (
                        <tr key={a.id}
                          onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                          onMouseOut={e  => e.currentTarget.style.background=''}>
                          <td style={{ fontWeight:600 }}>{assetLabel(a.asset_id)}</td>
                          <td>{a.operator_name}</td>
                          <td style={{ fontSize:12 }}>{new Date(a.assigned_from).toLocaleString()}</td>
                          <td style={{ fontSize:12 }}>{a.assigned_to ? new Date(a.assigned_to).toLocaleString() : '—'}</td>
                          <td><ShiftBadge shift={a.shift} /></td>
                          <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.hours_logged ?? '—'}</td>
                          <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.km_start != null ? Number(a.km_start).toLocaleString() : '—'}</td>
                          <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.km_end   != null ? Number(a.km_end).toLocaleString()   : '—'}</td>
                          <td style={{ fontSize:12, color:'var(--text-dim)' }}>{durationHrs ? `${durationHrs} h` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ── Utilization Tab ── */}
      {tab === 'utilization' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            Operator utilization this month ({today.slice(0, 7)}) · Approx. working days: {workingDays}
          </div>
          {utilizationList.length === 0 ? (
            <EmptyState icon="people" message="No assignment data for this month" />
          ) : (
            <div className="card" style={{ padding: 16 }}>
              {utilizationList.map(u => (
                <div key={u.operator_id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{u.operator_name}</span>
                    <span style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-dim)' }}>{u.daysAssigned} day{u.daysAssigned !== 1 ? 's' : ''}</span>
                      {u.totalHours > 0 && <span style={{ color: 'var(--teal)' }}>{u.totalHours.toFixed(1)} h</span>}
                      <span style={{ fontWeight: 700, color: u.utilPct >= 80 ? 'var(--green)' : u.utilPct >= 50 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                        {u.utilPct}%
                      </span>
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${u.utilPct}%`, height: '100%', borderRadius: 6, transition: 'width .5s ease',
                      background: u.utilPct >= 80 ? 'var(--green)' : u.utilPct >= 50 ? 'var(--yellow)' : 'var(--text-dim)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Assign Modal ─── */}
      {assignOpen && (
        <ModalDialog open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Operator to Asset">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Asset *</label>
              <select className="form-control" value={form.asset_id} onChange={e => setForm(f => ({...f,asset_id:e.target.value}))}>
                <option value="">— Select asset —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.plate_number||a.asset_name} ({a.asset_code})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Operator *</label>
              <select className="form-control" value={form.operator_id} onChange={e => setForm(f => ({...f,operator_id:e.target.value}))}>
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned From</label>
              <input type="datetime-local" className="form-control" value={form.assigned_from} onChange={e => setForm(f => ({...f,assigned_from:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="form-control" value={form.shift} onChange={e => setForm(f => ({...f,shift:e.target.value}))}>
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Starting KM / Hours</label><input type="number" className="form-control" value={form.km_start} onChange={e => setForm(f => ({...f,km_start:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Project / Job</label><input className="form-control" value={form.project_id} onChange={e => setForm(f => ({...f,project_id:e.target.value}))} /></div>
            <div className="form-group">
              <label className="form-label">Site</label>
              <select className="form-control" value={form.site_id} onChange={e => setForm(f => ({...f,site_id:e.target.value}))}>
                <option value="">— None —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setAssignOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssign} disabled={saving}>{saving ? 'Saving…' : 'Assign'}</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── End Assignment Modal ─── */}
      {endRow && (
        <ModalDialog open={!!endRow} onClose={() => setEndRow(null)} title={`End Assignment — ${endRow.operator_name}`}>
          <div style={{ marginBottom:12, fontSize:13, color:'var(--text-dim)' }}>
            Asset: <strong>{assetLabel(endRow.asset_id)}</strong> · Started: <strong>{new Date(endRow.assigned_from).toLocaleString()}</strong>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group"><label className="form-label">Ending KM / Hours</label><input type="number" className="form-control" value={endForm.km_end} onChange={e => setEndForm(f => ({...f,km_end:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Total Hours Logged</label><input type="number" className="form-control" value={endForm.hours_logged} onChange={e => setEndForm(f => ({...f,hours_logged:e.target.value}))} /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={endForm.notes} onChange={e => setEndForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setEndRow(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEndAssignment}>End Assignment</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
