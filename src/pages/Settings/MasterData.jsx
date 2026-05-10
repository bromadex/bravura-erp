// src/pages/Settings/MasterData.jsx
import { useState, useEffect } from 'react'
import { useMasterData } from '../../contexts/MasterDataContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'departments',    label: 'Departments',    icon: 'corporate_fare' },
  { id: 'designations',  label: 'Designations',   icon: 'badge' },
  { id: 'suppliers',     label: 'Suppliers',      icon: 'local_shipping' },
  { id: 'cost_centers',  label: 'Cost Centers',   icon: 'account_balance' },
  { id: 'sites',         label: 'Sites',          icon: 'location_on' },
  { id: 'statuses',      label: 'Statuses',       icon: 'label' },
  { id: 'notif_tpls',   label: 'Notifications',  icon: 'notifications' },
]

const BADGE_CLASS_OPTIONS = [
  'badge-success', 'badge-warning', 'badge-danger', 'badge-info',
  'badge-dim', 'badge-purple', 'badge-orange',
]

const MODULE_OPTIONS = [
  'global', 'hr', 'procurement', 'fleet', 'campsite', 'payroll', 'governance', 'accounts',
]

const NOTIF_TYPE_OPTIONS = ['info', 'success', 'warning', 'error']

export default function MasterData() {
  const {
    departments, designations, suppliers, costCenters, sites,
    statuses, notificationTemplates, loading,
    addDepartment, updateDepartment, deleteDepartment,
    addDesignation, updateDesignation, deleteDesignation,
    addSupplier, updateSupplier, deleteSupplier,
    addCostCenter, updateCostCenter, deleteCostCenter,
    addSite, updateSite, deleteSite,
    addStatus, updateStatus, deleteStatus,
    addNotificationTemplate, updateNotificationTemplate, deleteNotificationTemplate,
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

      {/* ── STATUSES ──────────────────────────────── */}
      {tab === 'statuses' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Status Definitions <span className="badge badge-dim">{(statuses || []).length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'status' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Key</th><th>Label</th><th>Badge</th><th>Module</th><th>Sort</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : !(statuses?.length) ? <tr><td colSpan="7" className="empty-state">No status definitions yet</td></tr>
                : [...(statuses || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(s => (
                  <tr key={s.key}>
                    <td className="td-mono" style={{ color: 'var(--gold)', fontSize: 12 }}>{s.key}</td>
                    <td style={{ fontWeight: 600 }}>{s.label}</td>
                    <td><span className={`badge ${s.badge_class || 'badge-dim'}`}>{s.label}</span></td>
                    <td><span className="badge badge-dim">{s.module || 'global'}</span></td>
                    <td className="td-mono">{s.sort_order ?? 0}</td>
                    <td>
                      {s.active
                        ? <span className="badge badge-success">Active</span>
                        : <span className="badge badge-dim">Inactive</span>}
                    </td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'status', data: s })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteStatus, s.key, 'status')}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── NOTIFICATION TEMPLATES ──────────────────────────────── */}
      {tab === 'notif_tpls' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Notification Templates <span className="badge badge-dim">{(notificationTemplates || []).length}</span></strong>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'notif' })}><span className="material-icons">add</span> Add</button>}
          </div>
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
            Use <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>{'{{variable}}'}</code> placeholders in titles and messages. They are replaced at send time.
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Event Type</th><th>Type</th><th>Title</th><th>Message</th><th>Enabled</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : !(notificationTemplates?.length) ? <tr><td colSpan="6" className="empty-state">No templates yet</td></tr>
                : (notificationTemplates || []).map(t => (
                  <tr key={t.id}>
                    <td className="td-mono" style={{ color: 'var(--gold)', fontSize: 12 }}>{t.event_type}</td>
                    <td><span className={`badge badge-${t.type === 'success' ? 'success' : t.type === 'warning' ? 'warning' : t.type === 'error' ? 'danger' : 'info'}`}>{t.type}</span></td>
                    <td style={{ fontWeight: 600, maxWidth: 180 }} className="truncate">{t.title}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12, maxWidth: 260 }} className="truncate">{t.message}</td>
                    <td>
                      {t.enabled
                        ? <span className="badge badge-success">On</span>
                        : <span className="badge badge-dim">Off</span>}
                    </td>
                    <td className="td-actions">
                      {canEdit && <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'notif', data: t })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteNotificationTemplate, t.id, 'template')}>Delete</button>
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

      {/* Status modal */}
      <StatusModal open={modal?.type === 'status'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateStatus(modal.data.key, x) : addStatus, d, 'Status')} />

      {/* Notification Template modal */}
      <NotifModal open={modal?.type === 'notif'} data={modal?.data} onClose={close}
        onSave={(d) => handleSave(modal?.data ? (x) => updateNotificationTemplate(modal.data.id, x) : addNotificationTemplate, d, 'Template')} />
    </div>
  )
}

