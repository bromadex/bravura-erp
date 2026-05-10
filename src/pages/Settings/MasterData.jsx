// src/pages/Settings/MasterData.jsx
import { useState } from 'react'
import { useMasterData } from '../../contexts/MasterDataContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'departments',  label: 'Departments',  icon: 'corporate_fare' },
  { id: 'designations', label: 'Designations', icon: 'badge' },
  { id: 'suppliers',    label: 'Suppliers',    icon: 'local_shipping' },
  { id: 'cost_centers', label: 'Cost Centers', icon: 'account_balance' },
  { id: 'sites',        label: 'Sites',        icon: 'location_on' },
]

export default function MasterData() {
  const {
    departments, designations, suppliers, costCenters, sites, loading,
    addDepartment, updateDepartment, deleteDepartment,
    addDesignation, updateDesignation, deleteDesignation,
    addSupplier, updateSupplier, deleteSupplier,
    addCostCenter, updateCostCenter, deleteCostCenter,
    addSite, updateSite, deleteSite,
  } = useMasterData()
  const canEdit = useCanEdit('settings', 'master-data')
  const [tab, setTab] = useState('departments')
  const [modal, setModal] = useState(null) // { type, data? }

  const close = () => setModal(null)

  const handleSave = async (fn, data, label) => {
    try {
      await fn(data)
      toast.success(`${label} saved`)
      close()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (fn, id, label) => {
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return
    try {
      await fn(id)
      toast.success(`${label} deleted`)
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <PageHeader title="Master Data" subtitle="Central reference data used across all modules" />

      {/* Tab Navigation */}
      <div className="tab-nav" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="material-icons" style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DEPARTMENTS ──────────────────────────────── */}
      {tab === 'departments' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Departments <span className="badge badge-dim">{departments.length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'dept' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Code</th><th>Name</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : departments.length === 0 ? <tr><td colSpan="3" className="empty-state">No departments</td></tr>
                : departments.map(d => (
                  <tr key={d.id}>
                    <td className="td-mono" style={{ color: 'var(--gold)' }}>{d.code || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'dept', data: d })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteDepartment, d.id, 'department')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DESIGNATIONS ──────────────────────────────── */}
      {tab === 'designations' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Designations <span className="badge badge-dim">{designations.length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'des' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Title</th><th>Grade</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : designations.length === 0 ? <tr><td colSpan="3" className="empty-state">No designations</td></tr>
                : designations.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.title}</td>
                    <td className="td-mono">{d.grade || '—'}</td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'des', data: d })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteDesignation, d.id, 'designation')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SUPPLIERS ──────────────────────────────── */}
      {tab === 'suppliers' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Suppliers <span className="badge badge-dim">{suppliers.length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'sup' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Name</th><th>Category</th><th>Contact</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : suppliers.length === 0 ? <tr><td colSpan="6" className="empty-state">No suppliers</td></tr>
                : suppliers.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><span className="badge badge-dim">{s.category || '—'}</span></td>
                    <td>{s.contact_person || '—'}</td>
                    <td className="td-mono">{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'sup', data: s })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteSupplier, s.id, 'supplier')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── COST CENTERS ──────────────────────────────── */}
      {tab === 'cost_centers' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Cost Centers <span className="badge badge-dim">{costCenters.length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'cc' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : costCenters.length === 0 ? <tr><td colSpan="5" className="empty-state">No cost centers yet</td></tr>
                : costCenters.map(cc => (
                  <tr key={cc.id}>
                    <td className="td-mono" style={{ color: 'var(--gold)' }}>{cc.code}</td>
                    <td style={{ fontWeight: 600 }}>{cc.name}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{cc.description || '—'}</td>
                    <td><StatusBadge status={cc.active ? 'active' : 'inactive'} /></td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'cc', data: cc })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteCostCenter, cc.id, 'cost center')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SITES ──────────────────────────────── */}
      {tab === 'sites' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Sites / Locations <span className="badge badge-dim">{sites.length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'site' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Code</th><th>Name</th><th>Location</th><th>Manager</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : sites.length === 0 ? <tr><td colSpan="6" className="empty-state">No sites yet</td></tr>
                : sites.map(s => (
                  <tr key={s.id}>
                    <td className="td-mono" style={{ color: 'var(--gold)' }}>{s.code}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.location || '—'}</td>
                    <td>{s.manager || '—'}</td>
                    <td><StatusBadge status={s.active ? 'active' : 'inactive'} /></td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'site', data: s })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteSite, s.id, 'site')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────── */}

      {/* Department modal */}
      <DeptModal open={modal?.type === 'dept'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateDepartment(modal.data.id, x) : addDepartment, d, 'Department')} />

      {/* Designation modal */}
      <DesModal open={modal?.type === 'des'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateDesignation(modal.data.id, x) : addDesignation, d, 'Designation')} />

      {/* Supplier modal */}
      <SupModal open={modal?.type === 'sup'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateSupplier(modal.data.id, x) : addSupplier, d, 'Supplier')} />

      {/* Cost Center modal */}
      <CCModal open={modal?.type === 'cc'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateCostCenter(modal.data.id, x) : addCostCenter, d, 'Cost Center')} />

      {/* Site modal */}
      <SiteModal open={modal?.type === 'site'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateSite(modal.data.id, x) : addSite, d, 'Site')} />
    </div>
  )
}

function DeptModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', code: '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (open) setForm({ name: data?.name || '', code: data?.code || '' }) })
  return (
    <ModalDialog open={open} onClose={onClose} title={data ? 'Edit Department' : 'Add Department'}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group"><label>Department Name *</label>
            <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label>Code</label>
            <input className="form-control" placeholder="e.g. HR, OPS, FIN" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
        </div>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

function DesModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', grade: '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (open) setForm({ title: data?.title || '', grade: data?.grade || '' }) })
  return (
    <ModalDialog open={open} onClose={onClose} title={data ? 'Edit Designation' : 'Add Designation'}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group"><label>Designation Title *</label>
            <input className="form-control" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="form-group"><label>Grade</label>
            <input className="form-control" placeholder="e.g. A1, B2, C3" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} /></div>
        </div>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

function SupModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', category: '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    if (open) setForm({ name: data?.name || '', contact_person: data?.contact_person || '', phone: data?.phone || '', email: data?.email || '', address: data?.address || '', category: data?.category || '' })
  })
  return (
    <ModalDialog open={open} onClose={onClose} title={data ? 'Edit Supplier' : 'Add Supplier'} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group"><label>Supplier Name *</label>
            <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group"><label>Category</label>
            <input className="form-control" placeholder="e.g. Materials, Services" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Contact Person</label>
            <input className="form-control" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
          <div className="form-group"><label>Phone</label>
            <input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Email</label>
            <input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="form-group"><label>Address</label>
            <input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
        </div>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

function CCModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ code: '', name: '', description: '', active: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (open) setForm({ code: data?.code || '', name: data?.name || '', description: data?.description || '', active: data?.active ?? true }) })
  return (
    <ModalDialog open={open} onClose={onClose} title={data ? 'Edit Cost Center' : 'Add Cost Center'}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group"><label>Code *</label>
            <input className="form-control" required placeholder="e.g. CC-001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
          <div className="form-group"><label>Name *</label>
            <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label>Description</label>
          <textarea className="form-control" rows="2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active
          </label>
        </div>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

function SiteModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ code: '', name: '', location: '', manager: '', active: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { if (open) setForm({ code: data?.code || '', name: data?.name || '', location: data?.location || '', manager: data?.manager || '', active: data?.active ?? true }) })
  return (
    <ModalDialog open={open} onClose={onClose} title={data ? 'Edit Site' : 'Add Site'}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group"><label>Site Code *</label>
            <input className="form-control" required placeholder="e.g. SITE-01" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
          <div className="form-group"><label>Site Name *</label>
            <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Location / Address</label>
            <input className="form-control" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          <div className="form-group"><label>Site Manager</label>
            <input className="form-control" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} /></div>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active
          </label>
        </div>
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}
