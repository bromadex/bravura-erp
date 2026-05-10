// src/pages/Inventory/Categories.jsx
//
// IMPROVEMENTS:
// 1. Edit button — rename category, change icon
// 2. Click category card → see all items in that category
// 3. Item count per category
// 4. Icon picker (curated list)
// 5. Visual card grid instead of plain table

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const ICON_OPTIONS = [
  { icon: 'category',             label: 'General'        },
  { icon: 'construction',         label: 'Construction'   },
  { icon: 'electrical_services',  label: 'Electrical'     },
  { icon: 'handyman',             label: 'Mechanical'     },
  { icon: 'safety_vest',          label: 'Safety/PPE'     },
  { icon: 'local_gas_station',    label: 'Fuel'           },
  { icon: 'bolt',                 label: 'Power'          },
  { icon: 'water_drop',           label: 'Fluids'         },
  { icon: 'build',                label: 'Tools'          },
  { icon: 'kitchen',              label: 'Consumables'    },
  { icon: 'science',              label: 'Chemicals'      },
  { icon: 'inventory_2',          label: 'Stores'         },
  { icon: 'plumbing',             label: 'Plumbing'       },
  { icon: 'grid_view',            label: 'Structural'     },
  { icon: 'computer',             label: 'IT'             },
  { icon: 'local_shipping',       label: 'Logistics'      },
]

function getMaterialIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('construct') || n.includes('civil'))    return 'construction'
  if (n.includes('electrical') || n.includes('cable'))   return 'electrical_services'
  if (n.includes('mechanic') || n.includes('maintenar')) return 'handyman'
  if (n.includes('ppe') || n.includes('safe'))           return 'safety_vest'
  if (n.includes('fuel') || n.includes('oil'))           return 'local_gas_station'
  if (n.includes('chem'))                                return 'science'
  if (n.includes('plumb'))                               return 'plumbing'
  if (n.includes('it') || n.includes('comput'))          return 'computer'
  if (n.includes('tool'))                                return 'build'
  return 'category'
}

