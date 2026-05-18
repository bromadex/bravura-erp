// src/pages/HR/HolidayLists.jsx
// Manage holiday lists and their individual holiday dates.
// Left panel: list selector. Right panel: dates for selected list.

import { useState, useMemo } from 'react'
import { useShift } from '../../contexts/ShiftContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, DataTable, Spinner,
} from '../../components/ui'

const LIST_DEFAULTS = {
  name:       '',
  from_date:  '',
  to_date:    '',
  is_default: false,
}

const DATE_DEFAULTS = {
  holiday_date: '',
  description:  '',
  weekly_off:   false,
}

// Generate all Sundays between two date strings
function getSundaysBetween(fromStr, toStr) {
  const sundays = []
  if (!fromStr || !toStr) return sundays
  const start = new Date(fromStr)
  const end   = new Date(toStr)
  // Advance to first Sunday
  const d = new Date(start)
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  while (d <= end) {
    sundays.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 7)
  }
  return sundays
}

export default function HolidayLists() {
  const { user } = useAuth()
  const {
    holidayLists,
    holidayListDates,
    loading,
    addHolidayList,
    deleteHolidayList,
    addHolidayDate,
    deleteHolidayDate,
  } = useShift()

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedListId, setSelectedListId] = useState(null)

  // ── Add list modal ────────────────────────────────────────────────────────
  const [listModal,   setListModal]   = useState(false)
  const [listForm,    setListForm]    = useState(LIST_DEFAULTS)
  const [savingList,  setSavingList]  = useState(false)

  // ── Delete list confirm ───────────────────────────────────────────────────
  const [deleteListId, setDeleteListId] = useState(null)
  const [deletingList, setDeletingList] = useState(false)

  // ── Add date ──────────────────────────────────────────────────────────────
  const [dateForm,    setDateForm]    = useState(DATE_DEFAULTS)
  const [savingDate,  setSavingDate]  = useState(false)
  const [addingDate,  setAddingDate]  = useState(false)

  // ── Delete date confirm ───────────────────────────────────────────────────
  const [deleteDateId, setDeleteDateId] = useState(null)
  const [deletingDate, setDeletingDate] = useState(false)

  // ── Sundays loader ────────────────────────────────────────────────────────
  const [loadingSundays, setLoadingSundays] = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedList = holidayLists.find(l => l.id === selectedListId) || null
  const datesForSelected = useMemo(() =>
    holidayListDates.filter(d => d.holiday_list_id === selectedListId)
  , [holidayListDates, selectedListId])

  const publicHolidays = datesForSelected.filter(d => !d.weekly_off).length
  const weeklyOffs     = datesForSelected.filter(d =>  d.weekly_off).length

  // ── Handlers: list ────────────────────────────────────────────────────────
  const handleSaveList = async () => {
    if (!listForm.name.trim()) { toast.error('List name is required'); return }
    setSavingList(true)
    try {
      const id = await addHolidayList({
        name:       listForm.name.trim(),
        from_date:  listForm.from_date || null,
        to_date:    listForm.to_date   || null,
        is_default: listForm.is_default,
      })
      toast.success('Holiday list created')
      setListModal(false)
      setListForm(LIST_DEFAULTS)
      if (id) setSelectedListId(id)
    } catch (err) {
      toast.error(err.message || 'Failed to create list')
    } finally {
      setSavingList(false)
    }
  }

  const handleDeleteList = async () => {
    if (!deleteListId) return
    setDeletingList(true)
    try {
      await deleteHolidayList(deleteListId)
      toast.success('Holiday list deleted')
      if (selectedListId === deleteListId) setSelectedListId(null)
      setDeleteListId(null)
    } catch (err) {
      toast.error(err.message || 'Failed to delete list')
    } finally {
      setDeletingList(false)
    }
  }

  // ── Handlers: dates ───────────────────────────────────────────────────────
  const handleAddDate = async () => {
    if (!dateForm.holiday_date) { toast.error('Date is required'); return }
    if (!selectedListId)        { toast.error('No list selected'); return }
    // Prevent duplicate
    if (datesForSelected.some(d => d.holiday_date === dateForm.holiday_date)) {
      toast.error('This date is already in the list'); return
    }
    setSavingDate(true)
    try {
      await addHolidayDate(selectedListId, {
        holiday_date: dateForm.holiday_date,
        description:  dateForm.description.trim() || null,
        weekly_off:   dateForm.weekly_off,
      })
      toast.success('Date added')
      setDateForm(DATE_DEFAULTS)
      setAddingDate(false)
    } catch (err) {
      toast.error(err.message || 'Failed to add date')
    } finally {
      setSavingDate(false)
    }
  }

  const handleDeleteDate = async () => {
    if (!deleteDateId) return
    setDeletingDate(true)
    try {
      await deleteHolidayDate(deleteDateId)
      toast.success('Date removed')
      setDeleteDateId(null)
    } catch (err) {
      toast.error(err.message || 'Failed to remove date')
    } finally {
      setDeletingDate(false)
    }
  }

  // ── Mark all Sundays as weekly offs ──────────────────────────────────────
  const handleMarkSundays = async () => {
    if (!selectedList?.from_date || !selectedList?.to_date) {
      toast.error('Holiday list must have From/To dates to auto-fill Sundays'); return
    }
    const sundays = getSundaysBetween(selectedList.from_date, selectedList.to_date)
    const newSundays = sundays.filter(s => !datesForSelected.some(d => d.holiday_date === s))
    if (newSundays.length === 0) { toast('All Sundays are already added', { icon: 'ℹ️' }); return }
    setLoadingSundays(true)
    try {
      for (const s of newSundays) {
        await addHolidayDate(selectedListId, { holiday_date: s, description: 'Weekly Off', weekly_off: true })
      }
      toast.success(`${newSundays.length} Sunday(s) added as weekly offs`)
    } catch (err) {
      toast.error(err.message || 'Failed to add Sundays')
    } finally {
      setLoadingSundays(false)
    }
  }

  // ── Date table columns ────────────────────────────────────────────────────
  const dateColumns = [
    { key: 'holiday_date', label: 'Date',        sortable: true },
    { key: 'description',  label: 'Description', render: (v) => v || '—' },
    {
      key: 'weekly_off',
      label: 'Type',
      render: (v) => (
        <span className={`badge ${v ? 'badge-blue' : 'badge-green'}`}>
          {v ? 'Weekly Off' : 'Public Holiday'}
        </span>
      ),
    },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <button className="btn btn-sm btn-danger" onClick={() => setDeleteDateId(row.id)}>Remove</button>
      ),
    },
  ]

  if (loading) return <div className="page-body"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Holiday Lists"
        subtitle="Manage public holidays and weekly off calendars"
      >
        <button className="btn btn-primary" onClick={() => { setListForm(LIST_DEFAULTS); setListModal(true) }}>
          <span className="material-icons md-18">add</span> New Holiday List
        </button>
      </PageHeader>

      <div className="page-body">
        {/* KPI row — shown when a list is selected */}
        {selectedList && (
          <div className="kpi-row" style={{ marginBottom: 16 }}>
            <KPICard label="Public Holidays" value={publicHolidays} icon="celebration"  color="blue" />
            <KPICard label="Weekly Offs"     value={weeklyOffs}     icon="weekend"      color="green" />
            <KPICard label="Total Dates"     value={datesForSelected.length} icon="event" />
          </div>
        )}

        {/* Two-panel layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
          {/* ── Left: list panel ─────────────────────────────────────────── */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
              Holiday Lists
            </div>
            {holidayLists.length === 0 ? (
              <EmptyState icon="event_busy" text="No holiday lists yet" />
            ) : (
              <div>
                {holidayLists.map(hl => (
                  <div
                    key={hl.id}
                    onClick={() => setSelectedListId(hl.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      background: selectedListId === hl.id ? 'var(--surface2)' : 'transparent',
                      borderLeft: selectedListId === hl.id ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      {hl.name}
                      {hl.is_default && (
                        <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 10 }}>Default</span>
                      )}
                    </div>
                    {(hl.from_date || hl.to_date) && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {hl.from_date || '?'} – {hl.to_date || '?'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: dates panel ───────────────────────────────────────── */}
          <div>
            {!selectedList ? (
              <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                <EmptyState icon="event_note" text="Select a holiday list to view and manage dates" />
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{selectedList.name}</h3>
                    {selectedList.from_date && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {selectedList.from_date} – {selectedList.to_date || 'ongoing'}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedList.from_date && selectedList.to_date && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleMarkSundays}
                        disabled={loadingSundays}
                        title="Auto-fill all Sundays as weekly offs"
                      >
                        <span className="material-icons md-18">weekend</span>
                        {loadingSundays ? 'Adding…' : 'Mark Sundays'}
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => { setDateForm(DATE_DEFAULTS); setAddingDate(true) }}>
                      <span className="material-icons md-18">add</span> Add Date
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteListId(selectedListId)}>
                      <span className="material-icons md-18">delete</span> Delete List
                    </button>
                  </div>
                </div>

                {/* Inline add date row */}
                {addingDate && (
                  <div className="card" style={{ padding: '14px 16px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Date *</label>
                      <input
                        className="form-control"
                        type="date"
                        value={dateForm.holiday_date}
                        onChange={e => setDateForm(f => ({ ...f, holiday_date: e.target.value }))}
                        style={{ width: 150 }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0, flex: 1 }}>
                      <label className="form-label">Description</label>
                      <input
                        className="form-control"
                        value={dateForm.description}
                        onChange={e => setDateForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. National Day"
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={dateForm.weekly_off}
                          onChange={e => setDateForm(f => ({ ...f, weekly_off: e.target.checked }))}
                        />
                        Weekly Off
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleAddDate} disabled={savingDate}>
                        {savingDate ? 'Adding…' : 'Add'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setAddingDate(false); setDateForm(DATE_DEFAULTS) }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <DataTable
                  columns={dateColumns}
                  data={datesForSelected}
                  rowKey="id"
                  emptyText="No dates added to this list yet"
                  emptyIcon="event_busy"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── New Holiday List Modal ──────────────────────────────────────────── */}
      <ModalDialog open={listModal} onClose={() => setListModal(false)} title="New Holiday List">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">List Name *</label>
            <input className="form-control" value={listForm.name} onChange={e => setListForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 2026 Public Holidays" />
          </div>
          <div className="form-group">
            <label className="form-label">From Date</label>
            <input className="form-control" type="date" value={listForm.from_date} onChange={e => setListForm(f => ({ ...f, from_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">To Date</label>
            <input className="form-control" type="date" value={listForm.to_date} onChange={e => setListForm(f => ({ ...f, to_date: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={listForm.is_default} onChange={e => setListForm(f => ({ ...f, is_default: e.target.checked }))} />
              Set as default holiday list
            </label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setListModal(false)} disabled={savingList}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveList} disabled={savingList}>
            {savingList ? 'Creating…' : 'Create List'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Delete List Confirm ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteListId}
        onClose={() => setDeleteListId(null)}
        onConfirm={handleDeleteList}
        title="Delete Holiday List"
        message="Delete this holiday list and all its dates? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deletingList}
      />

      {/* ── Delete Date Confirm ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteDateId}
        onClose={() => setDeleteDateId(null)}
        onConfirm={handleDeleteDate}
        title="Remove Holiday Date"
        message="Remove this date from the holiday list?"
        confirmLabel="Remove"
        danger
        loading={deletingDate}
      />
    </div>
  )
}
