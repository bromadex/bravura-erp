import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, KPICard } from '../../components/ui'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

const STATUS_CFG = {
  expired:  { color:'var(--red)',      label:'Expired',  bg:'color-mix(in srgb,var(--red)    12%,var(--surface2))', border:'color-mix(in srgb,var(--red)    30%,transparent)', rowBg:'color-mix(in srgb,var(--red)    5%,var(--surface))' },
  critical: { color:'var(--red)',      label:'Critical', bg:'color-mix(in srgb,var(--red)    12%,var(--surface2))', border:'color-mix(in srgb,var(--red)    30%,transparent)', rowBg:'color-mix(in srgb,var(--red)    5%,var(--surface))' },
  warning:  { color:'var(--yellow)',   label:'Warning',  bg:'color-mix(in srgb,var(--yellow) 12%,var(--surface2))', border:'color-mix(in srgb,var(--yellow) 30%,transparent)', rowBg:'color-mix(in srgb,var(--yellow) 5%,var(--surface))' },
  ok:       { color:'var(--green)',    label:'OK',       bg:'color-mix(in srgb,var(--green)  12%,var(--surface2))', border:'color-mix(in srgb,var(--green)  30%,transparent)', rowBg:'' },
}

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] || { color:'var(--text-dim)', label:status, bg:'var(--surface2)', border:'var(--border)' }
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  )
}

export default function FleetCompliance() {
  const [alerts,    setAlerts]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tabFilter, setTabFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [typeFilter,setTypeFilter]= useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('fleet_expiry_alerts').select('*').order('expiry_date')
    if (!error && data) setAlerts(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const expired  = alerts.filter(a => a.status === 'expired').length
  const critical = alerts.filter(a => a.status === 'critical').length
  const warning  = alerts.filter(a => a.status === 'warning').length
  const ok       = alerts.filter(a => a.status === 'ok').length

  const docTypes = [...new Set(alerts.map(a => a.expiry_type))].sort()

  const filtered = alerts.filter(a => {
    if (tabFilter !== 'all' && a.status !== tabFilter) return false
    if (typeFilter !== 'all' && a.expiry_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!((a.asset_name||'').toLowerCase().includes(q) || (a.registration_no||'').toLowerCase().includes(q) || (a.fleet_number||'').toLowerCase().includes(q))) return false
    }
    return true
  })

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(a => ({
      'Asset':           a.asset_name,
      'Reg / Code':      a.registration_no,
      'Fleet No':        a.fleet_number || '',
      'Document Type':   a.expiry_type,
      'Expiry Date':     a.expiry_date,
      'Days Remaining':  a.days_until_expiry,
      'Status':          a.status,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Compliance')
    XLSX.writeFile(wb, `FleetCompliance_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div className="page-container">
      <PageHeader title="Fleet Compliance" subtitle="Document expiry monitoring — insurance, licences, fitness certificates, warranties" icon="verified_user">
        <button className="btn btn-ghost" onClick={exportXLSX}>
          <span className="material-icons" style={{ fontSize:16 }}>download</span>Export
        </button>
        <button className="btn btn-ghost" onClick={load}>
          <span className="material-icons" style={{ fontSize:16 }}>refresh</span>Refresh
        </button>
      </PageHeader>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <KPICard label="Expired"  value={expired}  icon="cancel"       color="var(--red)"    />
        <KPICard label="Critical (≤7 days)" value={critical} icon="warning" color="var(--red)"  />
        <KPICard label="Warning (≤30 days)" value={warning}  icon="schedule" color="var(--yellow)" />
        <KPICard label="Compliant"          value={ok}       icon="verified"  color="var(--green)"  />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[['all','All'],['expired','Expired'],['critical','Critical'],['warning','Warning'],['ok','OK']].map(([k,l]) => {
          const cnt = k === 'all' ? alerts.length : alerts.filter(a => a.status === k).length
          return (
            <button key={k} onClick={() => setTabFilter(k)} style={{
              background:'none', border:'none', cursor:'pointer', padding:'7px 14px',
              fontSize:13, fontWeight: tabFilter===k ? 700 : 500,
              color: tabFilter===k ? 'var(--primary)' : 'var(--text-dim)',
              borderBottom: tabFilter===k ? '2px solid var(--primary)' : '2px solid transparent',
              display:'flex', alignItems:'center', gap:6,
            }}>
              {l}
              <span style={{ fontSize:11, background:'var(--surface2)', borderRadius:20, padding:'1px 7px', fontWeight:600 }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Search + type filter */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-control" style={{ maxWidth:260 }} placeholder="Search asset name or registration…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ width:200 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All document types</option>
          {docTypes.map(t => <option key={t}>{t}</option>)}
        </select>
        {(search || typeFilter !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setTypeFilter('all') }}>Clear</button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-dim)' }}>{filtered.length} records</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-dim)' }}>Loading compliance data…</div>
      ) : filtered.length === 0 ? (
        tabFilter === 'ok' || (tabFilter === 'all' && alerts.length === 0)
          ? <EmptyState icon="verified" message="All documents are compliant — no alerts found" />
          : <EmptyState icon="search" message="No compliance alerts match the current filters" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th><th>Reg / Code</th><th>Fleet No</th>
                <th>Document Type</th><th>Expiry Date</th><th>Days Remaining</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const cfg = STATUS_CFG[a.status] || STATUS_CFG.ok
                return (
                  <tr key={`${a.asset_id}-${a.expiry_type}-${i}`}
                    style={{ background: cfg.rowBg, borderLeft: (a.status === 'expired' || a.status === 'critical') ? '3px solid var(--red)' : a.status === 'warning' ? '3px solid var(--yellow)' : undefined }}
                    onMouseOver={e => { if (!cfg.rowBg) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseOut={e  => { if (!cfg.rowBg) e.currentTarget.style.background = '' }}>
                    <td style={{ fontWeight:600 }}>{a.asset_name}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.registration_no || '—'}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)', color:'var(--text-dim)' }}>{a.fleet_number || '—'}</td>
                    <td>{a.expiry_type}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)' }}>{a.expiry_date}</td>
                    <td style={{ fontFamily:'var(--mono,monospace)', fontWeight:600, color: cfg.color }}>
                      {a.days_until_expiry < 0
                        ? `${Math.abs(a.days_until_expiry)} days ago`
                        : a.days_until_expiry === 0
                        ? 'Today'
                        : `${a.days_until_expiry} days`
                      }
                    </td>
                    <td><StatusPill status={a.status} /></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" title="Send reminder" onClick={() => toast.success(`Reminder noted for ${a.asset_name} — ${a.expiry_type}`)}>
                        <span className="material-icons" style={{ fontSize:15 }}>notifications</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
