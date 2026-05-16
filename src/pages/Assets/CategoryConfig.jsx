// src/pages/Assets/CategoryConfig.jsx
// Admin page for configuring asset categories — measurement rules, enabled features, depreciation.

import { useState } from 'react'
import { useAssetRegistry } from '../../contexts/AssetRegistryContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const BLANK = {
  category: '', display_label: '', icon: 'inventory_2', color: '#94a3b8',
  measurement_type: 'hours', primary_metric: 'hour_meter', service_interval_basis: 'hours',
  show_odometer: false, show_hour_meter: true, enable_trips: false, enable_run_logs: false,
  enable_fuel: true, enable_tyre_module: false,
  depreciation_method: 'straight_line', useful_life_years: 5, is_active: true, sort_order: 99,
}

const TOGGLE = ({ label, field, form, setForm }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 13 }}>{label}</span>
    <button type="button"
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: form[field] ? 'var(--green)' : 'var(--border)',
        position: 'relative', transition: 'background .2s',
      }}
      onClick={() => setForm(f => ({ ...f, [field]: !f[field] }))}>
      <span style={{
        position: 'absolute', top: 2, left: form[field] ? 22 : 2, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', transition: 'left .2s',
      }} />
    </button>
  </div>
)

export default function CategoryConfig() {
  const { categoryConfigs, createCategoryConfig, updateCategoryConfig, loading } = useAssetRegistry()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [showModal, setShowModal] = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)

  const openAdd = () => { setEditId(null); setForm(BLANK); setShowModal(true) }

  const openEdit = (cfg) => {
    setEditId(cfg.id)
    setForm({
      category: cfg.category, display_label: cfg.display_label, icon: cfg.icon, color: cfg.color,
      measurement_type: cfg.measurement_type, primary_metric: cfg.primary_metric,
      service_interval_basis: cfg.service_interval_basis,
      show_odometer: cfg.show_odometer, show_hour_meter: cfg.show_hour_meter,
      enable_trips: cfg.enable_trips, enable_run_logs: cfg.enable_run_logs,
      enable_fuel: cfg.enable_fuel, enable_tyre_module: cfg.enable_tyre_module,
      depreciation_method: cfg.depreciation_method || 'straight_line',
      useful_life_years: cfg.useful_life_years || 5,
      is_active: cfg.is_active !== false, sort_order: cfg.sort_order ?? 99,
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.category.trim() || !form.display_label.trim()) return toast.error('Category key and label are required')
    setSaving(true)
    try {
      if (editId) {
        await updateCategoryConfig(editId, form)
        toast.success('Category updated')
      } else {
        await createCategoryConfig(form)
        toast.success(`Category "${form.display_label}" created`)
      }
      setShowModal(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const FEATURE_MAP = [
    { field: 'show_odometer',     label: 'Show Odometer (km)' },
    { field: 'show_hour_meter',   label: 'Show Hour Meter (hrs)' },
    { field: 'enable_trips',      label: 'Enable Trip Logs' },
    { field: 'enable_run_logs',   label: 'Enable Run Logs' },
    { field: 'enable_fuel',       label: 'Enable Fuel Consumption' },
    { field: 'enable_tyre_module',label: 'Enable Tyre Module' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Category Configuration</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Category
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-dim)' }}>
        Each category defines measurement rules (km vs hours), which features are visible in forms,
        and depreciation defaults. Changes take effect immediately across the Asset Registry.
      </div>

      {loading ? <div className="empty-state">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {categoryConfigs.map(cfg => (
            <div key={cfg.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ color: cfg.color, fontSize: 22 }}>{cfg.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{cfg.display_label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{cfg.category}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {!cfg.is_active && <span className="badge badge-dim">Inactive</span>}
                  {isAdmin && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(cfg)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                <div><strong>Measurement:</strong> {cfg.measurement_type}</div>
                <div><strong>Service basis:</strong> {cfg.service_interval_basis}</div>
                <div><strong>Depreciation:</strong> {(cfg.depreciation_method || 'straight_line').replace(/_/g, ' ')}</div>
                <div><strong>Useful life:</strong> {cfg.useful_life_years}y</div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {cfg.show_odometer    && <span className="badge badge-blue"  style={{ fontSize: 10 }}>Odometer</span>}
                {cfg.show_hour_meter  && <span className="badge badge-teal"  style={{ fontSize: 10 }}>Hours</span>}
                {cfg.enable_fuel      && <span className="badge badge-yellow" style={{ fontSize: 10 }}>Fuel</span>}
                {cfg.enable_trips     && <span className="badge badge-green"  style={{ fontSize: 10 }}>Trips</span>}
                {cfg.enable_run_logs  && <span className="badge badge-purple" style={{ fontSize: 10 }}>Run Logs</span>}
                {cfg.enable_tyre_module && <span className="badge badge-gold" style={{ fontSize: 10 }}>Tyres</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? 'Edit' : 'New'} <span>Category</span></div>
            <form onSubmit={handleSubmit}>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>IDENTITY</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category Key *<span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>(unique, no spaces)</span></label>
                  <input className="form-control" required value={form.category}
                    readOnly={!!editId}
                    style={editId ? { opacity: .6 } : {}}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Heavy Equipment" />
                </div>
                <div className="form-group">
                  <label>Display Label *</label>
                  <input className="form-control" required value={form.display_label}
                    onChange={e => setForm(f => ({ ...f, display_label: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Icon <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(Material icon name)</span></label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="form-control" value={form.icon}
                      onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
                    <span className="material-icons" style={{ color: form.color, fontSize: 28 }}>{form.icon}</span>
                  </div>
                </div>
                <div className="form-group">
                  <label>Colour</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', padding: 2 }}
                      value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                    <input className="form-control" style={{ fontFamily: 'var(--mono)' }}
                      value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Sort Order</label>
                  <input type="number" className="form-control" value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 99 }))} />
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>MEASUREMENT &amp; SERVICE</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Measurement Type</label>
                  <select className="form-control" value={form.measurement_type}
                    onChange={e => setForm(f => ({ ...f, measurement_type: e.target.value }))}>
                    <option value="km">Kilometres (km)</option>
                    <option value="hours">Hours</option>
                    <option value="fixed">Fixed / Count</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Service Interval Basis</label>
                  <select className="form-control" value={form.service_interval_basis}
                    onChange={e => setForm(f => ({ ...f, service_interval_basis: e.target.value }))}>
                    <option value="km">Kilometres</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>FEATURES</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                {FEATURE_MAP.map(({ field, label }) => (
                  <TOGGLE key={field} field={field} label={label} form={form} setForm={setForm} />
                ))}
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>DEPRECIATION DEFAULTS</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Method</label>
                  <select className="form-control" value={form.depreciation_method}
                    onChange={e => setForm(f => ({ ...f, depreciation_method: e.target.value }))}>
                    <option value="straight_line">Straight Line</option>
                    <option value="declining">Declining Balance</option>
                    <option value="units_of_production">Units of Production</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Default Useful Life (years)</label>
                  <input type="number" min="1" max="50" className="form-control"
                    value={form.useful_life_years}
                    onChange={e => setForm(f => ({ ...f, useful_life_years: parseInt(e.target.value) || 5 }))} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div>
                    <TOGGLE field="is_active" label="Category is active" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
