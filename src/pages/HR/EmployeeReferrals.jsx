import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const REFERRAL_STATUSES = ['Submitted', 'Screening', 'Interviewed', 'Hired', 'Rejected', 'Withdrawn']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'INR', 'CAD', 'AUD', 'SGD']

const today = new Date().toISOString().split('T')[0]

function pad(n) { return String(n).padStart(6, '0') }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const BLANK_REFERRAL = {
  referrer_id: '',
  referred_name: '',
  referred_email: '',
  referred_phone: '',
  position: '',
  program_id: '',
  referral_date: today,
  status: 'Submitted',
  hire_date: '',
  notes: '',
}

const BLANK_PROGRAM = {
  program_name: '',
  description: '',
  bonus_amount: '',
  currency: 'USD',
  valid_from: '',
  valid_to: '',
  is_active: true,
}

export default function EmployeeReferrals() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'referrals')
  const canApprove = useCanApprove('hr', 'referrals')

  const [activeTab, setActiveTab] = useState('referrals')

  const [referrals, setReferrals] = useState([])
  const [programs, setPrograms] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterReferrer, setFilterReferrer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showRefModal, setShowRefModal] = useState(false)
  const [editReferral, setEditReferral] = useState(null)
  const [refForm, setRefForm] = useState(BLANK_REFERRAL)

  const [confirmMarkHired, setConfirmMarkHired] = useState(null)
  const [confirmBonusPaid, setConfirmBonusPaid] = useState(null)
  const [confirmDelRef, setConfirmDelRef] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [actioning, setActioning] = useState(false)

  const [showProgModal, setShowProgModal] = useState(false)
  const [editProgram, setEditProgram] = useState(null)
  const [progForm, setProgForm] = useState(BLANK_PROGRAM)
  const [confirmDelProg, setConfirmDelProg] = useState(null)
  const [deletingProg, setDeletingProg] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: rData }, { data: pData }, { data: eData }] = await Promise.all([
      supabase.from('employee_referrals').select('*').order('created_at', { ascending: false }),
      supabase.from('referral_programs').select('*').order('program_name'),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
    ])
    setReferrals(rData || [])
    setPrograms(pData || [])
    setEmployees(eData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextRefNumber = (existing) => {
    const nums = existing
      .map(r => parseInt((r.referral_number || '').replace('REF-', ''), 10))
      .filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `REF-${pad(max + 1)}`
  }

  const openNewReferral = () => {
    setEditReferral(null)
    setRefForm(BLANK_REFERRAL)
    setShowRefModal(true)
  }

  const openEditReferral = (r) => {
    setEditReferral(r)
    setRefForm({
      referrer_id: r.referrer_id || '',
      referred_name: r.referred_name || '',
      referred_email: r.referred_email || '',
      referred_phone: r.referred_phone || '',
      position: r.position || '',
      program_id: r.program_id || '',
      referral_date: r.referral_date || today,
      status: r.status || 'Submitted',
      hire_date: r.hire_date || '',
      notes: r.notes || '',
    })
    setShowRefModal(true)
  }

  const handleSaveReferral = async () => {
    if (!refForm.referred_name.trim()) { toast.error('Referred name is required'); return }
    if (!refForm.referral_date) { toast.error('Referral date is required'); return }
    setSaving(true)
    try {
      if (editReferral) {
        const { error } = await supabase.from('employee_referrals').update({
          referrer_id: refForm.referrer_id || null,
          referred_name: refForm.referred_name.trim(),
          referred_email: refForm.referred_email || null,
          referred_phone: refForm.referred_phone || null,
          position: refForm.position || null,
          program_id: refForm.program_id || null,
          referral_date: refForm.referral_date,
          status: refForm.status,
          hire_date: refForm.status === 'Hired' ? (refForm.hire_date || null) : null,
          notes: refForm.notes || null,
          updated_at: new Date().toISOString(),
        }).eq('id', editReferral.id)
        if (error) throw error
        toast.success('Referral updated')
      } else {
        const { error } = await supabase.from('employee_referrals').insert([{
          id: crypto.randomUUID(),
          referral_number: nextRefNumber(referrals),
          referrer_id: refForm.referrer_id || null,
          referred_name: refForm.referred_name.trim(),
          referred_email: refForm.referred_email || null,
          referred_phone: refForm.referred_phone || null,
          position: refForm.position || null,
          program_id: refForm.program_id || null,
          referral_date: refForm.referral_date,
          status: refForm.status,
          hire_date: refForm.status === 'Hired' ? (refForm.hire_date || null) : null,
          notes: refForm.notes || null,
          bonus_paid: false,
          created_by: user?.full_name || '',
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        toast.success('Referral created')
      }
      setShowRefModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleMarkHired = async () => {
    if (!confirmMarkHired) return
    setActioning(true)
    try {
      const { error } = await supabase.from('employee_referrals').update({
        status: 'Hired',
        hire_date: today,
        updated_at: new Date().toISOString(),
      }).eq('id', confirmMarkHired.id)
      if (error) throw error
      toast.success('Marked as Hired')
      setConfirmMarkHired(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActioning(false) }
  }

  const handleMarkBonusPaid = async () => {
    if (!confirmBonusPaid) return
    setActioning(true)
    try {
      const { error } = await supabase.from('employee_referrals').update({
        bonus_paid: true,
        bonus_paid_date: today,
        updated_at: new Date().toISOString(),
      }).eq('id', confirmBonusPaid.id)
      if (error) throw error
      toast.success('Bonus marked as paid')
      setConfirmBonusPaid(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActioning(false) }
  }

  const handleDeleteReferral = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('employee_referrals').delete().eq('id', confirmDelRef.id)
      if (error) throw error
      toast.success('Referral deleted')
      setConfirmDelRef(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setDeleting(false) }
  }

  const openNewProgram = () => {
    setEditProgram(null)
    setProgForm(BLANK_PROGRAM)
    setShowProgModal(true)
  }

  const openEditProgram = (p) => {
    setEditProgram(p)
    setProgForm({
      program_name: p.program_name || '',
      description: p.description || '',
      bonus_amount: p.bonus_amount != null ? String(p.bonus_amount) : '',
      currency: p.currency || 'USD',
      valid_from: p.valid_from || '',
      valid_to: p.valid_to || '',
      is_active: p.is_active !== false,
    })
    setShowProgModal(true)
  }

  const handleSaveProgram = async () => {
    if (!progForm.program_name.trim()) { toast.error('Program name is required'); return }
    setSaving(true)
    try {
      const payload = {
        program_name: progForm.program_name.trim(),
        description: progForm.description || null,
        bonus_amount: progForm.bonus_amount !== '' ? parseFloat(progForm.bonus_amount) : 0,
        currency: progForm.currency || 'USD',
        valid_from: progForm.valid_from || null,
        valid_to: progForm.valid_to || null,
        is_active: progForm.is_active,
      }
      if (editProgram) {
        const { error } = await supabase.from('referral_programs').update(payload).eq('id', editProgram.id)
        if (error) throw error
        toast.success('Program updated')
      } else {
        const { error } = await supabase.from('referral_programs').insert([{
          id: crypto.randomUUID(),
          ...payload,
          created_by: user?.full_name || '',
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        toast.success('Program created')
      }
      setShowProgModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDeleteProgram = async () => {
    setDeletingProg(true)
    try {
      const { error } = await supabase.from('referral_programs').delete().eq('id', confirmDelProg.id)
      if (error) throw error
      toast.success('Program deleted')
      setConfirmDelProg(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setDeletingProg(false) }
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]))
  const progMap = Object.fromEntries(programs.map(p => [p.id, p]))

  const filteredReferrals = referrals.filter(r => {
    if (filterReferrer && r.referrer_id !== filterReferrer) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  const kpiTotal = referrals.length
  const kpiSubmitted = referrals.filter(r => r.status === 'Submitted').length
  const kpiHired = referrals.filter(r => r.status === 'Hired').length
  const kpiBonusPaid = referrals.filter(r => r.bonus_paid === true).length

  const tabs = [
    { id: 'referrals', label: 'Referrals' },
    { id: 'programs', label: 'Programs' },
  ]

  const bonusPaidProgram = confirmBonusPaid ? progMap[confirmBonusPaid.program_id] : null

  return (
    <div>
      <PageHeader title="Employee Referrals">
        {canEdit && activeTab === 'referrals' && (
          <button className="btn btn-primary btn-sm" onClick={openNewReferral}>
            <span className="material-icons">add</span> New Referral
          </button>
        )}
        {canEdit && activeTab === 'programs' && (
          <button className="btn btn-primary btn-sm" onClick={openNewProgram}>
            <span className="material-icons">add</span> New Program
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {activeTab === 'referrals' && (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
                <KPICard label="Total" value={kpiTotal} icon="people" />
                <KPICard label="Submitted" value={kpiSubmitted} icon="send" color="blue" />
                <KPICard label="Hired" value={kpiHired} icon="how_to_reg" color="green" />
                <KPICard label="Bonuses Paid" value={kpiBonusPaid} icon="payments" color="gold" />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <select className="form-control" style={{ width: 'auto', minWidth: 180 }}
                  value={filterReferrer} onChange={e => setFilterReferrer(e.target.value)}>
                  <option value="">All Referrers</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <select className="form-control" style={{ width: 'auto', minWidth: 140 }}
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  {REFERRAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {(filterReferrer || filterStatus) && (
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => { setFilterReferrer(''); setFilterStatus('') }}>
                    Clear
                  </button>
                )}
              </div>

              {filteredReferrals.length === 0 ? (
                <EmptyState icon="person_add" message="No referrals found." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Referrer</th>
                        <th>Referred Name</th>
                        <th>Position</th>
                        <th>Program</th>
                        <th>Status</th>
                        <th>Hire Date</th>
                        <th>Bonus</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReferrals.map(r => {
                        const emp = empMap[r.referrer_id]
                        const prog = progMap[r.program_id]
                        const canDelete = ['Submitted', 'Withdrawn', 'Rejected'].includes(r.status)
                        return (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                              {r.referral_number || '—'}
                            </td>
                            <td>
                              {emp ? (
                                <>
                                  <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{emp.employee_number}</div>
                                </>
                              ) : '—'}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.referred_name}</div>
                              {r.referred_email && (
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.referred_email}</div>
                              )}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.position || '—'}</td>
                            <td style={{ fontSize: 12 }}>{prog ? prog.program_name : '—'}</td>
                            <td><StatusBadge status={r.status?.toLowerCase()} label={r.status} /></td>
                            <td style={{ fontSize: 12 }}>{fmtDate(r.hire_date)}</td>
                            <td>
                              {r.bonus_paid ? (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                  background: 'var(--green)18', color: 'var(--green)',
                                  border: '1px solid var(--green)44', display: 'inline-flex', alignItems: 'center', gap: 4,
                                }}>
                                  <span className="material-icons" style={{ fontSize: 12 }}>check_circle</span>
                                  Paid
                                </span>
                              ) : r.status === 'Hired' ? (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                  background: 'var(--yellow)18', color: 'var(--yellow)',
                                  border: '1px solid var(--yellow)44',
                                }}>
                                  Pending
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {canEdit && (
                                  <button className="btn btn-xs btn-secondary" onClick={() => openEditReferral(r)}
                                    title="Edit">
                                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                  </button>
                                )}
                                {canApprove && ['Screening', 'Interviewed'].includes(r.status) && (
                                  <button className="btn btn-xs btn-primary" onClick={() => setConfirmMarkHired(r)}
                                    title="Mark Hired">
                                    <span className="material-icons" style={{ fontSize: 13 }}>how_to_reg</span>
                                  </button>
                                )}
                                {canApprove && r.status === 'Hired' && !r.bonus_paid && (
                                  <button className="btn btn-xs btn-secondary" onClick={() => setConfirmBonusPaid(r)}
                                    title="Mark Bonus Paid"
                                    style={{ color: 'var(--gold)', borderColor: 'var(--gold)44' }}>
                                    <span className="material-icons" style={{ fontSize: 13 }}>payments</span>
                                  </button>
                                )}
                                {canEdit && canDelete && (
                                  <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelRef(r)}
                                    title="Delete">
                                    <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'programs' && (
            <div style={{ marginTop: 16 }}>
              {programs.length === 0 ? (
                <EmptyState icon="card_giftcard" message="No referral programs defined." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Bonus</th>
                        <th>Currency</th>
                        <th>Valid Period</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {programs.map(p => (
                        <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.program_name}</div>
                            {p.description && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.description}
                              </div>
                            )}
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {p.bonus_amount != null ? Number(p.bonus_amount).toLocaleString() : '—'}
                          </td>
                          <td style={{ fontSize: 12 }}>{p.currency || 'USD'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            {p.valid_from || p.valid_to
                              ? `${fmtDate(p.valid_from)} → ${fmtDate(p.valid_to)}`
                              : '—'}
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: p.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                              color: p.is_active ? 'var(--green)' : 'var(--text-dim)',
                              border: `1px solid ${p.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                            }}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: 4 }}>
                            {canEdit && (
                              <>
                                <button className="btn btn-xs btn-secondary" onClick={() => openEditProgram(p)}
                                  title="Edit">
                                  <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                </button>
                                <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelProg(p)}
                                  title="Delete">
                                  <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ModalDialog open={showRefModal} onClose={() => setShowRefModal(false)}
        title={editReferral ? 'Edit Referral' : 'New Referral'} size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          <div className="form-group">
            <label>Referrer (Employee)</label>
            <select className="form-control" value={refForm.referrer_id}
              onChange={e => setRefForm(f => ({ ...f, referrer_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Referral Date *</label>
            <input type="date" className="form-control" value={refForm.referral_date}
              onChange={e => setRefForm(f => ({ ...f, referral_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Referred Name *</label>
            <input className="form-control" value={refForm.referred_name}
              onChange={e => setRefForm(f => ({ ...f, referred_name: e.target.value }))}
              placeholder="Full name of referred candidate" />
          </div>
          <div className="form-group">
            <label>Referred Email</label>
            <input type="email" className="form-control" value={refForm.referred_email}
              onChange={e => setRefForm(f => ({ ...f, referred_email: e.target.value }))}
              placeholder="candidate@email.com" />
          </div>
          <div className="form-group">
            <label>Referred Phone</label>
            <input className="form-control" value={refForm.referred_phone}
              onChange={e => setRefForm(f => ({ ...f, referred_phone: e.target.value }))}
              placeholder="+1 555 000 0000" />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input className="form-control" value={refForm.position}
              onChange={e => setRefForm(f => ({ ...f, position: e.target.value }))}
              placeholder="e.g. Software Engineer" />
          </div>
          <div className="form-group">
            <label>Referral Program</label>
            <select className="form-control" value={refForm.program_id}
              onChange={e => setRefForm(f => ({ ...f, program_id: e.target.value }))}>
              <option value="">None</option>
              {programs.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.program_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={refForm.status}
              onChange={e => setRefForm(f => ({ ...f, status: e.target.value }))}>
              {REFERRAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {refForm.status === 'Hired' && (
            <div className="form-group">
              <label>Hire Date</label>
              <input type="date" className="form-control" value={refForm.hire_date}
                onChange={e => setRefForm(f => ({ ...f, hire_date: e.target.value }))} />
            </div>
          )}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={3} value={refForm.notes}
              onChange={e => setRefForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional notes…" />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowRefModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveReferral} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={showProgModal} onClose={() => setShowProgModal(false)}
        title={editProgram ? 'Edit Program' : 'New Referral Program'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
          <div className="form-group">
            <label>Program Name *</label>
            <input className="form-control" value={progForm.program_name}
              onChange={e => setProgForm(f => ({ ...f, program_name: e.target.value }))}
              placeholder="e.g. Q1 2026 Referral Bonus" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={progForm.description}
              onChange={e => setProgForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            <div className="form-group">
              <label>Bonus Amount</label>
              <input type="number" min="0" step="0.01" className="form-control" value={progForm.bonus_amount}
                onChange={e => setProgForm(f => ({ ...f, bonus_amount: e.target.value }))}
                placeholder="0" />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select className="form-control" value={progForm.currency}
                onChange={e => setProgForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Valid From</label>
              <input type="date" className="form-control" value={progForm.valid_from}
                onChange={e => setProgForm(f => ({ ...f, valid_from: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Valid To</label>
              <input type="date" className="form-control" value={progForm.valid_to}
                onChange={e => setProgForm(f => ({ ...f, valid_to: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="prog_active" checked={progForm.is_active}
              onChange={e => setProgForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="prog_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowProgModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveProgram} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmMarkHired}
        onClose={() => setConfirmMarkHired(null)}
        onConfirm={handleMarkHired}
        title="Mark as Hired"
        message={`Mark "${confirmMarkHired?.referred_name}" as Hired? This will set today as the hire date.`}
        confirmLabel={actioning ? 'Updating…' : 'Mark Hired'}
        loading={actioning}
      />

      <ConfirmDialog
        open={!!confirmBonusPaid}
        onClose={() => setConfirmBonusPaid(null)}
        onConfirm={handleMarkBonusPaid}
        title="Mark Bonus as Paid"
        message={`Confirm bonus paid for referral of "${confirmBonusPaid?.referred_name}"?${bonusPaidProgram ? ` Bonus amount: ${Number(bonusPaidProgram.bonus_amount).toLocaleString()} ${bonusPaidProgram.currency}.` : ''}`}
        confirmLabel={actioning ? 'Updating…' : 'Confirm Paid'}
        loading={actioning}
      />

      <ConfirmDialog
        open={!!confirmDelRef}
        onClose={() => setConfirmDelRef(null)}
        onConfirm={handleDeleteReferral}
        title="Delete Referral"
        message={`Delete referral for "${confirmDelRef?.referred_name}" (${confirmDelRef?.referral_number})? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />

      <ConfirmDialog
        open={!!confirmDelProg}
        onClose={() => setConfirmDelProg(null)}
        onConfirm={handleDeleteProgram}
        title="Delete Program"
        message={`Delete program "${confirmDelProg?.program_name}"? This cannot be undone.`}
        confirmLabel={deletingProg ? 'Deleting…' : 'Delete'}
        danger
        loading={deletingProg}
      />
    </div>
  )
}
