// src/pages/Logistics/BatchPlant.jsx
//
// Batch Plant Operations Intelligence:
// - Record concrete batches with material inputs
// - Auto-deducts raw materials from logistics stock
// - Efficiency tracking: cement kg per m³ (benchmark <380kg/m³)
// - Production trends with CSS charts
// - Mix design performance comparison

import { useState, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]
const MIX_DESIGNS = ['C20', 'C25', 'C30', 'C35', 'Standard', 'Blinding', 'Other']
// Benchmark cement usage per m³ by mix design
const CEMENT_BENCHMARKS = { C20: 320, C25: 360, C30: 400, C35: 440, Standard: 350, Blinding: 200, Other: 350 }

export default function BatchPlant() {
  const { batchRecords, addBatchRecord, items, loading } = useLogistics()
  const { user } = useAuth()
  const canEdit = useCanEdit('logistics', 'batch-plant')

  const [showModal, setShowModal] = useState(false)
  const [filterDays, setFilterDays] = useState(30)
  const [form, setForm] = useState({
    date: today, batch_number: '', mix_design: 'C25',
    volume_m3: 0, cement_kg: 0, sand_kg: 0, stone_kg: 0,
    water_litres: 0, additive_kg: 0,
    pour_location: '', operator: user?.full_name || user?.username || '', notes: ''
  })

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - filterDays)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const recentRecords = useMemo(() => batchRecords.filter(r => r.date >= cutoffStr), [batchRecords, cutoffStr])

  // KPIs
  const totalVolume      = recentRecords.reduce((s, r) => s + (r.volume_m3  || 0), 0)
  const totalCement      = recentRecords.reduce((s, r) => s + (r.cement_kg  || 0), 0)
  const totalBatches     = recentRecords.length
  const avgCementPerM3   = totalVolume > 0 ? totalCement / totalVolume : 0
  const thisMonthVol     = batchRecords.filter(r => r.date >= today.slice(0,7)+'-01').reduce((s, r) => s + (r.volume_m3 || 0), 0)

  // Mix design breakdown
  const mixMap = {}
  recentRecords.forEach(r => {
    const m = r.mix_design || 'Unknown'
    if (!mixMap[m]) mixMap[m] = { volume: 0, batches: 0, cementTotal: 0 }
    mixMap[m].volume       += r.volume_m3 || 0
    mixMap[m].batches       += 1
    mixMap[m].cementTotal   += r.cement_kg || 0
  })

  // Weekly production for chart
  const weeklyMap = {}
  recentRecords.forEach(r => {
    const weekStart = new Date(r.date); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
    const key = weekStart.toISOString().split('T')[0]
    weeklyMap[key] = (weeklyMap[key] || 0) + (r.volume_m3 || 0)
  })
  const weeklyData = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
  const maxWeekly = Math.max(...weeklyData.map(([, v]) => v), 1)

  // Material stock levels
  const matItems = items.filter(i => i.category === 'Batch Plant')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.volume_m3 || form.volume_m3 <= 0) return toast.error('Enter volume produced (m³)')
    if (!form.cement_kg || form.cement_kg <= 0)  return toast.error('Enter cement used (kg)')
    try {
      await addBatchRecord(form, user?.full_name || user?.username)
      toast.success(`Batch recorded: ${form.volume_m3} m³ ${form.mix_design}`)
      setShowModal(false)
      setForm({ date: today, batch_number: '', mix_design: 'C25', volume_m3: 0, cement_kg: 0, sand_kg: 0, stone_kg: 0, water_litres: 0, additive_kg: 0, pour_location: '', operator: user?.full_name || user?.username || '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(recentRecords.map(r => ({
      Date: r.date, 'Batch #': r.batch_number, Mix: r.mix_design,
      'Volume (m³)': r.volume_m3, 'Cement (kg)': r.cement_kg,
      'Sand (kg)': r.sand_kg, 'Stone (kg)': r.stone_kg,
      'Water (L)': r.water_litres, 'Additive (kg)': r.additive_kg,
      'kg/m³': r.cement_per_m3?.toFixed(1), Location: r.pour_location, Operator: r.operator,
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Batch Records')
    XLSX.writeFile(wb, `BatchPlant_${today}.xlsx`); toast.success('Exported')
  }

  const efficiencyColor = (kgPerM3, design = 'Standard') => {
    const bench = CEMENT_BENCHMARKS[design] || 350
    if (kgPerM3 > bench * 1.15) return 'var(--red)'
    if (kgPerM3 > bench * 1.05) return 'var(--yellow)'
    return 'var(--green)'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Batch Plant</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <span className="material-icons">add</span> Record Batch
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[7, 30, 90, 365].map(d => (
          <button key={d} className={filterDays === d ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setFilterDays(d)}>Last {d} days</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Volume</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{totalVolume.toFixed(1)}</div>
          <div className="kpi-sub">m³ in {filterDays} days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">This Month</div>
          <div className="kpi-val">{thisMonthVol.toFixed(1)}</div>
          <div className="kpi-sub">m³ produced</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Batches</div>
          <div className="kpi-val">{totalBatches}</div>
          <div className="kpi-sub">recorded</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cement Used</div>
          <div className="kpi-val" style={{ fontSize: 20 }}>{(totalCement / 1000).toFixed(1)} t</div>
          <div className="kpi-sub">{totalCement.toLocaleString()} kg total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cement Efficiency</div>
          <div className="kpi-val" style={{ color: efficiencyColor(avgCementPerM3), fontSize: 22 }}>
            {avgCementPerM3.toFixed(0)}
          </div>
          <div className="kpi-sub">kg cement per m³</div>
        </div>
      </div>

      {/* Efficiency context */}
      {avgCementPerM3 > 0 && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 20, background: avgCementPerM3 > 420 ? 'rgba(248,113,113,.08)' : avgCementPerM3 > 390 ? 'rgba(251,191,36,.08)' : 'rgba(52,211,153,.08)', border: `1px solid ${avgCementPerM3 > 420 ? 'rgba(248,113,113,.3)' : avgCementPerM3 > 390 ? 'rgba(251,191,36,.3)' : 'rgba(52,211,153,.3)'}`, fontSize: 12 }}>
          <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>info</span>
          Average cement usage: <strong>{avgCementPerM3.toFixed(0)} kg/m³</strong>.
          {avgCementPerM3 > 420 ? ' Above normal — check mix design proportions and material wastage.' :
           avgCementPerM3 > 390 ? ' Slightly elevated — monitor closely.' :
           ' Within acceptable range.'}
          {' '}Typical C25 mix: ~360–400 kg/m³.
        </div>
      )}

      {/* Weekly production chart */}
      {weeklyData.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Weekly Production</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>m³ concrete produced per week</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {weeklyData.map(([week, vol], i) => {
              const pct   = (vol / maxWeekly) * 100
              const label = new Date(week + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{vol.toFixed(1)}</div>
                  <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(4, pct)}%`, background: 'var(--blue)', borderRadius: '4px 4px 0 0', transition: 'height .4s ease', opacity: 0.85 }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Mix design breakdown */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>By Mix Design</div>
          {Object.entries(mixMap).length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No data</div>
          ) : Object.entries(mixMap).sort(([, a], [, b]) => b.volume - a.volume).map(([mix, data]) => {
            const eff   = data.volume > 0 ? data.cementTotal / data.volume : 0
            const bench = CEMENT_BENCHMARKS[mix] || 350
            const pct   = (data.volume / totalVolume) * 100
            return (
              <div key={mix} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{mix}</span>
                  <span style={{ fontSize: 12 }}>
                    <strong>{data.volume.toFixed(1)} m³</strong>
                    <span style={{ color: efficiencyColor(eff, mix), marginLeft: 8, fontFamily: 'var(--mono)' }}>{eff.toFixed(0)} kg/m³</span>
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue)', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  {data.batches} batches · Benchmark: {bench} kg/m³
                  {eff > bench * 1.1 && <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>⚠ Above benchmark</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Raw material stock */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Raw Material Stock</div>
          {matItems.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No batch plant items in logistics stock.<br /><span style={{ fontSize: 11 }}>Add items with category "Batch Plant"</span></div>
          ) : matItems.map(i => {
            const isLow = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
            const pct   = i.reorder_level > 0 ? (i.balance / (i.reorder_level * 3)) * 100 : 50
            return (
              <div key={i.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{i.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: i.balance <= 0 ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>
                    {i.balance.toLocaleString()} {i.unit}
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(2, pct))}%`, height: '100%', background: i.balance <= 0 ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--teal)', borderRadius: 4 }} />
                </div>
                {isLow && <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 2 }}>Below reorder level ({i.reorder_level} {i.unit})</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Batch records table */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
          Batch Records — Last {filterDays} Days
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Date</th><th>Batch #</th><th>Mix</th><th>Volume (m³)</th><th>Cement (kg)</th><th>Sand (kg)</th><th>Stone (kg)</th><th>kg/m³</th><th>Location</th><th>Operator</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              : recentRecords.length === 0 ? <tr><td colSpan="10" className="empty-state">No batch records for this period</td></tr>
              : recentRecords.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{r.batch_number || '—'}</td>
                  <td><span className="badge badge-blue">{r.mix_design}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{r.volume_m3}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.cement_kg?.toLocaleString()}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{r.sand_kg?.toLocaleString() || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{r.stone_kg?.toLocaleString() || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: efficiencyColor(r.cement_per_m3 || 0, r.mix_design) }}>
                    {r.cement_per_m3?.toFixed(0) || '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.pour_location || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.operator || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Batch Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Record <span>Concrete Batch</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="form-group"><label>Batch Number</label><input className="form-control" placeholder="e.g. B-2024-001" value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Mix Design</label><select className="form-control" value={form.mix_design} onChange={e => setForm({ ...form, mix_design: e.target.value })}>{MIX_DESIGNS.map(m => <option key={m}>{m}</option>)}</select></div>
                <div className="form-group">
                  <label>Volume Produced (m³) *</label>
                  <input type="number" min="0.1" step="0.1" className="form-control" required value={form.volume_m3} onChange={e => setForm({ ...form, volume_m3: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '12px 0 8px' }}>Materials Used</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[['Cement (kg) *','cement_kg'],['Sand (kg)','sand_kg'],['Stone/Aggregate (kg)','stone_kg'],['Water (L)','water_litres'],['Additive (kg)','additive_kg']].map(([label, key]) => (
                  <div className="form-group" key={key}>
                    <label>{label}</label>
                    <input type="number" min="0" step="0.1" className="form-control" value={form[key]}
                      onChange={e => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })}
                      required={key === 'cement_kg'} />
                  </div>
                ))}
                {form.volume_m3 > 0 && form.cement_kg > 0 && (
                  <div className="kpi-card" style={{ padding: 12 }}>
                    <div className="kpi-label">This Batch kg/m³</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: efficiencyColor(form.cement_kg / form.volume_m3, form.mix_design) }}>
                      {(form.cement_kg / form.volume_m3).toFixed(0)}
                    </div>
                    <div className="kpi-sub">Benchmark: {CEMENT_BENCHMARKS[form.mix_design] || 350}</div>
                  </div>
                )}
              </div>

              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="form-group"><label>Pour Location</label><input className="form-control" placeholder="e.g. Shaft collar, Workshop slab" value={form.pour_location} onChange={e => setForm({ ...form, pour_location: e.target.value })} /></div>
                <div className="form-group"><label>Operator</label><input className="form-control" value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
                <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>info</span>
                Saving this record will automatically deduct materials from Batch Plant stock.
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><span className="material-icons">factory</span> Record Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
