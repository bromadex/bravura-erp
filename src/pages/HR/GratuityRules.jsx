import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'rules', label: 'Gratuity Rules', icon: 'rule' },
  { id: 'slabs', label: 'Slabs',          icon: 'layers' },
]

const emptyRule = { name: '', currency: 'USD', applicable_from_date: '', notes: '', is_active: true }
const emptySlab = { from_year: 0, to_year: '', fraction_of_applicable_earnings: 0.5, sort_order: 0 }

export default function GratuityRules() {
  const canEdit = useCanEdit('hr', 'gratuity-rules')
  const [tab, setTab] = useState('rules')
  const [rules, setRules] = useState([])
  const [selectedRule, setSelectedRule] = useState(null)
  const [slabs, setSlabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [slabsLoading, setSlabsLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('gratuity_rules').select('*').order('name')
    if (error) toast.error(error.message)
    setRules(data || [])
    setLoading(false)
  }, [])

  const fetchSlabs = useCallback(async (ruleId) => {
    setSlabsLoading(true)
    const { data, error } = await supabase.from('gratuity_rule_slabs').select('*').eq('rule_id', ruleId).order('sort_order')
    if (error) toast.error(error.message)
    setSlabs(data || [])
    setSlabsLoading(false)
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const selectRule = (rule) => {
    setSelectedRule(rule)
    setTab('slabs')
    fetchSlabs(rule.id)
  }

  const openRuleModal = (rule = null) => setModal({ mode: 'rule', data: rule ? { ...rule } : { ...emptyRule } })
  const openSlabModal = (slab = null) => setModal({ mode: 'slab', data: slab ? { ...slab } : { ...emptySlab, rule_id: selectedRule.id } })

  const saveRule = async () => {
    const { id, ...rest } = modal.data
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('gratuity_rules').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('gratuity_rules').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Rule saved')
      setModal(null)
      fetchRules()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const saveSlab = async () => {
    const { id, ...rest } = modal.data
    const payload = { ...rest, to_year: rest.to_year === '' || rest.to_year === null ? null : Number(rest.to_year) }
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('gratuity_rule_slabs').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('gratuity_rule_slabs').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Slab saved')
      setModal(null)
      fetchSlabs(selectedRule.id)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const deleteSlab = async () => {
    const { error } = await supabase.from('gratuity_rule_slabs').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Slab deleted')
    setDeleting(null)
    fetchSlabs(selectedRule.id)
  }

  const deleteRule = async () => {
    const { error } = await supabase.from('gratuity_rules').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Rule deleted')
    setDeleting(null)
    if (selectedRule?.id === deleting.id) { setSelectedRule(null); setTab('rules') }
    fetchRules()
  }

  const setF = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))

  if (loading) return <div><PageHeader title="Gratuity Rules" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Gratuity Rules" subtitle="Manage gratuity calculation rules and year-based slabs">
        {canEdit && tab === 'rules' && (
          <button className="btn btn-primary btn-sm" onClick={() => openRuleModal()}>
            <span className="material-icons">add</span>New Rule
          </button>
        )}
        {canEdit && tab === 'slabs' && selectedRule && (
          <button className="btn btn-primary btn-sm" onClick={() => openSlabModal()}>
            <span className="material-icons">add</span>Add Slab
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'rules' && (
        <div style={{ marginTop: 16 }}>
          {rules.length === 0
            ? <EmptyState icon="rule" message="No gratuity rules defined" action={canEdit ? { label: 'Create Rule', onClick: () => openRuleModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Rule Name</th><th>Currency</th><th>Applicable From</th><th>Status</th><th>Slabs</th><th /></tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td>
                        <button style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, padding: 0 }} onClick={() => selectRule(r)}>
                          {r.name}
                        </button>
                      </td>
                      <td>{r.currency}</td>
                      <td>{r.applicable_from_date || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: r.is_active ? 'var(--green)22' : 'var(--border)', color: r.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-xs" onClick={() => selectRule(r)}>View Slabs</button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openRuleModal(r)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...r, _type: 'rule' })}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {tab === 'slabs' && (
        <div style={{ marginTop: 16 }}>
          {!selectedRule
            ? <EmptyState icon="layers" message="Select a rule from the Rules tab to manage its slabs" />
            : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span className="material-icons" style={{ color: 'var(--gold)' }}>rule</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedRule.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{selectedRule.currency}</div>
                  </div>
                  <button className="btn btn-secondary btn-xs" style={{ marginLeft: 'auto' }} onClick={() => { setTab('rules'); setSelectedRule(null) }}>
                    ← Back to Rules
                  </button>
                </div>
                {slabsLoading
                  ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
                  : slabs.length === 0
                    ? <EmptyState icon="layers" message="No slabs defined for this rule" action={canEdit ? { label: 'Add Slab', onClick: () => openSlabModal() } : null} />
                    : (
                      <table className="data-table">
                        <thead>
                          <tr><th>From (years)</th><th>To (years)</th><th>Fraction of Earnings</th><th>Sort Order</th><th /></tr>
                        </thead>
                        <tbody>
                          {slabs.map(s => (
                            <tr key={s.id}>
                              <td>{s.from_year}</td>
                              <td>{s.to_year != null ? s.to_year : '∞'}</td>
                              <td>{(Number(s.fraction_of_applicable_earnings) * 100).toFixed(1)}%</td>
                              <td>{s.sort_order}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openSlabModal(s)}>Edit</button>}
                                  {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...s, _type: 'slab' })}>Delete</button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
              </>
            )}
        </div>
      )}

      {/* Rule Modal */}
      <ModalDialog open={modal?.mode === 'rule'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Rule' : 'New Gratuity Rule'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Rule Name *</label>
            <input className="form-control" value={modal?.data?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Currency</label>
              <input className="form-control" value={modal?.data?.currency || 'USD'} onChange={e => setF('currency', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Applicable From</label>
              <input className="form-control" type="date" value={modal?.data?.applicable_from_date || ''} onChange={e => setF('applicable_from_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={3} value={modal?.data?.notes || ''} onChange={e => setF('notes', e.target.value)} disabled={!canEdit} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={modal?.data?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
            <span>Active</span>
          </label>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveRule} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Slab Modal */}
      <ModalDialog open={modal?.mode === 'slab'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Slab' : 'New Slab'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>From Year</label>
              <input className="form-control" type="number" step="0.5" value={modal?.data?.from_year ?? 0} onChange={e => setF('from_year', Number(e.target.value))} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>To Year (blank = ∞)</label>
              <input className="form-control" type="number" step="0.5" value={modal?.data?.to_year ?? ''} onChange={e => setF('to_year', e.target.value === '' ? '' : Number(e.target.value))} disabled={!canEdit} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Fraction (0–1)</label>
              <input className="form-control" type="number" step="0.0001" min="0" max="1" value={modal?.data?.fraction_of_applicable_earnings ?? 0.5} onChange={e => setF('fraction_of_applicable_earnings', Number(e.target.value))} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Sort Order</label>
              <input className="form-control" type="number" value={modal?.data?.sort_order ?? 0} onChange={e => setF('sort_order', Number(e.target.value))} disabled={!canEdit} />
            </div>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveSlab} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={deleting?._type === 'slab' ? deleteSlab : deleteRule}
        title="Confirm Delete"
        message={`Delete "${deleting?.name || 'this slab'}"? This cannot be undone.`}
      />
    </div>
  )
}
