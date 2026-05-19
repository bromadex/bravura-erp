import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, Spinner, ModalDialog, ModalActions, ConfirmDialog } from '../../components/ui'
import toast from 'react-hot-toast'

const BLANK = {
  name: '', code: '', description: '', color: '#60a5fa',
  max_leaves_allowed: 0, max_continuous_days: 0,
  is_carry_forward: false, max_carry_forward_days: 0,
  is_lwp: false, is_compensatory: false, is_earned_leave: false,
  earned_leave_frequency: 'Monthly',
  allow_negative: false, include_holiday: false,
  allow_encashment: false, max_encashable_days: 0,
  applicable_gender: 'all', requires_approval: true,
  requires_document: false, min_notice_days: 0, is_active: true,
}

const PRESET_COLORS = ['#60a5fa','#34d399','#f87171','#fbbf24','#a78bfa','#f97316','#06b6d4','#ec4899','#94a3b8','#10b981']

function Badge({ type, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  )
}

export default function LeaveTypes() {
  const [types,   setTypes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)  // null | { mode: 'form', data: {} }
  const [confirm, setConfirm] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState(BLANK)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('leave_types').select('*').order('name')
    if (error) toast.error(error.message)
    else setTypes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd  = () => { setForm(BLANK); setModal({ mode: 'form', data: null }) }
  const openEdit = (lt) => {
    setForm({
      name:                  lt.name              || '',
      code:                  lt.code              || '',
      description:           lt.description       || '',
      color:                 lt.color             || '#60a5fa',
      max_leaves_allowed:    lt.max_leaves_allowed    ?? 0,
      max_continuous_days:   lt.max_continuous_days   ?? 0,
      is_carry_forward:      lt.is_carry_forward      ?? false,
      max_carry_forward_days: lt.max_carry_forward_days ?? 0,
      is_lwp:                lt.is_lwp                ?? false,
      is_compensatory:       lt.is_compensatory        ?? false,
      is_earned_leave:       lt.is_earned_leave        ?? false,
      earned_leave_frequency: lt.earned_leave_frequency || 'Monthly',
      allow_negative:        lt.allow_negative          ?? false,
      include_holiday:       lt.include_holiday         ?? false,
      allow_encashment:      lt.allow_encashment         ?? false,
      max_encashable_days:   lt.max_encashable_days      ?? 0,
      applicable_gender:     lt.applicable_gender       || 'all',
      requires_approval:     lt.requires_approval        ?? true,
      requires_document:     lt.requires_document        ?? false,
      min_notice_days:       lt.min_notice_days           ?? 0,
      is_active:             lt.is_active                 ?? true,
    })
    setModal({ mode: 'form', data: lt })
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      const payload = { ...form }
      if (modal.data?.id) {
        const { error } = await supabase.from('leave_types').update(payload).eq('id', modal.data.id)
        if (error) throw error
        toast.success('Leave type updated')
      } else {
        const { error } = await supabase.from('leave_types').insert([{ id: crypto.randomUUID(), ...payload }])
        if (error) throw error
        toast.success('Leave type created')
      }
      setModal(null)
      load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('leave_types').delete().eq('id', confirm.id)
      if (error) throw error
      toast.success('Deleted')
      setConfirm(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const f = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked
              : e.target.type === 'number'   ? (parseFloat(e.target.value) || 0)
              : e.target.value
    setForm(p => ({ ...p, [key]: val }))
  }

  const typeLabels = (lt) => {
    const tags = []
    if (lt.is_lwp)          tags.push({ label: 'LWP',    color: 'var(--red)'    })
    if (lt.is_compensatory) tags.push({ label: 'Comp',   color: 'var(--purple)' })
    if (lt.is_earned_leave) tags.push({ label: 'Earned', color: 'var(--teal)'   })
    if (lt.allow_encashment) tags.push({ label: 'Encashable', color: 'var(--gold)' })
    if (lt.is_carry_forward) tags.push({ label: 'Carry Forward', color: 'var(--blue)' })
    return tags
  }

  if (loading) return <div><PageHeader title="Leave Types" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Leave Types" subtitle="Configure leave categories, entitlements & rules">
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons">add</span> New Leave Type
        </button>
      </PageHeader>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Types',    value: types.length,                               color: 'var(--blue)'   },
          { label: 'Active',         value: types.filter(t => t.is_active !== false).length, color: 'var(--green)' },
          { label: 'With Encashment', value: types.filter(t => t.allow_encashment).length, color: 'var(--gold)'  },
          { label: 'Carry Forward',  value: types.filter(t => t.is_carry_forward).length, color: 'var(--teal)'  },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: kpi.color, fontFamily: 'var(--mono)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {types.length === 0
        ? <EmptyState icon="event_busy" message="No leave types configured" action={{ label: 'Create First Leave Type', onClick: openAdd }} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {types.map(lt => {
              const active = lt.is_active !== false
              const tags   = typeLabels(lt)
              return (
                <div key={lt.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden', opacity: active ? 1 : 0.6,
                  transition: 'border-color .15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = lt.color || 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  {/* Color bar + header */}
                  <div style={{ height: 4, background: lt.color || '#60a5fa' }} />
                  <div style={{ padding: '16px 16px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{lt.name}</div>
                        {lt.code && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 2 }}>{lt.code}</div>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: active ? 'var(--green)22' : 'var(--red)22', color: active ? 'var(--green)' : 'var(--red)', border: `1px solid ${active ? 'var(--green)' : 'var(--red)'}44` }}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {lt.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.4 }}>{lt.description}</div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--text-dim)' }}>Max days/yr: </span>
                        <strong style={{ color: lt.color || 'var(--blue)' }}>{lt.max_leaves_allowed || 0}</strong>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--text-dim)' }}>Max consecutive: </span>
                        <strong>{lt.max_continuous_days || 'Unlimited'}</strong>
                      </div>
                      {lt.is_carry_forward && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-dim)' }}>Carry fwd max: </span>
                          <strong>{lt.max_carry_forward_days || 0} days</strong>
                        </div>
                      )}
                      {lt.allow_encashment && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-dim)' }}>Max encash: </span>
                          <strong>{lt.max_encashable_days || 0} days</strong>
                        </div>
                      )}
                      {lt.applicable_gender !== 'all' && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-dim)' }}>Gender: </span>
                          <strong style={{ textTransform: 'capitalize' }}>{lt.applicable_gender}</strong>
                        </div>
                      )}
                      {lt.min_notice_days > 0 && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-dim)' }}>Min notice: </span>
                          <strong>{lt.min_notice_days}d</strong>
                        </div>
                      )}
                    </div>

                    {tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                        {tags.map(tag => <Badge key={tag.label} type={tag.label} color={tag.color} />)}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}>
                      {lt.requires_approval && <span>✓ Approval required</span>}
                      {lt.requires_document && <span>✓ Document required</span>}
                      {lt.include_holiday   && <span>✓ Includes holidays</span>}
                      {lt.allow_negative    && <span>✓ Allow negative</span>}
                    </div>
                  </div>

                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(lt)}>
                      <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: lt.id, name: lt.name })}>
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      {/* Add/Edit modal */}
      <ModalDialog open={modal?.mode === 'form'} onClose={() => setModal(null)}
        title={modal?.data?.id ? `Edit — ${modal.data.name}` : 'New Leave Type'} size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label>Name *</label>
              <input className="form-control" value={form.name} onChange={f('name')} placeholder="e.g. Annual Leave" />
            </div>
            <div className="form-group">
              <label>Short Code</label>
              <input className="form-control" value={form.code} onChange={f('code')} placeholder="e.g. AL" maxLength={6} style={{ fontFamily: 'var(--mono)', textTransform: 'uppercase' }} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={f('description')} />
            </div>
            <div className="form-group">
              <label>Max Days Per Year</label>
              <input type="number" min={0} step={0.5} className="form-control" value={form.max_leaves_allowed} onChange={f('max_leaves_allowed')} />
            </div>
            <div className="form-group">
              <label>Max Consecutive Days <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>(0 = unlimited)</span></label>
              <input type="number" min={0} className="form-control" value={form.max_continuous_days} onChange={f('max_continuous_days')} />
            </div>
            <div className="form-group">
              <label>Min Notice Days</label>
              <input type="number" min={0} className="form-control" value={form.min_notice_days} onChange={f('min_notice_days')} />
            </div>
            <div className="form-group">
              <label>Applicable Gender</label>
              <select className="form-control" value={form.applicable_gender} onChange={f('applicable_gender')}>
                <option value="all">All Employees</option>
                <option value="male">Male Only</option>
                <option value="female">Female Only</option>
              </select>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={form.color} onChange={f('color')} style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--surface)' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESET_COLORS.map(c => (
                    <div key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '2px solid var(--text)' : '2px solid transparent', transition: 'border .1s' }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Leave Type Flags</div>
              {[
                { key: 'is_lwp',          label: 'Leave Without Pay (LWP)' },
                { key: 'is_compensatory', label: 'Compensatory Leave' },
                { key: 'is_earned_leave', label: 'Earned / Accrued Leave' },
                { key: 'include_holiday', label: 'Count Holidays in Duration' },
                { key: 'allow_negative',  label: 'Allow Negative Balance' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form[key]} onChange={f(key)} />
                  {label}
                </label>
              ))}
            </div>

            {form.is_earned_leave && (
              <div className="form-group">
                <label>Accrual Frequency</label>
                <select className="form-control" value={form.earned_leave_frequency} onChange={f('earned_leave_frequency')}>
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Annually</option>
                </select>
              </div>
            )}

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Carry Forward</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.is_carry_forward} onChange={f('is_carry_forward')} />
                Allow Carry Forward to Next Year
              </label>
              {form.is_carry_forward && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Max Carry Forward Days</label>
                  <input type="number" min={0} step={0.5} className="form-control" value={form.max_carry_forward_days} onChange={f('max_carry_forward_days')} />
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Encashment</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.allow_encashment} onChange={f('allow_encashment')} />
                Allow Leave Encashment
              </label>
              {form.allow_encashment && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Max Encashable Days</label>
                  <input type="number" min={0} className="form-control" value={form.max_encashable_days} onChange={f('max_encashable_days')} />
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Requirements & Status</div>
              {[
                { key: 'requires_approval', label: 'Requires Manager Approval' },
                { key: 'requires_document', label: 'Requires Supporting Document' },
                { key: 'is_active',         label: 'Active (visible in leave requests)' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form[key]} onChange={f(key)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (modal?.data?.id ? 'Save Changes' : 'Create Leave Type')}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Leave Type"
        message={`Delete "${confirm?.name}"? This cannot be undone if leave requests reference this type.`}
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
