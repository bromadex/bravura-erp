// src/pages/Assets/ReclassificationLog.jsx
// Audit trail of all asset reclassifications.

import { useState, useMemo } from 'react'
import { useAssetRegistry } from '../../contexts/AssetRegistryContext'
import { exportXLSX, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function ReclassificationLog() {
  const { reclassLogs, categoryConfigs, loading } = useAssetRegistry()
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [expanded,  setExpanded]  = useState(null)

  const allCategories = [...new Set([
    ...reclassLogs.map(r => r.from_category),
    ...reclassLogs.map(r => r.to_category),
  ])].sort()

  const filtered = useMemo(() => {
    return reclassLogs.filter(r => {
      if (dateFrom && r.created_at?.slice(0, 10) < dateFrom) return false
      if (dateTo   && r.created_at?.slice(0, 10) > dateTo)   return false
      if (catFilter !== 'All' && r.from_category !== catFilter && r.to_category !== catFilter) return false
      if (search) {
        const t = search.toLowerCase()
        if (!([r.asset_name, r.asset_code, r.txn_code, r.reason, r.requested_by]
          .some(v => v?.toLowerCase().includes(t)))) return false
      }
      return true
    })
  }, [reclassLogs, dateFrom, dateTo, catFilter, search])

  const handleExport = () => {
    if (!filtered.length) return toast.error('No data to export')
    exportXLSX(filtered.map(r => ({
      'Txn Code':      r.txn_code,
      'Asset Code':    r.asset_code,
      'Asset Name':    r.asset_name,
      'From Category': r.from_category,
      'To Category':   r.to_category,
      'From Metric':   r.from_measurement_type || '',
      'To Metric':     r.to_measurement_type || '',
      'Reason':        r.reason,
      'Requested By':  r.requested_by,
      'Status':        r.status,
      'Date':          r.created_at?.slice(0, 10),
    })), `ReclassificationLog_${dateTag()}`, 'Reclassifications')
    toast.success('Exported')
  }

  const getCfg = (cat) => categoryConfigs.find(c => c.category === cat)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reclassification Log</h1>
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Name, code, reason…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select className="form-control" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="All">All Categories</option>
              {allCategories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>From Date</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To Date</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setCatFilter('All') }}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, paddingLeft: 2 }}>
        {filtered.length} events
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Txn Code</th>
                <th>Asset</th>
                <th>Reclassification</th>
                <th>Metric Change</th>
                <th>Reason</th>
                <th>By</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No reclassifications found</td></tr>
              ) : filtered.map(r => {
                const fromCfg = getCfg(r.from_category)
                const toCfg   = getCfg(r.to_category)
                const isExp   = expanded === r.id
                return (
                  <>
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(isExp ? null : r.id)}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.txn_code}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.asset_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{r.asset_code}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                            {fromCfg && <span className="material-icons" style={{ fontSize: 12, color: fromCfg.color }}>{fromCfg.icon}</span>}
                            {r.from_category}
                          </span>
                          <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>arrow_forward</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                            {toCfg && <span className="material-icons" style={{ fontSize: 12, color: toCfg.color }}>{toCfg.icon}</span>}
                            {r.to_category}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {r.from_measurement_type !== r.to_measurement_type ? (
                          <span style={{ color: 'var(--red)' }}>
                            {r.from_measurement_type} → {r.to_measurement_type}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>No change</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason}
                      </td>
                      <td style={{ fontSize: 12 }}>{r.requested_by}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.created_at?.slice(0, 10)}</td>
                      <td>
                        <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                          {isExp ? 'expand_less' : 'expand_more'}
                        </span>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${r.id}-exp`}>
                        <td colSpan="8" style={{ background: 'var(--bg)', padding: '12px 24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Full Reason</div>
                              <div style={{ fontSize: 13 }}>{r.reason}</div>
                              {r.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{r.notes}</div>}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Archived Fields</div>
                              {Object.keys(r.archived_fields || {}).length === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>None</div>
                              ) : Object.entries(r.archived_fields).map(([k, v]) => (
                                <div key={k} style={{ fontSize: 12 }}><strong>{k}:</strong> {String(v ?? '—')}</div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Details</div>
                              <div style={{ fontSize: 12 }}>Status: <strong>{r.status}</strong></div>
                              {r.approved_by && <div style={{ fontSize: 12 }}>Approved by: <strong>{r.approved_by}</strong></div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
