import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const SHIFTS    = ['Day', 'Night', 'AM', 'PM']
const DOC_TYPES = ['Insurance', 'Vehicle Licence', 'Fitness Certificate', 'Roadworthy', 'Warranty', 'Other']

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}
function expiryColor(dateStr) {
  const d = daysUntil(dateStr)
  if (d === null) return 'var(--text-dim)'
  if (d < 0)   return 'var(--red)'
  if (d <= 7)  return 'var(--red)'
  if (d <= 30) return 'var(--yellow)'
  return 'var(--green)'
}

function StatusPill({ status }) {
  const cfgMap = {
    Active:        { c: 'var(--green)',    b: 'color-mix(in srgb,var(--green) 12%,var(--surface2))'    },
    active:        { c: 'var(--green)',    b: 'color-mix(in srgb,var(--green) 12%,var(--surface2))'    },
    Maintenance:   { c: 'var(--yellow)',   b: 'color-mix(in srgb,var(--yellow) 12%,var(--surface2))'   },
    maintenance:   { c: 'var(--yellow)',   b: 'color-mix(in srgb,var(--yellow) 12%,var(--surface2))'   },
    breakdown:     { c: 'var(--red)',      b: 'color-mix(in srgb,var(--red) 12%,var(--surface2))'      },
    Grounded:      { c: 'var(--red)',      b: 'color-mix(in srgb,var(--red) 12%,var(--surface2))'      },
    Sold:          { c: 'var(--text-dim)', b: 'var(--surface2)'                                         },
    'Written Off': { c: 'var(--text-dim)', b: 'var(--surface2)'                                         },
  }
  const { c, b } = cfgMap[status] || { c: 'var(--text-dim)', b: 'var(--surface2)' }
  return (
    <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:b, color:c, border:`1px solid color-mix(in srgb,${c} 30%,transparent)` }}>
      {status || '—'}
    </span>
  )
}

function InfoRow({ label, value, mono }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:13, fontFamily: mono ? 'var(--mono,monospace)' : undefined }}>{value}</span>
    </div>
  )
}

function ExpiryCard({ label, doc, onAdd }) {
  const color = expiryColor(doc?.expiry_date)
  const d     = daysUntil(doc?.expiry_date)
  return (
    <div style={{ borderRadius:10, border:'1px solid var(--border)', borderLeft:`4px solid ${color}`, background:'var(--surface)', padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:3 }}>{label}</div>
          {doc
            ? <div style={{ fontSize:12, color:'var(--text-dim)' }}>{[doc.doc_number && `#${doc.doc_number}`, doc.issuing_authority, doc.insurer].filter(Boolean).join(' · ') || 'On file'}</div>
            : <div style={{ fontSize:12, color:'var(--text-dim)' }}>No document on file</div>
          }
        </div>
        {doc?.expiry_date && (
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:`color-mix(in srgb,${color} 12%,var(--surface2))`, color, border:`1px solid color-mix(in srgb,${color} 30%,transparent)`, whiteSpace:'nowrap' }}>
            {d !== null && d < 0 ? 'EXPIRED' : d !== null && d <= 7 ? 'Critical' : d !== null && d <= 30 ? 'Warning' : 'OK'}
          </span>
        )}
      </div>
      {doc?.expiry_date && (
        <div style={{ fontSize:13, fontWeight:600, color }}>
          {d !== null && d < 0 ? `Expired ${Math.abs(d)} days ago` : d === 0 ? 'Expires today' : d !== null ? `Expires in ${d} days — ${doc.expiry_date}` : doc.expiry_date}
        </div>
      )}
      {doc?.coverage_amount > 0 && <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:4 }}>Coverage: ${Number(doc.coverage_amount).toLocaleString()}</div>}
      <button className="btn btn-ghost btn-sm" onClick={onAdd} style={{ marginTop:8, fontSize:11, padding:'3px 10px' }}>
        <span className="material-icons" style={{ fontSize:14 }}>edit</span>{doc ? 'Update' : 'Add'}
      </button>
    </div>
  )
}

