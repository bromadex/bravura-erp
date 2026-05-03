// src/pages/Reports/AuditTrail.jsx — Cross-module transaction audit log
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const MODULE_COLOR = {
  inventory:   'var(--blue)',
  procurement: 'var(--purple)',
  fuel:        'var(--gold)',
  fleet:       'var(--yellow)',
  hr:          'var(--green)',
  campsite:    'var(--teal)',
  logistics:   'var(--orange)',
  accounting:  'var(--red)',
  governance:  '#818cf8',
}

const MODULE_ICON = {
  inventory:   'inventory_2',
  procurement: 'shopping_cart',
  fuel:        'local_gas_station',
  fleet:       'directions_car',
  hr:          'people',
  campsite:    'hotel',
  logistics:   'local_shipping',
  accounting:  'receipt_long',
  governance:  'policy',
}

const TODAY = new Date().toISOString().split('T')[0]
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

export default function AuditTrail() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [module,  setModule]  = useState('ALL')
  const [dateFrom, setDateFrom] = useState(THIRTY_DAYS_AGO)
  const [dateTo,   setDateTo]   = useState(TODAY)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Pull recent transactions from multiple tables and merge them
        const [invR, fuelR, procR, jeR, campsiteR] = await Promise.all([
          supabase.from('stock_transactions')
            .select('id, txn_code, txn_type, quantity, item_id, created_by, created_at, notes')
            .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false }).limit(300),

          supabase.from('fuel_transactions')
            .select('id, txn_code, txn_type, quantity_liters, vehicle_id, issued_to, created_at, notes')
            .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false }).limit(300),

          supabase.from('purchase_orders')
            .select('id, po_number, status, total_amount, supplier_id, created_by, created_at, notes')
            .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false }).limit(300),

          supabase.from('journal_entries')
            .select('id, entry_date, description, reference, total_debit, created_by, created_at')
            .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false }).limit(300),

          supabase.from('room_assignments')
            .select('id, txn_code, status, employee_id, room_id, assigned_by, created_at, checkin_notes')
            .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false }).limit(300),
        ])

        const merged = [
          ...(invR.data || []).map(r => ({
            id: r.id, module: 'inventory',
            ref:    r.txn_code || r.id.slice(0, 8),
            action: r.txn_type || 'Transaction',
            detail: `Qty: ${r.quantity}`,
            user:   r.created_by || '—',
            notes:  r.notes || '',
            ts:     r.created_at,
          })),
          ...(fuelR.data || []).map(r => ({
            id: r.id, module: 'fuel',
            ref:    r.txn_code || r.id.slice(0, 8),
            action: r.txn_type || 'Fuel Transaction',
            detail: `${r.quantity_liters}L`,
            user:   r.issued_to || '—',
            notes:  r.notes || '',
            ts:     r.created_at,
          })),
          ...(procR.data || []).map(r => ({
            id: r.id, module: 'procurement',
            ref:    r.po_number || r.id.slice(0, 8),
            action: `PO — ${r.status}`,
            detail: r.total_amount ? `$${r.total_amount}` : '',
            user:   r.created_by || '—',
            notes:  r.notes || '',
            ts:     r.created_at,
          })),
          ...(jeR.data || []).map(r => ({
            id: r.id, module: 'accounting',
            ref:    r.reference || r.id.slice(0, 8),
            action: 'Journal Entry',
            detail: r.description,
            user:   r.created_by || '—',
            notes:  '',
            ts:     r.created_at,
          })),
          ...(campsiteR.data || []).map(r => ({
            id: r.id, module: 'campsite',
            ref:    r.txn_code || r.id.slice(0, 8),
            action: `Room — ${r.status}`,
            detail: r.checkin_notes || '',
            user:   r.assigned_by || '—',
            notes:  '',
            ts:     r.created_at,
          })),
        ].sort((a, b) => new Date(b.ts) - new Date(a.ts))

        setRows(merged)
      } catch (err) {
        console.error(err)
        toast.error('Failed to load audit trail')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dateFrom, dateTo])

  const modules = useMemo(() => ['ALL', ...new Set(rows.map(r => r.module))], [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r => {
      if (module !== 'ALL' && r.module !== module) return false
      if (q && !r.ref.toLowerCase().includes(q) && !r.action.toLowerCase().includes(q) &&
          !r.detail.toLowerCase().includes(q) && !r.user.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, module, search])

  const exportXlsx = () => {
    const data = [
      ['Date/Time', 'Module', 'Reference', 'Action', 'Detail', 'User', 'Notes'],
      ...filtered.map(r => [
        new Date(r.ts).toLocaleString(), r.module, r.ref, r.action, r.detail, r.user, r.notes,
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail')
    XLSX.writeFile(wb, `AuditTrail_${TODAY}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Audit Trail</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} records shown</div>
        </div>
        <button className="btn btn-secondary" onClick={exportXlsx}>
          <span className="material-icons" style={{ fontSize: 16 }}>table_chart</span> Export
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" className="form-control" style={{ maxWidth: 140 }} value={dateFrom}
          onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
        <input type="date" className="form-control" style={{ maxWidth: 140 }} value={dateTo}
          onChange={e => setDateTo(e.target.value)} />
        <input className="form-control" placeholder="Search…" style={{ maxWidth: 220 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ maxWidth: 160 }} value={module}
          onChange={e => setModule(e.target.value)}>
          {modules.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>manage_search</span>
          <p>No records found.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Module</th>
                  <th>Reference</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const color = MODULE_COLOR[r.module] || 'var(--text-dim)'
                  const icon  = MODULE_ICON[r.module]  || 'circle'
                  return (
                    <tr key={r.id + r.ts}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {new Date(r.ts).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 14, color }}>{icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'capitalize' }}>{r.module}</span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color }}>{r.ref}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{r.action}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{r.user}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
