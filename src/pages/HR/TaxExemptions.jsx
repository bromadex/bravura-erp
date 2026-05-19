import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CURRENCIES = ['USD', 'ZiG', 'ZWL']
const PROOF_STATUSES = ['Pending', 'Submitted', 'Verified', 'Rejected']

const pad6 = (n) => String(n).padStart(6, '0')

const BLANK_CAT = { name: '', description: '', max_amount: '', currency: 'USD', is_active: true }
const BLANK_DECL = { employee_id: '', tax_year_id: '', currency: 'USD', notes: '' }
const BLANK_ITEM = () => ({
  id: crypto.randomUUID(),
  category_id: '',
  declared_amount: 0,
  proof_url: '',
  proof_status: 'Pending',
  verification_notes: '',
  _isNew: true,
})

export default function TaxExemptions() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'tax-exemptions')
  const canApprove = useCanApprove('hr', 'tax-exemptions')

  const [tab, setTab] = useState('categories')

  const [categories, setCategories] = useState([])
  const [declarations, setDeclarations] = useState([])
  const [employees, setEmployees] = useState([])
  const [taxYears, setTaxYears] = useState([])
  const [loading, setLoading] = useState(true)

  const [catForm, setCatForm] = useState(BLANK_CAT)
  const [editCat, setEditCat] = useState(null)
  const [showCat, setShowCat] = useState(false)
  const [savingCat, setSavingCat] = useState(false)
  const [confirmDelCat, setConfirmDelCat] = useState(null)

  const [filterEmp, setFilterEmp] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showDecl, setShowDecl] = useState(false)
  const [editDecl, setEditDecl] = useState(null)
  const [declForm, setDeclForm] = useState(BLANK_DECL)
  const [items, setItems] = useState([])
  const [savingDecl, setSavingDecl] = useState(false)

  const [confirmDelDecl, setConfirmDelDecl] = useState(null)
  const [confirmSubmit, setConfirmSubmit] = useState(null)
  const [confirmApprove, setConfirmApprove] = useState(null)
  const [rejectRow, setRejectRow] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [cats, decls, emps, yrs] = await Promise.all([
      supabase.from('tax_exemption_categories').select('*').order('name'),
      supabase.from('tax_exemption_declarations')
        .select('*, employees(name, employee_number), tax_years(year_label), tax_exemption_declaration_items(id)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
      supabase.from('tax_years').select('id, year_label, status').order('start_date', { ascending: false }),
    ])
    if (cats.error) toast.error('Categories: ' + cats.error.message)
    if (decls.error) toast.error('Declarations: ' + decls.error.message)
    setCategories(cats.data || [])
    setDeclarations(decls.data || [])
    setEmployees(emps.data || [])
    setTaxYears(yrs.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextDeclNumber = () => {
    const nums = declarations
      .map(d => parseInt((d.declaration_number || '').replace('TXE-', ''), 10))
      .filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `TXE-${pad6(max + 1)}`
  }

  const openNewCat = () => { setEditCat(null); setCatForm(BLANK_CAT); setShowCat(true) }
  const openEditCat = (c) => {
    setEditCat(c)
    setCatForm({
      name: c.name || '',
      description: c.description || '',
      max_amount: c.max_amount ?? '',
      currency: c.currency || 'USD',
      is_active: c.is_active ?? true,
    })
    setShowCat(true)
  }

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { toast.error('Name is required'); return }
    setSavingCat(true)
    try {
      const payload = {
        name: catForm.name.trim(),
        description: catForm.description || null,
        max_amount: catForm.max_amount === '' ? null : Number(catForm.max_amount),
        currency: catForm.currency || 'USD',
        is_active: !!catForm.is_active,
      }
      if (editCat) {
        const { error } = await supabase.from('tax_exemption_categories').update(payload).eq('id', editCat.id)
        if (error) throw error
        toast.success('Category updated')
      } else {
        const { error } = await supabase.from('tax_exemption_categories').insert([{
          id: crypto.randomUUID(),
          ...payload,
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
        toast.success('Category created')
      }
      setShowCat(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSavingCat(false) }
  }

  const toggleCatActive = async (c) => {
    const { error } = await supabase.from('tax_exemption_categories').update({ is_active: !c.is_active }).eq('id', c.id)
    if (error) toast.error(error.message)
    else fetchAll()
  }

  const handleDeleteCat = async () => {
    if (!confirmDelCat) return
    setActing(true)
    try {
      const { error } = await supabase.from('tax_exemption_categories').delete().eq('id', confirmDelCat.id)
      if (error) throw error
      toast.success('Category deleted')
      setConfirmDelCat(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const openNewDecl = () => {
    setEditDecl(null)
    setDeclForm({ ...BLANK_DECL })
    setItems([])
    setShowDecl(true)
  }

  const openEditDecl = async (d) => {
    setEditDecl(d)
    setDeclForm({
      employee_id: d.employee_id || '',
      tax_year_id: d.tax_year_id || '',
      currency: d.currency || 'USD',
      notes: d.notes || '',
    })
    const { data, error } = await supabase
      .from('tax_exemption_declaration_items')
      .select('*')
      .eq('declaration_id', d.id)
    if (error) toast.error('Items: ' + error.message)
    setItems((data || []).map(it => ({
      id: it.id,
      category_id: it.category_id || '',
      declared_amount: it.declared_amount ?? 0,
      proof_url: it.proof_url || '',
      proof_status: it.proof_status || 'Pending',
      verification_notes: it.verification_notes || '',
      _isNew: false,
    })))
    setShowDecl(true)
  }

  const addItem = () => setItems(prev => [...prev, BLANK_ITEM()])
  const updateItem = (id, key, val) => setItems(prev => prev.map(it => it.id === id ? { ...it, [key]: val } : it))
  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id))

  const totalDeclared = items.reduce((acc, it) => acc + (Number(it.declared_amount) || 0), 0)
  const isLocked = !!editDecl && editDecl.status !== 'Draft'

  const handleSaveDecl = async () => {
    if (!declForm.employee_id) { toast.error('Select an employee'); return }
    if (!declForm.tax_year_id) { toast.error('Select a tax year'); return }
    setSavingDecl(true)
    try {
      let declId = editDecl?.id
      const payload = {
        employee_id: declForm.employee_id,
        tax_year_id: declForm.tax_year_id,
        total_declared: totalDeclared,
        currency: declForm.currency || 'USD',
        notes: declForm.notes || null,
      }
      if (editDecl) {
        const { error } = await supabase.from('tax_exemption_declarations').update(payload).eq('id', editDecl.id)
        if (error) throw error
      } else {
        declId = crypto.randomUUID()
        const { error } = await supabase.from('tax_exemption_declarations').insert([{
          id: declId,
          declaration_number: nextDeclNumber(),
          ...payload,
          status: 'Draft',
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
      }

      if (!isLocked) {
        const { error: delErr } = await supabase.from('tax_exemption_declaration_items').delete().eq('declaration_id', declId)
        if (delErr) throw delErr
        if (items.length) {
          const payloadItems = items.map(it => ({
            id: it._isNew ? crypto.randomUUID() : it.id,
            declaration_id: declId,
            category_id: it.category_id || null,
            declared_amount: Number(it.declared_amount) || 0,
            proof_url: it.proof_url || null,
            proof_status: it.proof_status || 'Pending',
            verification_notes: it.verification_notes || null,
          }))
          const { error: insErr } = await supabase.from('tax_exemption_declaration_items').insert(payloadItems)
          if (insErr) throw insErr
        }
      }

      toast.success(editDecl ? 'Declaration updated' : 'Declaration created')
      setShowDecl(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSavingDecl(false) }
  }

  const handleSubmit = async () => {
    if (!confirmSubmit) return
    setActing(true)
    try {
      const { error } = await supabase.from('tax_exemption_declarations').update({
        status: 'Submitted',
        submitted_at: new Date().toISOString(),
      }).eq('id', confirmSubmit.id)
      if (error) throw error
      toast.success('Declaration submitted')
      setConfirmSubmit(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleApprove = async () => {
    if (!confirmApprove) return
    setActing(true)
    try {
      const { error } = await supabase.from('tax_exemption_declarations').update({
        status: 'Approved',
        approved_by: user?.full_name || user?.username || '',
        approved_at: new Date().toISOString(),
      }).eq('id', confirmApprove.id)
      if (error) throw error
      toast.success('Declaration approved')
      setConfirmApprove(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleReject = async () => {
    if (!rejectRow) return
    if (!rejectReason.trim()) { toast.error('Rejection reason is required'); return }
    setActing(true)
    try {
      const { error } = await supabase.from('tax_exemption_declarations').update({
        status: 'Rejected',
        rejection_reason: rejectReason.trim(),
        approved_by: user?.full_name || user?.username || '',
        approved_at: new Date().toISOString(),
      }).eq('id', rejectRow.id)
      if (error) throw error
      toast.success('Declaration rejected')
      setRejectRow(null)
      setRejectReason('')
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleDeleteDecl = async () => {
    if (!confirmDelDecl) return
    setActing(true)
    try {
      const { error: itemErr } = await supabase.from('tax_exemption_declaration_items').delete().eq('declaration_id', confirmDelDecl.id)
      if (itemErr) throw itemErr
      const { error } = await supabase.from('tax_exemption_declarations').delete().eq('id', confirmDelDecl.id)
      if (error) throw error
      toast.success('Declaration deleted')
      setConfirmDelDecl(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const filteredDecls = declarations.filter(d => {
    if (filterEmp && d.employee_id !== filterEmp) return false
    if (filterYear && d.tax_year_id !== filterYear) return false
    if (filterStatus && d.status !== filterStatus) return false
    return true
  })

  const kpiTotal = declarations.length
  const kpiDraft = declarations.filter(d => d.status === 'Draft').length
  const kpiSubmitted = declarations.filter(d => d.status === 'Submitted').length
  const kpiApproved = declarations.filter(d => d.status === 'Approved').length
  const kpiRejected = declarations.filter(d => d.status === 'Rejected').length

  const selectedCatForItem = (catId) => categories.find(c => c.id === catId)

  return (
    <div>
      <PageHeader title="Tax Exemptions" subtitle="Manage exemption categories and employee declarations" />

      <TabNav
        tabs={[
          { id: 'categories',   label: 'Categories',   icon: 'category',  count: categories.length },
          { id: 'declarations', label: 'Declarations', icon: 'assignment', count: declarations.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'categories' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={openNewCat}>
                <span className="material-icons">add</span> New Category
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : categories.length === 0 ? (
            <EmptyState icon="category" message="No exemption categories defined." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Max Amount</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.description || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.max_amount != null ? `$${fmt(c.max_amount)}` : '—'}</td>
                      <td>{c.currency || 'USD'}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: c.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                          color: c.is_active ? 'var(--green)' : 'var(--text-dim)',
                          border: `1px solid ${c.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                        }}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <>
                            <button className="btn btn-xs btn-secondary" onClick={() => openEditCat(c)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            </button>
                            <button className="btn btn-xs btn-secondary" onClick={() => toggleCatActive(c)} title={c.is_active ? 'Deactivate' : 'Activate'}>
                              <span className="material-icons" style={{ fontSize: 13 }}>{c.is_active ? 'toggle_on' : 'toggle_off'}</span>
                            </button>
                            <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelCat(c)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'declarations' && (
        <div style={{ marginTop: 16 }}>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <KPICard label="Total"     value={kpiTotal}     icon="assignment"     color="blue"   />
            <KPICard label="Draft"     value={kpiDraft}     icon="edit_note"      color="text-dim" />
            <KPICard label="Submitted" value={kpiSubmitted} icon="outbox"         color="yellow" />
            <KPICard label="Approved"  value={kpiApproved}  icon="check_circle"   color="green"  />
            <KPICard label="Rejected"  value={kpiRejected}  icon="cancel"         color="red"    />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Employee</label>
              <select className="form-control" style={{ width: 220 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Tax Year</label>
              <select className="form-control" style={{ width: 150 }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                <option value="">All Years</option>
                {taxYears.map(y => <option key={y.id} value={y.id}>{y.year_label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Status</label>
              <select className="form-control" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option>Draft</option><option>Submitted</option><option>Approved</option><option>Rejected</option>
              </select>
            </div>
            {(filterEmp || filterYear || filterStatus) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterYear(''); setFilterStatus('') }}>Clear</button>
            )}
            <div style={{ marginLeft: 'auto' }}>
              {canEdit && (
                <button className="btn btn-primary btn-sm" onClick={openNewDecl}>
                  <span className="material-icons">add</span> New Declaration
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : filteredDecls.length === 0 ? (
            <EmptyState icon="assignment" message="No declarations found." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>Tax Year</th>
                    <th style={{ textAlign: 'right' }}>Total Declared</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDecls.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>{d.declaration_number}</td>
                      <td>{d.employees?.name || '—'}</td>
                      <td>{d.tax_years?.year_label || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${fmt(d.total_declared)} {d.currency}</td>
                      <td><StatusBadge status={d.status?.toLowerCase()} label={d.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => openEditDecl(d)} title={d.status === 'Draft' ? 'Edit' : 'View'}>
                            <span className="material-icons" style={{ fontSize: 13 }}>{d.status === 'Draft' ? 'edit' : 'visibility'}</span>
                          </button>
                          {canEdit && d.status === 'Draft' && (
                            <button className="btn btn-xs btn-primary" onClick={() => setConfirmSubmit(d)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>outbox</span> Submit
                            </button>
                          )}
                          {canApprove && d.status === 'Submitted' && (
                            <>
                              <button className="btn btn-xs btn-primary" onClick={() => setConfirmApprove(d)} style={{ background: 'var(--green)' }}>
                                <span className="material-icons" style={{ fontSize: 13 }}>check</span> Approve
                              </button>
                              <button className="btn btn-xs btn-danger" onClick={() => { setRejectRow(d); setRejectReason('') }}>
                                <span className="material-icons" style={{ fontSize: 13 }}>close</span> Reject
                              </button>
                            </>
                          )}
                          {canEdit && d.status === 'Draft' && (
                            <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelDecl(d)} title="Delete">
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModalDialog open={showCat} onClose={() => setShowCat(false)} title={editCat ? 'Edit Category' : 'New Category'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Max Amount</label>
              <input type="number" step="0.01" min="0" className="form-control"
                value={catForm.max_amount}
                onChange={e => setCatForm(f => ({ ...f, max_amount: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Currency</label>
              <select className="form-control" value={catForm.currency} onChange={e => setCatForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="cat_active" checked={catForm.is_active} onChange={e => setCatForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="cat_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowCat(false)} disabled={savingCat}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveCat} disabled={savingCat}>{savingCat ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog
        open={showDecl}
        onClose={() => setShowDecl(false)}
        size="lg"
        title={editDecl ? `Declaration · ${editDecl.declaration_number}` : 'New Declaration'}
      >
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLocked && (
            <div style={{
              padding: 10, background: 'var(--yellow)18', border: '1px solid var(--yellow)44',
              borderRadius: 6, fontSize: 12, color: 'var(--yellow)',
            }}>
              This declaration is {editDecl.status}. Items are read-only.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Employee *</label>
              <select className="form-control" value={declForm.employee_id} disabled={isLocked}
                onChange={e => setDeclForm(f => ({ ...f, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Tax Year *</label>
              <select className="form-control" value={declForm.tax_year_id} disabled={isLocked}
                onChange={e => setDeclForm(f => ({ ...f, tax_year_id: e.target.value }))}>
                <option value="">Select year…</option>
                {taxYears.map(y => <option key={y.id} value={y.id}>{y.year_label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Currency</label>
              <select className="form-control" value={declForm.currency} disabled={isLocked}
                onChange={e => setDeclForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={declForm.notes} disabled={isLocked}
              onChange={e => setDeclForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {editDecl?.status === 'Rejected' && editDecl.rejection_reason && (
            <div style={{
              padding: 10, background: 'var(--red)18', border: '1px solid var(--red)44',
              borderRadius: 6, fontSize: 12, color: 'var(--red)',
            }}>
              <strong>Rejection reason:</strong> {editDecl.rejection_reason}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <strong style={{ fontSize: 13 }}>Declaration Items</strong>
            {!isLocked && (
              <button className="btn btn-secondary btn-sm" onClick={addItem}>
                <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Item
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState icon="list_alt" message="No items added yet." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Proof URL</th>
                    <th>Proof Status</th>
                    {!isLocked && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const cat = selectedCatForItem(it.category_id)
                    return (
                      <tr key={it.id}>
                        <td>
                          <select className="form-control" style={{ minWidth: 180 }} value={it.category_id} disabled={isLocked}
                            onChange={e => updateItem(it.id, 'category_id', e.target.value)}>
                            <option value="">Select…</option>
                            {categories.filter(c => c.is_active || c.id === it.category_id).map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}{c.max_amount != null ? ` (max $${fmt(c.max_amount)})` : ''}
                              </option>
                            ))}
                          </select>
                          {cat?.max_amount != null && (
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                              Max: ${fmt(cat.max_amount)} {cat.currency}
                            </div>
                          )}
                        </td>
                        <td>
                          <input type="number" step="0.01" className="form-control" style={{ width: 110 }}
                            value={it.declared_amount} disabled={isLocked}
                            onChange={e => updateItem(it.id, 'declared_amount', e.target.value)} />
                        </td>
                        <td>
                          <input type="text" className="form-control" style={{ minWidth: 180 }}
                            value={it.proof_url} disabled={isLocked} placeholder="Optional link"
                            onChange={e => updateItem(it.id, 'proof_url', e.target.value)} />
                        </td>
                        <td>
                          <select className="form-control" style={{ width: 130 }} value={it.proof_status} disabled={isLocked}
                            onChange={e => updateItem(it.id, 'proof_status', e.target.value)}>
                            {PROOF_STATUSES.map(p => <option key={p}>{p}</option>)}
                          </select>
                        </td>
                        {!isLocked && (
                          <td>
                            <button className="btn btn-xs btn-danger" onClick={() => removeItem(it.id)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{
            padding: 10, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Total Declared</span>
            <strong style={{ color: 'var(--gold)', fontSize: 16 }}>${fmt(totalDeclared)} {declForm.currency}</strong>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowDecl(false)} disabled={savingDecl}>Close</button>
          {!isLocked && (
            <button className="btn btn-primary" onClick={handleSaveDecl} disabled={savingDecl}>
              {savingDecl ? 'Saving…' : editDecl ? 'Save Changes' : 'Create Declaration'}
            </button>
          )}
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={!!rejectRow} onClose={() => setRejectRow(null)} title="Reject Declaration">
        {rejectRow && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
              <div><strong>#:</strong> {rejectRow.declaration_number}</div>
              <div><strong>Employee:</strong> {rejectRow.employees?.name}</div>
              <div><strong>Total:</strong> ${fmt(rejectRow.total_declared)} {rejectRow.currency}</div>
            </div>
            <div className="form-group">
              <label>Rejection Reason *</label>
              <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why is this being rejected?" />
            </div>
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectRow(null)} disabled={acting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={acting}>
            {acting ? 'Rejecting…' : 'Confirm Reject'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDelCat} onClose={() => setConfirmDelCat(null)} onConfirm={handleDeleteCat}
        title="Delete Category" message={`Delete "${confirmDelCat?.name}"? This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />

      <ConfirmDialog
        open={!!confirmSubmit} onClose={() => setConfirmSubmit(null)} onConfirm={handleSubmit}
        title="Submit Declaration"
        message={`Submit ${confirmSubmit?.declaration_number}? Once submitted, items cannot be edited.`}
        confirmLabel={acting ? 'Submitting…' : 'Submit'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmApprove} onClose={() => setConfirmApprove(null)} onConfirm={handleApprove}
        title="Approve Declaration"
        message={`Approve ${confirmApprove?.declaration_number} for ${confirmApprove?.employees?.name}? Total: $${fmt(confirmApprove?.total_declared)} ${confirmApprove?.currency}.`}
        confirmLabel={acting ? 'Approving…' : 'Approve'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmDelDecl} onClose={() => setConfirmDelDecl(null)} onConfirm={handleDeleteDecl}
        title="Delete Declaration"
        message={`Delete declaration ${confirmDelDecl?.declaration_number}? Items will be removed. This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />
    </div>
  )
}
