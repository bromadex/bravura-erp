// src/pages/HR/DepartmentApprovers.jsx
// Manages approval hierarchies per department.
// Table: department_approvers (id, department_id, approval_type, level, approver_id, is_active)

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog, TabNav,
} from '../../components/ui'

const APPROVAL_TYPES = [
  { id: 'leave',    label: 'Leave'    },
  { id: 'expense',  label: 'Expense'  },
  { id: 'overtime', label: 'Overtime' },
  { id: 'travel',   label: 'Travel'   },
  { id: 'general',  label: 'General'  },
]

const LEVELS = [1, 2, 3]

const BLANK_FORM = {
  approval_type: 'leave',
  level:         1,
  approver_id:   '',
  is_active:     true,
}

export default function DepartmentApprovers() {
  const { departments, employees } = useHR()

  const [approvers,     setApprovers]     = useState([])
  const [loading,       setLoading]       = useState(false)
  const [selectedDept,  setSelectedDept]  = useState(null)
  const [activeTab,     setActiveTab]     = useState('leave')

  // Modal state
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingItem,   setEditingItem]   = useState(null)
  const [form,          setForm]          = useState(BLANK_FORM)
  const [saving,        setSaving]        = useState(false)

  // Confirm state
  const [confirm,       setConfirm]       = useState({ open: false, item: null })

  // Active employees for the approver select
  const activeEmployees = employees.filter(e => e.status === 'Active')

  // ── Fetch approvers for selected department ───────────────────
  const fetchApprovers = useCallback(async (deptId) => {
    if (!deptId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('department_approvers')
        .select('*')
        .eq('department_id', deptId)
        .order('approval_type')
        .order('level')
      if (error) throw error
      setApprovers(data || [])
    } catch (err) {
      toast.error('Failed to load approvers: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const selectDept = (dept) => {
    setSelectedDept(dept)
    setActiveTab('leave')
    fetchApprovers(dept.id)
  }

  // Refresh after mutation
  const refresh = () => { if (selectedDept) fetchApprovers(selectedDept.id) }

  // ── Modal helpers ─────────────────────────────────────────────
  const openAdd = () => {
    setEditingItem(null)
    setForm({ ...BLANK_FORM, approval_type: activeTab })
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setForm({
      approval_type: item.approval_type,
      level:         item.level,
      approver_id:   item.approver_id,
      is_active:     item.is_active ?? true,
    })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditingItem(null) }

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.approver_id)   return toast.error('Approver is required')
    if (!form.approval_type) return toast.error('Approval type is required')
    if (!form.level)         return toast.error('Level is required')

    // Duplicate check: same dept + type + level (excluding current row on edit)
    const duplicate = approvers.find(a =>
      a.department_id  === selectedDept.id   &&
      a.approval_type  === form.approval_type &&
      a.level          === Number(form.level) &&
      (!editingItem || a.id !== editingItem.id)
    )
    if (duplicate) {
      return toast.error(`Level ${form.level} for "${form.approval_type}" already assigned in this department`)
    }

    setSaving(true)
    try {
      const payload = {
        department_id: selectedDept.id,
        approval_type: form.approval_type,
        level:         Number(form.level),
        approver_id:   form.approver_id,
        is_active:     form.is_active,
      }

      if (editingItem) {
        const { error } = await supabase
          .from('department_approvers')
          .update(payload)
          .eq('id', editingItem.id)
        if (error) throw error
        toast.success('Approver updated')
      } else {
        const { error } = await supabase
          .from('department_approvers')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Approver added')
      }

      closeModal()
      refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  const askDelete = (item) => setConfirm({ open: true, item })

  const handleDelete = async () => {
    const item = confirm.item
    setConfirm({ open: false, item: null })
    try {
      const { error } = await supabase
        .from('department_approvers')
        .delete()
        .eq('id', item.id)
      if (error) throw error
      toast.success('Approver removed')
      refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const getEmpName = (id) => employees.find(e => e.id === id)?.name || id || '—'

  const getEmpCountInDept = (deptId) =>
    employees.filter(e => e.department_id === deptId).length

  // Approvers for the current tab, sorted by level
  const tabApprovers = approvers
    .filter(a => a.approval_type === activeTab)
    .sort((a, b) => a.level - b.level)

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Department Approvers"
        subtitle="Configure approval hierarchies per department"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left sidebar: department list ──────────────────── */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
          }}>
            Departments
          </div>

          {departments.length === 0 ? (
            <EmptyState icon="business" message="No departments found" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {departments.map(dept => {
                const isSelected = selectedDept?.id === dept.id
                const empCount   = getEmpCountInDept(dept.id)
                return (
                  <div
                    key={dept.id}
                    onClick={() => selectDept(dept)}
                    style={{
                      background: isSelected ? 'var(--gold)15' : 'var(--surface)',
                      border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 9,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'border-color .15s, background .15s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--gold)88' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{dept.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {empCount} employee{empCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right panel: approvers for selected dept ────────── */}
        <div>
          {!selectedDept ? (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 48, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14,
            }}>
              <span className="material-icons" style={{ fontSize: 40, opacity: .3, display: 'block', marginBottom: 10 }}>
                how_to_reg
              </span>
              Select a department to manage its approvers
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedDept.name}</div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}>
                  <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Approver
                </button>
              </div>

              {/* Tab navigation */}
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <TabNav
                  tabs={APPROVAL_TYPES.map(t => ({
                    id:    t.id,
                    label: t.label,
                    count: approvers.filter(a => a.approval_type === t.id).length || undefined,
                  }))}
                  active={activeTab}
                  onChange={setActiveTab}
                />
              </div>

              {/* Approvers table */}
              <div style={{ padding: '4px 0 8px' }}>
                {loading ? (
                  <Spinner />
                ) : tabApprovers.length === 0 ? (
                  <EmptyState
                    icon="person_off"
                    message={`No ${activeTab} approvers configured`}
                    action={{ label: 'Add Approver', onClick: openAdd }}
                  />
                ) : (
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Level</th>
                        <th>Approver</th>
                        <th style={{ width: 100 }}>Status</th>
                        <th style={{ width: 100 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabApprovers.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--gold)22', color: 'var(--gold)',
                              fontWeight: 800, fontSize: 13, border: '1px solid var(--gold)44',
                            }}>
                              {item.level}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{getEmpName(item.approver_id)}</div>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: item.is_active ? 'var(--green)22' : 'var(--text-dim)22',
                              color: item.is_active ? 'var(--green)' : 'var(--text-dim)',
                              border: `1px solid ${item.is_active ? 'var(--green)44' : 'var(--border)'}`,
                            }}>
                              {item.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="btn-group-sm">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEdit(item)}
                                title="Edit"
                              >
                                <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => askDelete(item)}
                                title="Remove"
                              >
                                <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Approver Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editingItem ? 'Edit Approver' : 'Add Approver'}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Approval Type *</label>
            <select
              className="form-control"
              value={form.approval_type}
              onChange={e => setForm(f => ({ ...f, approval_type: e.target.value }))}
            >
              {APPROVAL_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Level *</label>
            <select
              className="form-control"
              value={form.level}
              onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))}
            >
              {LEVELS.map(l => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Approver *</label>
            <select
              className="form-control"
              value={form.approver_id}
              onChange={e => setForm(f => ({ ...f, approver_id: e.target.value }))}
            >
              <option value="">Select employee…</option>
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
            />
            Active
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingItem ? 'Update' : 'Add Approver'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, item: null })}
        onConfirm={handleDelete}
        title="Remove Approver"
        message={`Remove this approver from the "${confirm.item?.approval_type}" hierarchy?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}
