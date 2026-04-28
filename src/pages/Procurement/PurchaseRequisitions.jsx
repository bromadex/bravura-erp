import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function PurchaseRequisitions() {
  const { purchaseRequisitions, approvePurchaseRequisition, rejectPurchaseRequisition, createPurchaseOrder, loading, fetchAll } = useProcurement()
  const { user } = useAuth()
  const canApprove = useCanApprove('procurement', 'purchase-requisitions')
  const [filterStatus, setFilterStatus] = useState('all')

  const handleApprove = async (pr) => {
    try {
      await approvePurchaseRequisition(pr.id, user?.full_name || user?.username, user?.id)
      toast.success('Purchase requisition approved')
      const items = typeof pr.items === 'string' ? JSON.parse(pr.items) : pr.items
      const poItems = items.map(it => ({
        ...it,
        ordered_qty: it.requested_qty,
        unit_cost: 0,
        total: 0
      }))
      await createPurchaseOrder({
        supplier_id: null,
        supplier_name: items[0]?.suggested_supplier || '',
        order_date: new Date().toISOString().split('T')[0],
        items: poItems,
        total_amount: 0,
        notes: `Auto-created from PR ${pr.pr_number}`
      })
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleReject = async (id) => {
    const reason = prompt('Rejection reason:')
    if (!reason) return
    try {
      await rejectPurchaseRequisition(id, reason, user?.full_name || user?.username, user?.id)
      toast.success('Purchase requisition rejected')
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const filtered = purchaseRequisitions.filter(r => filterStatus === 'all' || r.status === filterStatus)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Purchase Requisitions</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'draft', 'submitted', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            className={`btn btn-secondary btn-sm ${filterStatus === s ? 'active' : ''}`}
            onClick={() => setFilterStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>PR #</th>
              <th>Date</th>
              <th>Department</th>
              <th>Requester</th>
              <th>Items</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 40 }}>Loading...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 40 }}>No purchase requisitions</td>
              </tr>
            ) : (
              filtered.map(pr => {
                const items = typeof pr.items === 'string' ? JSON.parse(pr.items) : pr.items
                return (
                  <tr key={pr.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                      {pr.pr_number}
                    </td>
                    <td>{pr.date}</td>
                    <td>{pr.department || '-'}</td>
                    <td>{pr.requester_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                    <td>
                      <span className={`badge bg-${pr.status === 'approved' ? 'green' : pr.status === 'rejected' ? 'red' : 'yellow'}`}>
                        {pr.status}
                      </span>
                    </td>
                    <td>
                      {canApprove && pr.status === 'submitted' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => handleApprove(pr)} style={{ marginRight: 4 }}>
                            <span className="material-icons">check_circle</span> Approve
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleReject(pr.id)}>
                            <span className="material-icons">cancel</span> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
