// src/pages/HR/HRReports.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, TabNav, KPICard, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, exportAoa, dateTag } from '../../engine/reportingEngine'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Monthly Attendance ────────────────────────────────────────────────────
function MonthlyAttendanceTab() {
  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows,  setRows]  = useState([])
  const [days,  setDays]  = useState([])
  const [loading, setLoading] = useState(false)
  const [deptFilter, setDeptFilter] = useState('')
  const [depts, setDepts] = useState([])

  useEffect(() => {
    supabase.from('departments').select('id,name').order('name').then(({ data }) => setDepts(data || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const daysInMonth = new Date(year, month, 0).getDate()
    const end   = `${year}-${String(month).padStart(2,'0')}-${daysInMonth}`
    setDays(Array.from({ length: daysInMonth }, (_, i) => i + 1))

    let empQ = supabase.from('employees').select('id,name,department_id,departments:department_id(name)').eq('status','Active').order('name')
    if (deptFilter) empQ = empQ.eq('department_id', deptFilter)
    const { data: emps } = await empQ

    const { data: att } = await supabase
      .from('attendance')
      .select('employee_id,attendance_date,status')
      .gte('attendance_date', start)
      .lte('attendance_date', end)

    const attMap = {}
    ;(att || []).forEach(a => {
      const day = parseInt(a.attendance_date.split('-')[2], 10)
      if (!attMap[a.employee_id]) attMap[a.employee_id] = {}
      attMap[a.employee_id][day] = a.status
    })

    setRows((emps || []).map(e => ({ emp: e, days: attMap[e.id] || {} })))
    setLoading(false)
  }, [year, month, deptFilter])

  useEffect(() => { load() }, [load])

  const STATUS_ABBR = { Present: 'P', Absent: 'A', 'Half Day': 'H', 'On Leave': 'L', Holiday: 'Ho', 'Work From Home': 'W' }
  const STATUS_COLOR = { Present: 'var(--green)', Absent: 'var(--red)', 'Half Day': 'var(--yellow)', 'On Leave': 'var(--blue)', Holiday: 'var(--teal)', 'Work From Home': 'var(--purple)' }

  const handleExport = () => {
    const daysArr = Array.from({ length: days.length }, (_, i) => i + 1)
    const header = ['Employee', 'Department', ...daysArr.map(d => `${d}`), 'P','A','H','L']
    const data = rows.map(r => {
      const empDays = daysArr.map(d => STATUS_ABBR[r.days[d]] || '')
      const P = daysArr.filter(d => r.days[d] === 'Present').length
      const A = daysArr.filter(d => r.days[d] === 'Absent').length
      const H = daysArr.filter(d => r.days[d] === 'Half Day').length
      const L = daysArr.filter(d => r.days[d] === 'On Leave').length
      return [r.emp.name, r.emp.departments?.name || '', ...empDays, P, A, H, L]
    })
    exportAoa([header, ...data], `AttendanceSheet_${year}_${String(month).padStart(2,'0')}_${dateTag()}`)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Month</label>
          <select className="form-control" style={{ width:110 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Year</label>
          <input type="number" className="form-control" style={{ width:90 }} value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Department</label>
          <select className="form-control" style={{ width:180 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ marginTop:18 }}>
          <span className="material-icons" style={{ fontSize:14 }}>download</span> Export
        </button>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="calendar_month" message="No attendance data for this period." />
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table className="stock-table" style={{ minWidth: 900, fontSize:11 }}>
            <thead>
              <tr>
                <th style={{ position:'sticky', left:0, background:'var(--surface)', zIndex:2, minWidth:140 }}>Employee</th>
                <th style={{ minWidth:100 }}>Dept</th>
                {days.map(d => <th key={d} style={{ width:28, textAlign:'center', padding:'4px 2px' }}>{d}</th>)}
                <th style={{ width:32, color:'var(--green)' }}>P</th>
                <th style={{ width:32, color:'var(--red)' }}>A</th>
                <th style={{ width:32, color:'var(--yellow)' }}>H</th>
                <th style={{ width:32, color:'var(--blue)' }}>L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const P = days.filter(d => r.days[d] === 'Present').length
                const A = days.filter(d => r.days[d] === 'Absent').length
                const H = days.filter(d => r.days[d] === 'Half Day').length
                const L = days.filter(d => r.days[d] === 'On Leave').length
                return (
                  <tr key={r.emp.id}>
                    <td style={{ position:'sticky', left:0, background:'var(--surface)', fontWeight:600 }}>{r.emp.name}</td>
                    <td style={{ fontSize:11, color:'var(--text-dim)' }}>{r.emp.departments?.name || '—'}</td>
                    {days.map(d => {
                      const s = r.days[d]
                      return (
                        <td key={d} style={{ textAlign:'center', padding:'2px', background: s ? `${STATUS_COLOR[s]}18` : undefined }}>
                          <span style={{ fontSize:10, fontWeight:700, color: s ? STATUS_COLOR[s] : 'var(--text-dim)' }}>
                            {STATUS_ABBR[s] || '·'}
                          </span>
                        </td>
                      )
                    })}
                    <td style={{ textAlign:'center', fontWeight:700, color:'var(--green)' }}>{P}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color:'var(--red)' }}>{A}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color:'var(--yellow)' }}>{H}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color:'var(--blue)' }}>{L}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop:12, fontSize:11, color:'var(--text-dim)', display:'flex', gap:16, flexWrap:'wrap' }}>
        {Object.entries(STATUS_ABBR).map(([k,v]) => (
          <span key={k}><strong style={{ color: STATUS_COLOR[k] }}>{v}</strong> = {k}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Leave Balance ─────────────────────────────────────────────────────────
function LeaveBalanceTab() {
  const [rows,    setRows]    = useState([])
  const [types,   setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: emps }, { data: allocs }, { data: apps }, { data: ltypes }] = await Promise.all([
        supabase.from('employees').select('id,name,department_id,departments:department_id(name)').eq('status','Active').order('name'),
        supabase.from('leave_allocations').select('employee_id,leave_type_id,leave_types:leave_type_id(name),total_days').eq('status','Active'),
        supabase.from('leave_applications').select('employee_id,leave_type_id,total_days,status').in('status',['Approved','Open']),
        supabase.from('leave_types').select('id,name').order('name'),
      ])

      const allocMap = {}
      ;(allocs || []).forEach(a => {
        const lt = a.leave_types?.name || a.leave_type_id
        if (!allocMap[a.employee_id]) allocMap[a.employee_id] = {}
        allocMap[a.employee_id][lt] = (allocMap[a.employee_id][lt] || 0) + Number(a.total_days || 0)
      })
      const usedMap = {}
      ;(apps || []).forEach(a => {
        const lt = a.leave_type_id
        if (!usedMap[a.employee_id]) usedMap[a.employee_id] = {}
        usedMap[a.employee_id][lt] = (usedMap[a.employee_id][lt] || 0) + Number(a.total_days || 0)
      })

      setTypes(ltypes || [])
      setRows((emps || []).map(e => ({
        emp: e,
        alloc: allocMap[e.id] || {},
        used:  usedMap[e.id]  || {},
      })))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = rows.filter(r => !search || r.emp.name.toLowerCase().includes(search.toLowerCase()))

  const handleExport = () => {
    const header = ['Employee', 'Department', ...types.flatMap(t => [`${t.name} Alloc`, `${t.name} Used`, `${t.name} Bal`])]
    const data = filtered.map(r => [
      r.emp.name,
      r.emp.departments?.name || '',
      ...types.flatMap(t => {
        const alloc = r.alloc[t.name] || 0
        const used  = r.used[t.id]   || 0
        return [alloc, used, alloc - used]
      })
    ])
    exportAoa([header, ...data], `LeaveBalance_${dateTag()}`)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Search Employee</label>
          <input className="form-control" style={{ width:220 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name…" />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ marginTop:18 }}>
          <span className="material-icons" style={{ fontSize:14 }}>download</span> Export
        </button>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="beach_access" message="No leave balance data." />
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table className="stock-table" style={{ fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ position:'sticky', left:0, background:'var(--surface)', zIndex:2 }}>Employee</th>
                <th>Department</th>
                {types.map(t => (
                  <th key={t.id} colSpan={3} style={{ textAlign:'center', borderLeft:'1px solid var(--border)' }}>{t.name}</th>
                ))}
              </tr>
              <tr>
                <th style={{ position:'sticky', left:0, background:'var(--surface)', zIndex:2 }} />
                <th />
                {types.map(t => (
                  ['Alloc','Used','Bal'].map((l, i) => (
                    <th key={`${t.id}-${l}`} style={{ fontSize:10, textAlign:'right', borderLeft: i===0 ? '1px solid var(--border)' : undefined, color: l==='Bal' ? 'var(--green)' : l==='Used' ? 'var(--red)' : undefined }}>{l}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.emp.id}>
                  <td style={{ position:'sticky', left:0, background:'var(--surface)', fontWeight:600 }}>{r.emp.name}</td>
                  <td style={{ fontSize:11, color:'var(--text-dim)' }}>{r.emp.departments?.name || '—'}</td>
                  {types.map((t, ti) => {
                    const alloc = r.alloc[t.name] || 0
                    const used  = r.used[t.id]   || 0
                    const bal   = alloc - used
                    return ['Alloc','Used','Bal'].map((l, i) => (
                      <td key={`${t.id}-${l}`} style={{ textAlign:'right', borderLeft: i===0 ? '1px solid var(--border)' : undefined, color: l==='Bal' ? (bal < 0 ? 'var(--red)' : 'var(--green)') : l==='Used' ? 'var(--red)' : undefined, fontWeight: l==='Bal' ? 700 : undefined }}>
                        {l==='Alloc' ? alloc : l==='Used' ? used : bal}
                      </td>
                    ))
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Salary Register ───────────────────────────────────────────────────────
function SalaryRegisterTab() {
  const now = new Date()
  const [year,        setYear]        = useState(now.getFullYear())
  const [month,       setMonth]       = useState(now.getMonth() + 1)
  const [deptFilter,  setDeptFilter]  = useState('')
  const [depts,       setDepts]       = useState([])
  const [slips,       setSlips]       = useState([])
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    supabase.from('departments').select('id,name').order('name').then(({ data }) => setDepts(data || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const prefix = `${year}-${String(month).padStart(2,'0')}`
    let q = supabase
      .from('salary_slips')
      .select('*, employees(name, designation, department_id, departments:department_id(name))')
      .like('start_date', `${prefix}%`)
      .eq('status','Submitted')
      .order('employees(name)')
    const { data, error } = await q
    if (error) toast.error(error.message)
    let rows = data || []
    if (deptFilter) rows = rows.filter(s => s.employees?.department_id === deptFilter)
    setSlips(rows)
    setLoading(false)
  }, [year, month, deptFilter])

  useEffect(() => { load() }, [load])

  const totalGross  = slips.reduce((a, s) => a + Number(s.gross_pay || 0), 0)
  const totalDeduct = slips.reduce((a, s) => a + Number(s.total_deduction || 0), 0)
  const totalNet    = slips.reduce((a, s) => a + Number(s.net_pay || 0), 0)

  const handleExport = () => {
    const rows = slips.map(s => ({
      'Slip #':       s.slip_number || '',
      Employee:       s.employees?.name || '',
      Department:     s.employees?.departments?.name || '',
      Designation:    s.employees?.designation || '',
      Period:         `${s.start_date} – ${s.end_date}`,
      'Basic Salary': Number(s.basic_salary || 0),
      'Gross Pay':    Number(s.gross_pay    || 0),
      Deductions:     Number(s.total_deduction || 0),
      'Net Pay':      Number(s.net_pay      || 0),
    }))
    exportXLSX(rows, `SalaryRegister_${year}_${String(month).padStart(2,'0')}_${dateTag()}`)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Month</label>
          <select className="form-control" style={{ width:110 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Year</label>
          <input type="number" className="form-control" style={{ width:90 }} value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label style={{ fontSize:11 }}>Department</label>
          <select className="form-control" style={{ width:180 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ marginTop:18 }}>
          <span className="material-icons" style={{ fontSize:14 }}>download</span> Export
        </button>
      </div>

      <div className="kpi-grid" style={{ marginBottom:20 }}>
        <KPICard label="Employees"  value={slips.length}         icon="people"     color="blue"  />
        <KPICard label="Gross Pay"  value={`$${fmt(totalGross)}`} icon="payments"   color="green" />
        <KPICard label="Deductions" value={`$${fmt(totalDeduct)}`}icon="remove"     color="red"   />
        <KPICard label="Net Pay"    value={`$${fmt(totalNet)}`}   icon="account_balance_wallet" color="teal" />
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>
      ) : slips.length === 0 ? (
        <EmptyState icon="receipt_long" message="No submitted salary slips for this period." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Slip #</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Designation</th>
                <th style={{ textAlign:'right' }}>Basic</th>
                <th style={{ textAlign:'right' }}>Gross</th>
                <th style={{ textAlign:'right', color:'var(--red)' }}>Deductions</th>
                <th style={{ textAlign:'right', color:'var(--green)' }}>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight:600, color:'var(--gold)' }}>{s.slip_number || '—'}</td>
                  <td>{s.employees?.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{s.employees?.departments?.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{s.employees?.designation || '—'}</td>
                  <td style={{ textAlign:'right' }}>${fmt(s.basic_salary)}</td>
                  <td style={{ textAlign:'right' }}>${fmt(s.gross_pay)}</td>
                  <td style={{ textAlign:'right', color:'var(--red)' }}>${fmt(s.total_deduction)}</td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'var(--green)' }}>${fmt(s.net_pay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight:800, borderTop:'2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding:'8px 12px' }}>Totals</td>
                <td style={{ textAlign:'right', padding:'8px 6px' }}></td>
                <td style={{ textAlign:'right', padding:'8px 6px' }}>${fmt(totalGross)}</td>
                <td style={{ textAlign:'right', padding:'8px 6px', color:'var(--red)' }}>${fmt(totalDeduct)}</td>
                <td style={{ textAlign:'right', padding:'8px 6px', color:'var(--green)' }}>${fmt(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Recruitment Analytics ─────────────────────────────────────────────────
function RecruitmentAnalyticsTab() {
  const [openings,    setOpenings]    = useState([])
  const [applicants,  setApplicants]  = useState([])
  const [requisitions,setRequisitions]= useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: j }, { data: a }, { data: r }] = await Promise.all([
        supabase.from('job_openings').select('id,job_title,status,no_of_positions,department_id,departments:department_id(name)').order('created_at', { ascending:false }),
        supabase.from('job_applicants').select('id,applicant_name,job_opening_id,status,application_date').order('application_date', { ascending:false }),
        supabase.from('job_requisitions').select('id,designation,status,no_of_positions,department_id,departments:department_id(name)').order('created_at', { ascending:false }),
      ])
      setOpenings(j || [])
      setApplicants(a || [])
      setRequisitions(r || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>

  const STAGES = ['Applied','Screening','Interview','Offer','Hired','Rejected']
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, applicants.filter(a => a.status === s).length]))
  const maxStage = Math.max(1, ...Object.values(stageCounts))

  const STAGE_COLOR = { Applied:'var(--blue)', Screening:'var(--yellow)', Interview:'var(--purple)', Offer:'var(--teal)', Hired:'var(--green)', Rejected:'var(--red)' }

  const openingApplicants = {}
  applicants.forEach(a => {
    if (!openingApplicants[a.job_opening_id]) openingApplicants[a.job_opening_id] = 0
    openingApplicants[a.job_opening_id]++
  })

  const handleExport = () => {
    const rows = openings.map(o => ({
      'Job Title':   o.job_title,
      Department:    o.departments?.name || '',
      Status:        o.status,
      Positions:     o.no_of_positions,
      Applicants:    openingApplicants[o.id] || 0,
    }))
    exportXLSX(rows, `RecruitmentAnalytics_${dateTag()}`)
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom:20 }}>
        <KPICard label="Requisitions"   value={requisitions.length}                          icon="description"  color="blue"   />
        <KPICard label="Job Openings"   value={openings.length}                              icon="work_outline" color="teal"   />
        <KPICard label="Total Applicants" value={applicants.length}                          icon="people"       color="purple" />
        <KPICard label="Hired"          value={applicants.filter(a=>a.status==='Hired').length} icon="check_circle" color="green"  />
      </div>

      {/* Pipeline funnel */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Recruitment Pipeline</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {STAGES.map(s => (
            <div key={s} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:90, fontSize:12, color:'var(--text-dim)', textAlign:'right' }}>{s}</div>
              <div style={{ flex:1, height:26, background:'var(--border)', borderRadius:4, overflow:'hidden', position:'relative' }}>
                <div style={{ height:'100%', width:`${(stageCounts[s] / maxStage) * 100}%`, background: STAGE_COLOR[s], borderRadius:4, transition:'width 0.4s', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6 }}>
                  {stageCounts[s] > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>{stageCounts[s]}</span>}
                </div>
                {stageCounts[s] === 0 && <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'var(--text-dim)' }}>0</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Job openings table */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>Job Openings</div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>
          <span className="material-icons" style={{ fontSize:14 }}>download</span> Export
        </button>
      </div>
      {openings.length === 0 ? (
        <EmptyState icon="work_outline" message="No job openings." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Job Title</th>
                <th>Department</th>
                <th>Positions</th>
                <th>Applicants</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {openings.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight:600 }}>{o.job_title}</td>
                  <td style={{ fontSize:12, color:'var(--text-dim)' }}>{o.departments?.name || '—'}</td>
                  <td style={{ textAlign:'center' }}>{o.no_of_positions}</td>
                  <td style={{ textAlign:'center', fontWeight:700, color:'var(--blue)' }}>{openingApplicants[o.id] || 0}</td>
                  <td>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4,
                      background: o.status==='Open' ? 'var(--green)18' : 'var(--text-dim)18',
                      color: o.status==='Open' ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${o.status==='Open' ? 'var(--green)' : 'var(--text-dim)'}44` }}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Employee Analytics ────────────────────────────────────────────────────
function EmployeeAnalyticsTab() {
  const [employees,  setEmployees]  = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    supabase.from('employees')
      .select('id,name,status,gender,employment_type,department_id,designation,date_of_joining,departments:department_id(name)')
      .order('name')
      .then(({ data }) => { setEmployees(data || []); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner /></div>

  const active   = employees.filter(e => e.status === 'Active')
  const inactive = employees.filter(e => e.status !== 'Active')

  // Dept breakdown
  const deptMap = {}
  active.forEach(e => {
    const d = e.departments?.name || 'Unknown'
    deptMap[d] = (deptMap[d] || 0) + 1
  })
  const deptRows = Object.entries(deptMap).sort((a,b) => b[1]-a[1])
  const maxDept  = Math.max(1, ...deptRows.map(r => r[1]))

  // Gender breakdown
  const genderMap = {}
  active.forEach(e => { const g = e.gender || 'Unknown'; genderMap[g] = (genderMap[g] || 0) + 1 })

  // Employment type
  const typeMap = {}
  active.forEach(e => { const t = e.employment_type || 'Unknown'; typeMap[t] = (typeMap[t] || 0) + 1 })

  // Tenure buckets
  const now = new Date()
  const tenure = { '<1yr':0, '1-3yr':0, '3-5yr':0, '5+yr':0 }
  active.forEach(e => {
    if (!e.date_of_joining) return
    const yrs = (now - new Date(e.date_of_joining)) / (1000 * 60 * 60 * 24 * 365.25)
    if (yrs < 1) tenure['<1yr']++
    else if (yrs < 3) tenure['1-3yr']++
    else if (yrs < 5) tenure['3-5yr']++
    else tenure['5+yr']++
  })

  const DEPT_COLORS = ['var(--blue)','var(--teal)','var(--green)','var(--purple)','var(--yellow)','var(--gold)','var(--red)']

  const handleExport = () => {
    const rows = employees.map(e => ({
      Name:             e.name,
      Department:       e.departments?.name || '',
      Designation:      e.designation || '',
      Status:           e.status,
      Gender:           e.gender || '',
      'Employment Type': e.employment_type || '',
      'Date of Joining': e.date_of_joining || '',
    }))
    exportXLSX(rows, `EmployeeAnalytics_${dateTag()}`)
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom:24 }}>
        <KPICard label="Total Employees" value={employees.length}   icon="people"         color="blue"   />
        <KPICard label="Active"          value={active.length}      icon="check_circle"   color="green"  />
        <KPICard label="Inactive/Left"   value={inactive.length}    icon="person_off"     color="red"    />
        <KPICard label="Departments"     value={Object.keys(deptMap).length} icon="domain" color="teal"  />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
        {/* Dept headcount bar chart */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>Headcount by Department</div>
            <button className="btn btn-xs btn-secondary" onClick={handleExport}>
              <span className="material-icons" style={{ fontSize:13 }}>download</span>
            </button>
          </div>
          {deptRows.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--text-dim)' }}>No data</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {deptRows.map(([name, count], i) => (
                <div key={name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:110, fontSize:11, color:'var(--text-dim)', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={name}>{name}</div>
                  <div style={{ flex:1, height:20, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(count/maxDept)*100}%`, background: DEPT_COLORS[i % DEPT_COLORS.length], borderRadius:3, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>{count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gender + Type + Tenure */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Gender */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Gender Breakdown</div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {Object.entries(genderMap).map(([g, n]) => (
                <div key={g} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--gold)' }}>{n}</div>
                  <div style={{ fontSize:11, color:'var(--text-dim)' }}>{g}</div>
                  <div style={{ fontSize:11, color:'var(--text-dim)' }}>{Math.round((n/active.length)*100)}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Employment Type */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Employment Type</div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {Object.entries(typeMap).map(([t, n]) => (
                <div key={t} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--teal)' }}>{n}</div>
                  <div style={{ fontSize:11, color:'var(--text-dim)' }}>{t}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tenure */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Tenure Distribution</div>
            <div style={{ display:'flex', gap:16 }}>
              {Object.entries(tenure).map(([label, n]) => (
                <div key={label} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:'var(--purple)' }}>{n}</div>
                  <div style={{ fontSize:11, color:'var(--text-dim)' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full employee table */}
      <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>All Employees</div>
      <div className="table-wrap">
        <table className="stock-table" style={{ fontSize:12 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Type</th>
              <th>Gender</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} style={{ opacity: e.status === 'Active' ? 1 : 0.55 }}>
                <td style={{ fontWeight:600 }}>{e.name}</td>
                <td style={{ color:'var(--text-dim)' }}>{e.departments?.name || '—'}</td>
                <td style={{ color:'var(--text-dim)' }}>{e.designation || '—'}</td>
                <td>{e.employment_type || '—'}</td>
                <td>{e.gender || '—'}</td>
                <td style={{ color:'var(--text-dim)' }}>{e.date_of_joining || '—'}</td>
                <td>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                    background: e.status==='Active' ? 'var(--green)18' : 'var(--red)18',
                    color: e.status==='Active' ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${e.status==='Active' ? 'var(--green)' : 'var(--red)'}44` }}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
const TABS = [
  { id:'attendance', label:'Monthly Attendance', icon:'calendar_month'   },
  { id:'leave',      label:'Leave Balance',       icon:'beach_access'     },
  { id:'salary',     label:'Salary Register',     icon:'receipt_long'     },
  { id:'recruit',    label:'Recruitment',         icon:'work_outline'     },
  { id:'employees',  label:'Employee Analytics',  icon:'bar_chart'        },
]

export default function HRReports() {
  const [tab, setTab] = useState('attendance')

  return (
    <div>
      <PageHeader title="HR Reports" />
      <TabNav
        tabs={TABS.map(t => ({ id: t.id, label: t.label }))}
        active={tab}
        onChange={setTab}
      />
      <div style={{ marginTop:20 }}>
        {tab === 'attendance' && <MonthlyAttendanceTab />}
        {tab === 'leave'      && <LeaveBalanceTab />}
        {tab === 'salary'     && <SalaryRegisterTab />}
        {tab === 'recruit'    && <RecruitmentAnalyticsTab />}
        {tab === 'employees'  && <EmployeeAnalyticsTab />}
      </div>
    </div>
  )
}
