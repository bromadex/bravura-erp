// src/pages/Expenses/ExpenseTypes.jsx
// CRUD configuration page for expense types.

import { useState } from 'react'
import { useExpense } from '../../contexts/ExpenseContext'
import { auditLog } from '../../engine/auditEngine'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, SectionCard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const emptyForm = () => ({
  name:                 '',
  description:          '',
  default_account_code: '',
  max_claim_amount:     '',
  requires_receipt:     true,
  is_active:            true,
})

export default function ExpenseTypes() {
  const { user } = useAuth()
  const { expenseTypes, loading, addExpenseType, updateExpenseType, deleteExpenseType } = useExpense()

  // ── Add / Edit Modal ──────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(emptyForm())
  const [saving,    setSaving]    = useState(false)

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const openEdit = (et) => {
    setEditId(et.id)
    setForm({
      name:                 et.name                 || '',
      description:          et.description          || '',
      default_account_code: et.default_account_code || '',
      max_claim_amount:     et.max_claim_amount !== null ? String(et.max_claim_amount) : '',
      requires_receipt:     et.requires_receipt     ?? true,
      is_active:            et.is_active            ?? true,
    })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditId(null) }

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const data = {
        name:                 form.name.trim(),
        description:          form.description.trim() || null,
        default_account_code: form.default_account_code.trim() || null,
        max_claim_amount:     parseFloat(form.max_claim_amount) || 0,
        requires_receipt:     form.requires_receipt,
        is_active:            form.is_active,
      }
      if (editId) {
        await updateExpenseType(editId, data)
        toast.success('Expense type updated')
      } else {
        await addExpenseType(data)
        toast.success('Expense type added')
      }
      closeModal()
    } catch (err) {
      toast.error(err.message || 'Failed to save expense type')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle Active / Inactive ──────────────────────────────────────────────
  const handleToggleActive = async (et) => {
    try {
      await updateExpenseType(et.id, {
        name:                 et.name,
        description:          et.description,
        default_account_code: et.default_account_code,
        max_claim_amount:     et.max_claim_amount,
        requires_receipt:     et.requires_receipt,
        is_active:            !et.is_active,
      })
      auditLog({
        module:     'expenses',
        action:     'UPDATE',
        entityType: 'expense_type',
        entityId:   et.id,
        entityName: et.name,
        details:    `is_active → ${!et.is_active}`,
        userName:   user?.full_name || user?.username || '',
      }).catch(() => {})
      toast.success(`${et.name} ${!et.is_active ? 'activated' : 'deactivated'}`)
    } catch (err) {
      toast.error(err.message || 'Failed to update status')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteExpenseType(deleteTarget.id)
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message || 'Failed to delete expense type')
    } finally {
      setDeleting(false)
    }
  }

  const fmt = (n) => {
    const num = parseFloat(n)
    if (!num || num === 0) return 'Unlimited'
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <PageHeader title="Expense Types">
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <span className="material-icons">add</span> Add Type
        </button>
      </PageHeader>

      <SectionCard>
        {expenseTypes.length === 0 ? (
          <EmptyState icon="category" message="No expense types configured. Add one to get started." />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>GL Account Code</th>
                  <th>Max Claim</th>
                  <th>Requires Receipt</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenseTypes.map(et => (
                  <tr key={et.id}>
                    <td style={{ fontWeight: 600 }}>{et.name}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {et.description || '—'}
                    </td>
                    <td>
                      {et.default_account_code
                        ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{et.default_account_code}</span>
                        : '—'}
                    </td>
                    <td>{fmt(et.max_claim_amount)}</td>
                    <td>
                      <StatusBadge
                        status={et.requires_receipt ? 'active' : 'inactive'}
                        label={et.requires_receipt ? 'Required' : 'Optional'}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={et.is_active ? 'active' : 'inactive'}
                        label={et.is_active ? 'Active' : 'Inactive'}
                      />
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(et)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                      </button>
                      <button
                        className={`btn btn-xs ${et.is_active ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => handleToggleActive(et)}
                        title={et.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>
                          {et.is_active ? 'toggle_on' : 'toggle_off'}
                        </span>
                      </button>
                      <button
                        className="btn btn-xs btn-danger"
                        onClick={() => setDeleteTarget(et)}
                        title="Delete"
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      <ModalDialog
        open={showModal}
        onClose={closeModal}
        title={editId ? 'Edit Expense Type' : 'Add Expense Type'}
      >
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Name *</label>
            <input
              type="text"
              className="form-control"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Travel, Accommodation…"
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Optional description…"
            />
          </div>

          <div className="form-group">
            <label>GL Account Code</label>
            <input
              type="text"
              className="form-control"
              value={form.default_account_code}
              onChange={e => handleChange('default_account_code', e.target.value)}
              placeholder="e.g. 6100-01"
            />
          </div>

          <div className="form-group">
            <label>Max Claim Amount (0 = Unlimited)</label>
            <input
              type="number"
              className="form-control"
              min="0"
              step="0.01"
              value={form.max_claim_amount}
              onChange={e => handleChange('max_claim_amount', e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              id="requires_receipt"
              checked={form.requires_receipt}
              onChange={e => handleChange('requires_receipt', e.target.checked)}
            />
            <label htmlFor="requires_receipt" style={{ margin: 0, cursor: 'pointer' }}>Requires receipt</label>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => handleChange('is_active', e.target.checked)}
            />
            <label htmlFor="is_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (editId ? 'Save Changes' : 'Add Type')}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Expense Type"
        message={`Delete "${deleteTarget?.name}"? If this type is referenced by existing claims, the delete will fail with a constraint error.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