export default function Categories() {
  const canEdit   = useCanEdit('inventory', 'categories')
  const canDelete = useCanDelete('inventory', 'categories')

  const [categories,    setCategories]    = useState([])
  const [items,         setItems]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [editing,       setEditing]       = useState(null)
  const [selectedCat,   setSelectedCat]   = useState(null)   // click to view items
  const [form,          setForm]          = useState({ name: '', icon: 'category' })

  const fetchAll = async () => {
    setLoading(true)
    const [catRes, itemRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('items').select('id, name, balance, unit, category, item_code, threshold').order('name'),
    ])
    if (catRes.data) setCategories(catRes.data)
    if (itemRes.data) setItems(itemRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => { setEditing(null); setForm({ name: '', icon: 'category' }); setShowModal(true) }
  const openEdit   = (cat) => { setEditing(cat); setForm({ name: cat.name, icon: cat.icon || getMaterialIcon(cat.name) }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Category name required')
    try {
      if (editing) {
        // Update category record
        await supabase.from('categories').update({ name: form.name, icon: form.icon }).eq('name', editing.name)
        // If name changed, update all items in this category
        if (form.name !== editing.name) {
          await supabase.from('items').update({ category: form.name }).eq('category', editing.name)
        }
        toast.success('Category updated')
      } else {
        const icon = form.icon || getMaterialIcon(form.name)
        const { error } = await supabase.from('categories').insert([{ name: form.name, icon }])
        if (error) { toast.error(error.message); return }
        toast.success('Category added')
      }
      setShowModal(false)
      setEditing(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (name) => {
    const inUse = items.filter(i => i.category === name).length
    if (inUse > 0) { toast.error(`Cannot delete "${name}" — ${inUse} item(s) use this category. Re-categorise them first.`); return }
    if (!window.confirm(`Delete category "${name}"?`)) return
    await supabase.from('categories').delete().eq('name', name)
    toast.success('Deleted')
    await fetchAll()
  }

  // Items in the selected category
  const categoryItems = selectedCat ? items.filter(i => i.category === selectedCat) : []

  // Count items per category
  const countMap = {}
  items.forEach(i => { countMap[i.category] = (countMap[i.category] || 0) + 1 })

  return (
    <div>
      <PageHeader title="Categories">
        {canEdit && (
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="material-icons">add</span> Add Category
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Categories" value={categories.length} />
        <KPICard label="Total Items" value={items.length} />
        <KPICard label="Low Stock" value={items.filter(i => i.balance > 0 && i.balance <= (i.threshold || 5)).length} color="yellow" />
        <KPICard label="Out of Stock" value={items.filter(i => i.balance <= 0).length} color="red" />
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {categories.length === 0 ? (
            <EmptyState icon="category" message="No categories yet" />
          ) : categories.map(cat => {
            const count   = countMap[cat.name] || 0
            const icon    = cat.icon || getMaterialIcon(cat.name)
            const isSelected = selectedCat === cat.name
            return (
              <div key={cat.name} className="card"
                onClick={() => setSelectedCat(isSelected ? null : cat.name)}
                style={{ padding: 16, cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--gold)' : undefined, background: isSelected ? 'rgba(244,162,97,.06)' : 'var(--surface)', transition: 'all .15s' }}
                onMouseOver={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.2)' }}
                onMouseOut={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = '' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(244,162,97,.12)', border: '1px solid rgba(244,162,97,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 22, color: 'var(--gold)' }}>{icon}</span>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="btn-group-sm" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(cat)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canDelete && count === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.name)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                    {count} item{count !== 1 ? 's' : ''}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
                    ▼ showing items below
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Items in selected category */}
      {selectedCat && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>
              <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>
                {categories.find(c => c.name === selectedCat)?.icon || getMaterialIcon(selectedCat)}
              </span>
              {selectedCat} — {categoryItems.length} item{categoryItems.length !== 1 ? 's' : ''}
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCat(null)}>
              <span className="material-icons" style={{ fontSize: 14 }}>close</span> Close
            </button>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Code</th><th>Item Name</th><th>Unit</th><th>Balance</th><th>Reorder At</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {categoryItems.length === 0 ? (
                    <tr><td colSpan="6"><EmptyState icon="inventory_2" message="No items in this category" /></td></tr>
                  ) : categoryItems.map(item => {
                    const isOut = item.balance <= 0
                    const isLow = item.balance > 0 && item.balance <= (item.threshold || 5)
                    return (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)' }}>{item.item_code || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{item.unit || 'pcs'}</td>
                        <td className="td-mono" style={{ color: isOut ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>{item.balance}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{item.threshold || 5}</td>
                        <td>
                          {isOut  ? <span className="badge badge-red">OUT</span>
                          : isLow ? <span className="badge badge-yellow">LOW</span>
                          :         <span className="badge badge-green">OK</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <ModalDialog open onClose={() => setShowModal(false)} title={`${editing ? 'Edit' : 'Add'} Category`}>
          <div className="form-group">
            <label>Category Name *</label>
            <input className="form-control" required autoFocus placeholder="e.g. Electrical, PPE, Construction"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Icon</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ICON_OPTIONS.map(opt => (
                <button key={opt.icon} type="button"
                  onClick={() => setForm({ ...form, icon: opt.icon })}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${form.icon === opt.icon ? 'var(--gold)' : 'var(--border)'}`, background: form.icon === opt.icon ? 'rgba(244,162,97,.1)' : 'var(--surface2)', cursor: 'pointer' }}>
                  <span className="material-icons" style={{ fontSize: 22, color: form.icon === opt.icon ? 'var(--gold)' : 'var(--text-mid)' }}>{opt.icon}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          {editing && (
            <div style={{ padding: '8px 12px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 6, fontSize: 11, color: 'var(--yellow)', marginBottom: 8 }}>
              <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
              Renaming will update all {countMap[editing.name] || 0} items in this category.
            </div>
          )}
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editing ? 'Save Changes' : 'Add Category'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
