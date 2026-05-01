// src/pages/HR/UserPermissions.jsx
//
// NEW FEATURES:
// 1. Permission Templates — apply a preset to an employee in one click
// 2. Bulk Assign — apply same permissions to multiple employees at once
// 3. HR Password Reset — generate a new temp password for any employee

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { useCanManagePermissions } from '../../hooks/usePermission'

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

const emptyPermState = () => {
  const state = {}
  MODULES.forEach(mod => mod.pages.forEach(page => {
    state[`${mod.name}:${page}`] = { view: false, edit: false, delete: false, approve: false }
  }))
  return state
}

export default function UserPermissions() {
  const { employees, setUserPermissions, fetchAll } = useHR()
  const canManage = useCanManagePermissions()

  // Tab: 'individual' | 'bulk' | 'templates' | 'reset'
  const [activeTab, setActiveTab] = useState('individual')

  // Individual assignment
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [permState, setPermState] = useState(emptyPermState())
  const [saving, setSaving] = useState(false)

  // Templates
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  // Bulk assign
  const [bulkEmployees, setBulkEmployees]       = useState([])
  const [bulkPermState, setBulkPermState]       = useState(emptyPermState())
  const [bulkTemplate, setBulkTemplate]         = useState(null)
  const [bulkSaving, setBulkSaving]             = useState(false)

  // Password reset
  const [resetEmployee, setResetEmployee]       = useState(null)
  const [resetResult,   setResetResult]         = useState(null)
  const [resetting,     setResetting]           = useState(false)

  const eligibleEmployees = employees.filter(e => e.system_user_id)

  // Load templates
  useEffect(() => {
    const load = async () => {
      setTemplatesLoading(true)
      const { data } = await supabase.from('permission_templates').select('*').order('name')
      setTemplates(data || [])
      setTemplatesLoading(false)
    }
    load()
  }, [])

  // Load permissions when employee selected
  useEffect(() => {
    if (!selectedEmployee?.system_user_id) { setPermState(emptyPermState()); return }
    const load = async () => {
      const { data } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', selectedEmployee.system_user_id)
      const state = emptyPermState()
      ;(data || []).forEach(p => {
        const key = `${p.module_name}:${p.page_name}`
        if (state[key]) {
          state[key] = { view: p.can_view, edit: p.can_edit, delete: p.can_delete, approve: p.can_approve }
        }
      })
      setPermState(state)
    }
    load()
  }, [selectedEmployee])

  const handleCheck = (mod, page, action, checked) => {
    const key = `${mod}:${page}`
    setPermState(prev => ({ ...prev, [key]: { ...prev[key], [action]: checked } }))
  }

  const toggleModule = (modName, checked, setter = setPermState) => {
    const mod = MODULES.find(m => m.name === modName)
    if (!mod) return
    const updates = {}
    mod.pages.forEach(page => {
      updates[`${modName}:${page}`] = { view: checked, edit: false, delete: false, approve: false }
    })
    setter(prev => ({ ...prev, ...updates }))
  }

  // Apply template to permState
  const applyTemplate = (template, setter = setPermState) => {
    const state = emptyPermState()
    const perms = Array.isArray(template.permissions) ? template.permissions : JSON.parse(template.permissions)
    perms.forEach(p => {
      const key = `${p.module}:${p.page}`
      if (state[key] !== undefined) {
        state[key] = { view: p.can_view, edit: p.can_edit, delete: p.can_delete, approve: p.can_approve }
      }
    })
    setter(state)
  }

  // Save individual permissions
  const savePermissions = async () => {
    if (!selectedEmployee?.system_user_id) return
    setSaving(true)
    try {
      const permsList = Object.entries(permState).map(([key, perms]) => {
        const [module, page] = key.split(':')
        return { module, page, can_view: perms.view, can_edit: perms.edit, can_delete: perms.delete, can_approve: perms.approve }
      })
      await setUserPermissions(selectedEmployee.system_user_id, permsList)
      toast.success(`Permissions saved for ${selectedEmployee.name}`)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // Save bulk permissions
  const saveBulkPermissions = async () => {
    if (!bulkEmployees.length) return toast.error('Select at least one employee')
    setBulkSaving(true)
    let ok = 0
    try {
      const state = bulkTemplate ? (() => { const s = emptyPermState(); applyTemplate(bulkTemplate, st => { Object.assign(s, st) }); return s })() : bulkPermState
      const permsList = Object.entries(state).map(([key, perms]) => {
        const [module, page] = key.split(':')
        return { module, page, can_view: perms.view, can_edit: perms.edit, can_delete: perms.delete, can_approve: perms.approve }
      })
      for (const empId of bulkEmployees) {
        const emp = employees.find(e => e.id === empId)
        if (!emp?.system_user_id) continue
        await setUserPermissions(emp.system_user_id, permsList)
        ok++
      }
      toast.success(`Permissions applied to ${ok} employee${ok !== 1 ? 's' : ''}`)
      setBulkEmployees([])
      setBulkTemplate(null)
      setBulkPermState(emptyPermState())
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setBulkSaving(false) }
  }

  // HR password reset
  const handlePasswordReset = async () => {
    if (!resetEmployee?.system_user_id) return toast.error('No system account found')
    setResetting(true)
    setResetResult(null)
    try {
      const newPassword = Math.random().toString(36).slice(-8) + (Math.floor(Math.random() * 90) + 10)
      const { error } = await supabase
        .from('app_users')
        .update({
          password_plain:       newPassword,
          password_hash:        btoa(newPassword),
          must_change_password: true,
        })
        .eq('id', resetEmployee.system_user_id)
      if (error) throw new Error(error.message)
      setResetResult({ username: resetEmployee.system_username, password: newPassword })
      toast.success(`Password reset for ${resetEmployee.name}`)
    } catch (err) { toast.error(err.message) }
    finally { setResetting(false) }
  }

  const copyReset = () => {
    if (!resetResult) return
    navigator.clipboard.writeText(`Username: ${resetResult.username}\nNew Password: ${resetResult.password}`)
    toast.success('Copied to clipboard')
  }

  if (!canManage) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>lock</span>
        <p>You don't have permission to manage user permissions.</p>
      </div>
    )
  }

  const TABS = [
    { id: 'individual', label: 'Individual',  icon: 'person'            },
    { id: 'bulk',       label: 'Bulk Assign', icon: 'group'             },
    { id: 'templates',  label: 'Templates',   icon: 'layers'            },
    { id: 'reset',      label: 'Reset Password', icon: 'lock_reset'     },
  ]

  const PermTable = ({ state, onCheck, onToggleModule }) => (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="stock-table" style={{ minWidth: 600 }}>
        <thead>
          <tr><th>Module</th><th>Page</th><th style={{ textAlign: 'center' }}>View</th><th style={{ textAlign: 'center' }}>Edit</th><th style={{ textAlign: 'center' }}>Delete</th><th style={{ textAlign: 'center' }}>Approve</th></tr>
        </thead>
        <tbody>
          {MODULES.map(mod => {
            const allViewed = mod.pages.every(p => state[`${mod.name}:${p}`]?.view)
            return mod.pages.map((page, idx) => {
              const key   = `${mod.name}:${page}`
              const perms = state[key] || {}
              return (
                <tr key={key}>
                  {idx === 0 && (
                    <td rowSpan={mod.pages.length} style={{ fontWeight: 700, verticalAlign: 'top', paddingTop: 14, color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                      <div>{mod.name}</div>
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 10 }}
                        onClick={() => onToggleModule(mod.name, !allViewed)}>
                        {allViewed ? 'Clear' : 'View all'}
                      </button>
                    </td>
                  )}
                  <td style={{ color: 'var(--text-mid)', fontSize: 12 }}>{page}</td>
                  {['view','edit','delete','approve'].map(action => (
                    <td key={action} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={perms[action] ?? false}
                        onChange={e => onCheck(mod.name, page, action, e.target.checked)}
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
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Permissions</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-mid)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ── INDIVIDUAL TAB ─────────────────────────────────────── */}
      {activeTab === 'individual' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Employee (must have system account)</label>
                <select className="form-control"
                  value={selectedEmployee?.id || ''}
                  onChange={e => setSelectedEmployee(eligibleEmployees.find(emp => emp.id === e.target.value) || null)}>
                  <option value="">— Select employee —</option>
                  {eligibleEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.system_username})</option>)}
                </select>
              </div>
              {templates.length > 0 && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Apply Template</label>
                  <select className="form-control" value=""
                    onChange={e => {
                      const t = templates.find(t => t.id === e.target.value)
                      if (t) { applyTemplate(t); toast.success(`Template "${t.name}" applied`) }
                    }}>
                    <option value="">— Choose template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          {selectedEmployee && (
            <>
              <PermTable
                state={permState}
                onCheck={handleCheck}
                onToggleModule={(mod, checked) => toggleModule(mod, checked, setPermState)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-primary" onClick={savePermissions} disabled={saving}>
                  <span className="material-icons">save</span>
                  {saving ? 'Saving…' : `Save for ${selectedEmployee.name}`}
                </button>
              </div>
            </>
          )}
          {!selectedEmployee && (
            <div className="empty-state">
              <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>person_search</span>
              <span>Select an employee above to manage their permissions</span>
            </div>
          )}
        </div>
      )}

      {/* ── BULK ASSIGN TAB ────────────────────────────────────── */}
      {activeTab === 'bulk' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select Employees</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
              {eligibleEmployees.map(emp => (
                <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, cursor: 'pointer', border: bulkEmployees.includes(emp.id) ? '1px solid var(--gold)' : '1px solid var(--border)' }}>
                  <input type="checkbox"
                    checked={bulkEmployees.includes(emp.id)}
                    onChange={e => setBulkEmployees(prev => e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id))}
                    style={{ accentColor: 'var(--gold)', width: 15, height: 15 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{emp.system_username}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setBulkEmployees(eligibleEmployees.map(e => e.id))}>Select All</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setBulkEmployees([])}>Clear</button>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center', marginLeft: 8 }}>
                {bulkEmployees.length} selected
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Permissions to Apply</h3>
              <select className="form-control" style={{ width: 200 }}
                value={bulkTemplate?.id || ''}
                onChange={e => {
                  const t = templates.find(t => t.id === e.target.value) || null
                  setBulkTemplate(t)
                  if (t) applyTemplate(t, setBulkPermState)
                  else setBulkPermState(emptyPermState())
                }}>
                <option value="">— Or use template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <PermTable
              state={bulkPermState}
              onCheck={(mod, page, action, checked) => {
                setBulkTemplate(null)
                const key = `${mod}:${page}`
                setBulkPermState(prev => ({ ...prev, [key]: { ...prev[key], [action]: checked } }))
              }}
              onToggleModule={(mod, checked) => { setBulkTemplate(null); toggleModule(mod, checked, setBulkPermState) }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveBulkPermissions} disabled={bulkSaving || !bulkEmployees.length}>
              <span className="material-icons">group</span>
              {bulkSaving ? 'Applying…' : `Apply to ${bulkEmployees.length} Employee${bulkEmployees.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── TEMPLATES TAB ──────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>
            Permission templates provide a baseline set of permissions you can apply to any employee or designation in one click. Templates are managed in the database — add new ones via Supabase → permission_templates table.
          </div>
          {templatesLoading ? (
            <div className="empty-state">Loading templates…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {templates.map(template => {
                const perms = Array.isArray(template.permissions) ? template.permissions : JSON.parse(template.permissions || '[]')
                const modulesCovered = [...new Set(perms.filter(p => p.can_view).map(p => p.module))]
                return (
                  <div key={template.id} className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{template.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{template.description}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {modulesCovered.map(mod => (
                            <span key={mod} className="badge badge-blue" style={{ fontSize: 10 }}>{mod}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        className={`btn btn-secondary btn-sm ${selectedTemplate?.id === template.id ? 'btn-primary' : ''}`}
                        onClick={() => setSelectedTemplate(selectedTemplate?.id === template.id ? null : template)}
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>
                          {selectedTemplate?.id === template.id ? 'expand_less' : 'expand_more'}
                        </span>
                        {selectedTemplate?.id === template.id ? 'Hide' : 'Preview'}
                      </button>
                    </div>
                    {selectedTemplate?.id === template.id && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <div className="table-wrap">
                          <table className="stock-table">
                            <thead>
                              <tr><th>Module</th><th>Page</th><th style={{ textAlign: 'center' }}>View</th><th style={{ textAlign: 'center' }}>Edit</th><th style={{ textAlign: 'center' }}>Delete</th><th style={{ textAlign: 'center' }}>Approve</th></tr>
                            </thead>
                            <tbody>
                              {perms.map((p, i) => (
                                <tr key={i}>
                                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)' }}>{p.module}</td>
                                  <td style={{ fontSize: 12 }}>{p.page}</td>
                                  {['can_view','can_edit','can_delete','can_approve'].map(a => (
                                    <td key={a} style={{ textAlign: 'center' }}>
                                      <span className="material-icons" style={{ fontSize: 14, color: p[a] ? 'var(--green)' : 'var(--border2)' }}>
                                        {p[a] ? 'check_circle' : 'radio_button_unchecked'}
                                      </span>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {templates.length === 0 && <div className="empty-state">No templates found. Add them to the permission_templates table in Supabase.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── RESET PASSWORD TAB ─────────────────────────────────── */}
      {activeTab === 'reset' && (
        <div style={{ maxWidth: 500 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Reset Employee Password</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>
              Generates a new temporary password. The employee will be required to change it on next login.
            </p>
            <div className="form-group">
              <label>Select Employee</label>
              <select className="form-control"
                value={resetEmployee?.id || ''}
                onChange={e => { setResetEmployee(eligibleEmployees.find(emp => emp.id === e.target.value) || null); setResetResult(null) }}>
                <option value="">— Select employee —</option>
                {eligibleEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.system_username})</option>)}
              </select>
            </div>

            {resetEmployee && !resetResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{ padding: '12px 16px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{resetEmployee.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{resetEmployee.system_username}</div>
                </div>
                <button className="btn btn-danger" onClick={handlePasswordReset} disabled={resetting} style={{ width: '100%', justifyContent: 'center' }}>
                  <span className="material-icons">lock_reset</span>
                  {resetting ? 'Resetting…' : 'Generate New Password'}
                </button>
              </div>
            )}

            {resetResult && (
              <div style={{ marginTop: 16, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.3)', borderRadius: 10, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span className="material-icons" style={{ color: 'var(--green)' }}>check_circle</span>
                  <strong>Password Reset Successfully</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Username</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>{resetResult.username}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>New Password</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>{resetResult.password}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, marginBottom: 14 }}>
                  Employee must change password on next login.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={copyReset} style={{ flex: 1, justifyContent: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>content_copy</span> Copy
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setResetEmployee(null); setResetResult(null) }} style={{ flex: 1, justifyContent: 'center' }}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
