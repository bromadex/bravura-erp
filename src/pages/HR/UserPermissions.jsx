// src/pages/HR/UserPermissions.jsx
import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import { useCanManagePermissions } from '../../hooks/usePermission'

const MODULES = [
  { name: 'dashboard', pages: ['overview'] },
  { name: 'inventory', pages: ['stock-balance', 'stock-in', 'stock-out', 'transactions', 'stock-taking', 'categories'] },
  { name: 'procurement', pages: ['suppliers', 'store-requisitions', 'purchase-requisitions', 'purchase-orders', 'goods-received'] },
  { name: 'fuel', pages: ['tanks', 'dipstick', 'issuance', 'deliveries', 'reports'] },
  { name: 'fleet', pages: ['dashboard', 'vehicles', 'generators', 'heavy-equipment', 'maintenance-alerts', 'asset-issues'] },
  { name: 'hr', pages: ['dashboard', 'employees', 'departments', 'designations', 'permissions', 'attendance', 'leave', 'travel'] },
  { name: 'accounting', pages: ['chart-of-accounts', 'journal-entries', 'reports'] },
  { name: 'reports', pages: ['overview', 'audit-log', 'drafts'] },
]

export default function UserPermissions() {
  const { employees, permissions, setUserPermissions, fetchAll } = useHR()
  const canManage = useCanManagePermissions()

  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [permState, setPermState] = useState({})
  const [saving, setSaving] = useState(false)

  // ✅ SAFE: only run when selectedEmployee has a valid system_user_id
  useEffect(() => {
    if (!selectedEmployee?.system_user_id) return
    if (!permissions || permissions.length === 0) return

    const userPerms = permissions.filter(p => p.user_id === selectedEmployee.system_user_id)
    const newState = {}
    MODULES.forEach(mod => {
      mod.pages.forEach(page => {
        const existing = userPerms.find(p => p.module_name === mod.name && p.page_name === page)
        newState[`${mod.name}:${page}`] = {
          view:    existing?.can_view    ?? false,
          edit:    existing?.can_edit    ?? false,
          delete:  existing?.can_delete  ?? false,
          approve: existing?.can_approve ?? false,
        }
      })
    })
    setPermState(newState)
  }, [selectedEmployee, permissions])

  const handleCheck = (module, page, action, checked) => {
    const key = `${module}:${page}`
    setPermState(prev => ({ ...prev, [key]: { ...prev[key], [action]: checked } }))
  }

  const toggleModule = (moduleName, checked) => {
    const mod = MODULES.find(m => m.name === moduleName)
    if (!mod) return
    const updates = {}
    mod.pages.forEach(page => {
      const key = `${moduleName}:${page}`
      updates[key] = { ...(permState[key] || {}), view: checked }
    })
    setPermState(prev => ({ ...prev, ...updates }))
  }

  const savePermissions = async () => {
    if (!selectedEmployee?.system_user_id) {
      toast.error('Selected employee has no system account')
      return
    }
    setSaving(true)
    try {
      const permsList = Object.entries(permState).map(([key, perms]) => {
        const [module, page] = key.split(':')
        return {
          module, page,
          can_view:    perms.view    ?? false,
          can_edit:    perms.edit    ?? false,
          can_delete:  perms.delete  ?? false,
          can_approve: perms.approve ?? false,
        }
      })
      await setUserPermissions(selectedEmployee.system_user_id, permsList)
      toast.success(`Permissions saved for ${selectedEmployee.name}`)
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>lock</span>
        <p>You don't have permission to manage user permissions.</p>
      </div>
    )
  }

  const eligibleEmployees = employees.filter(e => e.system_user_id)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Permissions</h1>
        {selectedEmployee && (
          <button className="btn btn-primary" onClick={savePermissions} disabled={saving}>
            <span className="material-icons">save</span> {saving ? 'Saving…' : 'Save Permissions'}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-group">
          <label>Select Employee (must have a system account)</label>
          <select
            className="form-control"
            value={selectedEmployee?.id || ''}
            onChange={e => setSelectedEmployee(eligibleEmployees.find(emp => emp.id === e.target.value) || null)}
          >
            <option value="">— Select an employee —</option>
            {eligibleEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.system_username})</option>
            ))}
          </select>
          {eligibleEmployees.length === 0 && (
            <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-dim)' }}>
              No employees with system accounts found. Create a system account in the Employees page first.
            </p>
          )}
        </div>
      </div>

      {selectedEmployee && (
        <>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="stock-table" style={{ minWidth: 600 }}>
              <thead>
                <tr><th>Module</th><th>Page</th><th style={{ textAlign: 'center' }}>View</th><th style={{ textAlign: 'center' }}>Edit</th><th style={{ textAlign: 'center' }}>Delete</th><th style={{ textAlign: 'center' }}>Approve</th></tr>
              </thead>
              <tbody>
                {MODULES.map(mod => {
                  const allViewed = mod.pages.every(p => permState[`${mod.name}:${p}`]?.view)
                  return mod.pages.map((page, idx) => {
                    const key = `${mod.name}:${page}`
                    const perms = permState[key] || { view: false, edit: false, delete: false, approve: false }
                    const isFirstRow = idx === 0
                    return (
                      <tr key={key}>
                        {isFirstRow && (
                          <td rowSpan={mod.pages.length} style={{ fontWeight: 700, verticalAlign: 'top', paddingTop: 14 }}>
                            <div>{mod.name}</div>
                            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => toggleModule(mod.name, !allViewed)}>
                              {allViewed ? 'Remove all' : 'View all'}
                            </button>
                          </td>
                        )}
                        <td style={{ color: 'var(--text-mid)' }}>{page}</td>
                        {['view', 'edit', 'delete', 'approve'].map(action => (
                          <td key={action} style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={perms[action] || false}
                              onChange={e => handleCheck(mod.name, page, action, e.target.checked)}
                              style={{ cursor: 'pointer', width: 16, height: 16 }}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={savePermissions} disabled={saving}>
              <span className="material-icons">save</span> Save Permissions
            </button>
          </div>
        </>
      )}
    </div>
  )
}
