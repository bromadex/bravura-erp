// src/pages/Accounting/ChartOfAccounts.jsx
import { useState } from 'react'
import { useAccounting } from '../../contexts/AccountingContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

const TYPES   = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']
const TYPE_COLOR = {
  Asset:     'var(--green)',
  Liability: 'var(--red)',
  Equity:    'var(--blue)',
  Revenue:   'var(--teal)',
  Expense:   'var(--yellow)',
}

const EMPTY_FORM = { code: '', name: '', type: 'Asset', description: '' }

export default function ChartOfAccounts() {
  const { accounts, addAccount, updateAccount, deleteAccount, loading } = useAccounting()
  const canEdit = useCanEdit('accounting', 'chart-of-accounts')

  const [filterType, setFilterType] = useState('ALL')
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)

  const filtered = accounts.filter(a => {
    if (filterType !== 'ALL' && a.type !== filterType) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.code.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code || !form.name) return toast.error('Code and name are required')
    setSaving(true)
    try {
      if (editing) { await updateAccount(editing.id, form); toast.success('Account updated') }
      else         { await addAccount(form);                  toast.success('Account added')   }
      setModal(false); setEditing(null)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({ code: a.code, name: a.name, type: a.type, description: a.description || '' })
    setModal(true)
  }

  const openNew = () => {
    setEditing(null); setForm(EMPTY_FORM); setModal(true)
  }

  const totals = TYPES.reduce((acc, t) => {
    acc[t] = accounts.filter(a => a.type === t).reduce((s, a) => s + (a.balance || 0), 0)
    return acc
  }, {})

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Chart of Accounts</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{accounts.length} accounts</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Account
          </button>
        )}
      </div>

      {/* Type KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
        {TYPES.map(t => (
          <div key={t} onClick={() => setFilterType(filterType === t ? 'ALL' : t)}
            style={{ background: 'var(--surface)', border: `1px solid ${filterType === t ? TYPE_COLOR[t] : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
            <div style={{ fontSize: 10, color: TYPE_COLOR[t], fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 4 }}>{t.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: TYPE_COLOR[t] }}>{fmt(totals[t])}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{accounts.filter(a => a.type === t).length} accounts</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-control" placeholder="Search code or name…" style={{ maxWidth: 220 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className={filterType === 'ALL' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setFilterType('ALL')}>All</button>
        {TYPES.map(t => (
          <button key={t} className={filterType === t ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            style={{ borderColor: filterType === t ? TYPE_COLOR[t] : undefined, color: filterType === t ? '#0b0f1a' : TYPE_COLOR[t] }}
            onClick={() => setFilterType(filterType === t ? 'ALL' : t)}>{t}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Balance</th>
                <th>Description</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No accounts found</td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: TYPE_COLOR[a.type] }}>{a.code}</td>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: `${TYPE_COLOR[a.type]}18`, border: `1px solid ${TYPE_COLOR[a.type]}44`, color: TYPE_COLOR[a.type], fontSize: 11, fontWeight: 700 }}>{a.type}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(a.balance)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.description || '—'}</td>
                  {canEdit && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                        <button className="btn btn-danger btn-sm"
                          onClick={async () => { if (!window.confirm(`Delete "${a.name}"?`)) return; await deleteAccount(a.id); toast.success('Deleted') }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <>
          <div onClick={() => { setModal(false); setEditing(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--purple)' }}>account_tree</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{editing ? 'Edit' : 'Add'} Account</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setModal(false); setEditing(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Code *</label>
                  <input required className="form-control" placeholder="1000" value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Name *</label>
                  <input required className="form-control" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-control" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setModal(false); setEditing(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
