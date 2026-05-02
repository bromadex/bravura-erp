// src/pages/Logistics/CampManagement.jsx
//
// Camp & Site Supplies with headcount-driven consumption intelligence.
// Features:
// - Daily headcount recording (links to HR employees count)
// - Stock management: Food, PPE, Consumables, General
// - Per-person-per-day consumption ratios
// - Abnormal consumption detection
// - PPE issuance register per employee
// - Low-stock alerts with suggested reorder quantities

import { useState, useEffect, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today     = new Date().toISOString().split('T')[0]
const CATS      = ['Food', 'PPE', 'Consumables', 'Batch Plant', 'General']
const CAT_ICONS = { Food: 'restaurant', PPE: 'security', Consumables: 'handyman', 'Batch Plant': 'factory', General: 'inventory_2' }
const CAT_COLS  = { Food: 'var(--teal)', PPE: 'var(--yellow)', Consumables: 'var(--blue)', 'Batch Plant': 'var(--purple)', General: 'var(--text-dim)' }

export default function CampManagement() {
  const { items, transactions, headcounts, ppeIssuances, addItem, updateItem, deleteItem, stockIn, stockOut, setHeadcount, issuePPE, fetchAll, loading } = useLogistics()
  const { user } = useAuth()
  const canEdit = useCanEdit('logistics', 'camp')

  const [activeTab, setActiveTab]   = useState('stock')
  const [filterCat, setFilterCat]   = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  // Headcount
  const [hcForm, setHcForm]   = useState({ count: '', notes: '' })
  const todayHC = headcounts.find(h => h.date === today)?.count || 0

  // Stock In modal
  const [siModal, setSiModal]   = useState(false)
  const [siForm, setSiForm]     = useState({ item_id: '', qty: 1, date: today, supplier: '', reference: '', unit_cost: 0, notes: '' })

  // Stock Out modal
  const [soModal, setSoModal]   = useState(false)
  const [soForm, setSoForm]     = useState({ item_id: '', qty: 1, date: today, issued_to: '', authorized_by: user?.full_name || '', notes: '' })

  // Item CRUD
  const [itemModal, setItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm]   = useState({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' })

  // PPE issuance
  const [ppeModal, setPpeModal]   = useState(false)
  const [ppeForm, setPpeForm]     = useState({ employee_id: '', item_id: '', qty: 1, size: '', date: today, condition: 'New', reason: 'New issue', issued_by: user?.full_name || '' })
  const [employees, setEmployees] = useState([])

  useEffect(() => {
    supabase.from('employees').select('id, name, status').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const filteredItems = useMemo(() => items.filter(i => {
    if (i.category === 'Batch Plant') return false  // shown in Batch Plant page
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  }), [items, filterCat, searchTerm])

  // Consumption ratios for each item over last 30 days
  const last30From = new Date(); last30From.setDate(last30From.getDate() - 30)
  const last30Str  = last30From.toISOString().split('T')[0]

  const getItemStats = (itemId) => {
    const outTx   = transactions.filter(t => t.item_id === itemId && t.type === 'OUT' && t.date >= last30Str)
    const totalOut = outTx.reduce((s, t) => s + (t.qty || 0), 0)
    const hcDays  = headcounts.filter(h => h.date >= last30Str)
    const avgHC   = hcDays.length > 0 ? hcDays.reduce((s, h) => s + h.count, 0) / hcDays.length : 0
    const days    = Math.min(30, hcDays.length || 30)
    return { totalOut30d: totalOut, perPersonPerDay: avgHC > 0 ? totalOut / (avgHC * days) : 0 }
  }

  const handleStockIn = async (e) => {
    e.preventDefault()
    if (!siForm.item_id || siForm.qty <= 0) return toast.error('Select item and valid quantity')
    try {
      await stockIn(siForm.item_id, siForm.qty, siForm.date, siForm.supplier, siForm.reference, siForm.notes, siForm.unit_cost, user?.full_name || user?.username)
      toast.success('Stock in recorded')
      setSiModal(false)
      setSiForm({ item_id: '', qty: 1, date: today, supplier: '', reference: '', unit_cost: 0, notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleStockOut = async (e) => {
    e.preventDefault()
    if (!soForm.item_id || soForm.qty <= 0) return toast.error('Select item and valid quantity')
    try {
      await stockOut(soForm.item_id, soForm.qty, soForm.date, soForm.issued_to, soForm.authorized_by, soForm.notes, null, null, user?.full_name || user?.username)
      toast.success('Stock out recorded')
      setSoModal(false)
      setSoForm({ item_id: '', qty: 1, date: today, issued_to: '', authorized_by: user?.full_name || '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleSaveItem = async (e) => {
    e.preventDefault()
    try {
      if (editingItem) { await updateItem(editingItem.id, itemForm); toast.success('Item updated') }
      else             { await addItem(itemForm); toast.success('Item added') }
      setItemModal(false); setEditingItem(null)
    } catch (err) { toast.error(err.message) }
  }

  const handlePPE = async (e) => {
    e.preventDefault()
    if (!ppeForm.employee_id || !ppeForm.item_id) return toast.error('Select employee and PPE item')
    try {
      await issuePPE(ppeForm, user?.full_name || user?.username)
      toast.success('PPE issued')
      setPpeModal(false)
      setPpeForm({ employee_id: '', item_id: '', qty: 1, size: '', date: today, condition: 'New', reason: 'New issue', issued_by: user?.full_name || '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleSaveHeadcount = async () => {
    if (!hcForm.count) return toast.error('Enter headcount')
    try {
      await setHeadcount(today, parseInt(hcForm.count), hcForm.notes, user?.full_name || user?.username)
      toast.success('Headcount recorded')
      setHcForm({ count: '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filteredItems.map(i => {
      const s = getItemStats(i.id)
      return { Name: i.name, Category: i.category, Unit: i.unit, Balance: i.balance, 'Reorder Level': i.reorder_level, 'Unit Cost': i.unit_cost, 'Used 30d': s.totalOut30d, 'Per Person/Day': s.perPersonPerDay.toFixed(4) }
    }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Camp Stock')
    XLSX.writeFile(wb, `CampStock_${today}.xlsx`); toast.success('Exported')
  }

  const TABS = [
    { id: 'stock',      label: 'Stock Levels',    icon: 'inventory_2'    },
    { id: 'analytics',  label: 'Consumption',     icon: 'analytics'      },
    { id: 'ppe',        label: 'PPE Register',    icon: 'security'       },
    { id: 'headcount',  label: 'Headcount',       icon: 'people'         },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Camp & Site Supplies</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && <>
            <button className="btn btn-secondary" onClick={() => { setEditingItem(null); setItemForm({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' }); setItemModal(true) }}>
              <span className="material-icons">add</span> Add Item
            </button>
            <button className="btn btn-secondary" onClick={() => setSiModal(true)}>
              <span className="material-icons">add_circle</span> Stock In
            </button>
            <button className="btn btn-primary" onClick={() => setSoModal(true)}>
              <span className="material-icons">remove_circle</span> Issue Out
            </button>
          </>}
        </div>
      </div>

      {/* Headcount banner */}
      <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 24, color: 'var(--teal)' }}>people</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>CAMP HEADCOUNT TODAY</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: todayHC > 0 ? 'var(--teal)' : 'var(--text-dim)' }}>
              {todayHC > 0 ? todayHC : 'Not recorded'}
            </div>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 200 }}>
            <input type="number" className="form-control" placeholder={todayHC > 0 ? `Update (currently ${todayHC})` : 'Enter today\'s count'} style={{ maxWidth: 140 }}
              value={hcForm.count} onChange={e => setHcForm({ ...hcForm, count: e.target.value })} />
            <input className="form-control" placeholder="Notes (optional)" style={{ flex: 1 }}
              value={hcForm.notes} onChange={e => setHcForm({ ...hcForm, notes: e.target.value })} />
            <button className="btn btn-primary btn-sm" onClick={handleSaveHeadcount}>
              {todayHC > 0 ? 'Update' : 'Record'}
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {CATS.filter(c => c !== 'Batch Plant').map(cat => {
          const catItems = items.filter(i => i.category === cat)
          const low      = catItems.filter(i => i.balance <= (i.reorder_level || 0) && i.reorder_level > 0).length
          return (
            <div key={cat} className="kpi-card" style={{ cursor: 'pointer', borderLeft: low > 0 ? '3px solid var(--yellow)' : undefined }}
              onClick={() => { setActiveTab('stock'); setFilterCat(cat) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="kpi-label">{cat}</div>
                <span className="material-icons" style={{ fontSize: 16, color: CAT_COLS[cat] }}>{CAT_ICONS[cat]}</span>
              </div>
              <div className="kpi-val" style={{ color: CAT_COLS[cat], fontSize: 22 }}>{catItems.length}</div>
              <div className="kpi-sub">{low > 0 ? <span style={{ color: 'var(--yellow)' }}>{low} low stock</span> : 'items'}</div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === t.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-icons" style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* STOCK TAB */}
      {activeTab === 'stock' && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input className="form-control" placeholder="Search items…" style={{ maxWidth: 200 }} value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} />
              <div style={{ display: 'flex', gap: 6 }}>
                {['ALL', ...CATS.filter(c => c !== 'Batch Plant')].map(c => (
                  <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    onClick={() => setFilterCat(c)}>{c}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Item</th><th>Category</th><th>Unit</th><th>Balance</th><th>Reorder Level</th><th>Status</th><th>Unit Cost</th><th>Used (30d)</th>{canEdit && <th>Actions</th>}</tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : filteredItems.length === 0 ? <tr><td colSpan="9" className="empty-state">No items found</td></tr>
                : filteredItems.map(i => {
                  const isLow  = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
                  const isOut  = i.balance <= 0
                  const stats  = getItemStats(i.id)
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td><span className="badge badge-blue" style={{ color: CAT_COLS[i.category] || 'var(--blue)' }}>{i.category}</span></td>
                      <td style={{ color: 'var(--text-dim)' }}>{i.unit}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: isOut ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>
                        {i.balance.toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i.reorder_level || '—'}</td>
                      <td>
                        {isOut  ? <span className="badge badge-red">Out of Stock</span>
                        : isLow ? <span className="badge badge-yellow">Low Stock</span>
                        :         <span className="badge badge-green">OK</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>${(i.unit_cost || 0).toFixed(2)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{stats.totalOut30d > 0 ? stats.totalOut30d.toLocaleString() : '—'}</td>
                      {canEdit && (
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingItem(i); setItemForm({ name: i.name, category: i.category, unit: i.unit, reorder_level: i.reorder_level, unit_cost: i.unit_cost, notes: i.notes || '' }); setItemModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm(`Delete ${i.name}?`)) return; await deleteItem(i.id); toast.success('Deleted') }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            Consumption per person per day — based on last 30 days + average camp headcount.
            <strong style={{ color: 'var(--yellow)' }}> Higher than normal values may indicate wastage or theft.</strong>
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Item</th><th>Category</th><th>Unit</th><th>Used (30d)</th><th>Per Person / Day</th><th>Headcount Avg</th><th>Est. Days Remaining</th></tr>
              </thead>
              <tbody>
                {filteredItems.map(i => {
                  const stats   = getItemStats(i.id)
                  const hcAvg   = headcounts.filter(h => h.date >= last30Str).reduce((s, h) => s + h.count, 0) / (headcounts.filter(h => h.date >= last30Str).length || 1)
                  const dailyBurn = stats.perPersonPerDay * hcAvg
                  const daysLeft  = dailyBurn > 0 ? Math.floor(i.balance / dailyBurn) : null
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td><span style={{ fontSize: 11, color: CAT_COLS[i.category] }}>{i.category}</span></td>
                      <td style={{ color: 'var(--text-dim)' }}>{i.unit}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{stats.totalOut30d > 0 ? stats.totalOut30d.toLocaleString() : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {stats.perPersonPerDay > 0 ? stats.perPersonPerDay.toFixed(3) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                        {hcAvg > 0 ? hcAvg.toFixed(0) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: daysLeft !== null && daysLeft < 7 ? 'var(--red)' : daysLeft !== null && daysLeft < 14 ? 'var(--yellow)' : 'var(--green)' }}>
                        {daysLeft !== null ? `~${daysLeft} days` : '—'}
                      </td>
                    </tr>
                  )
                })}
                {filteredItems.length === 0 && <tr><td colSpan="7" className="empty-state">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PPE REGISTER TAB */}
      {activeTab === 'ppe' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setPpeModal(true)}>
                <span className="material-icons">security</span> Issue PPE
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Date</th><th>Employee</th><th>Item</th><th>Qty</th><th>Size</th><th>Condition</th><th>Reason</th><th>Issued By</th></tr>
              </thead>
              <tbody>
                {ppeIssuances.length === 0 ? <tr><td colSpan="8" className="empty-state">No PPE issuances recorded</td></tr>
                : ppeIssuances.map(p => {
                  const emp = employees.find(e => e.id === p.employee_id)
                  return (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 600 }}>{emp?.name || p.employee_id}</td>
                      <td>{p.item_name}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{p.qty}</td>
                      <td>{p.size || '—'}</td>
                      <td><span className={`badge ${p.condition === 'New' ? 'badge-green' : p.condition === 'Replacement' ? 'badge-yellow' : 'badge-blue'}`}>{p.condition}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.reason}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.issued_by}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HEADCOUNT TAB */}
      {activeTab === 'headcount' && (
        <div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Date</th><th>Day</th><th>Headcount</th><th>Notes</th><th>Recorded By</th></tr>
              </thead>
              <tbody>
                {headcounts.length === 0 ? <tr><td colSpan="5" className="empty-state">No headcount records yet</td></tr>
                : headcounts.map(h => (
                  <tr key={h.id} style={{ background: h.date === today ? 'rgba(251,191,36,.04)' : 'transparent' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.date}{h.date === today && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>Today</span>}</td>
                    <td>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18, color: 'var(--teal)' }}>{h.count}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{h.notes || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{h.recorded_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {itemModal && (
        <div className="overlay" onClick={() => { setItemModal(false); setEditingItem(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingItem ? 'Edit' : 'Add'} <span>Item</span></div>
            <form onSubmit={handleSaveItem}>
              <div className="form-group"><label>Name *</label><input className="form-control" required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>Category</label><select className="form-control" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div className="form-group"><label>Unit</label><input className="form-control" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} placeholder="kg, L, pcs, boxes" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Reorder Level</label><input type="number" min="0" className="form-control" value={itemForm.reorder_level} onChange={e => setItemForm({ ...itemForm, reorder_level: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" className="form-control" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="form-group"><label>Notes</label><input className="form-control" value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setItemModal(false); setEditingItem(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {siModal && (
        <div className="overlay" onClick={() => setSiModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Stock <span>In</span></div>
            <form onSubmit={handleStockIn}>
              <div className="form-group"><label>Item *</label><select className="form-control" required value={siForm.item_id} onChange={e => setSiForm({ ...siForm, item_id: e.target.value })}><option value="">Select item</option>{items.filter(i => i.category !== 'Batch Plant').map(i => <option key={i.id} value={i.id}>{i.name} ({i.category}) — {i.balance} {i.unit}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>Quantity *</label><input type="number" min="0.01" step="0.01" className="form-control" required value={siForm.qty} onChange={e => setSiForm({ ...siForm, qty: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={siForm.date} onChange={e => setSiForm({ ...siForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Supplier</label><input className="form-control" value={siForm.supplier} onChange={e => setSiForm({ ...siForm, supplier: e.target.value })} /></div>
                <div className="form-group"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" className="form-control" value={siForm.unit_cost} onChange={e => setSiForm({ ...siForm, unit_cost: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="form-group"><label>Reference / Delivery Note</label><input className="form-control" value={siForm.reference} onChange={e => setSiForm({ ...siForm, reference: e.target.value })} /></div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={siForm.notes} onChange={e => setSiForm({ ...siForm, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSiModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><span className="material-icons">add_circle</span> Stock In</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {soModal && (
        <div className="overlay" onClick={() => setSoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Issue <span>Out</span></div>
            <form onSubmit={handleStockOut}>
              <div className="form-group"><label>Item *</label><select className="form-control" required value={soForm.item_id} onChange={e => setSoForm({ ...soForm, item_id: e.target.value })}><option value="">Select item</option>{items.filter(i => i.category !== 'Batch Plant' && i.balance > 0).map(i => <option key={i.id} value={i.id}>{i.name} ({i.category}) — {i.balance} {i.unit} available</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>Quantity *</label><input type="number" min="0.01" step="0.01" className="form-control" required value={soForm.qty} onChange={e => setSoForm({ ...soForm, qty: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={soForm.date} onChange={e => setSoForm({ ...soForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Issued To</label><input className="form-control" placeholder="Department or employee" value={soForm.issued_to} onChange={e => setSoForm({ ...soForm, issued_to: e.target.value })} /></div>
                <div className="form-group"><label>Authorized By</label><input className="form-control" value={soForm.authorized_by} onChange={e => setSoForm({ ...soForm, authorized_by: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Notes / Purpose</label><textarea className="form-control" rows="2" value={soForm.notes} onChange={e => setSoForm({ ...soForm, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSoModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger"><span className="material-icons">remove_circle</span> Issue Out</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PPE Modal */}
      {ppeModal && (
        <div className="overlay" onClick={() => setPpeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Issue <span>PPE</span></div>
            <form onSubmit={handlePPE}>
              <div className="form-group"><label>Employee *</label><select className="form-control" required value={ppeForm.employee_id} onChange={e => setPpeForm({ ...ppeForm, employee_id: e.target.value })}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>PPE Item *</label><select className="form-control" required value={ppeForm.item_id} onChange={e => setPpeForm({ ...ppeForm, item_id: e.target.value, item_name: items.find(i => i.id === e.target.value)?.name || '' })}><option value="">Select item</option>{items.filter(i => i.category === 'PPE').map(i => <option key={i.id} value={i.id}>{i.name} — {i.balance} available</option>)}</select></div>
                <div className="form-group"><label>Qty</label><input type="number" min="1" className="form-control" value={ppeForm.qty} onChange={e => setPpeForm({ ...ppeForm, qty: parseInt(e.target.value) || 1 })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Size</label><input className="form-control" placeholder="e.g. Size 9, L, XL" value={ppeForm.size} onChange={e => setPpeForm({ ...ppeForm, size: e.target.value })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={ppeForm.date} onChange={e => setPpeForm({ ...ppeForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Condition</label><select className="form-control" value={ppeForm.condition} onChange={e => setPpeForm({ ...ppeForm, condition: e.target.value })}><option>New</option><option>Good</option><option>Fair</option><option>Replacement</option></select></div>
                <div className="form-group"><label>Reason</label><select className="form-control" value={ppeForm.reason} onChange={e => setPpeForm({ ...ppeForm, reason: e.target.value })}><option>New issue</option><option>Replacement - Worn</option><option>Replacement - Damaged</option><option>Replacement - Lost</option></select></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setPpeModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><span className="material-icons">security</span> Issue PPE</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
