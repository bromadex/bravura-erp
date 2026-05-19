// src/pages/HR/RetentionBonuses.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, Pagination,
} from '../../components/ui'
import toast from 'react-hot-toast'

const PAGE_SIZE = 20
const STATUS_COLORS = { Pending: 'yellow', Vested: 'blue', Paid: 'green', Forfeited: 'red', Cancelled: 'red' }
const BONUS_TYPES = ['Sign-on', 'Retention', 'Milestone', 'Long-Service']
const EMPTY = { employee_id: '', bonus_type: 'Sign-on', total_amount: '', currency: 'USD', signup_date: '', vesting_date: '', notes: '' }

function daysToVest(vestingDate) {
  if (!vestingDate) return null
  return Math.ceil((new Date(vestingDate) - new Date()) / 86400000)
}

function VestingChip({ vestingDate, status }) {
  if (status !== 'Pending') return null
  const days = daysToVest(vestingDate)
  if (days === null) return null
  if (days < 0)  return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--red)22', color: 'var(--red)', fontWeight: 700 }}>Overdue</span>
  if (days === 0) return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--green)22', color: 'var(--green)', fontWeight: 700 }}>Today</span>
  if (days <= 30) return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--yellow)22', color: 'var(--yellow)', fontWeight: 700 }}>{days}d to vest</span>
  return <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-dim)' }}>{days}d</span>
}

