// src/pages/ESS/ESSPayslips.jsx
// Employee payslip viewer — gracefully handles missing salary_slips table.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function ESSPayslips() {
  const { user } = useAuth()
  const [payslips,     setPayslips]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selectedSlip, setSelectedSlip] = useState(null)
  const [employeeId,   setEmployeeId]   = useState(null)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.employee_id) {
          setEmployeeId(data.employee_id)
          // Try to fetch salary slips — table may not exist yet
          supabase.from('salary_slips').select('*').eq('employee_id', data.employee_id).order('start_date', { ascending: false })
            .then(({ data: slips, error }) => {
              if (!error && slips) setPayslips(slips)
            })
            .catch(() => setPayslips([]))
            .finally(() => setLoading(false))
        } else {
          setLoading(false)
        }
      })
  }, [user])

  // Format currency
  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>My Payslips</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>View and download your salary slips</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading payslips…</div>
      ) : payslips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span className="material-icons" style={{ fontSize: 64, opacity: .25, color: 'var(--gold)', display: 'block', marginBottom: 16 }}>receipt_long</span>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No payslips yet</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Your salary slips will appear here once payroll is processed.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Slip list */}
          <div style={{ width: 220, flexShrink: 0 }}>
            {payslips.map(slip => (
              <button key={slip.id}
                onClick={() => setSelectedSlip(slip)}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', borderRadius: 8, marginBottom: 6, border: '1px solid var(--border)',
                  background: selectedSlip?.id === slip.id ? 'var(--gold-alpha, rgba(212,175,55,0.1))' : 'var(--surface)', cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{slip.start_date?.slice(0,7)}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>Net: {fmt(slip.net_pay)}</div>
              </button>
            ))}
          </div>
          {/* Slip detail */}
          {selectedSlip && (
            <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedSlip.start_date?.slice(0,7)}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{selectedSlip.slip_number}</div>
                </div>
                <button className="btn btn-secondary" onClick={() => window.print()}>
                  <span className="material-icons" style={{ fontSize: 16 }}>print</span> Print
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>GROSS PAY</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--green)' }}>{fmt(selectedSlip.gross_pay)}</div>
                </div>
                <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>DEDUCTIONS</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--red)' }}>{fmt(selectedSlip.total_deduction)}</div>
                </div>
              </div>
              <div style={{ padding: 16, background: 'var(--gold-alpha, rgba(212,175,55,0.1))', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700 }}>NET PAY</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{fmt(selectedSlip.net_pay)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