export default function VehicleDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [asset,       setAsset]     = useState(null)
  const [loading,     setLoading]   = useState(true)
  const [tab,         setTab]       = useState('overview')
  const [employees,   setEmployees] = useState([])
  const [departments, setDepts]     = useState([])
  const [sites,       setSites]     = useState([])
  const [allAssets,   setAllAssets] = useState([])

  const [fleetDocs,   setFleetDocs]  = useState([])
  const [meterHist,   setMeterHist]  = useState([])
  const [opAssigns,   setOpAssigns]  = useState([])
  const [attachments, setAttachs]    = useState([])

  // modals
  const [editOpen,    setEditOpen]   = useState(false)
  const [editTab,     setEditTab]    = useState('identity')
  const [editForm,    setEditForm]   = useState({})
  const [saving,      setSaving]     = useState(false)

  const [docOpen,     setDocOpen]    = useState(false)
  const [docForm,     setDocForm]    = useState({})
  const [docSaving,   setDocSaving]  = useState(false)

  const [meterOpen,   setMeterOpen]  = useState(false)
  const [meterForm,   setMeterForm]  = useState({ reading_type:'odometer', reading_value:'', reading_date:new Date().toISOString().split('T')[0], reading_source:'manual', notes:'' })
  const [meterSaving, setMeterSaving]= useState(false)

  const [opOpen,      setOpOpen]     = useState(false)
  const [opForm,      setOpForm]     = useState({ operator_id:'', assigned_from:new Date().toISOString().slice(0,16), shift:'Day', km_start:'', project_id:'', site_id:'', notes:'' })
  const [opSaving,    setOpSaving]   = useState(false)

  const [endOpRow,    setEndOpRow]   = useState(null)
  const [endForm,     setEndForm]    = useState({ km_end:'', hours_logged:'', notes:'' })

  const [attOpen,     setAttOpen]    = useState(false)
  const [attForm,     setAttForm]    = useState({ attached_asset_id:'', attached_from:new Date().toISOString().split('T')[0], notes:'' })
  const [attSaving,   setAttSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [arRes, fdRes, mrRes, oaRes, aahRes] = await Promise.all([
      supabase.from('asset_registry').select('*').eq('id', id).single(),
      supabase.from('fleet_documents').select('*').eq('asset_id', id).eq('is_active', true).order('expiry_date'),
      supabase.from('meter_readings').select('*').eq('asset_id', id).order('reading_date', { ascending:false }).order('created_at', { ascending:false }),
      supabase.from('asset_operator_assignments').select('*').eq('asset_id', id).order('assigned_from', { ascending:false }),
      supabase.from('asset_attachments').select('*').or(`primary_asset_id.eq.${id},attached_asset_id.eq.${id}`).order('created_at', { ascending:false }),
    ])
    if (arRes.data) { setAsset(arRes.data); setEditForm(arRes.data) }
    if (fdRes.data)  setFleetDocs(fdRes.data)
    if (mrRes.data)  setMeterHist(mrRes.data)
    if (oaRes.data)  setOpAssigns(oaRes.data)
    if (aahRes.data) setAttachs(aahRes.data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      supabase.from('employees').select('id,name,employee_number').neq('status','Terminated').order('name'),
      supabase.from('departments').select('id,name').order('name'),
      supabase.from('sites').select('id,name,code').order('name'),
      supabase.from('asset_registry').select('id,asset_name,plate_number,asset_code').order('asset_name'),
    ]).then(([e,d,s,a]) => {
      if (e.data) setEmployees(e.data)
      if (d.data) setDepts(d.data)
      if (s.data) setSites(s.data)
      if (a.data) setAllAssets(a.data.filter(x => x.id !== id))
    })
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('asset_registry').update({
        fleet_number:         editForm.fleet_number        || null,
        plate_number:         editForm.plate_number        || null,
        asset_name:           editForm.asset_name          || null,
        asset_subtype:        editForm.asset_subtype       || null,
        make:                 editForm.make                || null,
        model:                editForm.model               || null,
        year:                 editForm.year ? parseInt(editForm.year) : null,
        colour:               editForm.colour              || null,
        fuel_type:            editForm.fuel_type           || null,
        engine_number:        editForm.engine_number       || null,
        chassis_number:       editForm.chassis_number      || null,
        vin_serial:           editForm.vin_serial          || null,
        tracker_id:           editForm.tracker_id          || null,
        status:               editForm.status              || 'Active',
        operational_status:   editForm.operational_status  || null,
        assigned_to:          editForm.assigned_to         || null,
        assigned_operator_id: editForm.assigned_operator_id|| null,
        department:           editForm.department          || null,
        location:             editForm.location            || null,
        site_id:              editForm.site_id             || null,
        assigned_project:     editForm.assigned_project    || null,
        tare_weight:          editForm.tare_weight         ? parseFloat(editForm.tare_weight)      : null,
        gross_vehicle_mass:   editForm.gross_vehicle_mass  ? parseFloat(editForm.gross_vehicle_mass): null,
        notes:                editForm.notes               || null,
        updated_at:           new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success('Asset updated')
      setEditOpen(false)
      await load()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleSaveDoc = async () => {
    if (!docForm.doc_type) return toast.error('Select a document type')
    setDocSaving(true)
    try {
      await supabase.from('fleet_documents').update({ is_active:false }).eq('asset_id', id).eq('doc_type', docForm.doc_type)
      const { error } = await supabase.from('fleet_documents').insert([{
        asset_id: id, doc_type: docForm.doc_type, doc_number: docForm.doc_number || null,
        issuing_authority: docForm.issuing_authority || null, issue_date: docForm.issue_date || null,
        expiry_date: docForm.expiry_date || null, coverage_amount: docForm.coverage_amount ? parseFloat(docForm.coverage_amount) : null,
        insurer: docForm.insurer || null, notes: docForm.notes || null,
        is_active: true, created_by: user?.name || '', created_at: new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Document saved')
      setDocOpen(false)
      await load()
    } catch (err) { toast.error(err.message) } finally { setDocSaving(false) }
  }

  const handleSaveMeter = async () => {
    if (!meterForm.reading_value) return toast.error('Enter a reading value')
    setMeterSaving(true)
    try {
      const { error } = await supabase.from('meter_readings').insert([{
        asset_id: id, reading_type: meterForm.reading_type, reading_value: parseFloat(meterForm.reading_value),
        reading_date: meterForm.reading_date, reading_source: meterForm.reading_source,
        notes: meterForm.notes || null, recorded_by: user?.name || '', created_at: new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Meter reading recorded')
      setMeterOpen(false)
      setMeterForm({ reading_type:'odometer', reading_value:'', reading_date:new Date().toISOString().split('T')[0], reading_source:'manual', notes:'' })
      await load()
    } catch (err) { toast.error(err.message) } finally { setMeterSaving(false) }
  }

  const handleAssignOp = async () => {
    if (!opForm.operator_id) return toast.error('Select an operator')
    setOpSaving(true)
    try {
      const emp = employees.find(e => e.id === opForm.operator_id)
      const { error } = await supabase.from('asset_operator_assignments').insert([{
        asset_id: id, operator_id: opForm.operator_id, operator_name: emp?.name || '',
        assigned_from: new Date(opForm.assigned_from).toISOString(), shift: opForm.shift || null,
        km_start: opForm.km_start ? parseFloat(opForm.km_start) : null, project_id: opForm.project_id || null,
        site_id: opForm.site_id || null, notes: opForm.notes || null,
        created_by: user?.name || '', created_at: new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Operator assigned')
      setOpOpen(false)
      await load()
    } catch (err) { toast.error(err.message) } finally { setOpSaving(false) }
  }

  const handleEndAssignment = async () => {
    const { error } = await supabase.from('asset_operator_assignments').update({
      assigned_to: new Date().toISOString(),
      km_end:       endForm.km_end      ? parseFloat(endForm.km_end)      : null,
      hours_logged: endForm.hours_logged? parseFloat(endForm.hours_logged): null,
      notes:        endForm.notes       || endOpRow.notes || null,
    }).eq('id', endOpRow.id)
    if (error) return toast.error(error.message)
    toast.success('Assignment ended')
    setEndOpRow(null)
    await load()
  }

  const handleAttach = async () => {
    if (!attForm.attached_asset_id) return toast.error('Select an asset to attach')
    setAttSaving(true)
    try {
      const { error } = await supabase.from('asset_attachments').insert([{
        primary_asset_id: id, attached_asset_id: attForm.attached_asset_id,
        attached_from: attForm.attached_from || null, notes: attForm.notes || null,
        created_by: user?.name || '', created_at: new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Asset attached')
      setAttOpen(false)
      await load()
    } catch (err) { toast.error(err.message) } finally { setAttSaving(false) }
  }

  const handleDetach = async (row) => {
    const { error } = await supabase.from('asset_attachments').update({ detached_on: new Date().toISOString().split('T')[0] }).eq('id', row.id)
    if (error) return toast.error(error.message)
    toast.success('Asset detached')
    await load()
  }

  if (loading) return (
    <div className="page-container">
      <div style={{ textAlign:'center', padding:80, color:'var(--text-dim)' }}>
        <span className="material-icons" style={{ fontSize:40, opacity:.25, display:'block', marginBottom:10 }}>directions_car</span>
        Loading asset…
      </div>
    </div>
  )
  if (!asset) return <div className="page-container"><EmptyState icon="directions_car" message="Asset not found" /></div>

  const docByType = {}
  fleetDocs.forEach(d => { docByType[d.doc_type] = d })
  const activeOp = opAssigns.find(a => !a.assigned_to)

  const TABS = [
    { id:'overview',    label:'Overview',     icon:'info'         },
    { id:'documents',   label:'Documents',    icon:'description'  },
    { id:'meter',       label:'Meter History',icon:'speed'        },
    { id:'operators',   label:'Operator Log', icon:'person'       },
    { id:'attachments', label:'Attachments',  icon:'link'         },
  ]

  return (
    <div className="page-container">
      <PageHeader
        title={asset.plate_number || asset.asset_name}
        subtitle={[asset.asset_category, asset.make, asset.model].filter(Boolean).join(' · ')}
        icon="directions_car"
      >
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>
          <span className="material-icons" style={{ fontSize:18 }}>arrow_back</span>Back
        </button>
        <StatusPill status={asset.status} />
        <button className="btn btn-primary" onClick={() => { setEditTab('identity'); setEditForm({...asset}); setEditOpen(true) }}>
          <span className="material-icons" style={{ fontSize:16 }}>edit</span>Edit
        </button>
      </PageHeader>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background:'none', border:'none', cursor:'pointer', padding:'8px 16px',
            fontSize:13, fontWeight: tab===t.id ? 700 : 500,
            color: tab===t.id ? 'var(--primary)' : 'var(--text-dim)',
            borderBottom: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent',
            display:'flex', alignItems:'center', gap:6,
          }}>
            <span className="material-icons" style={{ fontSize:16 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20 }}>
            <div style={{ fontWeight:700, fontSize:11, color:'var(--text-dim)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.08em' }}>Identity</div>
            <InfoRow label="Fleet Number"  value={asset.fleet_number}   mono />
            <InfoRow label="Registration"  value={asset.plate_number}   mono />
            <InfoRow label="Asset Code"    value={asset.asset_code}     mono />
            <InfoRow label="Asset Name"    value={asset.asset_name} />
            <InfoRow label="Category"      value={asset.asset_category} />
            <InfoRow label="Sub-type"      value={asset.asset_subtype} />
            <InfoRow label="Make"          value={asset.make} />
            <InfoRow label="Model"         value={asset.model} />
            <InfoRow label="Year"          value={asset.year} />
            <InfoRow label="Colour"        value={asset.colour} />
            <InfoRow label="Fuel Type"     value={asset.fuel_type} />
            <InfoRow label="Engine No"     value={asset.engine_number}  mono />
            <InfoRow label="Chassis No"    value={asset.chassis_number} mono />
            <InfoRow label="VIN / Serial"  value={asset.vin_serial}     mono />
            <InfoRow label="Tracker ID"    value={asset.tracker_id}     mono />
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20 }}>
            <div style={{ fontWeight:700, fontSize:11, color:'var(--text-dim)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.08em' }}>Operations</div>
            <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:500 }}>Status</span>
              <StatusPill status={asset.status} />
            </div>
            <InfoRow label="Op. Status"    value={asset.operational_status} />
            <InfoRow label="Assigned To"   value={asset.assigned_to} />
            <InfoRow label="Department"    value={asset.department} />
            <InfoRow label="Location"      value={asset.location} />
            <InfoRow label="Project"       value={asset.assigned_project} />
            {asset.current_odometer > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:500 }}>Odometer</span>
                <span style={{ fontSize:13, fontFamily:'var(--mono,monospace)' }}>{Number(asset.current_odometer).toLocaleString()} km</span>
              </div>
            )}
            {asset.current_engine_hours > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:500 }}>Engine Hours</span>
                <span style={{ fontSize:13, fontFamily:'var(--mono,monospace)' }}>{Number(asset.current_engine_hours).toLocaleString()} hrs</span>
              </div>
            )}
            {activeOp && (
              <div style={{ marginTop:16, background:'color-mix(in srgb,var(--green) 8%,var(--surface2))', border:'1px solid color-mix(in srgb,var(--green) 25%,transparent)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', marginBottom:3, textTransform:'uppercase', letterSpacing:'.06em' }}>Active Operator</div>
                <div style={{ fontSize:13, fontWeight:600 }}>{activeOp.operator_name}</div>
                <div style={{ fontSize:11, color:'var(--text-dim)' }}>Since {new Date(activeOp.assigned_from).toLocaleString()} · {activeOp.shift || ''} shift</div>
              </div>
            )}
            {asset.notes && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, color:'var(--text-dim)', fontWeight:500, marginBottom:4 }}>Notes</div>
                <div style={{ fontSize:12, color:'var(--text-mid)', lineHeight:1.5 }}>{asset.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Documents ── */}
      {tab === 'documents' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => { setDocForm({ doc_type:'', doc_number:'', issuing_authority:'', issue_date:'', expiry_date:'', coverage_amount:'', insurer:'', notes:'' }); setDocOpen(true) }}>
              <span className="material-icons" style={{ fontSize:16 }}>add</span>Add Document
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
            {DOC_TYPES.slice(0,5).map(type => (
              <ExpiryCard key={type} label={type} doc={docByType[type]}
                onAdd={() => { setDocForm({ doc_type:type, doc_number:'', issuing_authority:'', issue_date:'', expiry_date:'', coverage_amount:'', insurer:'', notes:'' }); setDocOpen(true) }} />
            ))}
          </div>
          {fleetDocs.filter(d => !DOC_TYPES.slice(0,5).includes(d.doc_type)).length > 0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:12 }}>Other Documents</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {fleetDocs.filter(d => !DOC_TYPES.slice(0,5).includes(d.doc_type)).map(d => (
                  <ExpiryCard key={d.id} label={d.doc_type} doc={d}
                    onAdd={() => { setDocForm({...d}); setDocOpen(true) }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Meter History ── */}
      {tab === 'meter' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setMeterOpen(true)}>
              <span className="material-icons" style={{ fontSize:16 }}>add</span>Record Reading
            </button>
          </div>
          {meterHist.length === 0
            ? <EmptyState icon="speed" message="No meter readings recorded for this asset" />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Type</th><th>Reading</th><th>Previous</th><th>Delta</th><th>Source</th><th>Recorded By</th><th>Status</th></tr></thead>
                  <tbody>
                    {meterHist.map(r => {
                      const delta = r.previous_value != null ? r.reading_value - r.previous_value : null
                      return (
                        <tr key={r.id} style={{ background: r.flagged ? 'color-mix(in srgb,var(--yellow) 8%,var(--surface))' : undefined }}>
                          <td>{r.reading_date}</td>
                          <td style={{ textTransform:'capitalize' }}>{(r.reading_type||'').replace('_',' ')}</td>
                          <td style={{ fontFamily:'var(--mono,monospace)', fontWeight:600 }}>{Number(r.reading_value).toLocaleString()}</td>
                          <td style={{ fontFamily:'var(--mono,monospace)', color:'var(--text-dim)' }}>{r.previous_value != null ? Number(r.previous_value).toLocaleString() : '—'}</td>
                          <td style={{ fontFamily:'var(--mono,monospace)', color: delta == null ? 'var(--text-dim)' : delta < 0 ? 'var(--red)' : 'var(--green)' }}>
                            {delta != null ? (delta >= 0 ? '+' : '') + Number(delta).toLocaleString() : '—'}
                          </td>
                          <td style={{ textTransform:'capitalize' }}>{r.reading_source}</td>
                          <td>{r.recorded_by || r.created_by || '—'}</td>
                          <td>
                            {r.flagged
                              ? <span title={r.flag_reason} style={{ cursor:'help', background:'color-mix(in srgb,var(--yellow) 12%,var(--surface2))', color:'var(--yellow)', border:'1px solid color-mix(in srgb,var(--yellow) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700 }}>⚠ Flagged</span>
                              : <span style={{ background:'color-mix(in srgb,var(--green) 12%,var(--surface2))', color:'var(--green)', border:'1px solid color-mix(in srgb,var(--green) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>OK</span>
                            }
                            {r.flagged && r.flag_reason && <div style={{ fontSize:10, color:'var(--red)', marginTop:2, maxWidth:200 }}>{r.flag_reason}</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ── Operator Log ── */}
      {tab === 'operators' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setOpOpen(true)}>
              <span className="material-icons" style={{ fontSize:16 }}>person_add</span>Assign Operator
            </button>
          </div>
          {opAssigns.length === 0
            ? <EmptyState icon="person" message="No operator assignments recorded" />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Operator</th><th>From</th><th>To</th><th>Shift</th><th>KM Start</th><th>KM End</th><th>Hours</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {opAssigns.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight:600 }}>{a.operator_name}</td>
                        <td>{new Date(a.assigned_from).toLocaleString()}</td>
                        <td>{a.assigned_to ? new Date(a.assigned_to).toLocaleString() : <span style={{ color:'var(--text-dim)' }}>—</span>}</td>
                        <td>{a.shift || '—'}</td>
                        <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.km_start != null ? Number(a.km_start).toLocaleString() : '—'}</td>
                        <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.km_end   != null ? Number(a.km_end).toLocaleString()   : '—'}</td>
                        <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.hours_logged ?? '—'}</td>
                        <td>{!a.assigned_to
                          ? <span style={{ background:'color-mix(in srgb,var(--green) 12%,var(--surface2))', color:'var(--green)', border:'1px solid color-mix(in srgb,var(--green) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700 }}>Active</span>
                          : <span style={{ background:'var(--surface2)', color:'var(--text-dim)', border:'1px solid var(--border)', borderRadius:20, padding:'2px 8px', fontSize:11 }}>Ended</span>
                        }</td>
                        <td>{!a.assigned_to && <button className="btn btn-ghost btn-sm" onClick={() => { setEndOpRow(a); setEndForm({ km_end:'', hours_logged:'', notes:'' }) }}>End</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ── Attachments ── */}
      {tab === 'attachments' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setAttOpen(true)}>
              <span className="material-icons" style={{ fontSize:16 }}>link</span>Attach Asset
            </button>
          </div>
          {attachments.length === 0
            ? <EmptyState icon="link" message="No attached assets — link trailers, tools or child equipment here" />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Role</th><th>Asset ID</th><th>Attached From</th><th>Detached On</th><th>Notes</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {attachments.map(a => {
                      const isPrimary = a.primary_asset_id === id
                      return (
                        <tr key={a.id}>
                          <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'color-mix(in srgb,var(--blue) 12%,var(--surface2))', color:'var(--blue)', border:'1px solid color-mix(in srgb,var(--blue) 30%,transparent)' }}>{isPrimary ? 'Primary' : 'Attached'}</span></td>
                          <td style={{ fontFamily:'var(--mono,monospace)', fontWeight:600 }}>{isPrimary ? a.attached_asset_id : a.primary_asset_id}</td>
                          <td>{a.attached_from || '—'}</td>
                          <td>{a.detached_on  || '—'}</td>
                          <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.notes || '—'}</td>
                          <td>{!a.detached_on
                            ? <span style={{ background:'color-mix(in srgb,var(--green) 12%,var(--surface2))', color:'var(--green)', border:'1px solid color-mix(in srgb,var(--green) 30%,transparent)', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700 }}>Attached</span>
                            : <span style={{ background:'var(--surface2)', color:'var(--text-dim)', border:'1px solid var(--border)', borderRadius:20, padding:'2px 8px', fontSize:11 }}>Detached</span>
                          }</td>
                          <td>{isPrimary && !a.detached_on && <button className="btn btn-ghost btn-sm" onClick={() => handleDetach(a)}>Detach</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {editOpen && (
        <ModalDialog open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${asset.plate_number || asset.asset_name}`} size="lg">
          <div style={{ display:'flex', gap:8, marginBottom:18, borderBottom:'1px solid var(--border)', paddingBottom:12 }}>
            {[['identity','Identity'],['operations','Operations']].map(([k,l]) => (
              <button key={k} onClick={() => setEditTab(k)} style={{ background: editTab===k ? 'var(--primary)' : 'var(--surface2)', color: editTab===k ? '#fff' : 'var(--text)', border:'none', borderRadius:6, padding:'5px 14px', cursor:'pointer', fontSize:13 }}>{l}</button>
            ))}
          </div>
          {editTab === 'identity' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[['fleet_number','Fleet Number'],['plate_number','Registration / Plate'],['asset_name','Asset Name'],['asset_subtype','Sub-type'],['make','Make'],['model','Model'],['year','Year'],['colour','Colour'],['fuel_type','Fuel Type'],['engine_number','Engine Number'],['chassis_number','Chassis Number'],['vin_serial','VIN / Serial'],['tracker_id','Tracker ID'],['tare_weight','Tare Weight (kg)'],['gross_vehicle_mass','Gross Vehicle Mass (kg)']].map(([k,l]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{l}</label>
                  <input className="form-control" value={editForm[k] || ''} onChange={e => setEditForm(f => ({...f, [k]:e.target.value}))} />
                </div>
              ))}
            </div>
          )}
          {editTab === 'operations' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={editForm.status||''} onChange={e => setEditForm(f => ({...f,status:e.target.value}))}>
                  {['Active','Maintenance','Grounded','Sold','Written Off'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Operational Status</label>
                <select className="form-control" value={editForm.operational_status||''} onChange={e => setEditForm(f => ({...f,operational_status:e.target.value}))}>
                  <option value="">— None —</option>
                  {['active','maintenance','breakdown','standby','decommissioned'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Operator</label>
                <select className="form-control" value={editForm.assigned_operator_id||''} onChange={e => { const emp=employees.find(x=>x.id===e.target.value); setEditForm(f => ({...f,assigned_operator_id:e.target.value,assigned_to:emp?.name||''})) }}>
                  <option value="">— None —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-control" value={editForm.department||''} onChange={e => setEditForm(f => ({...f,department:e.target.value}))}>
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Site</label>
                <select className="form-control" value={editForm.site_id||''} onChange={e => setEditForm(f => ({...f,site_id:e.target.value}))}>
                  <option value="">— None —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-control" value={editForm.location||''} onChange={e => setEditForm(f => ({...f,location:e.target.value}))} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Assigned Project</label>
                <input className="form-control" value={editForm.assigned_project||''} onChange={e => setEditForm(f => ({...f,assigned_project:e.target.value}))} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={3} value={editForm.notes||''} onChange={e => setEditForm(f => ({...f,notes:e.target.value}))} />
              </div>
            </div>
          )}
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── Document Modal ─── */}
      {docOpen && (
        <ModalDialog open={docOpen} onClose={() => setDocOpen(false)} title="Fleet Document">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Document Type *</label>
              <select className="form-control" value={docForm.doc_type||''} onChange={e => setDocForm(f => ({...f,doc_type:e.target.value}))}>
                <option value="">— Select —</option>
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Document No</label><input className="form-control" value={docForm.doc_number||''} onChange={e => setDocForm(f => ({...f,doc_number:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Issuing Authority</label><input className="form-control" value={docForm.issuing_authority||''} onChange={e => setDocForm(f => ({...f,issuing_authority:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={docForm.issue_date||''} onChange={e => setDocForm(f => ({...f,issue_date:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Expiry Date</label><input type="date" className="form-control" value={docForm.expiry_date||''} onChange={e => setDocForm(f => ({...f,expiry_date:e.target.value}))} /></div>
            {docForm.doc_type === 'Insurance' && <>
              <div className="form-group"><label className="form-label">Insurer</label><input className="form-control" value={docForm.insurer||''} onChange={e => setDocForm(f => ({...f,insurer:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Coverage ($)</label><input type="number" className="form-control" value={docForm.coverage_amount||''} onChange={e => setDocForm(f => ({...f,coverage_amount:e.target.value}))} /></div>
            </>}
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={docForm.notes||''} onChange={e => setDocForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setDocOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveDoc} disabled={docSaving}>{docSaving ? 'Saving…' : 'Save Document'}</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── Meter Modal ─── */}
      {meterOpen && (
        <ModalDialog open={meterOpen} onClose={() => setMeterOpen(false)} title="Record Meter Reading">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Reading Type</label>
              <select className="form-control" value={meterForm.reading_type} onChange={e => setMeterForm(f => ({...f,reading_type:e.target.value}))}>
                <option value="odometer">Odometer (km)</option>
                <option value="engine_hours">Engine Hours</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reading Date</label>
              <input type="date" className="form-control" value={meterForm.reading_date} onChange={e => setMeterForm(f => ({...f,reading_date:e.target.value}))} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">New Reading *
                <span style={{ marginLeft:8, fontSize:11, color:'var(--text-dim)' }}>
                  Current: {meterForm.reading_type==='odometer' ? `${Number(asset.current_odometer||0).toLocaleString()} km` : `${Number(asset.current_engine_hours||0).toLocaleString()} hrs`}
                </span>
              </label>
              <input type="number" className="form-control" min="0" value={meterForm.reading_value} onChange={e => setMeterForm(f => ({...f,reading_value:e.target.value}))} placeholder="Enter new reading" />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-control" value={meterForm.reading_source} onChange={e => setMeterForm(f => ({...f,reading_source:e.target.value}))}>
                <option value="manual">Manual</option>
                <option value="fuel_issue">Fuel Issuance</option>
                <option value="maintenance">Maintenance</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={meterForm.notes} onChange={e => setMeterForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setMeterOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveMeter} disabled={meterSaving}>{meterSaving ? 'Saving…' : 'Record Reading'}</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── Assign Operator Modal ─── */}
      {opOpen && (
        <ModalDialog open={opOpen} onClose={() => setOpOpen(false)} title="Assign Operator">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Operator *</label>
              <select className="form-control" value={opForm.operator_id} onChange={e => setOpForm(f => ({...f,operator_id:e.target.value}))}>
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Assigned From</label><input type="datetime-local" className="form-control" value={opForm.assigned_from} onChange={e => setOpForm(f => ({...f,assigned_from:e.target.value}))} /></div>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="form-control" value={opForm.shift} onChange={e => setOpForm(f => ({...f,shift:e.target.value}))}>
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Starting KM / Hours</label><input type="number" className="form-control" value={opForm.km_start} onChange={e => setOpForm(f => ({...f,km_start:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Project / Job No</label><input className="form-control" value={opForm.project_id} onChange={e => setOpForm(f => ({...f,project_id:e.target.value}))} /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={opForm.notes} onChange={e => setOpForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setOpOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAssignOp} disabled={opSaving}>{opSaving ? 'Saving…' : 'Assign'}</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── End Assignment Modal ─── */}
      {endOpRow && (
        <ModalDialog open={!!endOpRow} onClose={() => setEndOpRow(null)} title={`End Assignment — ${endOpRow.operator_name}`}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group"><label className="form-label">Ending KM / Hours</label><input type="number" className="form-control" value={endForm.km_end} onChange={e => setEndForm(f => ({...f,km_end:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Total Hours Logged</label><input type="number" className="form-control" value={endForm.hours_logged} onChange={e => setEndForm(f => ({...f,hours_logged:e.target.value}))} /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={endForm.notes} onChange={e => setEndForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setEndOpRow(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEndAssignment}>End Assignment</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ─── Attach Asset Modal ─── */}
      {attOpen && (
        <ModalDialog open={attOpen} onClose={() => setAttOpen(false)} title="Attach Asset">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Asset to Attach *</label>
              <select className="form-control" value={attForm.attached_asset_id} onChange={e => setAttForm(f => ({...f,attached_asset_id:e.target.value}))}>
                <option value="">— Select asset —</option>
                {allAssets.map(a => <option key={a.id} value={a.id}>{a.plate_number||a.asset_name} ({a.asset_code})</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Attached From</label><input type="date" className="form-control" value={attForm.attached_from} onChange={e => setAttForm(f => ({...f,attached_from:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={attForm.notes} onChange={e => setAttForm(f => ({...f,notes:e.target.value}))} /></div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setAttOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAttach} disabled={attSaving}>{attSaving ? 'Saving…' : 'Attach'}</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
