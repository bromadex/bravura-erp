import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import toast from 'react-hot-toast'

export default function Suppliers() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, loading } = useProcurement()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', payment_terms: '', lead_time_days: 0, status: 'Active'
  })

  const openModal = (supplier = null) => {
    if (supplier) {
      setEditing(supplier)
      setForm({
        name: supplier.name,
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        tax_id: supplier.tax_id || '',
        payment_terms: supplier.payment_terms || '',
        lead_time_days: supplier.lead_time_days || 0,
        status: supplier.status || 'Active',
      })
    } else {
      setEditing(null)
      setForm({ name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', payment_terms: '', lead_time_days: 0, status: 'Active' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Supplier name required')
    try {
      if (editing) {
        await updateSupplier(editing.id, form)
        toast.success('Supplier updated')
      } else {
        await addSupplier(form)
        toast.success('Supplier added')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete supplier "${name}"?`)) {
      await deleteSupplier(id)
      toast.success('Deleted')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Suppliers</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Supplier
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Terms</th><th>Lead Time</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8">Loading...</td></tr> : suppliers.length === 0 ? <tr><td colSpan="8">No suppliers</td></tr> : (
              suppliers.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.contact_person || '-'}</td>
                  <td>{s.phone || '-'}</td>
                  <td>{s.email || '-'}</td>
                  <td>{s.payment_terms || '-'}</td>
                  <td>{s.lead_time_days || 0} days</td>
                  <td><span className="badge bg-good">{s.status}</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openModal(s)}><span className="material-icons">edit</span></button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id, s.name)}><span className="material-icons">delete</span></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Supplier</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Supplier Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="form-group"><label>Contact Person</label><input className="form-control" value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Address</label><textarea className="form-control" rows="2" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label>Tax ID</label><input className="form-control" value={form.tax_id} onChange={e => setForm({...form, tax_id: e.target.value})} /></div>
                <div className="form-group"><label>Payment Terms</label><input className="form-control" placeholder="e.g. Net 30" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Lead Time (days)</label><input type="number" className="form-control" value={form.lead_time_days} onChange={e => setForm({...form, lead_time_days: parseInt(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option>Active</option><option>Inactive</option></select></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
