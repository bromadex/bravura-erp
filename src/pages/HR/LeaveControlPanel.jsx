// src/pages/HR/LeaveControlPanel.jsx
// Bulk leave allocation tool — 4-step workflow
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, EmptyState } from '../../components/ui'

const CURRENT_YEAR = new Date().getFullYear()

// ── Step indicator ─────────────────────────────────────────────
function StepIndicator({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => i + 1).map(step => (
        <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            background: step === current ? 'var(--gold)' : step < current ? 'var(--green)' : 'var(--surface2)',
            color: step <= current ? '#fff' : 'var(--text-dim)',
            border: `2px solid ${step === current ? 'var(--gold)' : step < current ? 'var(--green)' : 'var(--border)'}`,
            flexShrink: 0,
          }}>
            {step < current ? '✓' : step}
          </div>
          {step < total && (
            <div style={{ width: 40, height: 2, background: step < current ? 'var(--green)' : 'var(--border)', borderRadius: 1 }} />
          )}
        </div>
      ))}
      <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-dim)' }}>Step {current} of {total}</span>
    </div>
  )
}

export default function LeaveControlPanel() {
  const { employees: ctxEmployees } = useHR()

  const [leaveTypes,  setLeaveTypes]  = useState([])
  const [balances,    setBalances]    = useState([])
  const [loading,     setLoading]     = useState(false)
  const [applying,    setApplying]    = useState(false)

  // Workflow state
  const [step,            setStep]            = useState(1)
  const [year,            setYear]            = useState(CURRENT_YEAR)
  const [leaveTypeId,     setLeaveTypeId]     = useState('')
  const [selectedIds,     setSelectedIds]     = useState([])
  const [allocMode,       setAllocMode]       = useState('same') // 'same' | 'individual'
  const [sameForAll,      setSameForAll]      = useState('')
  const [individualAlloc, setIndividualAlloc] = useState({}) // empId -> days string

  const activeEmployees = (ctxEmployees || []).filter(e => e.status === 'Active' || e.status === 'active')

  // Fetch leave types (active)
  useEffect(() => {
    supabase.from('leave_types').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setLeaveTypes(data || []))
  }, [])

  // Fetch balances for selected year
  const fetchBalances = useCallback(async () => {
    if (!year || !leaveTypeId) return
    setLoading(true)
    const { data } = await supabase
      .from('leave_balances')
      .select('id, employee_id, leave_type_id, year, total_days, used_days, remaining_days')
      .eq('year', year)
      .eq('leave_type_id', leaveTypeId)
    setBalances(data || [])
    setLoading(false)
  }, [year, leaveTypeId])

  useEffect(() => { if (step >= 2) fetchBalances() }, [step, fetchBalances])

  const getBalance = (empId) => balances.find(b => b.employee_id === empId)?.total_days ?? '—'

  const toggleEmp = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  const selectAll   = () => setSelectedIds(activeEmployees.map(e => e.id))
  const deselectAll = () => setSelectedIds([])

  const getDeptName = (emp) => emp.department || emp.department_id || '—'

  // Get new allocation value for a specific employee
  const getAllocValue = (empId) => {
    if (allocMode === 'same') return parseFloat(sameForAll) || 0
    return parseFloat(individualAlloc[empId] || '') || 0
  }

  const selectedEmployees = activeEmployees.filter(e => selectedIds.includes(e.id))

  // Apply allocation
  const handleApply = async () => {
    if (!leaveTypeId) { toast.error('Leave type is required'); return }
    if (selectedIds.length === 0) { toast.error('No employees selected'); return }

    const upserts = selectedEmployees.map(emp => ({
      id:            crypto.randomUUID(),
      employee_id:   emp.id,
      leave_type_id: leaveTypeId,
      year:          year,
      total_days:    getAllocValue(emp.id),
      used_days:     balances.find(b => b.employee_id === emp.id)?.used_days ?? 0,
      remaining_days: Math.max(
        getAllocValue(emp.id) - (balances.find(b => b.employee_id === emp.id)?.used_days ?? 0),
        0
      ),
    }))

    setApplying(true)
    try {
      const { error } = await supabase
        .from('leave_balances')
        .upsert(upserts, { onConflict: 'employee_id,leave_type_id,year' })
      if (error) throw error
      toast.success(`Leave balances applied for ${upserts.length} employee(s)`)
      // Reset
      setStep(1)
      setLeaveTypeId('')
      setSelectedIds([])
      setSameForAll('')
      setIndividualAlloc({})
      setBalances([])
    } catch (err) { toast.error(err.message) }
    finally { setApplying(false) }
  }

  return (
    <div>
      <PageHeader title="Leave Control Panel" />

      <div style={{ maxWidth: 800 }}>
        <StepIndicator current={step} total={4} />

        {/* ── STEP 1: Year & Leave Type ── */}
        {step === 1 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--text)' }}>Select Year &amp; Leave Type</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div className="form-group">
                <label>Year</label>
                <input
                  type="number"
                  className="form-control"
                  value={year}
                  min={2000}
                  max={2099}
                  onChange={e => setYear(parseInt(e.target.value) || CURRENT_YEAR)}
                />
              </div>
              <div className="form-group">
                <label>Leave Type *</label>
                <select className="form-control" value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
                  <option value="">— Select leave type —</option>
                  {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!leaveTypeId) { toast.error('Please select a leave type'); return }
                setStep(2)
              }}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── STEP 2: Select Employees ── */}
        {step === 2 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Select Employees
                <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>({selectedIds.length} selected)</span>
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={selectAll}>Select All</button>
                <button className="btn btn-secondary btn-sm" onClick={deselectAll}>Deselect All</button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
            ) : activeEmployees.length === 0 ? (
              <EmptyState icon="people" message="No active employees found." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
                {activeEmployees.map(emp => {
                  const checked  = selectedIds.includes(emp.id)
                  const balance  = getBalance(emp.id)
                  return (
                    <label
                      key={emp.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                        background: checked ? 'var(--gold)11' : 'var(--surface2)',
                        border: `1.5px solid ${checked ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleEmp(emp.id)} style={{ marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{getDeptName(emp)}</div>
                        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>
                          Current: {balance === '—' ? '—' : `${balance} days`}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (selectedIds.length === 0) { toast.error('Select at least one employee'); return }
                  // Pre-fill individual alloc with current values
                  const init = {}
                  selectedIds.forEach(id => {
                    const bal = balances.find(b => b.employee_id === id)
                    init[id] = bal?.total_days?.toString() || ''
                  })
                  setIndividualAlloc(init)
                  setStep(3)
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Set Allocation ── */}
        {step === 3 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Set Allocation</h3>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
              {[{ id: 'same', label: 'Same for All' }, { id: 'individual', label: 'Individual' }].map(m => (
                <button
                  key={m.id}
                  onClick={() => setAllocMode(m.id)}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: allocMode === m.id ? 'var(--gold)' : 'transparent',
                    color: allocMode === m.id ? '#fff' : 'var(--text-dim)',
                  }}
                >{m.label}</button>
              ))}
            </div>

            {allocMode === 'same' ? (
              <div className="form-group" style={{ maxWidth: 200 }}>
                <label>Days for all selected employees</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  step={0.5}
                  value={sameForAll}
                  onChange={e => setSameForAll(e.target.value)}
                  placeholder="e.g. 21"
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, maxHeight: 400, overflowY: 'auto' }}>
                {selectedEmployees.map(emp => (
                  <div key={emp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, alignItems: 'center', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        Current: {getBalance(emp.id) === '—' ? '—' : `${getBalance(emp.id)} days`}
                      </div>
                    </div>
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      step={0.5}
                      value={individualAlloc[emp.id] ?? ''}
                      onChange={e => setIndividualAlloc(prev => ({ ...prev, [emp.id]: e.target.value }))}
                      placeholder="Days"
                      style={{ textAlign: 'center' }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setStep(2)}>← Previous</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (allocMode === 'same' && !sameForAll) { toast.error('Enter days allocation'); return }
                  setStep(4)
                }}
              >
                Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Preview & Apply ── */}
        {step === 4 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Preview &amp; Apply</h3>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              {leaveTypes.find(lt => lt.id === leaveTypeId)?.name} · {year} · {selectedEmployees.length} employees
            </div>

            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'right' }}>Current (days)</th>
                    <th style={{ textAlign: 'right' }}>New (days)</th>
                    <th style={{ textAlign: 'right' }}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEmployees.map(emp => {
                    const current    = parseFloat(getBalance(emp.id)) || 0
                    const newDays    = getAllocValue(emp.id)
                    const diff       = newDays - current
                    const isIncrease = diff > 0
                    const isDecrease = diff < 0
                    return (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: 600 }}>{emp.name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{getDeptName(emp)}</td>
                        <td style={{ textAlign: 'right' }}>{getBalance(emp.id) === '—' ? '—' : current}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold)' }}>{newDays}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: isIncrease ? 'var(--green)' : isDecrease ? 'var(--red)' : 'var(--text-dim)' }}>
                          {diff === 0 ? '—' : `${isIncrease ? '+' : ''}${diff}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep(3)}>← Back</button>
              <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? 'Applying…' : 'Apply Allocation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