export default function RetentionBonuses() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'retention-bonuses')

  const [rows, setRows]           = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [filterEmp, setFilterEmp]       = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)
  const [forfeitModal, setForfeitModal] = useState(null)
  const [forfeitReason, setForfeitReason] = useState('')

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
  const fmt = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id,name').eq('status', 'Active').order('name')
    setEmployees(data || [])
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('retention_bonuses').select('*', { count: 'exact' })
    if (filterEmp)    q = q.eq('employee_id', filterEmp)
    if (filterType)   q = q.eq('bonus_type', filterType)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data, count, error } = await q
      .order('vesting_date', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) { toast.error('Failed to load retention bonuses: ' + error.message); setLoading(false); return }
    setRows(data || []); setTotal(count || 0); setLoading(false)
  }, [filterEmp, filterType, filterStatus, page])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => {
    setEditing(r.id)
    setForm({ employee_id: r.employee_id, bonus_type: r.bonus_type, total_amount: r.total_amount, currency: r.currency, signup_date: r.signup_date, vesting_date: r.vesting_date, notes: r.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.employee_id) return toast.error('Select an employee')
    if (!form.signup_date || !form.vesting_date) return toast.error('Both dates required')
    if (form.vesting_date < form.signup_date) return toast.error('Vesting date must be after signup date')
    if (!form.total_amount || Number(form.total_amount) <= 0) return toast.error('Amount must be > 0')
    setSaving(true)
    const payload = { employee_id: form.employee_id, bonus_type: form.bonus_type, total_amount: Number(form.total_amount), currency: form.currency, signup_date: form.signup_date, vesting_date: form.vesting_date, notes: form.notes, updated_at: new Date().toISOString() }
    let error
    if (editing) {
      ;({ error } = await supabase.from('retention_bonuses').update(payload).eq('id', editing))
    } else {
      payload.created_by = user?.id; payload.ref_number = 'RB-' + Date.now(); payload.status = 'Pending'; payload.vesting_status = 'Pending'
      ;({ error } = await supabase.from('retention_bonuses').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Retention bonus updated' : 'Retention bonus created')
    setModal(false); fetchRows()
  }

  const markVested = async id => {
    const { error } = await supabase.from('retention_bonuses').update({ status: 'Vested', vesting_status: 'Vested', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Marked as Vested'); fetchRows(); setConfirm(null)
  }

  const markPaid = async id => {
    const { error } = await supabase.from('retention_bonuses').update({ status: 'Paid', paid_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Marked as Paid'); fetchRows(); setConfirm(null)
  }

  const markForfeited = async () => {
    if (!forfeitReason.trim()) return toast.error('Forfeiture reason is required')
    const { error } = await supabase.from('retention_bonuses').update({ status: 'Forfeited', vesting_status: 'Forfeited', forfeiture_reason: forfeitReason, updated_at: new Date().toISOString() }).eq('id', forfeitModal.id)
    if (error) return toast.error(error.message)
    toast.success('Marked as Forfeited'); fetchRows(); setForfeitModal(null); setForfeitReason('')
  }

  const markCancelled = async id => {
    const { error } = await supabase.from('retention_bonuses').update({ status: 'Cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Cancelled'); fetchRows(); setConfirm(null)
  }

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title="Retention Bonuses" subtitle="Sign-on, retention, milestone & long-service bonuses with vesting schedules">
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ New Bonus</button>}
      </PageHeader>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterEmp} onChange={e => { setFilterEmp(e.target.value); setPage(0) }} className="input" style={{ minWidth: 200 }}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0) }} className="input" style={{ minWidth: 150 }}>
          <option value="">All Types</option>
          {BONUS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }} className="input" style={{ minWidth: 150 }}>
          <option value="">All Statuses</option>
          {['Pending','Vested','Paid','Forfeited','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="card_giftcard" message="No retention bonuses found" />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ref #</th><th>Employee</th><th>Type</th><th>Amount</th>
                  <th>Signup</th><th>Vesting</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.ref_number || '—'}</span></td>
                    <td>{empMap[r.employee_id] || r.employee_id}</td>
                    <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--purple)22', color: 'var(--purple)', fontWeight: 600 }}>{r.bonus_type}</span></td>
                    <td style={{ fontWeight: 700 }}>{r.currency} {fmt(r.total_amount)}</td>
                    <td style={{ fontSize: 12 }}>{r.signup_date}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12 }}>{r.vesting_date}</span>
                        <VestingChip vestingDate={r.vesting_date} status={r.status} />
                      </div>
                    </td>
                    <td><StatusBadge status={r.status} color={STATUS_COLORS[r.status]} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canEdit && r.status === 'Pending' && <>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-sm btn-primary" style={{ background: 'var(--blue)' }} onClick={() => setConfirm({ type: 'vest', id: r.id, name: empMap[r.employee_id] })}>Mark Vested</button>
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => { setForfeitReason(''); setForfeitModal({ id: r.id, name: empMap[r.employee_id] }) }}>Forfeit</button>
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--text-dim)' }} onClick={() => setConfirm({ type: 'cancel', id: r.id, name: empMap[r.employee_id] })}>Cancel</button>
                        </>}
                        {canEdit && r.status === 'Vested' && (
                          <button className="btn btn-sm btn-primary" style={{ background: 'var(--green)' }} onClick={() => setConfirm({ type: 'pay', id: r.id, name: empMap[r.employee_id] })}>Mark Paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}

      {/* New / Edit modal */}
      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Retention Bonus' : 'New Retention Bonus'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Employee *</label>
            <select className="input" value={form.employee_id} onChange={e => fld('employee_id', e.target.value)} disabled={!!editing}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Bonus Type</label>
              <select className="input" value={form.bonus_type} onChange={e => fld('bonus_type', e.target.value)}>
                {BONUS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Currency</label>
              <select className="input" value={form.currency} onChange={e => fld('currency', e.target.value)}>
                {['USD','ZWL','ZAR','GBP','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Total Amount *</label>
            <input type="number" className="input" min="0" step="0.01" value={form.total_amount} onChange={e => fld('total_amount', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Signup Date *</label>
              <input type="date" className="input" value={form.signup_date} onChange={e => fld('signup_date', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Vesting Date *</label>
              <input type="date" className="input" value={form.vesting_date} onChange={e => fld('vesting_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Forfeit modal */}
      <ModalDialog open={!!forfeitModal} onClose={() => setForfeitModal(null)} title={`Forfeit Bonus — ${forfeitModal?.name || ''}`}>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>Provide a reason for forfeiture. This action cannot be undone.</p>
        <div>
          <label className="field-label">Forfeiture Reason *</label>
          <textarea className="input" rows={3} value={forfeitReason} onChange={e => setForfeitReason(e.target.value)} placeholder="e.g. Employee resigned before vesting date" style={{ resize: 'vertical' }} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setForfeitModal(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={markForfeited}>Confirm Forfeit</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={confirm?.type === 'vest'} title="Mark as Vested"
        message={`Confirm vesting for ${confirm?.name}'s retention bonus?`} confirmLabel="Mark Vested"
        onConfirm={() => markVested(confirm.id)} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'pay'} title="Mark as Paid"
        message={`Confirm payment of retention bonus for ${confirm?.name}?`} confirmLabel="Mark Paid"
        onConfirm={() => markPaid(confirm.id)} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'cancel'} title="Cancel Bonus"
        message={`Cancel this retention bonus for ${confirm?.name}?`} confirmLabel="Cancel"
        onConfirm={() => markCancelled(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
