import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanManagePermissions } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

const MODULES = [
  { name: 'inventory', pages: ['stock-balance', 'stock-in', 'stock-out', 'transactions', 'stock-taking', 'categories'] },
  { name: 'procurement', pages: ['suppliers', 'store-requisitions', 'purchase-requisitions', 'purchase-orders', 'goods-received'] },
  { name: 'fuel', pages: ['tanks', 'dipstick', 'issuance', 'deliveries', 'reports'] },
  { name: 'fleet', pages: ['dashboard', 'vehicles', 'generators', 'heavy-equipment', 'maintenance-alerts', 'asset-issues'] },
  { name: 'hr', pages: ['employees', 'departments', 'designations', 'permissions', 'attendance', 'leave', 'travel'] },
  { name: 'accounting', pages: ['chart-of-accounts', 'journal-entries', 'reports'] },
  { name: 'reports', pages: ['overview', 'audit-log', 'drafts'] },
]

export default function UserPermissions() {
  const { employees, permissions, setUserPermissions, fetchAll } = useHR()
  const canManage = useCanManagePermissions()
  
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [permState, setPermState] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedEmployee) {
      const userPerms = permissions.filter(p => p.user_id === selectedEmployee.system_user_id)
      const newState = {}
      MODULES.forEach(mod => {
        mod.pages.forEach(page => {
          const existing = userPerms.find(p => p.module_name === mod.name && p.page_name === page)
          newState[`${mod.name}:${page}`] = {
            view: existing?.can_view || false,
            edit: existing?.can_edit || false,
            delete: existing?.can_delete || false,
            approve: existing?.can_approve || false,
          }
        })
      })
      setPermState(newState)
    }
  }, [selectedEmployee, permissions])

  const handleCheck = (module, page, action, checked) => {
    const key = `${module}:${page}`
    setPermState(prev => ({
      ...prev,
      [key]: { ...prev[key], [action]: checked }
    }))
  }

  const handleSelectAllModule = (module, checked) => {
    const modulePages = MODULES.find(m => m.name === module)?.pages || []
    setPermState(prev => {
      const newState = { ...prev }
      modulePages.forEach(page => {
        const key = `${module}:${page}`
        newState[key] = { ...newState[key], view: checked, edit: checked, delete: checked, approve: checked }
      })
      return newState
    })
  }

  const savePermissions = async () => {
    if (!selectedEmployee) return
    setLoading(true)
    const permsList = []
    for (const [key, perms] of Object.entries(permState)) {
      const [module, page] = key.split(':')
      permsList.push({
        module,
        page,
        can_view: perms.view,
        can_edit: perms.edit,
        can_delete: perms.delete,
        can_approve: perms.approve,
      })
    }
    try {
      await setUserPermissions(selectedEmployee.system_user_id, permsList)
      toast.success('Permissions saved')
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!canManage) {
    return (
      <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>lock</span>
        <p>You don't have permission to manage user permissions.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Permissions</h1>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label>Select Employee</label>
          <select
            className="form-control"
            value={selectedEmployee?.id || ''}
            onChange={e => setSelectedEmployee(employees.find(emp => emp.id === e.target.value))}
          >
            <option value="">-- Select Employee --</option>
            {employees.filter(e => e.system_user_id).map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.system_username})</option>
            ))}
          </select>
        </div>
      </div>

      {selectedEmployee && (
        <>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Module</th><th>Page</th><th>View</th><th>Edit</th><th>Delete</th><th>Approve</th>
                  <th style={{ width: 80 }}>Select All</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => {
                  let allChecked = true
                  let anyChecked = false
                  mod.pages.forEach(page => {
                    const key = `${mod.name}:${page}`
                    const perms = permState[key] || { view: false, edit: false, delete: false, approve: false }
                    if (!perms.view && !perms.edit && !perms.delete && !perms.approve) allChecked = false
                    if (perms.view || perms.edit || perms.delete || perms.approve) anyChecked = true
                  })
                  const isIndeterminate = !allChecked && anyChecked
                  return (
                    <>
                      {mod.pages.map((page, idx) => {
                        const key = `${mod.name}:${page}`
                        const perms = permState[key] || { view: false, edit: false, delete: false, approve: false }
                        const isFirstRow = idx === 0
                        return (
                          <tr key={key}>
                            {isFirstRow && (
                              <>
                                <td rowSpan={mod.pages.length} style={{ fontWeight: 600, verticalAlign: 'middle' }}>
                                  {mod.name}
                                </td>
                                <td rowSpan={mod.pages.length} style={{ verticalAlign: 'middle' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleSelectAllModule(mod.name, !allChecked)}
                                    style={{ fontSize: 10 }}
                                  >
                                    {allChecked ? 'Clear All' : 'Select All'}
                                  </button>
                                </td>
                              </>
                            )}
                            <td>{page}</td>
                            <td><input type="checkbox" checked={perms.view} onChange={e => handleCheck(mod.name, page, 'view', e.target.checked)} /></td>
                            <td><input type="checkbox" checked={perms.edit} onChange={e => handleCheck(mod.name, page, 'edit', e.target.checked)} /></td>
                            <td><input type="checkbox" checked={perms.delete} onChange={e => handleCheck(mod.name, page, 'delete', e.target.checked)} /></td>
                            <td><input type="checkbox" checked={perms.approve} onChange={e => handleCheck(mod.name, page, 'approve', e.target.checked)} /></td>
                            {!isFirstRow && <td style={{ display: 'none' }}></td>}
                            {!isFirstRow && <td style={{ display: 'none' }}></td>}
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={savePermissions} disabled={loading}>
              {loading ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
