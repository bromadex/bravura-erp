// src/pages/HR/Designations.jsx
//
// NEW: Each designation now has a "Set Permissions" button.
// Clicking it opens a side panel showing all module/page permissions
// for that designation. These are saved to designation_permissions table.
// When an employee with that designation logs in, these permissions form
// the baseline layer (role and user-specific overrides still apply on top).

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete, useCanManagePermissions } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

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

export default function Designations() {
  const { designations, addDesignation, updateDesignation, deleteDesignation } = useHR()
  const canEdit       = useCanEdit('hr', 'designations')
  const canDelete     = useCanDelete('hr', 'designations')
  const canManage     = useCanManagePermissions()

  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState({ title: '', level: 1 })

  // Designation permissions panel
  const [permPanel,  setPermPanel]  = useState(null)   // designation object or null
  const [permState,  setPermState]  = useState({})
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving]   = useState(false)

  // Load existing permissions when a designation is selected
  useEffect(() => {
    if (!permPanel) return
    const load = async () => {
      setPermLoading(true)
      try {
        const { data } = await supabase
          .from('designation_permissions')
          .select('*')
          .eq('designation_id', permPanel.id)

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
      } finally {
        setPermLoading(false)
      }
    }
    load()
  }, [permPanel])

  const togglePage = (modName, page, action, checked) => {
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
    if (!permPanel) return
    setPermSaving(true)
    try {
      // Delete existing and re-insert (simplest upsert for JSONB-free tables)
      await supabase.from('designation_permissions').delete().eq('designation_id', permPanel.id)

      const rows = Object.entries(permState)
        .filter(([, perms]) => perms.view || perms.edit || perms.delete || perms.approve)
        .map(([key, perms]) => {
          const [module_name, page_name] = key.split(':')
          return {
            id:             crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
            designation_id: permPanel.id,
            module_name,
            page_name,
            can_view:    perms.view,
            can_edit:    perms.edit,
            can_delete:  perms.delete,
            can_approve: perms.approve,
          }
        })

      if (rows.length > 0) {
        const { error } = await supabase.from('designation_permissions').insert(rows)
        if (error) throw new Error(error.message)
      }

      toast.success(`Permissions saved for ${permPanel.title}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPermSaving(false)
    }
  }

  // Designation CRUD
  const openModal = (des = null) => {
    if (des) { setEditing(des); setForm({ title: des.title, level: des.level || 1 }) }
    else { setEditing(null); setForm({ title: '', level: 1 }) }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title) return toast.error('Designation title required')
    try {
      if (editing) { await updateDesignation(editing.id, form); toast.success('Designation updated') }
      else { await addDesignation(form); toast.success('Designation added') }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete designation "${title}"?`)) return
    await deleteDesignation(id)
    toast.success('Deleted')
    if (permPanel?.id === id) setPermPanel(null)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Designations</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            <span className="material-icons">add</span> Add Designation
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Designation list */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {designations.map(des => (
                  <tr key={des.id} style={{ background: permPanel?.id === des.id ? 'rgba(251,191,36,.06)' : 'transparent' }}>
                    <td style={{ fontWeight: 600 }}>{des.title}</td>
                    <td>{des.level || 1}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {canEdit && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal(des)}>
                          <span className="material-icons">edit</span>
                        </button>
                      )}
                      {canManage && (
                        <button
                          className={`btn btn-sm ${permPanel?.id === des.id ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPermPanel(permPanel?.id === des.id ? null : des)}
                          title="Set permissions for this designation"
                        >
                          <span className="material-icons">admin_panel_settings</span>
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(des.id, des.title)}>
                          <span className="material-icons">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {designations.length === 0 && (
                  <tr><td colSpan="3" className="empty-state">No designations</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permissions panel */}
        {permPanel && (
          <div className="card" style={{ flex: 2, minWidth: 320, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>admin_panel_settings</span>
                  {permPanel.title} — Permissions
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  These are the baseline permissions for all employees with this designation.
                  Role and individual overrides still apply on top.
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setPermPanel(null)}>
                <span className="material-icons" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>

            {permLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading permissions…</div>
            ) : (
              <>
                <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Page</th>
                        <th style={{ textAlign: 'center' }}>View</th>
                        <th style={{ textAlign: 'center' }}>Edit</th>
                        <th style={{ textAlign: 'center' }}>Delete</th>
                        <th style={{ textAlign: 'center' }}>Approve</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(mod => {
                        const allViewed = mod.pages.every(p => permState[`${mod.name}:${p}`]?.view)
                        return mod.pages.map((page, pageIdx) => {
                          const key   = `${mod.name}:${page}`
                          const perms = permState[key] || { view: false, edit: false, delete: false, approve: false }
                          return (
                            <tr key={key}>
                              {pageIdx === 0 ? (
                                <td rowSpan={mod.pages.length} style={{ fontWeight: 700, verticalAlign: 'top', paddingTop: 14, color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                                  <div>{mod.name}</div>
                                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 10 }}
                                    onClick={() => toggleViewAll(mod.name, !allViewed)}>
                                    {allViewed ? 'Remove all' : 'View all'}
                                  </button>
                                </td>
                              ) : null}
                              <td style={{ color: 'var(--text-mid)', fontSize: 12 }}>{page}</td>
                              {['view','edit','delete','approve'].map(action => (
                                <td key={action} style={{ textAlign: 'center' }}>
                                  <input type="checkbox"
                                    checked={perms[action] ?? false}
                                    onChange={e => togglePage(mod.name, page, action, e.target.checked)}
                                    style={{ cursor: 'pointer', width: 15, height: 15 }} />
                                </td>
                              ))}
                            </tr>
                          )
                        })
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={savePermissions} disabled={permSaving}>
                    <span className="material-icons">save</span>
                    {permSaving ? 'Saving…' : `Save Permissions for ${permPanel.title}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Designation</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title *</label>
                <input className="form-control" required value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Level / Grade</label>
                <input type="number" className="form-control" value={form.level}
                  onChange={e => setForm({ ...form, level: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
