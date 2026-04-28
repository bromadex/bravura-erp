import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function AssetIssues() {
  const { vehicles, generators, earthMovers, addAssetIssue, updateAssetIssue } = useFleet()
  const { user } = useAuth()
  const canEdit = useCanEdit('fleet', 'asset-issues')
  const [issues, setIssues] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    asset_type: 'vehicle',
    asset_id: '',
    reported_date: new Date().toISOString().split('T')[0],
    reported_by: user?.full_name || user?.username,
    issue_description: '',
    urgency: 'normal'
  })

  useEffect(() => { loadIssues() }, [])

  const loadIssues = async () => {
    const { data } = await supabase.from('asset_issues').select('*').order('created_at', { ascending: false })
    if (data) setIssues(data)
  }

  const getAssetName = (type, id) => {
    if (type === 'vehicle') return vehicles.find(v => v.id === id)?.reg
    if (type === 'generator') return generators.find(g => g.id === id)?.gen_code
    if (type === 'earthmover') return earthMovers.find(e => e.id === id)?.reg
    return id
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_id || !form.issue_description) return toast.error('Asset and description required')
    try {
      await addAssetIssue(form)
      toast.success('Issue reported')
      setModalOpen(false)
      loadIssues()
    } catch (err) { toast.error(err.message) }
  }

  const handleStatusUpdate = async (id, status) => {
    await updateAssetIssue(id, { status, resolved_date: status === 'resolved' ? new Date().toISOString().split('T')[0] : null })
    toast.success(`Issue marked as ${status}`)
    loadIssues()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Asset Issues & Maintenance</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <span className="material-icons">bug_report</span> Report Issue
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr><th>Date</th><th>Asset</th><th>Issue</th><th>Urgency</th><th>Status</th><th>Reported By</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {issues.map(issue => {
              const assetName = getAssetName(issue.asset_type, issue.asset_id)
              const urgencyColor = issue.urgency === 'critical' ? 'var(--red)' : issue.urgency === 'high' ? 'var(--yellow)' : 'var(--text-dim)'
              return (
                <tr key={issue.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{issue.reported_date}</td>
                  <td><strong>{assetName}</strong> ({issue.asset_type})</td>
                  <td>{issue.issue_description}</td>
                  <td style={{ color: urgencyColor }}>{issue.urgency}</td>
                  <td><span className={`badge ${issue.status === 'resolved' ? 'bg-green' : issue.status === 'in_progress' ? 'bg-yellow' : 'bg-red'}`}>{issue.status}</span></td>
                  <td>{issue.reported_by || '-'}</td>
                  <td>
                    {canEdit && issue.status !== 'resolved' && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleStatusUpdate(issue.id, 'in_progress')}>In Progress</button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusUpdate(issue.id, 'resolved')}>Resolve</button>
                      </>
                    )}
                   </td>
                </tr>
              )
            })}
            {issues.length === 0 && <tr><td colSpan="7" className="empty-state">No issues reported</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Report <span>Issue</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Asset Type</label>
                  <select className="form-control" value={form.asset_type} onChange={e => setForm({...form, asset_type: e.target.value, asset_id: ''})}>
                    <option value="vehicle">Vehicle</option>
                    <option value="generator">Generator</option>
                    <option value="earthmover">Heavy Equipment</option>
                  </select>
                </div>
                <div className="form-group"><label>Asset</label>
                  <select className="form-control" required value={form.asset_id} onChange={e => setForm({...form, asset_id: e.target.value})}>
                    <option value="">Select</option>
                    {form.asset_type === 'vehicle' && vehicles.map(v => <option key={v.id} value={v.id}>{v.reg}</option>)}
                    {form.asset_type === 'generator' && generators.map(g => <option key={g.id} value={g.id}>{g.gen_code}</option>)}
                    {form.asset_type === 'earthmover' && earthMovers.map(e => <option key={e.id} value={e.id}>{e.reg}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Reported Date</label><input type="date" className="form-control" required value={form.reported_date} onChange={e => setForm({...form, reported_date: e.target.value})} /></div>
                <div className="form-group"><label>Reported By</label><input className="form-control" value={form.reported_by} onChange={e => setForm({...form, reported_by: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Urgency</label>
                  <select className="form-control" value={form.urgency} onChange={e => setForm({...form, urgency: e.target.value})}>
                    <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Issue Description *</label><textarea className="form-control" rows="3" required value={form.issue_description} onChange={e => setForm({...form, issue_description: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Report Issue</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
