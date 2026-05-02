// src/pages/Logistics/BatchPlant.jsx
import { useState, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]
const MIX_DESIGNS = ['C20','C25','C30','C35','Standard','Blinding','Other']
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
    pour_location: '', operator: user?.full_name || '', notes: ''
  })

  const cutoffStr = (() => { const d = new Date(); d.setDate(d.getDate() - filterDays); return d.toISOString().split('T')[0] })()
  const recent    = useMemo(() => batchRecords.filter(r => r.date >= cutoffStr), [batchRecords, cutoffStr])

  const totalVolume    = recent.reduce((s, r) => s + (r.volume_m3 || 0), 0)
  const totalCement    = recent.reduce((s, r) => s + (r.cement_kg || 0), 0)
  const avgCementPerM3 = totalVolume > 0 ? totalCement / totalVolume : 0
  const thisMonthVol   = batchRecords.filter(r => r.date >= today.slice(0,7)+'-01').reduce((s, r) => s + (r.volume_m3 || 0), 0)

  // Weekly chart
  const weeklyMap = {}
  recent.forEach(r => { const ws = new Date(r.date); ws.setDate(ws.getDate() - ws.getDay() + 1); const k = ws.toISOString().split('T')[0]; weeklyMap[k] = (weeklyMap[k] || 0) + (r.volume_m3 || 0) })
  const weeklyData = Object.entries(weeklyMap).sort(([a],[b]) => a.localeCompare(b)).slice(-8)
  const maxWeekly  = Math.max(...weeklyData.map(([,v]) => v), 1)

  const matItems = items.filter(i => i.category === 'Batch Plant')

  const effColor = (kgPerM3, design = 'Standard') => {
    const b = CEMENT_BENCHMARKS[design] || 350
    if (kgPerM3 > b * 1.15) return 'var(--red)'
    if (kgPerM3 > b * 1.05) return 'var(--yellow)'
    return 'var(--green)'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.volume_m3 || form.volume_m3 <= 0) return toast.error('Enter volume produced (m³)')
    if (!form.cement_kg || form.cement_kg <= 0)  return toast.error('Enter cement used (kg)')
    try {
      await addBatchRecord(form, user?.full_name || '')
      toast.success(`Batch recorded: ${form.volume_m3} m³ ${form.mix_design}`)
      setShowModal(false)
      setForm({ date: today, batch_number: '', mix_design: 'C25', volume_m3: 0, cement_kg: 0, sand_kg: 0, stone_kg: 0, water_litres: 0, additive_kg: 0, pour_location: '', operator: user?.full_name || '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(recent.map(r => ({ Date: r.date, 'Batch #': r.batch_number, Mix: r.mix_design, 'Volume (m³)': r.volume_m3, 'Cement (kg)': r.cement_kg, 'Sand (kg)': r.sand_kg, 'Stone (kg)': r.stone_kg, 'kg/m³': (r.cement_per_m3 || (r.volume_m3 > 0 ? r.cement_kg/r.volume_m3 : 0)).toFixed(1), Location: r.pour_location, Operator: r.operator })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Batch Records')
    XLSX.writeFile(wb, `BatchPlant_${today}.xlsx`); toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Batch Plant</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowModal(true)}><span className="material-icons">add</span> Record Batch</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[7, 30, 90, 365].map(d => <button key={d} className={filterDays === d ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setFilterDays(d)}>Last {d}d</button>)}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Volume ({filterDays}d)</div><div className="kpi-val" style={{ color: 'var(--blue)' }}>{totalVolume.toFixed(1)}</div><div className="kpi-sub">m³ produced</div></div>
        <div className="kpi-card"><div className="kpi-label">This Month</div><div className="kpi-val">{thisMonthVol.toFixed(1)}</div><div className="kpi-sub">m³</div></div>
        <div className="kpi-card"><div className="kpi-label">Batches</div><div className="kpi-val">{recent.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Cement Used</div><div className="kpi-val" style={{ fontSize: 20 }}>{(totalCement/1000).toFixed(1)} t</div></div>
        <div className="kpi-card"><div className="kpi-label">Cement / m³</div><div className="kpi-val" style={{ color: effColor(avgCementPerM3), fontSize: 22 }}>{avgCementPerM3.toFixed(0)}</div><div className="kpi-sub">kg/m³ avg</div></div>
      </div>

      {/* Weekly chart */}
      {weeklyData.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Weekly Production (m³)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {weeklyData.map(([week, vol], i) => {
              const pct = (vol / maxWeekly) * 100
              const lbl = new Date(week+'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{vol.toFixed(1)}</div>
                  <div style={{ width: '100%', height: 90, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(3, pct)}%`, background: 'var(--blue)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>{lbl}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Raw materials */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Raw Material Stock</div>
          {matItems.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>No batch plant items. Add items with category "Batch Plant" in Camp Supplies.</div>
          : matItems.map(i => {
            const isLow = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
            const pct   = i.reorder_level > 0 ? (i.balance / (i.reorder_level * 3)) * 100 : 50
            return (
              <div key={i.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12 }}>{i.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: i.balance <= 0 ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)', fontSize: 12 }}>{i.balance.toLocaleString()} {i.unit}</span>
                </div>
                <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(2, pct))}%`, height: '100%', background: i.balance <= 0 ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--teal)', borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>
        {/* Records table */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Recent Batches</div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Date</th><th>Mix</th><th>Vol (m³)</th><th>kg/m³</th><th>Location</th></tr></thead>
              <tbody>
                {recent.slice(0, 10).map(r => {
                  const kgM3 = r.volume_m3 > 0 ? r.cement_kg / r.volume_m3 : 0
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td><span className="badge badge-blue">{r.mix_design}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{r.volume_m3}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: effColor(kgM3, r.mix_design) }}>{kgM3.toFixed(0)}</td>
                      <td style={{ fontSize: 11 }}>{r.pour_location || '—'}</td>
                    </tr>
                  )
                })}
                {recent.length === 0 && <tr><td colSpan="5" className="empty-state">No records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Batch Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Record Concrete <span>Batch</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="form-group"><label>Batch Number</label><input className="form-control" placeholder="e.g. B-001" value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Mix Design</label><select className="form-control" value={form.mix_design} onChange={e => setForm({ ...form, mix_design: e.target.value })}>{MIX_DESIGNS.map(m => <option key={m}>{m}</option>)}</select></div>
                <div className="form-group"><label>Volume Produced (m³) *</label><input type="number" min="0.1" step="0.1" required className="form-control" value={form.volume_m3} onChange={e => setForm({ ...form, volume_m3: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, margin: '12px 0 8px', textTransform: 'uppercase' }}>Materials Used</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[['Cement (kg) *','cement_kg'],['Sand (kg)','sand_kg'],['Stone (kg)','stone_kg'],['Water (L)','water_litres'],['Additive (kg)','additive_kg']].map(([lbl, key]) => (
                  <div className="form-group" key={key}>
                    <label>{lbl}</label>
                    <input type="number" min="0" step="0.1" className="form-control" value={form[key]} onChange={e => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} required={key === 'cement_kg'} />
                  </div>
                ))}
                {form.volume_m3 > 0 && form.cement_kg > 0 && (
                  <div className="kpi-card" style={{ padding: 10 }}>
                    <div className="kpi-label">This Batch</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: effColor(form.cement_kg / form.volume_m3, form.mix_design) }}>{(form.cement_kg / form.volume_m3).toFixed(0)} kg/m³</div>
                    <div className="kpi-sub">Benchmark: {CEMENT_BENCHMARKS[form.mix_design] || 350}</div>
                  </div>
                )}
              </div>
              <div className="form-row" style={{ marginTop: 10 }}>
                <div className="form-group"><label>Pour Location</label><input className="form-control" placeholder="e.g. Shaft collar" value={form.pour_location} onChange={e => setForm({ ...form, pour_location: e.target.value })} /></div>
                <div className="form-group"><label>Operator</label><input className="form-control" value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', margin: '8px 0' }}>
                <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>info</span>
                Materials will be automatically deducted from Batch Plant stock.
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