function DeptModal({ open, data, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', code: '' })
  useEffect(() => { if (open) setForm({ name: data?.name || '', code: data?.code || '' }) }, [open, data])
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
  useEffect(() => { if (open) setForm({ title: data?.title || '', grade: data?.grade || '' }) }, [open, data])
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
  useEffect(() => {
    if (open) setForm({ name: data?.name || '', contact_person: data?.contact_person || '', phone: data?.phone || '', email: data?.email || '', address: data?.address || '', category: data?.category || '' })
  }, [open, data])
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
  useEffect(() => { if (open) setForm({ code: data?.code || '', name: data?.name || '', description: data?.description || '', active: data?.active ?? true }) }, [open, data])
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
  useEffect(() => { if (open) setForm({ code: data?.code || '', name: data?.name || '', location: data?.location || '', manager: data?.manager || '', active: data?.active ?? true }) }, [open, data])
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

function StatusModal({ open, data, onClose, onSave }) {
  const isEdit = Boolean(data)
  const [form, setForm] = useState({ key: '', label: '', badge_class: 'badge-dim', color: '', icon: '', module: 'global', sort_order: 0, active: true })
  useEffect(() => {
    if (open) setForm({
      key: data?.key || '', label: data?.label || '', badge_class: data?.badge_class || 'badge-dim',
      color: data?.color || '', icon: data?.icon || '', module: data?.module || 'global',
      sort_order: data?.sort_order ?? 0, active: data?.active ?? true,
    })
  }, [open, data])
  return (
    <ModalDialog open={open} onClose={onClose} title={isEdit ? 'Edit Status' : 'Add Status'}>
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group">
            <label>Key * <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(unique, e.g. pending_review)</span></label>
            <input className="form-control" required disabled={isEdit}
              placeholder="snake_case_key"
              value={form.key}
              onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
            {isEdit && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Key cannot be changed after creation.</div>}
          </div>
          <div className="form-group"><label>Label *</label>
            <input className="form-control" required value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Badge Class</label>
            <select className="form-control" value={form.badge_class} onChange={e => setForm(f => ({ ...f, badge_class: e.target.value }))}>
              {BADGE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Module</label>
            <select className="form-control" value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))}>
              {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Material Icon (optional)</label>
            <input className="form-control" placeholder="e.g. check_circle" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} /></div>
          <div className="form-group"><label>Sort Order</label>
            <input type="number" className="form-control" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 12, color: 'var(--text-dim)' }}>Preview: </strong>
          <span className={`badge ${form.badge_class}`}>
            {form.icon && <span className="material-icons" style={{ fontSize: 14 }}>{form.icon}</span>}
            {form.label || 'Label'}
          </span>
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

function NotifModal({ open, data, onClose, onSave }) {
  const isEdit = Boolean(data)
  const [form, setForm] = useState({ event_type: '', type: 'info', title: '', message: '', link: '', enabled: true })
  useEffect(() => {
    if (open) setForm({
      event_type: data?.event_type || '', type: data?.type || 'info',
      title: data?.title || '', message: data?.message || '',
      link: data?.link || '', enabled: data?.enabled ?? true,
    })
  }, [open, data])
  return (
    <ModalDialog open={open} onClose={onClose} title={isEdit ? 'Edit Template' : 'Add Template'} size="lg">
      <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
        <div className="form-row">
          <div className="form-group">
            <label>Event Type * <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(unique key, e.g. sr_submitted)</span></label>
            <input className="form-control" required disabled={isEdit}
              placeholder="snake_case_event"
              value={form.event_type}
              onChange={e => setForm(f => ({ ...f, event_type: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
            {isEdit && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Event type cannot be changed after creation.</div>}
          </div>
          <div className="form-group">
            <label>Notification Type</label>
            <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {NOTIF_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label>Title * <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({'{{variable}}'} supported)</span></label>
          <input className="form-control" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. New Requisition {{req_number}} Submitted" /></div>
        <div className="form-group"><label>Message * <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({'{{variable}}'} supported)</span></label>
          <textarea className="form-control" rows="3" required value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder="e.g. {{requester_name}} submitted a requisition for your approval." /></div>
        <div className="form-group"><label>Link (optional) <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>('/module/...' or {'{{id}}'})</span></label>
          <input className="form-control" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
            placeholder="e.g. /module/procurement/sr/{{req_id}}" /></div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            Enabled (disabled templates are silently skipped)
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
