import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CURRENCIES = ['USD', 'ZiG', 'ZWL']
const APPLIES_TO = ['monthly', 'annual', 'weekly', 'fortnightly']
const STATUSES = ['Active', 'Closed', 'Archived']

const BLANK_YEAR = {
  year_label: '',
  start_date: '',
  end_date: '',
  country: 'Zimbabwe',
  status: 'Active',
  is_default: false,
  notes: '',
}

const BLANK_SLAB = () => ({
  id: crypto.randomUUID(),
  slab_from: 0,
  slab_to: '',
  rate_pct: 0,
  fixed_amount: 0,
  currency: 'USD',
  applies_to: 'monthly',
  sort_order: 0,
  _isNew: true,
})

export default function TaxYears() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'tax-years')

  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editYear, setEditYear] = useState(null)
  const [form, setForm] = useState(BLANK_YEAR)
  const [slabs, setSlabs] = useState([])
  const [formTab, setFormTab] = useState('details')

  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchYears = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tax_years')
      .select('*, income_tax_slabs(id)')
      .order('start_date', { ascending: false })
    if (error) toast.error('Failed to load tax years: ' + error.message)
    setYears(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchYears() }, [fetchYears])

  const openNew = () => {
    setEditYear(null)
    setForm({ ...BLANK_YEAR })
    setSlabs([])
    setFormTab('details')
    setShowForm(true)
  }

  const openEdit = async (y) => {
    setEditYear(y)
    setForm({
      year_label: y.year_label || '',
      start_date: y.start_date || '',
      end_date: y.end_date || '',
      country: y.country || 'Zimbabwe',
      status: y.status || 'Active',
      is_default: !!y.is_default,
      notes: y.notes || '',
    })
    setFormTab('details')
    setShowForm(true)
    const { data, error } = await supabase
      .from('income_tax_slabs')
      .select('*')
      .eq('tax_year_id', y.id)
      .order('sort_order')
    if (error) toast.error('Failed to load slabs: ' + error.message)
    setSlabs((data || []).map(s => ({
      id: s.id,
      slab_from: s.slab_from ?? 0,
      slab_to: s.slab_to ?? '',
      rate_pct: s.rate_pct ?? 0,
      fixed_amount: s.fixed_amount ?? 0,
      currency: s.currency || 'USD',
      applies_to: s.applies_to || 'monthly',
      sort_order: s.sort_order ?? 0,
      _isNew: false,
    })))
  }

  const addSlab = () => {
    const next = BLANK_SLAB()
    next.sort_order = slabs.length ? Math.max(...slabs.map(s => Number(s.sort_order) || 0)) + 1 : 1
    setSlabs(prev => [...prev, next])
  }

  const updateSlab = (id, key, val) => {
    setSlabs(prev => prev.map(s => s.id === id ? { ...s, [key]: val } : s))
  }

  const removeSlab = (id) => {
    setSlabs(prev => prev.filter(s => s.id !== id))
  }

  const validateSlabs = () => {
    const sorted = [...slabs]
      .map(s => ({ ...s, from: Number(s.slab_from) || 0, to: s.slab_to === '' || s.slab_to === null ? Infinity : Number(s.slab_to) }))
      .sort((a, b) => a.from - b.from)
    const orders = new Set()
    for (const s of sorted) {
      if (orders.has(Number(s.sort_order))) return 'Sort order must be unique across slabs'
      orders.add(Number(s.sort_order))
      if (s.to !== Infinity && s.from >= s.to) return `Slab range invalid: from (${s.from}) must be < to (${s.to})`
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from < sorted[i - 1].to) return `Slab ranges overlap between ${sorted[i - 1].from}-${sorted[i - 1].to === Infinity ? '∞' : sorted[i - 1].to} and ${sorted[i].from}-${sorted[i].to === Infinity ? '∞' : sorted[i].to}`
    }
    return null
  }

  const handleSave = async () => {
    if (!form.year_label.trim()) { toast.error('Year label is required'); return }
    if (!form.start_date || !form.end_date) { toast.error('Start and end dates are required'); return }
    if (new Date(form.end_date) < new Date(form.start_date)) { toast.error('End date must be on or after start date'); return }
    const slabErr = validateSlabs()
    if (slabErr) { toast.error(slabErr); return }

    setSaving(true)
    try {
      let yearId = editYear?.id
      const payload = {
        year_label: form.year_label.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        country: form.country || 'Zimbabwe',
        status: form.status,
        is_default: !!form.is_default,
        notes: form.notes || null,
      }

      if (editYear) {
        const { error } = await supabase.from('tax_years').update(payload).eq('id', editYear.id)
        if (error) throw error
      } else {
        yearId = crypto.randomUUID()
        const { error } = await supabase.from('tax_years').insert([{
          id: yearId,
          ...payload,
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
      }

      if (form.is_default) {
        const { error: clrErr } = await supabase
          .from('tax_years')
          .update({ is_default: false })
          .eq('country', payload.country)
          .neq('id', yearId)
        if (clrErr) throw clrErr
      }

      const { error: delErr } = await supabase.from('income_tax_slabs').delete().eq('tax_year_id', yearId)
      if (delErr) throw delErr

      if (slabs.length) {
        const slabPayload = slabs.map(s => ({
          id: s._isNew ? crypto.randomUUID() : s.id,
          tax_year_id: yearId,
          slab_from: Number(s.slab_from) || 0,
          slab_to: s.slab_to === '' || s.slab_to === null ? null : Number(s.slab_to),
          rate_pct: Number(s.rate_pct) || 0,
          fixed_amount: Number(s.fixed_amount) || 0,
          currency: s.currency || 'USD',
          applies_to: s.applies_to || 'monthly',
          sort_order: Number(s.sort_order) || 0,
        }))
        const { error: insErr } = await supabase.from('income_tax_slabs').insert(slabPayload)
        if (insErr) throw insErr
      }

      toast.success(editYear ? 'Tax year updated' : 'Tax year created')
      setShowForm(false)
      fetchYears()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      if (confirmDel.is_default) throw new Error('Cannot delete a default tax year')
      const { data: decls, error: dErr } = await supabase
        .from('tax_exemption_declarations')
        .select('id')
        .eq('tax_year_id', confirmDel.id)
        .limit(1)
      if (dErr) throw dErr
      if (decls && decls.length) throw new Error('Cannot delete: declarations are linked to this year')
      const { error: sErr } = await supabase.from('income_tax_slabs').delete().eq('tax_year_id', confirmDel.id)
      if (sErr) throw sErr
      const { error } = await supabase.from('tax_years').delete().eq('id', confirmDel.id)
      if (error) throw error
      toast.success('Tax year deleted')
      setConfirmDel(null)
      fetchYears()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const kpiTotal = years.length
  const kpiActive = years.filter(y => y.status === 'Active').length
  const kpiClosed = years.filter(y => y.status === 'Closed').length
  const defaultYear = years.find(y => y.is_default)?.year_label || '—'

  const slabPreview = [...slabs]
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map(s => {
      const from = Number(s.slab_from) || 0
      const to = s.slab_to === '' || s.slab_to === null ? null : Number(s.slab_to)
      const rangeStr = to === null ? `$${fmt(from)} and above` : `$${fmt(from)} - $${fmt(to)}`
      const fixed = Number(s.fixed_amount) || 0
      const rate = Number(s.rate_pct) || 0
      return `${rangeStr}: ${rate}%${fixed ? ` + $${fmt(fixed)}` : ''}`
    })

  return (
    <div>
      <PageHeader title="Tax Years" subtitle="Manage tax years and income tax slab structures">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Tax Year
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"        value={kpiTotal}   icon="event"          color="blue"  />
        <KPICard label="Active"       value={kpiActive}  icon="check_circle"   color="green" />
        <KPICard label="Closed"       value={kpiClosed}  icon="lock"           color="red"   />
        <KPICard label="Default Year" value={defaultYear} icon="star"          color="gold"  />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : years.length === 0 ? (
        <EmptyState icon="event" message="No tax years defined yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Period</th>
                <th>Country</th>
                <th>Status</th>
                <th>Default</th>
                <th>Slabs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id}>
                  <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{y.year_label}</td>
                  <td style={{ fontSize: 12 }}>{y.start_date} → {y.end_date}</td>
                  <td>{y.country}</td>
                  <td><StatusBadge status={y.status?.toLowerCase()} label={y.status} /></td>
                  <td>
                    {y.is_default
                      ? <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 18 }}>star</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{y.income_tax_slabs?.length ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {canEdit && (
                        <>
                          <button className="btn btn-xs btn-secondary" onClick={() => openEdit(y)} title="Edit">
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(y)} title="Delete">
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        size="lg"
        title={editYear ? `Edit Tax Year · ${editYear.year_label}` : 'New Tax Year'}
      >
        <TabNav
          tabs={[
            { id: 'details', label: 'Year Details', icon: 'event' },
            { id: 'slabs',   label: 'Tax Slabs',    icon: 'percent', count: slabs.length },
          ]}
          active={formTab}
          onChange={setFormTab}
        />

        {formTab === 'details' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>Year Label *</label>
              <input
                className="form-control"
                value={form.year_label}
                onChange={e => setForm(f => ({ ...f, year_label: e.target.value }))}
                placeholder="e.g. 2026"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Start Date *</label>
                <input type="date" className="form-control"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>End Date *</label>
                <input type="date" className="form-control"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Country</label>
                <input className="form-control"
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select className="form-control"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="ty_default"
                checked={form.is_default}
                onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              />
              <label htmlFor="ty_default" style={{ margin: 0, cursor: 'pointer' }}>
                Mark as default tax year for {form.country || 'this country'}
              </label>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        )}

        {formTab === 'slabs' && (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Define progressive tax slabs. Leave “Slab To” empty for the highest bracket (“and above”).
              </div>
              <button className="btn btn-primary btn-sm" onClick={addSlab}>
                <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Slab
              </button>
            </div>

            {slabs.length === 0 ? (
              <EmptyState icon="percent" message="No slabs added yet." />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Rate %</th>
                      <th>Fixed</th>
                      <th>Currency</th>
                      <th>Applies To</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {slabs.map(s => (
                      <tr key={s.id}>
                        <td style={{ width: 70 }}>
                          <input type="number" className="form-control" style={{ width: 60 }}
                            value={s.sort_order}
                            onChange={e => updateSlab(s.id, 'sort_order', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="0.01" className="form-control" style={{ width: 110 }}
                            value={s.slab_from}
                            onChange={e => updateSlab(s.id, 'slab_from', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="0.01" className="form-control" style={{ width: 110 }}
                            value={s.slab_to}
                            placeholder="and above"
                            onChange={e => updateSlab(s.id, 'slab_to', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" max="100" className="form-control" style={{ width: 80 }}
                            value={s.rate_pct}
                            onChange={e => updateSlab(s.id, 'rate_pct', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" step="0.01" className="form-control" style={{ width: 100 }}
                            value={s.fixed_amount}
                            onChange={e => updateSlab(s.id, 'fixed_amount', e.target.value)} />
                        </td>
                        <td>
                          <select className="form-control" style={{ width: 90 }}
                            value={s.currency}
                            onChange={e => updateSlab(s.id, 'currency', e.target.value)}>
                            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="form-control" style={{ width: 120 }}
                            value={s.applies_to}
                            onChange={e => updateSlab(s.id, 'applies_to', e.target.value)}>
                            {APPLIES_TO.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-xs btn-danger" onClick={() => removeSlab(s.id)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {slabs.length > 0 && (
              <div style={{
                marginTop: 14, padding: 12,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Slab Preview
                </div>
                {slabPreview.map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text)', padding: '2px 0' }}>
                    <span style={{ color: 'var(--gold)' }}>•</span> {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editYear ? 'Save Changes' : 'Create Tax Year'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={handleDelete}
        title="Delete Tax Year"
        message={`Delete tax year "${confirmDel?.year_label}"? All slabs will be removed. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
