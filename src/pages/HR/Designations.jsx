import { useState, useEffect, useMemo } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete, useCanManagePermissions } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, ModalDialog, ModalActions, ConfirmDialog } from '../../components/ui'

const MODULES = [
  { name: 'dashboard',   pages: ['overview'] },
  { name: 'inventory',   pages: ['stock-balance','stock-in','stock-out','transactions','stock-taking','categories'] },
  { name: 'procurement', pages: ['suppliers','store-requisitions','purchase-requisitions','purchase-orders','goods-received'] },
  { name: 'fuel',        pages: ['tanks','dipstick','issuance','deliveries','reports'] },
  { name: 'fleet',       pages: ['dashboard','vehicles','generators','heavy-equipment','maintenance-alerts','asset-issues'] },
  { name: 'hr',          pages: ['dashboard','employees','departments','designations','permissions','attendance','leave','leave-balance','travel'] },
  { name: 'accounting',  pages: ['chart-of-accounts','journal-entries','reports'] },
  { name: 'reports',     pages: ['overview','audit-log','drafts'] },
]

const LEVEL_COLORS = ['#94a3b8','#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#f97316','#06b6d4','#ec4899','#10b981']

export default function Designations() {
  const { designations, employees, addDesignation, updateDesignation, deleteDesignation } = useHR()
  const canEdit   = useCanEdit('hr', 'designations')
  const canDelete = useCanDelete('hr', 'designations')
  const canManage = useCanManagePermissions()

  const [modal,   setModal]   = useState(null)  // null | { mode: 'form'|'perm', data }
  const [confirm, setConfirm] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [form,    setForm]    = useState({ title: '', level: 1, description: '', pay_grade_min: '', pay_grade_max: '' })

  // Permissions state
  const [permState,   setPermState]   = useState({})
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving,  setPermSaving]  = useState(false)

  useEffect(() => {
    if (modal?.mode !== 'perm' || !modal.data) return
    const load = async () => {
      setPermLoading(true)
      try {
        const { data } = await supabase.from('designation_permissions').select('*').eq('designation_id', modal.data.id)
        const state = {}
        MODULES.forEach(mod => {
          mod.pages.forEach(page => {
            const key      = `${mod.name}:${page}`
            const existing = (data || []).find(p => p.module_name === mod.name && p.page_name === page)
            state[key] = {
              view:    existing?.can_view    ?? false,
              edit:    existing?.can_edit    ?? false,
              delete:  existing?.can_delete  ?? false,
              approve: existing?.can_approve ?? false,
            }
          })
        })
        setPermState(state)
      } finally { setPermLoading(false) }
    }
    load()
  }, [modal])

  const togglePage   = (modName, page, action, checked) => {
    const key = `${modName}:${page}`
    setPermState(prev => ({ ...prev, [key]: { ...prev[key], [action]: checked } }))
  }
  const toggleViewAll = (modName, checked) => {
    const mod = MODULES.find(m => m.name === modName)
    if (!mod) return
    const updates = {}
    mod.pages.forEach(page => {
      const key = `${modName}:${page}`
      updates[key] = { ...(permState[key] || {}), view: checked }
    })
    setPermState(prev => ({ ...prev, ...updates }))
  }

  const savePermissions = async () => {
    if (!modal?.data) return
    setPermSaving(true)
    try {
      await supabase.from('designation_permissions').delete().eq('designation_id', modal.data.id)
      const rows = Object.entries(permState)
        .filter(([, p]) => p.view || p.edit || p.delete || p.approve)
        .map(([key, p]) => {
          const [module_name, page_name] = key.split(':')
          return { id: crypto.randomUUID(), designation_id: modal.data.id, module_name, page_name, can_view: p.view, can_edit: p.edit, can_delete: p.delete, can_approve: p.approve }
        })
      if (rows.length > 0) {
        const { error } = await supabase.from('designation_permissions').insert(rows)
        if (error) throw new Error(error.message)
      }
      toast.success(`Permissions saved for ${modal.data.title}`)
    } catch (err) { toast.error(err.message) }
    finally { setPermSaving(false) }
  }

  const openAdd = () => {
    setForm({ title: '', level: 1, description: '', pay_grade_min: '', pay_grade_max: '' })
    setModal({ mode: 'form', data: null })
  }
  const openEdit = (des) => {
    setForm({ title: des.title || '', level: des.level || 1, description: des.description || '', pay_grade_min: des.pay_grade_min || '', pay_grade_max: des.pay_grade_max || '' })
    setModal({ mode: 'form', data: des })
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error('Designation title required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        pay_grade_min: form.pay_grade_min ? parseFloat(form.pay_grade_min) : null,
        pay_grade_max: form.pay_grade_max ? parseFloat(form.pay_grade_max) : null,
      }
      if (modal.data?.id) { await updateDesignation(modal.data.id, payload); toast.success('Updated') }
      else { await addDesignation(payload); toast.success('Designation added') }
      setModal(null)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await deleteDesignation(confirm.id)
    toast.success('Deleted')
    setConfirm(null)
  }

  const getHeadcount = (id) => employees.filter(e => e.designation_id === id && e.status === 'Active').length

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return designations.filter(d => !q || d.title?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q))
  }, [designations, search])

  return (
    <div>
      <PageHeader title="Designations" subtitle={`${designations.length} designations configured`}>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Designation
          </button>
        )}
      </PageHeader>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input className="form-control" placeholder="Search designations…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {filtered.length === 0
        ? <EmptyState icon="work" message="No designations found" action={!search ? { label: 'Add Designation', onClick: openAdd } : undefined} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(des => {
              const headcount = getHeadcount(des.id)
              const color     = LEVEL_COLORS[(des.level || 1) - 1] || LEVEL_COLORS[0]
              return (
                <div key={des.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
                  transition: 'all .2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  <div style={{ height: 4, background: color }} />
                  <div style={{ padding: '16px 16px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{des.title}</div>
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                            Level {des.level || 1}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{headcount}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>active</div>
                      </div>
                    </div>

                    {des.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {des.description}
                      </div>
                    )}

                    {(des.pay_grade_min || des.pay_grade_max) && (
                      <div style={{ fontSize: 12, marginTop: 8 }}>
                        <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: 'var(--green)' }}>payments</span>
                        <span style={{ color: 'var(--text-dim)' }}>Pay Grade: </span>
                        <strong style={{ color: 'var(--green)' }}>
                          {des.pay_grade_min ? `$${Number(des.pay_grade_min).toLocaleString()}` : '—'}
                          {' – '}
                          {des.pay_grade_max ? `$${Number(des.pay_grade_max).toLocaleString()}` : '—'}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {canManage && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'perm', data: des })} title="Set permissions">
                        <span className="material-icons" style={{ fontSize: 14 }}>admin_panel_settings</span>
                      </button>
                    )}
                    {canEdit && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(des)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: des.id, title: des.title })}>
                        <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {/* Add/Edit modal */}
      <ModalDialog open={modal?.mode === 'form'} onClose={() => setModal(null)}
        title={modal?.data?.id ? `Edit — ${modal.data.title}` : 'Add Designation'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Title *</label>
            <input className="form-control" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Senior Engineer" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Role responsibilities…" />
          </div>
          <div className="form-group">
            <label>Level / Grade <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(1 = entry level, 10 = executive)</span></label>
            <input type="range" min={1} max={10} value={form.level} onChange={e => setForm(p => ({ ...p, level: parseInt(e.target.value) }))}
              style={{ width: '100%', accentColor: LEVEL_COLORS[(form.level - 1)] || 'var(--gold)', marginTop: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>1 – Entry</span>
              <span style={{ fontWeight: 700, color: LEVEL_COLORS[(form.level - 1)] || 'var(--gold)', fontSize: 14 }}>Level {form.level}</span>
              <span>10 – Executive</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Min Pay Grade ($/month)</label>
              <input type="number" min={0} step={100} className="form-control" value={form.pay_grade_min} onChange={e => setForm(p => ({ ...p, pay_grade_min: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Max Pay Grade ($/month)</label>
              <input type="number" min={0} step={100} className="form-control" value={form.pay_grade_max} onChange={e => setForm(p => ({ ...p, pay_grade_max: e.target.value }))} placeholder="0" />
            </div>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : (modal?.data?.id ? 'Save Changes' : 'Add Designation')}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Permissions panel modal */}
      <ModalDialog open={modal?.mode === 'perm'} onClose={() => setModal(null)}
        title={`Permissions — ${modal?.data?.title || ''}`} size="xl">
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
          Baseline permissions for all employees with this designation. Role and individual overrides still apply on top.
        </div>
        {permLoading
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading permissions…</div>
          : (
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 2 }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Module</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Page</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>View</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Edit</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Delete</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Approve</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map(mod => {
                    const allViewed = mod.pages.every(p => permState[`${mod.name}:${p}`]?.view)
                    return mod.pages.map((page, pageIdx) => {
                      const key   = `${mod.name}:${page}`
                      const perms = permState[key] || { view: false, edit: false, delete: false, approve: false }
                      return (
                        <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
                          {pageIdx === 0 ? (
                            <td rowSpan={mod.pages.length} style={{ padding: '8px 12px', fontWeight: 700, verticalAlign: 'top', paddingTop: 14, color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                              <div>{mod.name}</div>
                              <button className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 10 }}
                                onClick={() => toggleViewAll(mod.name, !allViewed)}>
                                {allViewed ? 'Remove all' : 'View all'}
                              </button>
                            </td>
                          ) : null}
                          <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{page}</td>
                          {['view','edit','delete','approve'].map(action => (
                            <td key={action} style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input type="checkbox" checked={perms[action] ?? false} onChange={e => togglePage(mod.name, page, action, e.target.checked)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                            </td>
                          ))}
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>
          )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
          <button className="btn btn-primary" onClick={savePermissions} disabled={permSaving}>
            <span className="material-icons" style={{ fontSize: 15 }}>save</span>
            {permSaving ? 'Saving…' : 'Save Permissions'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Designation"
        message={`Delete "${confirm?.title}"? Employees assigned to this designation will lose it.`}
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
