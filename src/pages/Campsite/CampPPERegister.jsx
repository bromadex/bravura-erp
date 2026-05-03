// src/pages/Campsite/CampPPERegister.jsx — PPE issuance register
import { useState, useEffect } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const TODAY = new Date().toISOString().split('T')[0]

const CONDITION_STYLE = {
  New:         { bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.3)',  color: 'var(--green)'  },
  Good:        { bg: 'rgba(96,165,250,.1)',  border: 'rgba(96,165,250,.3)',  color: 'var(--blue)'   },
  Fair:        { bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  color: 'var(--yellow)' },
  Replacement: { bg: 'rgba(251,146,60,.1)',  border: 'rgba(251,146,60,.3)',  color: '#fb923c'       },
}

export default function CampPPERegister() {
  const { items, ppeIssuances, issuePPE, loading } = useLogistics()
  const { user }  = useAuth()
  const canEdit   = useCanEdit('campsite', 'ppe-register')

  const [employees,  setEmployees]  = useState([])
  const [ppeModal,   setPpeModal]   = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [ppeForm,    setPpeForm]    = useState({
    employee_id: '', item_id: '', item_name: '', qty: 1,
    size: '', date: TODAY, condition: 'New', reason: 'New issue',
  })

  useEffect(() => {
    supabase.from('employees').select('id, name, employee_number').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const ppeItems = items.filter(i => i.category === 'PPE')

  const filtered = ppeIssuances.filter(p =>
    !searchTerm ||
    employees.find(e => e.id === p.employee_id)?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.item_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handlePPE = async (e) => {
    e.preventDefault()
    if (!ppeForm.employee_id || !ppeForm.item_id) return toast.error('Select employee and item')
    try {
      await issuePPE(ppeForm, user?.full_name || user?.username || '')
      toast.success('PPE issued')
      setPpeModal(false)
      setPpeForm({ employee_id: '', item_id: '', item_name: '', qty: 1, size: '', date: TODAY, condition: 'New', reason: 'New issue' })
    } catch (err) { toast.error(err.message) }
  }

  const modalWrap = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500 }
  const modalBox  = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }
  const grid2     = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>PPE Register</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ppeIssuances.length} total issuance{ppeIssuances.length !== 1 ? 's' : ''}</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setPpeModal(true)}>
            <span className="material-icons" style={{ fontSize: 16 }}>security</span> Issue PPE
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input className="form-control" placeholder="Search by employee or item…" style={{ maxWidth: 280 }}
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Size</th>
                <th>Condition</th>
                <th>Reason</th>
                <th>Issued By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No PPE issuances found</td></tr>
              ) : filtered.map(p => {
                const emp  = employees.find(e => e.id === p.employee_id)
                const cs   = CONDITION_STYLE[p.condition] || CONDITION_STYLE.New
                return (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{emp?.name || p.employee_id}</div>
                      {emp?.employee_number && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{emp.employee_number}</div>}
                    </td>
                    <td>{p.item_name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{p.qty}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{p.size || '—'}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: cs.bg, border: `1px solid ${cs.border}`, color: cs.color, fontSize: 11, fontWeight: 700 }}>
                        {p.condition}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.reason}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.issued_by || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue PPE modal */}
      {ppeModal && (
        <>
          <div onClick={() => setPpeModal(false)} style={modalWrap} />
          <div style={modalBox}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--teal)' }}>security</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Issue PPE</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setPpeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handlePPE} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Employee *</label>
                <select required className="form-control" value={ppeForm.employee_id}
                  onChange={e => setPpeForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">Select employee…</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} {e.employee_number ? `(${e.employee_number})` : ''}</option>
                  ))}
                </select>
              </div>
              <div style={grid2}>
                <div className="form-group">
                  <label className="form-label">PPE Item *</label>
                  <select required className="form-control" value={ppeForm.item_id}
                    onChange={e => { const itm = items.find(i => i.id === e.target.value); setPpeForm(f => ({ ...f, item_id: e.target.value, item_name: itm?.name || '' })) }}>
                    <option value="">Select item…</option>
                    {ppeItems.map(i => (
                      <option key={i.id} value={i.id}>{i.name} — {i.balance} available</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input type="number" min="1" className="form-control" value={ppeForm.qty}
                    onChange={e => setPpeForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
              <div style={grid2}>
                <div className="form-group">
                  <label className="form-label">Size</label>
                  <input className="form-control" placeholder="Size 9, L, XL…" value={ppeForm.size}
                    onChange={e => setPpeForm(f => ({ ...f, size: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={ppeForm.date}
                    onChange={e => setPpeForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div style={grid2}>
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select className="form-control" value={ppeForm.condition}
                    onChange={e => setPpeForm(f => ({ ...f, condition: e.target.value }))}>
                    <option>New</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Replacement</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason</label>
                  <select className="form-control" value={ppeForm.reason}
                    onChange={e => setPpeForm(f => ({ ...f, reason: e.target.value }))}>
                    <option>New issue</option>
                    <option>Replacement - Worn</option>
                    <option>Replacement - Damaged</option>
                    <option>Replacement - Lost</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPpeModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Issue PPE</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
