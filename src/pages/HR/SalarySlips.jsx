// src/pages/HR/SalarySlips.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard, ModalDialog, ModalActions, Spinner,
} from '../../components/ui'

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_COLOR = { Draft: 'yellow', Submitted: 'green', Cancelled: 'red' }

export default function SalarySlips() {
  const { user } = useAuth()

  const [slips,        setSlips]        = useState([])
  const [employees,    setEmployees]    = useState([])
  const [designations, setDesignations] = useState([])
  const [departments,  setDepartments]  = useState([])
  const [loading,      setLoading]      = useState(true)

  const [filterEmp,    setFilterEmp]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth,  setFilterMonth]  = useState('')
  const [filterYear,   setFilterYear]   = useState(String(new Date().getFullYear()))

  const [payslip,     setPayslip]     = useState(null)
  const [slipComps,   setSlipComps]   = useState([])
  const [loadingSlip, setLoadingSlip] = useState(false)

  const fetchSlips = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('salary_slips')
        .select('*, employees(id, name, designation_id, department_id, departments:department_id(name))')
        .order('created_at', { ascending: false })
      if (error) throw error
      setSlips(data || [])
    } catch (err) {
      toast.error('Failed to load salary slips: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMeta = useCallback(async () => {
    const [{ data: emps }, { data: desigs }, { data: depts }] = await Promise.all([
      supabase.from('employees').select('id,name,employee_number').eq('status','Active').order('name'),
      supabase.from('designations').select('id,title'),
      supabase.from('departments').select('id,name'),
    ])
    setEmployees(emps || [])
    setDesignations(desigs || [])
    setDepartments(depts || [])
  }, [])

  useEffect(() => { fetchSlips(); fetchMeta() }, [fetchSlips, fetchMeta])

  const openPayslip = async (slip) => {
    setPayslip(slip)
    setLoadingSlip(true)
    const { data } = await supabase
      .from('salary_slip_components')
      .select('*')
      .eq('slip_id', slip.id)
      .order('sort_order')
    setSlipComps(data || [])
    setLoadingSlip(false)
  }

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const filtered = slips.filter(s => {
    if (filterEmp    && s.employee_id !== filterEmp)     return false
    if (filterStatus && s.status !== filterStatus)       return false
    if (filterYear) {
      const y = filterYear
      if (!s.start_date?.startsWith(y) && !s.end_date?.startsWith(y)) return false
    }
    if (filterMonth) {
      const m = filterMonth.padStart(2, '0')
      const yr = filterYear || String(now.getFullYear())
      const prefix = `${yr}-${m}`
      if (!s.start_date?.startsWith(prefix) && !s.end_date?.startsWith(prefix)) return false
    }
    return true
  })

  const totalThisMonth = slips
    .filter(s => s.status === 'Submitted' && s.start_date >= thisMonthStart && s.start_date <= thisMonthEnd)
    .reduce((a, s) => a + Number(s.net_pay || 0), 0)

  const desgMap = Object.fromEntries(designations.map(d => [d.id, d.title]))
  const earnings  = slipComps.filter(c => c.component_type === 'earning')
  const deductions = slipComps.filter(c => c.component_type === 'deduction')

  return (
    <div>
      <PageHeader title="Salary Slips" />

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Slips"    value={slips.length}                                            icon="receipt_long"   color="blue"   />
        <KPICard label="Draft"          value={slips.filter(s => s.status === 'Draft').length}          icon="drafts"         color="yellow" />
        <KPICard label="Submitted"      value={slips.filter(s => s.status === 'Submitted').length}      icon="check_circle"   color="green"  />
        <KPICard label="Net This Month" value={`$${fmt(totalThisMonth)}`}                               icon="payments"       color="teal"   />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Employee</label>
          <select className="form-control" style={{ width: 200 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Month</label>
          <select className="form-control" style={{ width: 120 }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">All</option>
            {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) =>
              <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>
            )}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Year</label>
          <input type="number" className="form-control" style={{ width: 90 }} value={filterYear} onChange={e => setFilterYear(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Status</label>
          <select className="form-control" style={{ width: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option>Draft</option><option>Submitted</option><option>Cancelled</option>
          </select>
        </div>
        {(filterEmp || filterStatus || filterMonth) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterStatus(''); setFilterMonth('') }}>
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="receipt_long" message="No salary slips found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Slip #</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Period</th>
                <th>Basic</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{s.slip_number || '—'}</td>
                  <td>{s.employees?.name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.employees?.departments?.name || '—'}</td>
                  <td style={{ fontSize: 12 }}>{s.start_date} – {s.end_date}</td>
                  <td>${fmt(s.basic_salary)}</td>
                  <td>${fmt(s.gross_pay)}</td>
                  <td style={{ color: 'var(--red)' }}>${fmt(s.total_deduction)}</td>
                  <td style={{ fontWeight: 700 }}>${fmt(s.net_pay)}</td>
                  <td>
                    <StatusBadge status={s.status?.toLowerCase()} label={s.status} color={STATUS_COLOR[s.status]} />
                  </td>
                  <td>
                    <button className="btn btn-xs btn-secondary" onClick={() => openPayslip(s)}>
                      <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payslip Modal */}
      {payslip && (
        <ModalDialog open={!!payslip} onClose={() => { setPayslip(null); setSlipComps([]) }} title={`Payslip — ${payslip.employees?.name}`} size="lg">
          {loadingSlip ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : (
            <div style={{ padding: 20 }} id="payslip-print">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>BRAVURA MINING</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Kamativi, Zimbabwe</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>PAYSLIP</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{payslip.slip_number}</div>
                  <StatusBadge status={payslip.status?.toLowerCase()} label={payslip.status} />
                </div>
              </div>

              {/* Employee Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, fontSize: 13 }}>
                <div><strong>Employee:</strong> {payslip.employees?.name}</div>
                <div><strong>Department:</strong> {payslip.employees?.departments?.name || '—'}</div>
                <div><strong>Designation:</strong> {desgMap[payslip.employees?.designation_id] || '—'}</div>
                <div><strong>Period:</strong> {payslip.start_date} – {payslip.end_date}</div>
                <div><strong>Working Days:</strong> {payslip.working_days}</div>
                <div><strong>Payment Days:</strong> {payslip.payment_days}</div>
                <div><strong>Absent Days:</strong> {payslip.absent_days}</div>
                <div><strong>LWP Days:</strong> {payslip.lwp_days}</div>
              </div>

              {/* Earnings & Deductions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--green)' }}>EARNINGS</div>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 0', color: 'var(--text-dim)' }}>Basic Salary</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>${fmt(payslip.basic_salary)}</td>
                      </tr>
                      {earnings.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--text-dim)' }}>{c.component_name}</td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>${fmt(c.amount)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: '8px 0', fontWeight: 700 }}>Gross Pay</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 800, color: 'var(--green)', fontSize: 14 }}>${fmt(payslip.gross_pay)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--red)' }}>DEDUCTIONS</div>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <tbody>
                      {deductions.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 0', color: 'var(--text-dim)' }}>{c.component_name}</td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>${fmt(c.amount)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: '8px 0', fontWeight: 700 }}>Total Deductions</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 800, color: 'var(--red)', fontSize: 14 }}>${fmt(payslip.total_deduction)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Pay */}
              <div style={{ padding: 16, background: 'var(--gold)18', border: '1px solid var(--gold)44', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>NET PAY</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)' }}>${fmt(payslip.net_pay)}</span>
              </div>

              {/* Payment Info */}
              {(payslip.bank_name || payslip.bank_account_no) && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 20 }}>
                  {payslip.mode_of_payment && <span>Mode: {payslip.mode_of_payment}</span>}
                  {payslip.bank_name && <span>Bank: {payslip.bank_name}</span>}
                  {payslip.bank_account_no && <span>Account: {payslip.bank_account_no}</span>}
                </div>
              )}
            </div>
          )}
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => window.print()}>
              <span className="material-icons" style={{ fontSize: 14 }}>print</span> Print
            </button>
            <button className="btn btn-secondary" onClick={() => { setPayslip(null); setSlipComps([]) }}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
