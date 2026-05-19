// src/pages/HR/LeaveBlockList.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'

const BLANK_LIST_FORM = {
  name: '',
  description: '',
  applies_to_all_departments: false,
}

// Add one calendar day at a time between start and end (inclusive)
function eachDayInRange(startStr, endStr) {
  const days = []
  const cur  = new Date(startStr + 'T00:00:00')
  const end  = new Date(endStr  + 'T00:00:00')
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export default function LeaveBlockList() {
  // ── Block-list state ──────────────────────────────────────────
  const [blockLists,     setBlockLists]     = useState([])
  const [loadingLists,   setLoadingLists]   = useState(true)
  const [selectedList,   setSelectedList]   = useState(null)  // full object

  // ── Dates state ───────────────────────────────────────────────
  const [dates,          setDates]          = useState([])    // for selected list
  const [loadingDates,   setLoadingDates]   = useState(false)

  // ── Date-range form ───────────────────────────────────────────
  const [rangeForm,      setRangeForm]      = useState({ start_date: '', end_date: '', reason: '' })
  const [addingRange,    setAddingRange]    = useState(false)

  // ── List modal ────────────────────────────────────────────────
  const [listModalOpen,  setListModalOpen]  = useState(false)
  const [editingList,    setEditingList]    = useState(null)
  const [listForm,       setListForm]       = useState(BLANK_LIST_FORM)
  const [savingList,     setSavingList]     = useState(false)

  // ── Confirm dialogs ───────────────────────────────────────────
  const [confirmList,    setConfirmList]    = useState({ open: false, item: null })
  const [confirmDate,    setConfirmDate]    = useState({ open: false, item: null })

  // ── Fetch block lists ─────────────────────────────────────────
  const fetchLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const { data, error } = await supabase
        .from('leave_block_lists')
        .select('*, leave_block_list_dates(id)')
        .order('name', { ascending: true })
      if (error) throw error
      setBlockLists(data || [])
    } catch (err) {
      toast.error('Failed to load block lists: ' + err.message)
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  // ── Fetch dates for selected list ─────────────────────────────
  const fetchDates = useCallback(async (listId) => {
    setLoadingDates(true)
    try {
      const { data, error } = await supabase
        .from('leave_block_list_dates')
        .select('*')
        .eq('block_list_id', listId)
        .order('block_date', { ascending: true })
      if (error) throw error
      setDates(data || [])
    } catch (err) {
      toast.error('Failed to load dates: ' + err.message)
    } finally {
      setLoadingDates(false)
    }
  }, [])

  const selectList = (list) => {
    setSelectedList(list)
    setRangeForm({ start_date: '', end_date: '', reason: '' })
    fetchDates(list.id)
  }

  // ── Add date range ────────────────────────────────────────────
  const handleAddRange = async () => {
    if (!rangeForm.start_date) return toast.error('Start date is required')
    if (!rangeForm.end_date)   return toast.error('End date is required')
    if (rangeForm.start_date > rangeForm.end_date)
      return toast.error('Start date must be before or equal to end date')

    const days = eachDayInRange(rangeForm.start_date, rangeForm.end_date)
    if (days.length > 365) return toast.error('Range cannot exceed 365 days')

    setAddingRange(true)
    try {
      const rows = days.map(d => ({
        id:            crypto.randomUUID(),
        block_list_id: selectedList.id,
        block_date:    d,
        reason:        rangeForm.reason.trim() || null,
      }))
      const { error } = await supabase
        .from('leave_block_list_dates')
        .insert(rows)
      if (error) throw error
      toast.success(`${days.length} date${days.length > 1 ? 's' : ''} added`)
      setRangeForm({ start_date: '', end_date: '', reason: '' })
      await fetchDates(selectedList.id)
      await fetchLists()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAddingRange(false)
    }
  }

  // ── Delete single date ────────────────────────────────────────
  const askDeleteDate = (d) => setConfirmDate({ open: true, item: d })

  const handleDeleteDate = async () => {
    const d = confirmDate.item
    setConfirmDate({ open: false, item: null })
    try {
      const { error } = await supabase
        .from('leave_block_list_dates')
        .delete()
        .eq('id', d.id)
      if (error) throw error
      toast.success('Date removed')
      await fetchDates(selectedList.id)
      await fetchLists()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Block-list modal helpers ──────────────────────────────────
  const openNewList = () => {
    setEditingList(null)
    setListForm(BLANK_LIST_FORM)
    setListModalOpen(true)
  }

  const openEditList = (item, e) => {
    e?.stopPropagation()
    setEditingList(item)
    setListForm({
      name:                       item.name || '',
      description:                item.description || '',
      applies_to_all_departments: !!item.applies_to_all_departments,
    })
    setListModalOpen(true)
  }

  const closeListModal = () => { setListModalOpen(false); setEditingList(null) }

  const handleSaveList = async () => {
    if (!listForm.name.trim()) return toast.error('Name is required')
    setSavingList(true)
    try {
      const payload = {
        name:                       listForm.name.trim(),
        description:                listForm.description.trim() || null,
        applies_to_all_departments: listForm.applies_to_all_departments,
      }

      if (editingList) {
        const { error } = await supabase
          .from('leave_block_lists')
          .update(payload)
          .eq('id', editingList.id)
        if (error) throw error
        toast.success('Block list updated')
        if (selectedList?.id === editingList.id) {
          setSelectedList({ ...selectedList, ...payload })
        }
      } else {
        const { error } = await supabase
          .from('leave_block_lists')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Block list created')
      }

      closeListModal()
      await fetchLists()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingList(false)
    }
  }

  // ── Delete block list ─────────────────────────────────────────
  const askDeleteList = (item, e) => {
    e?.stopPropagation()
    setConfirmList({ open: true, item })
  }

  const handleDeleteList = async () => {
    const item = confirmList.item
    setConfirmList({ open: false, item: null })
    try {
      // Cascade: delete dates first
      await supabase.from('leave_block_list_dates').delete().eq('block_list_id', item.id)
      const { error } = await supabase
        .from('leave_block_lists')
        .delete()
        .eq('id', item.id)
      if (error) throw error
      toast.success(`"${item.name}" deleted`)
      if (selectedList?.id === item.id) { setSelectedList(null); setDates([]) }
      await fetchLists()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Leave Block Lists" subtitle="Define periods when leave cannot be taken">
        <button className="btn btn-primary" onClick={openNewList}>
          <span className="material-icons">add</span> New Block List
        </button>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left panel ─────────────────────────────────────── */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
          }}>
            Block Lists
          </div>

          {loadingLists ? (
            <Spinner text="Loading…" />
          ) : blockLists.length === 0 ? (
            <EmptyState icon="block" message="No block lists yet" action={{ label: 'New Block List', onClick: openNewList }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blockLists.map(bl => {
                const isSelected = selectedList?.id === bl.id
                const dateCount  = Array.isArray(bl.leave_block_list_dates) ? bl.leave_block_list_dates.length : 0
                return (
                  <div
                    key={bl.id}
                    onClick={() => selectList(bl)}
                    style={{
                      background: 'var(--surface)',
                      border: `2px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'border-color .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{bl.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button className="btn btn-secondary btn-sm" onClick={e => openEditList(bl, e)} title="Edit">
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={e => askDeleteList(bl, e)} title="Delete">
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      </div>
                    </div>

                    {bl.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, marginBottom: 6, lineHeight: 1.4 }}>
                        {bl.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {bl.applies_to_all_departments && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: 'var(--blue)22', color: 'var(--blue)', border: '1px solid var(--blue)44',
                        }}>
                          All Departments
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)',
                      }}>
                        {dateCount} date{dateCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right panel ────────────────────────────────────── */}
        <div>
          {!selectedList ? (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 48, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14,
            }}>
              <span className="material-icons" style={{ fontSize: 40, opacity: .3, display: 'block', marginBottom: 10 }}>arrow_back</span>
              Select a block list to manage its dates
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
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedList.name}</div>
                  {selectedList.applies_to_all_departments && (
                    <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 2 }}>Applies to All Departments</div>
                  )}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)',
                }}>
                  {dates.length} date{dates.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Add date range form */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Add Date Range
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0, flex: '0 0 160px' }}>
                    <label style={{ fontSize: 12 }}>Start Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={rangeForm.start_date}
                      onChange={e => setRangeForm(f => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: '0 0 160px' }}>
                    <label style={{ fontSize: 12 }}>End Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={rangeForm.end_date}
                      onChange={e => setRangeForm(f => ({ ...f, end_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
                    <label style={{ fontSize: 12 }}>Reason</label>
                    <input
                      className="form-control"
                      value={rangeForm.reason}
                      onChange={e => setRangeForm(f => ({ ...f, reason: e.target.value }))}
                      placeholder="e.g. Peak season"
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddRange}
                    disabled={addingRange}
                    style={{ flexShrink: 0 }}
                  >
                    {addingRange ? 'Adding…' : 'Add Date Range'}
                  </button>
                </div>
              </div>

              {/* Dates table */}
              <div style={{ padding: '0 0 4px' }}>
                {loadingDates ? (
                  <div style={{ padding: 32 }}><Spinner /></div>
                ) : dates.length === 0 ? (
                  <EmptyState icon="event_busy" message="No blocked dates yet — add a date range above" />
                ) : (
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Blocked Date</th>
                        <th>Day</th>
                        <th>Reason</th>
                        <th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map(d => {
                        const dt  = new Date(d.block_date + 'T00:00:00')
                        const day = dt.toLocaleDateString('en-US', { weekday: 'short' })
                        return (
                          <tr key={d.id}>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{d.block_date}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{day}</td>
                            <td style={{ fontSize: 13 }}>{d.reason || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => askDeleteDate(d)}
                                title="Remove date"
                              >
                                <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit block-list modal */}
      <ModalDialog
        open={listModalOpen}
        onClose={closeListModal}
        title={editingList ? `Edit · ${editingList.name}` : 'New Block List'}
        size="md"
      >
        <div className="form-group">
          <label>Name *</label>
          <input
            className="form-control"
            value={listForm.name}
            onChange={e => setListForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Year-End Freeze"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            rows={3}
            value={listForm.description}
            onChange={e => setListForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description…"
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={listForm.applies_to_all_departments}
            onChange={e => setListForm(f => ({ ...f, applies_to_all_departments: e.target.checked }))}
            style={{ width: 16, height: 16, accentColor: 'var(--blue)' }}
          />
          <span>Applies to All Departments</span>
        </label>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeListModal} disabled={savingList}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveList} disabled={savingList}>
            {savingList ? 'Saving…' : editingList ? 'Update' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Confirm: delete block list */}
      <ConfirmDialog
        open={confirmList.open}
        onClose={() => setConfirmList({ open: false, item: null })}
        onConfirm={handleDeleteList}
        title="Delete Block List"
        message={`Delete "${confirmList.item?.name}" and all its blocked dates? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {/* Confirm: delete single date */}
      <ConfirmDialog
        open={confirmDate.open}
        onClose={() => setConfirmDate({ open: false, item: null })}
        onConfirm={handleDeleteDate}
        title="Remove Blocked Date"
        message={`Remove ${confirmDate.item?.block_date} from the block list?`}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}
