import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, Spinner, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

const STATUS_COLOR = { Draft: 'var(--text-dim)', Submitted: 'var(--blue)', Approved: 'var(--green)', Paid: 'var(--teal)', Cancelled: 'var(--red)' }

const emptyForm = {
  employee_id: '',
  gratuity_rule_id: '',
  date_of_joining: '',
  last_working_day: '',
  current_applicable_earnings: '',
  currency: 'USD',
  notes: '',
}

export default function GratuityCalculator() {
  const canEdit = useCanEdit('hr', 'gratuity-records')
  const [employees, setEmployees] = useState([])
  const [rules, setRules] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [calculated, setCalculated] = useState(null)

  const fetchMeta = useCallback(async () => {
    setLoading(true)
    const [empRes, ruleRes, recRes] = await Promise.all([
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
      supabase.from('gratuity_rules').select('*, gratuity_rule_slabs(*)').eq('is_active', true).order('name'),
      supabase.from('gratuity').select('*, employees(name)').order('created_at', { ascending: false }).limit(25),
    ])
    if (empRes.error) toast.error(empRes.error.message)
    if (ruleRes.error) toast.error(ruleRes.error.message)
    setEmployees(empRes.data || [])
    setRules(ruleRes.data || [])
    setRecords(recRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMeta() }, [fetchMeta])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setCalculated(null) }

  const calculate = () => {
    const { date_of_joining, last_working_day, current_applicable_earnings, gratuity_rule_id } = form
    if (!date_of_joining || !last_working_day || !current_applicable_earnings || !gratuity_rule_id) {
      toast.error('Fill all required fields first')
      return
    }
    const doj = new Date(date_of_joining)
    const lwd = new Date(last_working_day)
    if (lwd <= doj) { toast.error('Last working day must be after date of joining'); return }
    const years = (lwd - doj) / (1000 * 60 * 60 * 24 * 365.25)
    const rule = rules.find(r => r.id === gratuity_rule_id)
    if (!rule) return
    const sorted = [...(rule.gratuity_rule_slabs || [])].sort((a, b) => a.sort_order - b.sort_order)
    let fraction = 0
    for (const slab of sorted) {
      if (years >= Number(slab.from_year) && (slab.to_year == null || years < Number(slab.to_year))) {
        fraction = Number(slab.fraction_of_applicable_earnings)
        break
      }
    }
    const amount = Number(current_applicable_earnings) * fraction * years
    setCalculated({ years: years.toFixed(2), fraction, amount: amount.toFixed(2) })
  }

  const save = async () => {
    if (!calculated) { toast.error('Calculate first'); return }
    if (!form.employee_id) { toast.error('Select an employee'); return }
    setSaving(true)
    try {
      const payload = {
        id: crypto.randomUUID(),
        ref_number: `GRAT-${Date.now()}`,
        employee_id: form.employee_id,
        gratuity_rule_id: form.gratuity_rule_id || null,
        date_of_joining: form.date_of_joining,
        last_working_day: form.last_working_day,
        current_applicable_earnings: Number(form.current_applicable_earnings),
        currency: form.currency,
        notes: form.notes,
        years_of_service: Number(calculated.years),
        amount: Number(calculated.amount),
        status: 'Draft',
      }
      const { error } = await supabase.from('gratuity').insert(payload)
      if (error) throw error
      toast.success('Gratuity record saved')
      setForm(emptyForm)
      setCalculated(null)
      fetchMeta()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div><PageHeader title="Gratuity" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Gratuity" subtitle="Calculate and record employee gratuity payments" />

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, marginTop: 16 }}>
        {/* Calculator panel */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Calculator</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Gratuity Rule *</label>
              <select className="form-control" value={form.gratuity_rule_id} onChange={e => set('gratuity_rule_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select rule…</option>
                {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Date of Joining *</label>
                <input className="form-control" type="date" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} disabled={!canEdit} />
              </div>
              <div className="form-group">
                <label>Last Working Day *</label>
                <input className="form-control" type="date" value={form.last_working_day} onChange={e => set('last_working_day', e.target.value)} disabled={!canEdit} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
              <div className="form-group">
                <label>Monthly Earnings *</label>
                <input className="form-control" type="number" step="0.01" value={form.current_applicable_earnings} onChange={e => set('current_applicable_earnings', e.target.value)} disabled={!canEdit} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <input className="form-control" value={form.currency} onChange={e => set('currency', e.target.value)} disabled={!canEdit} />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} disabled={!canEdit} />
            </div>

            {calculated && (
              <div style={{ background: 'var(--green)11', border: '1px solid var(--green)44', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Result</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{calculated.years}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Years</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{(calculated.fraction * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Fraction</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{Number(calculated.amount).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{form.currency}</div>
                  </div>
                </div>
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={calculate} style={{ flex: 1 }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>calculate</span>Calculate
                </button>
                <button className="btn btn-primary" onClick={save} disabled={saving || !calculated} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Recent records */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Recent Records</h3>
          {records.length === 0
            ? <EmptyState icon="calculate" message="No gratuity records yet" />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Ref</th><th>Employee</th><th>Years</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.ref_number}</td>
                      <td>{r.employees?.name}</td>
                      <td>{Number(r.years_of_service || 0).toFixed(1)}</td>
                      <td>{Number(r.amount).toLocaleString()} {r.currency}</td>
                      <td><span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 12 }}>{r.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}
