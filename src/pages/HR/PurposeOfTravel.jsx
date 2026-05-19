// src/pages/HR/PurposeOfTravel.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'

const BLANK_FORM = {
  name: '',
  description: '',
  requires_approval: false,
  is_active: true,
}

export default function PurposeOfTravel() {
  const [purposes,   setPurposes]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(BLANK_FORM)
  const [confirm,    setConfirm]    = useState({ open: false, item: null })

  // ── Fetch ────────────────────────────────────────────────────
  const fetchPurposes = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('purpose_of_travel')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      setPurposes(data || [])
    } catch (err) {
      toast.error('Failed to load travel purposes: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPurposes() }, [fetchPurposes])

  // ── KPIs ─────────────────────────────────────────────────────
  const totalCount  = purposes.length
  const activeCount = purposes.filter(p => p.is_active).length

  // ── Modal helpers ─────────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      name:               item.name || '',
      description:        item.description || '',
      requires_approval:  !!item.requires_approval,
      is_active:          item.is_active !== false,
    })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required')

    setSaving(true)
    try {
      const payload = {
        name:              form.name.trim(),
        description:       form.description.trim() || null,
        requires_approval: form.requires_approval,
        is_active:         form.is_active,
      }

      if (editing) {
        const { error } = await supabase
          .from('purpose_of_travel')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Travel purpose updated')
      } else {
        const { error } = await supabase
          .from('purpose_of_travel')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Travel purpose created')
      }

      closeModal()
      await fetchPurposes()
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
        .from('purpose_of_travel')
        .delete()
        .eq('id', item.id)
      if (error) throw error
      toast.success(`"${item.name}" deleted`)
      await fetchPurposes()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Purpose of Travel"
        subtitle={
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
              background: 'var(--blue)22', color: 'var(--blue)', border: '1px solid var(--blue)44',
            }}>
              {totalCount} total
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
              background: 'var(--green)22', color: 'var(--green)', border: '1px solid var(--green)44',
            }}>
              {activeCount} active
            </span>
          </span>
        }
      >
        <button className="btn btn-primary" onClick={openNew}>
          <span className="material-icons">add</span> Add Purpose
        </button>
      </PageHeader>

      {loading ? (
        <Spinner text="Loading travel purposes…" />
      ) : purposes.length === 0 ? (
        <EmptyState
          icon="travel_explore"
          message="No travel purposes defined yet"
          action={{ label: 'Add Purpose', onClick: openNew }}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {purposes.map(item => (
            <div
              key={item.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '' }}
            >
              {/* Card body */}
              <div style={{ padding: '16px 16px 12px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{item.name}</div>
                  {/* Active / Inactive chip */}
                  <span style={{
                    flexShrink: 0,
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: item.is_active ? 'var(--green)22' : 'var(--text-dim)22',
                    color: item.is_active ? 'var(--green)' : 'var(--text-dim)',
                    border: `1px solid ${item.is_active ? 'var(--green)44' : 'var(--border)'}`,
                  }}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {item.description && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 10,
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {item.description}
                  </div>
                )}

                {/* Approval badge */}
                <div>
                  {item.requires_approval ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                      background: 'var(--gold)22', color: 'var(--gold)', border: '1px solid var(--gold)44',
                    }}>
                      Approval Required
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                      background: 'var(--green)22', color: 'var(--green)', border: '1px solid var(--green)44',
                    }}>
                      No Approval
                    </span>
                  )}
                </div>
              </div>

              {/* Card footer */}
              <div style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
              }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                  <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => askDelete(item)}>
                  <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit · ${editing.name}` : 'Add Travel Purpose'}
        size="md"
      >
        <div className="form-group">
          <label>Name *</label>
          <input
            className="form-control"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Client Visit"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description…"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.requires_approval}
              onChange={e => setForm(f => ({ ...f, requires_approval: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--gold)' }}
            />
            <span>Requires Approval</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--green)' }}
            />
            <span>Active</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, item: null })}
        onConfirm={handleDelete}
        title="Delete Travel Purpose"
        message={`Delete "${confirm.item?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
