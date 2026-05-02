// src/pages/Logistics/CampManagement.jsx
import { useState, useEffect, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]
const CATS  = ['Food', 'PPE', 'Consumables', 'General']

export default function CampManagement() {
  const { items, transactions, headcounts, ppeIssuances, addItem, updateItem, deleteItem, stockIn, stockOut, setHeadcount, issuePPE, loading } = useLogistics()
  const { user } = useAuth()
  const canEdit = useCanEdit('logistics', 'camp')

  const [activeTab,  setActiveTab]  = useState('stock')
  const [filterCat,  setFilterCat]  = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [employees,  setEmployees]  = useState([])

  useEffect(() => {
    supabase.from('employees').select('id, name').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  // Forms
  const [hcForm,    setHcForm]    = useState({ count: '', notes: '' })
  const [siModal,   setSiModal]   = useState(false)
  const [soModal,   setSoModal]   = useState(false)
  const [itemModal, setItemModal] = useState(false)
  const [ppeModal,  setPpeModal]  = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const [siForm, setSiForm] = useState({ item_id: '', qty: 1, date: today, supplier: '', reference: '', unit_cost: 0, notes: '' })
  const [soForm, setSoForm] = useState({ item_id: '', qty: 1, date: today, issued_to: '', authorized_by: user?.full_name || '', notes: '' })
  const [itemForm, setItemForm] = useState({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' })
  const [ppeForm, setPpeForm] = useState({ employee_id: '', item_id: '', item_name: '', qty: 1, size: '', date: today, condition: 'New', reason: 'New issue', issued_by: user?.full_name || '' })

  const todayHC = headcounts.find(h => h.date === today)?.count || 0

  const filteredItems = useMemo(() => items.filter(i => {
    if (i.category === 'Batch Plant') return false
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  }), [items, filterCat, searchTerm])

  // 30-day stats
  const last30 = new Date(); last30.setDate(last30.getDate() - 30)
  const last30Str = last30.toISOString().split('T')[0]

  const getStats = (itemId) => {
    const outTx   = transactions.filter(t => t.item_id === itemId && t.type === 'OUT' && t.date >= last30Str)
    const totalOut = outTx.reduce((s, t) => s + (t.qty || 0), 0)
    const hcDays  = headcounts.filter(h => h.date >= last30Str)
    const avgHC   = hcDays.length > 0 ? hcDays.reduce((s, h) => s + h.count, 0) / hcDays.length : 0
    return { totalOut30d: totalOut, perPersonPerDay: avgHC > 0 ? totalOut / (avgHC * (hcDays.length || 30)) : 0, avgHC }
  }

  const handleStockIn  = async (e) => { e.preventDefault(); if (!siForm.item_id || siForm.qty <= 0) return toast.error('Select item and quantity'); try { await stockIn(siForm.item_id, siForm.qty, siForm.date, siForm.supplier, siForm.reference, siForm.notes, siForm.unit_cost, user?.full_name || ''); toast.success('Stocked in'); setSiModal(false); setSiForm({ item_id: '', qty: 1, date: today, supplier: '', reference: '', unit_cost: 0, notes: '' }) } catch (err) { toast.error(err.message) } }
  const handleStockOut = async (e) => { e.preventDefault(); if (!soForm.item_id || soForm.qty <= 0) return toast.error('Select item and quantity'); try { await stockOut(soForm.item_id, soForm.qty, soForm.date, soForm.issued_to, soForm.authorized_by, soForm.notes, null, null, user?.full_name || ''); toast.success('Issued'); setSoModal(false); setSoForm({ item_id: '', qty: 1, date: today, issued_to: '', authorized_by: user?.full_name || '', notes: '' }) } catch (err) { toast.error(err.message) } }
  const handleSaveItem = async (e) => { e.preventDefault(); try { if (editingItem) { await updateItem(editingItem.id, itemForm); toast.success('Updated') } else { await addItem(itemForm); toast.success('Added') } setItemModal(false); setEditingItem(null) } catch (err) { toast.error(err.message) } }
  const handlePPE      = async (e) => { e.preventDefault(); if (!ppeForm.employee_id || !ppeForm.item_id) return toast.error('Select employee and item'); try { await issuePPE(ppeForm, user?.full_name || ''); toast.success('PPE issued'); setPpeModal(false); setPpeForm({ employee_id: '', item_id: '', item_name: '', qty: 1, size: '', date: today, condition: 'New', reason: 'New issue', issued_by: user?.full_name || '' }) } catch (err) { toast.error(err.message) } }
  const handleHeadcount = async () => { if (!hcForm.count) return toast.error('Enter headcount'); try { await setHeadcount(today, parseInt(hcForm.count), hcForm.notes, user?.full_name || ''); toast.success('Headcount recorded'); setHcForm({ count: '', notes: '' }) } catch (err) { toast.error(err.message) } }

  const exportXLSX = () => { const ws = XLSX.utils.json_to_sheet(filteredItems.map(i => { const s = getStats(i.id); return { Name: i.name, Category: i.category, Unit: i.unit, Balance: i.balance, 'Reorder Level': i.reorder_level, 'Used 30d': s.totalOut30d, 'Per Person/Day': s.perPersonPerDay.toFixed(4) } })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Camp Stock'); XLSX.writeFile(wb, `CampStock_${today}.xlsx`); toast.success('Exported') }

  const TABS = [
    { id: 'stock',     label: 'Stock Levels',  icon: 'inventory_2' },
    { id: 'analytics', label: 'Consumption',   icon: 'analytics'   },
    { id: 'ppe',       label: 'PPE Register',  icon: 'security'    },
    { id: 'headcount', label: 'Headcount',     icon: 'people'      },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Camp & Site Supplies</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && <>
            <button className="btn btn-secondary" onClick={() => { setEditingItem(null); setItemForm({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' }); setItemModal(true) }}><span className="material-icons">add</span> Item</button>
            <button className="btn btn-secondary" onClick={() => setSiModal(true)}><span className="material-icons">add_circle</span> Stock In</button>
            <button className="btn btn-primary" onClick={() => setSoModal(true)}><span className="material-icons">remove_circle</span> Issue</button>
          </>}
        </div>
      </div>

      {/* Headcount banner */}
      <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 24, color: 'var(--teal)' }}>people</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>CAMP HEADCOUNT TODAY</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: todayHC > 0 ? 'var(--teal)' : 'var(--text-dim)' }}>{todayHC > 0 ? todayHC : 'Not recorded'}</div>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 200 }}>
            <input type="number" className="form-control" placeholder={todayHC > 0 ? `Update (${todayHC})` : 'Enter count'} style={{ maxWidth: 130 }}
              value={hcForm.count} onChange={e => setHcForm({ ...hcForm, count: e.target.value })} />
            <input className="form-control" placeholder="Notes" style={{ flex: 1 }}
              value={hcForm.notes} onChange={e => setHcForm({ ...hcForm, notes: e.target.value })} />
            <button className="btn btn-primary btn-sm" onClick={handleHeadcount}>{todayHC > 0 ? 'Update' : 'Record'}</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === t.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-icons" style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Stock tab */}
      {activeTab === 'stock' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input className="form-control" placeholder="Search…" style={{ maxWidth: 180 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            {['ALL', ...CATS].map(c => <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setFilterCat(c)}>{c === 'ALL' ? 'All' : c}</button>)}
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Item</th><th>Category</th><th>Balance</th><th>Reorder</th><th>Status</th><th>Used 30d</th>{canEdit && <th>Actions</th>}</tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                  : filteredItems.length === 0 ? <tr><td colSpan="7" className="empty-state">No items</td></tr>
                  : filteredItems.map(i => {
                    const isLow = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
                    const isOut = i.balance <= 0
                    const s = getStats(i.id)
                    return (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.name}</td>
                        <td style={{ fontSize: 11 }}>{i.category}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: isOut ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>{i.balance} {i.unit}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i.reorder_level || '—'}</td>
                        <td>{isOut ? <span className="badge badge-red">Out</span> : isLow ? <span className="badge badge-yellow">Low</span> : <span className="badge badge-green">OK</span>}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{s.totalOut30d > 0 ? s.totalOut30d : '—'}</td>
                        {canEdit && (
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditingItem(i); setItemForm({ name: i.name, category: i.category, unit: i.unit, reorder_level: i.reorder_level, unit_cost: i.unit_cost, notes: i.notes || '' }); setItemModal(true) }}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>
                            <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm('Delete?')) return; await deleteItem(i.id); toast.success('Deleted') }}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
            Consumption per person per day — last 30 days. High values may indicate wastage or theft.
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Item</th><th>Category</th><th>Used (30d)</th><th>Per Person/Day</th><th>HC Avg</th><th>Days Remaining</th></tr></thead>
              <tbody>
                {filteredItems.map(i => {
                  const s = getStats(i.id)
                  const dailyBurn = s.perPersonPerDay * s.avgHC
                  const daysLeft  = dailyBurn > 0 ? Math.floor(i.balance / dailyBurn) : null
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td style={{ fontSize: 11 }}>{i.category}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{s.totalOut30d > 0 ? s.totalOut30d : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{s.perPersonPerDay > 0 ? s.perPersonPerDay.toFixed(3) : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{s.avgHC > 0 ? s.avgHC.toFixed(0) : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: daysLeft !== null && daysLeft < 7 ? 'var(--red)' : daysLeft !== null && daysLeft < 14 ? 'var(--yellow)' : 'var(--green)' }}>
                        {daysLeft !== null ? `~${daysLeft} days` : '—'}
                      </td>
                    </tr>
                  )
                })}
                {filteredItems.length === 0 && <tr><td colSpan="6" className="empty-state">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PPE tab */}
      {activeTab === 'ppe' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {canEdit && <button className="btn btn-primary" onClick={() => setPpeModal(true)}><span className="material-icons">security</span> Issue PPE</button>}
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Employee</th><th>Item</th><th>Qty</th><th>Size</th><th>Condition</th><th>Reason</th><th>Issued By</th></tr></thead>
                <tbody>
                  {ppeIssuances.length === 0 ? <tr><td colSpan="8" className="empty-state">No PPE issuances</td></tr>
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
        </div>
      )}

      {/* Headcount tab */}
      {activeTab === 'headcount' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Date</th><th>Day</th><th>Headcount</th><th>Notes</th><th>Recorded By</th></tr></thead>
              <tbody>
                {headcounts.length === 0 ? <tr><td colSpan="5" className="empty-state">No headcount records</td></tr>
                : headcounts.map(h => (
                  <tr key={h.id} style={{ background: h.date === today ? 'rgba(251,191,36,.04)' : 'transparent' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.date}{h.date === today && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>Today</span>}</td>
                    <td>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: 'var(--teal)' }}>{h.count}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{h.notes || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{h.recorded_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {itemModal && (
        <div className="overlay" onClick={() => { setItemModal(false); setEditingItem(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingItem ? 'Edit' : 'Add'} <span>Item</span></div>
            <form onSubmit={handleSaveItem}>
              <div className="form-group"><label>Name *</label><input className="form-control" required value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>Category</label><select className="form-control" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div className="form-group"><label>Unit</label><input className="form-control" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} placeholder="kg, L, pcs…" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Reorder Level</label><input type="number" min="0" className="form-control" value={itemForm.reorder_level} onChange={e => setItemForm({ ...itemForm, reorder_level: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" className="form-control" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setItemModal(false); setEditingItem(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {siModal && (
        <div className="overlay" onClick={() => setSiModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Stock <span>In</span></div>
            <form onSubmit={handleStockIn}>
              <div className="form-group"><label>Item *</label><select className="form-control" required value={siForm.item_id} onChange={e => setSiForm({ ...siForm, item_id: e.target.value })}><option value="">Select item</option>{items.filter(i => i.category !== 'Batch Plant').map(i => <option key={i.id} value={i.id}>{i.name} — {i.balance} {i.unit}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>Qty *</label><input type="number" min="0.01" step="0.01" required className="form-control" value={siForm.qty} onChange={e => setSiForm({ ...siForm, qty: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={siForm.date} onChange={e => setSiForm({ ...siForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Supplier</label><input className="form-control" value={siForm.supplier} onChange={e => setSiForm({ ...siForm, supplier: e.target.value })} /></div>
                <div className="form-group"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" className="form-control" value={siForm.unit_cost} onChange={e => setSiForm({ ...siForm, unit_cost: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setSiModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Stock In</button></div>
            </form>
          </div>
        </div>
      )}

      {soModal && (
        <div className="overlay" onClick={() => setSoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Issue <span>Out</span></div>
            <form onSubmit={handleStockOut}>
              <div className="form-group"><label>Item *</label><select className="form-control" required value={soForm.item_id} onChange={e => setSoForm({ ...soForm, item_id: e.target.value })}><option value="">Select item</option>{items.filter(i => i.category !== 'Batch Plant' && i.balance > 0).map(i => <option key={i.id} value={i.id}>{i.name} — {i.balance} {i.unit}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>Qty *</label><input type="number" min="0.01" step="0.01" required className="form-control" value={soForm.qty} onChange={e => setSoForm({ ...soForm, qty: parseFloat(e.target.value) || 0 })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={soForm.date} onChange={e => setSoForm({ ...soForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Issued To</label><input className="form-control" value={soForm.issued_to} onChange={e => setSoForm({ ...soForm, issued_to: e.target.value })} /></div>
                <div className="form-group"><label>Authorized By</label><input className="form-control" value={soForm.authorized_by} onChange={e => setSoForm({ ...soForm, authorized_by: e.target.value })} /></div>
              </div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setSoModal(false)}>Cancel</button><button type="submit" className="btn btn-danger">Issue</button></div>
            </form>
          </div>
        </div>
      )}

      {ppeModal && (
        <div className="overlay" onClick={() => setPpeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Issue <span>PPE</span></div>
            <form onSubmit={handlePPE}>
              <div className="form-group"><label>Employee *</label><select className="form-control" required value={ppeForm.employee_id} onChange={e => setPpeForm({ ...ppeForm, employee_id: e.target.value })}><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="form-row">
                <div className="form-group"><label>PPE Item *</label><select className="form-control" required value={ppeForm.item_id} onChange={e => { const itm = items.find(i => i.id === e.target.value); setPpeForm({ ...ppeForm, item_id: e.target.value, item_name: itm?.name || '' }) }}><option value="">Select item</option>{items.filter(i => i.category === 'PPE').map(i => <option key={i.id} value={i.id}>{i.name} — {i.balance} available</option>)}</select></div>
                <div className="form-group"><label>Qty</label><input type="number" min="1" className="form-control" value={ppeForm.qty} onChange={e => setPpeForm({ ...ppeForm, qty: parseInt(e.target.value) || 1 })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Size</label><input className="form-control" placeholder="Size 9, L, XL…" value={ppeForm.size} onChange={e => setPpeForm({ ...ppeForm, size: e.target.value })} /></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={ppeForm.date} onChange={e => setPpeForm({ ...ppeForm, date: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Condition</label><select className="form-control" value={ppeForm.condition} onChange={e => setPpeForm({ ...ppeForm, condition: e.target.value })}><option>New</option><option>Good</option><option>Fair</option><option>Replacement</option></select></div>
                <div className="form-group"><label>Reason</label><select className="form-control" value={ppeForm.reason} onChange={e => setPpeForm({ ...ppeForm, reason: e.target.value })}><option>New issue</option><option>Replacement - Worn</option><option>Replacement - Damaged</option><option>Replacement - Lost</option></select></div>
              </div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setPpeModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Issue PPE</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
