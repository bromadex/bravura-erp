import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, ModalDialog, ModalActions, KPICard } from '../../components/ui'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function MeterReadings() {
  const { user } = useAuth()

  const [readings,   setReadings]   = useState([])
  const [assets,     setAssets]     = useState([])
  const [loading,    setLoading]    = useState(true)

  // filters
  const [assetFilter,  setAssetFilter]  = useState('')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [fromDate,     setFromDate]     = useState('')
  const [toDate,       setToDate]       = useState('')
  const [flaggedOnly,  setFlaggedOnly]  = useState(false)

  // modal
  const [modalOpen,   setModalOpen]   = useState(false)
  const [form,        setForm]        = useState({ asset_id:'', reading_type:'odometer', reading_value:'', reading_date:today, reading_source:'manual', notes:'' })
  const [saving,      setSaving]      = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [rRes, aRes] = await Promise.all([
      supabase.from('meter_readings').select('*, asset:asset_registry(plate_number, asset_name, asset_code, current_odometer, current_engine_hours)').order('reading_date', { ascending:false }).order('created_at', { ascending:false }).limit(1000),
      supabase.from('asset_registry').select('id,asset_code,plate_number,asset_name,current_odometer,current_engine_hours,measurement_type').eq('status','Active').order('plate_number'),
    ])
    if (rRes.data)  setReadings(rRes.data)
    if (aRes.data)  setAssets(aRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const selectedAsset = assets.find(a => a.id === form.asset_id)

  const filtered = readings.filter(r => {
    if (assetFilter && r.asset_id !== assetFilter) return false
    if (typeFilter !== 'all' && r.reading_type !== typeFilter) return false
    if (fromDate && r.reading_date < fromDate) return false
    if (toDate   && r.reading_date > toDate)   return false
    if (flaggedOnly && !r.flagged)             return false
    return true
  })

  const todayReadings  = readings.filter(r => r.reading_date === today).length
  const flaggedCount   = readings.filter(r => r.flagged).length
  const todayAssets    = new Set(readings.filter(r => r.reading_date === today).map(r => r.asset_id)).size

  const handleSave = async () => {
    if (!form.asset_id)      return toast.error('Select an asset')
    if (!form.reading_value) return toast.error('Enter a reading value')
    setSaving(true)
    try {
      const { error } = await supabase.from('meter_readings').insert([{
        asset_id:       form.asset_id,
        reading_type:   form.reading_type,
        reading_value:  parseFloat(form.reading_value),
        reading_date:   form.reading_date,
        reading_source: form.reading_source,
        notes:          form.notes || null,
        recorded_by:    user?.name || '',
        created_at:     new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Reading recorded')
      setModalOpen(false)
      setForm({ asset_id:'', reading_type:'odometer', reading_value:'', reading_date:today, reading_source:'manual', notes:'' })
      await loadAll()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Date':        r.reading_date,
      'Asset':       r.asset?.plate_number || r.asset?.asset_name || r.asset_id,
      'Type':        r.reading_type,
      'Reading':     r.reading_value,
      'Previous':    r.previous_value ?? '',
      'Delta':       r.previous_value != null ? r.reading_value - r.previous_value : '',
      'Source':      r.reading_source,
      'Flagged':     r.flagged ? 'Yes' : 'No',
      'Flag Reason': r.flag_reason || '',
      'Recorded By': r.recorded_by || r.created_by || '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Meter Readings')
    XLSX.writeFile(wb, `MeterReadings_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div className="page-container">
      <PageHeader title="Meter Readings" subtitle="Odometer and engine-hour readings with integrity validation" icon="speed">
        <button className="btn btn-ghost" onClick={exportXLSX}>
          <span className="material-icons" style={{ fontSize:16 }}>download</span>Export
        </button>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <span className="material-icons" style={{ fontSize:16 }}>add</span>Record Reading
        </button>
      </PageHeader>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24, maxWidth:700 }}>
        <KPICard label="Readings Today"    value={todayReadings} icon="today"       color="var(--blue)"   />
        <KPICard label="Assets Updated Today" value={todayAssets} icon="directions_car" color="var(--teal)" />
        <KPICard label="Flagged Readings"  value={flaggedCount}  icon="flag"        color={flaggedCount > 0 ? 'var(--red)' : 'var(--green)'} />
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, alignItems:'center' }}>
        <select className="form-control" style={{ maxWidth:220 }} value={assetFilter} onChange={e => setAssetFilter(e.target.value)}>
          <option value="">All assets</option>
          {assets.map(a => <option key={a.id} value={a.id}>{a.plate_number || a.asset_name}</option>)}
        </select>
        <select className="form-control" style={{ width:160 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="odometer">Odometer</option>
          <option value="engine_hours">Engine Hours</option>
        </select>
        <input type="date" className="form-control" style={{ width:145 }} value={fromDate} onChange={e => setFromDate(e.target.value)} title="From date" />
        <input type="date" className="form-control" style={{ width:145 }} value={toDate}   onChange={e => setToDate(e.target.value)}   title="To date" />
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', userSelect:'none' }}>
          <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} />
          Flagged only
        </label>
        {(assetFilter || typeFilter !== 'all' || fromDate || toDate || flaggedOnly) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setAssetFilter(''); setTypeFilter('all'); setFromDate(''); setToDate(''); setFlaggedOnly(false) }}>
            Clear filters
          </button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-dim)' }}>{filtered.length} records</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-dim)' }}>Loading readings…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="speed" message="No meter readings match the current filters" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Asset</th><th>Type</th><th>Reading</th>
                <th>Previous</th><th>Delta</th><th>Source</th><th>Recorded By</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const delta = r.previous_value != null ? r.reading_value - r.previous_value : null
                const assetName = r.asset?.plate_number || r.asset?.asset_name || r.asset_id
                return (
                  <tr key={r.id}
                    style={{ background: r.flagged ? 'color-mix(in srgb,var(--yellow) 8%,var(--surface))' : undefined, borderLeft: r.flagged ? '3px solid var(--yellow)' : undefined }}
                    onMouseOver={e => { if (!r.flagged) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseOut={e  => { if (!r.flagged) e.currentTarget.style.background = '' }}>
                    <td>{r.reading_date}</td>
                    <td style={{ fontWeight:600 }}>{assetName}<br /><span style={{ fontSize:11, color:'var(--text-dim)', fontFamily:'var(--mono,monospace)' }}>{r.asset?.asset_code}</span></td>
                    <td style={{ textTransform:'capitalize' }}>{(r.reading_type||'').replace('_',' ')}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)', fontWeight:700 }}>{Number(r.reading_value).toLocaleString()}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)', color:'var(--text-dim)' }}>{r.previous_value != null ? Number(r.previous_value).toLocaleString() : '—'}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)', color: delta == null ? 'var(--text-dim)' : delta < 0 ? 'var(--red)' : 'var(--green)' }}>
                      {delta != null ? (delta >= 0 ? '+' : '') + Number(delta).toLocaleString() : '—'}
                    </td>
                    <td style={{ textTransform:'capitalize', fontSize:12 }}>{r.reading_source}</td>
                    <td style={{ fontSize:12 }}>{r.recorded_by || r.created_by || '—'}</td>
                    <td>
                      {r.flagged ? (
                        <div>
                          <span style={{ background:'color-mix(in srgb,var(--yellow) 15%,var(--surface2))', color:'var(--yellow)', border:'1px solid color-mix(in srgb,var(--yellow) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700, cursor:'default' }} title={r.flag_reason}>⚠ Flagged</span>
                          {r.flag_reason && <div style={{ fontSize:10, color:'var(--red)', marginTop:2, maxWidth:180 }}>{r.flag_reason}</div>}
                        </div>
                      ) : (
                        <span style={{ background:'color-mix(in srgb,var(--green) 12%,var(--surface2))', color:'var(--green)', border:'1px solid color-mix(in srgb,var(--green) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>OK</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Record Reading Modal ─── */}
      {modalOpen && (
        <ModalDialog open={modalOpen} onClose={() => setModalOpen(false)} title="Record Meter Reading">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Asset *</label>
              <select className="form-control" value={form.asset_id} onChange={e => setForm(f => ({...f,asset_id:e.target.value}))}>
                <option value="">— Select asset —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.plate_number || a.asset_name} ({a.asset_code})</option>)}
              </select>
              {selectedAsset && (
                <div style={{ marginTop:6, fontSize:12, color:'var(--text-dim)', display:'flex', gap:16 }}>
                  <span>Odometer: <strong>{Number(selectedAsset.current_odometer||0).toLocaleString()} km</strong></span>
                  <span>Engine Hrs: <strong>{Number(selectedAsset.current_engine_hours||0).toLocaleString()} hrs</strong></span>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Reading Type</label>
              <select className="form-control" value={form.reading_type} onChange={e => setForm(f => ({...f,reading_type:e.target.value}))}>
                <option value="odometer">Odometer (km)</option>
                <option value="engine_hours">Engine Hours</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reading Date</label>
              <input type="date" className="form-control" value={form.reading_date} onChange={e => setForm(f => ({...f,reading_date:e.target.value}))} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Reading Value *</label>
              <input type="number" className="form-control" min="0" value={form.reading_value} onChange={e => setForm(f => ({...f,reading_value:e.target.value}))} placeholder="Enter new reading" />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-control" value={form.reading_source} onChange={e => setForm(f => ({...f,reading_source:e.target.value}))}>
                <option value="manual">Manual</option>
                <option value="fuel_issue">Fuel Issuance</option>
                <option value="maintenance">Maintenance</option>
                <option value="inspection">Inspection</option>
                <option value="trip">Trip</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Record Reading'}</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
