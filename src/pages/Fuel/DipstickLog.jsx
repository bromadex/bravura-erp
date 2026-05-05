// src/pages/Fuel/DipstickLog.jsx
// Full edit + delete support with audit logging

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const TANK_CAPACITY = 10000 // litres — adjust to your Zufta tank capacity

export default function DipstickLog() {
  const { dipstickLog, addDipstick, updateDipstick, deleteDipstick, getLitresFromCm, loading, fetchAll } = useFuel()
  const { user }   = useAuth()
  const canEdit    = useCanEdit('fuel', 'dipstick')
  const canDelete  = useCanDelete('fuel', 'dipstick')

  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [calculation, setCalculation] = useState(null)
  const [saving,      setSaving]      = useState(false)

  const emptyForm = {
    date: new Date().toISOString().split('T')[0],
    dip_start: '', dip_end: '', fm_start: '', fm_end: '', done_by: user?.full_name || '', notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  const calcValues = (f = form) => {
    const startCm = parseFloat(f.dip_start)
    const endCm   = parseFloat(f.dip_end)
    if (isNaN(startCm) || isNaN(endCm)) return null
    const startL  = getLitresFromCm(startCm)
    const endL    = getLitresFromCm(endCm)
    const actual  = startL - endL
    const fmStart = parseFloat(f.fm_start) || 0
    const fmEnd   = parseFloat(f.fm_end)   || 0
    const flow    = fmEnd - fmStart
    const error   = flow - actual
    const errorPct = actual !== 0 ? (error / actual) * 100 : 0
    return { startL, endL, actual, flow, error, errorPct }
  }

  const openEdit = (row = null) => {
    if (row) {
      setEditing(row)
      setForm({
        date:      row.date,
        dip_start: row.dip_start ?? '',
        dip_end:   row.dip_end   ?? '',
        fm_start:  row.fm_start  ?? '',
        fm_end:    row.fm_end    ?? '',
        done_by:   row.done_by   || '',
        notes:     row.notes     || '',
      })
      setCalculation(null)
    } else {
      setEditing(null)
      setForm(emptyForm)
      setCalculation(null)
    }
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const startCm = parseFloat(form.dip_start)
    const endCm   = parseFloat(form.dip_end)
    if (!form.date || isNaN(startCm) || isNaN(endCm)) return toast.error('Enter date and dipstick readings')
    const c = calcValues()
    if (!c) return

    setSaving(true)
    try {
      const payload = {
        date:             form.date,
        dip_start:        startCm,
        dip_end:          endCm,
        fuel_start:       c.startL,
        fuel_end:         c.endL,
        fm_start:         parseFloat(form.fm_start) || 0,
        fm_end:           parseFloat(form.fm_end)   || 0,
        flowmeter_issued: c.flow,
        actual_issued:    c.actual,
        error_liters:     c.error,
        error_pct:        c.errorPct,
        done_by:          form.done_by || user?.full_name || '',
        notes:            form.notes,
        user_name:        user?.full_name || user?.username || '',
      }

      if (editing) {
        await updateDipstick(editing.id, payload)
        // Audit log
        await supabase.from('hr_audit_logs').insert([{
          id: crypto.randomUUID(), module: 'fuel', action: 'UPDATE',
          entity_type: 'dipstick_log', entity_id: editing.id,
          entity_name: `Dipstick ${form.date}`,
          user_name: user?.full_name || user?.username || '',
          created_at: new Date().toISOString(),
        }])
        toast.success('Dipstick entry updated')
      } else {
        await addDipstick(payload)
        toast.success('Dipstick entry saved')
      }
      setShowModal(false)
      setEditing(null)
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete dipstick reading for ${row.date}? This cannot be undone.`)) return
    try {
      await deleteDipstick(row.id)
      // Audit log
      await supabase.from('hr_audit_logs').insert([{
        id: crypto.randomUUID(), module: 'fuel', action: 'DELETE',
        entity_type: 'dipstick_log', entity_id: row.id,
        entity_name: `Dipstick ${row.date}`,
        user_name: user?.full_name || user?.username || '',
        created_at: new Date().toISOString(),
      }])
      toast.success('Entry deleted')
    } catch (err) { toast.error(err.message) }
  }

  const errColor = (pct) => {
    const abs = Math.abs(pct || 0)
    if (abs <= 2) return 'var(--green)'
    if (abs <= 5) return 'var(--yellow)'
    return 'var(--red)'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dipstick Log</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openEdit()}>
            <span className="material-icons">add</span> New Reading
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : dipstickLog.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.25 }}>opacity</span>
          <p>No dipstick readings yet</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Dip Start (cm)</th>
                <th>Dip End (cm)</th>
                <th>Fuel Start (L)</th>
                <th>Fuel End (L)</th>
                <th>Actual Issued (L)</th>
                <th>FM Issued (L)</th>
                <th>Error (L)</th>
                <th>Error %</th>
                <th>Done By</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {dipstickLog.map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.dip_start}</td>
                  <td>{r.dip_end}</td>
                  <td>{Number(r.fuel_start || 0).toFixed(0)}</td>
                  <td>{Number(r.fuel_end   || 0).toFixed(0)}</td>
                  <td><strong>{Number(r.actual_issued || 0).toFixed(0)}</strong></td>
                  <td>{Number(r.flowmeter_issued || 0).toFixed(0)}</td>
                  <td style={{ color: (r.error_liters || 0) !== 0 ? errColor(r.error_pct) : 'inherit' }}>
                    {Number(r.error_liters || 0).toFixed(1)}
                  </td>
                  <td>
                    <span style={{ color: errColor(r.error_pct), fontWeight: 700, fontSize: 12, background: `${errColor(r.error_pct)}18`, padding: '2px 8px', borderRadius: 10, border: `1px solid ${errColor(r.error_pct)}44` }}>
                      {Number(r.error_pct || 0).toFixed(2)}%
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.done_by || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 14 }}>edit</span></button>}
                        {canDelete && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}><span className="material-icons" style={{ fontSize: 14 }}>delete</span></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-title">{editing ? 'Edit' : 'New'} <span>Dipstick Reading</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" className="form-control" required value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Done By</label>
                  <input className="form-control" value={form.done_by} onChange={e => setForm(f => ({...f, done_by: e.target.value}))} placeholder={user?.full_name || ''} />
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>DIPSTICK READINGS (cm)</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start (Morning)</label>
                    <input type="number" step="0.1" className="form-control" required value={form.dip_start} onChange={e => { setForm(f => ({...f, dip_start: e.target.value})); setCalculation(null) }} placeholder="cm" />
                  </div>
                  <div className="form-group">
                    <label>End (Evening)</label>
                    <input type="number" step="0.1" className="form-control" required value={form.dip_end} onChange={e => { setForm(f => ({...f, dip_end: e.target.value})); setCalculation(null) }} placeholder="cm" />
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10 }}>FLOWMETER READINGS (L)</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start</label>
                    <input type="number" step="0.1" className="form-control" value={form.fm_start} onChange={e => { setForm(f => ({...f, fm_start: e.target.value})); setCalculation(null) }} placeholder="L" />
                  </div>
                  <div className="form-group">
                    <label>End</label>
                    <input type="number" step="0.1" className="form-control" value={form.fm_end} onChange={e => { setForm(f => ({...f, fm_end: e.target.value})); setCalculation(null) }} placeholder="L" />
                  </div>
                </div>
              </div>

              {/* Live calculation preview */}
              {(() => {
                const c = calcValues()
                if (!c) return null
                const pct = c.errorPct
                const col = Math.abs(pct) <= 2 ? 'var(--green)' : Math.abs(pct) <= 5 ? 'var(--yellow)' : 'var(--red)'
                return (
                  <div style={{ background: 'rgba(45,212,191,.06)', border: '1px solid rgba(45,212,191,.2)', borderRadius: 10, padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Actual Issued</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)' }}>{c.actual.toFixed(0)} L</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>FM Issued</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{c.flow.toFixed(0)} L</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Error</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{pct.toFixed(2)}%</div>
                    </div>
                  </div>
                )
              })()}

              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
