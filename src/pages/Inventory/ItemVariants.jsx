// src/pages/Inventory/ItemVariants.jsx
// Phase 13 — Item Variant Templates & Variant Matrix

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

const fmt = (d) => (d ? String(d).slice(0, 10) : '—')

function AttrsChips({ attrs = [] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {attrs.map((a) => (
        <span key={a} style={{
          background: 'rgba(96,165,250,.12)',
          color: 'var(--blue)',
          fontSize: 10,
          fontFamily: 'var(--mono)',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: 20,
          border: '1px solid rgba(96,165,250,.2)',
        }}>{a}</span>
      ))}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ItemVariants() {
  // ── data state ────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([])
  const [variants,  setVariants]  = useState([])
  const [items,     setItems]     = useState([])
  const [loading,   setLoading]   = useState(true)

  // ── selection ─────────────────────────────────────────────────────────────
  const [selectedTpl, setSelectedTpl] = useState(null)

  // ── modals ────────────────────────────────────────────────────────────────
  const [tplModal,  setTplModal]  = useState(false)
  const [varModal,  setVarModal]  = useState(false)
  const [saving,    setSaving]    = useState(false)

  // ── template form ─────────────────────────────────────────────────────────
  const [tplForm, setTplForm] = useState({
    name: '', description: '', category: '', unit: 'pcs',
    variant_attributes: '', has_variants: true,
  })

  // ── variant form ──────────────────────────────────────────────────────────
  const [varForm, setVarForm] = useState({})        // dynamic attrs
  const [varLinkItem, setVarLinkItem]   = useState('')
  const [varAutoCreate, setVarAutoCreate] = useState(false)

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: tpls }, { data: vars }, { data: its }] = await Promise.all([
      supabase.from('item_templates').select('*').order('name'),
      supabase.from('item_variants').select('*, items(id,name,item_code)').order('created_at'),
      supabase.from('items').select('id,name,item_code,unit,category').order('name'),
    ])
    setTemplates(tpls || [])
    setVariants(vars || [])
    setItems(its || [])
    setLoading(false)
  }

  // ── derived state ─────────────────────────────────────────────────────────
  const tplVariants = useMemo(
    () => variants.filter((v) => v.template_id === selectedTpl?.id),
    [variants, selectedTpl]
  )

  const unlinked = useMemo(
    () => variants.filter((v) => !v.item_id).length,
    [variants]
  )

  const activeTpls = useMemo(
    () => templates.filter((t) => t.is_active).length,
    [templates]
  )

  // ── create template ───────────────────────────────────────────────────────
  async function handleCreateTemplate() {
    if (!tplForm.name.trim()) return toast.error('Template name is required')
    setSaving(true)
    const attrs = tplForm.variant_attributes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const newId = uid()
    const { error } = await supabase.from('item_templates').insert({
      id: newId,
      name: tplForm.name.trim(),
      description: tplForm.description.trim() || null,
      category: tplForm.category.trim() || null,
      unit: tplForm.unit || 'pcs',
      variant_attributes: attrs,
      has_variants: tplForm.has_variants,
      is_active: true,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Template created')
    setTplModal(false)
    setTplForm({ name: '', description: '', category: '', unit: 'pcs', variant_attributes: '', has_variants: true })
    await loadAll()
  }

  // ── open variant modal ────────────────────────────────────────────────────
  function openVarModal() {
    if (!selectedTpl) return
    const initForm = {}
    ;(selectedTpl.variant_attributes || []).forEach((a) => { initForm[a] = '' })
    setVarForm(initForm)
    setVarLinkItem('')
    setVarAutoCreate(false)
    setVarModal(true)
  }

  // ── create variant ────────────────────────────────────────────────────────
  async function handleCreateVariant() {
    if (!selectedTpl) return
    const attrs = selectedTpl.variant_attributes || []
    for (const a of attrs) {
      if (!varForm[a]?.trim()) return toast.error(`${a} is required`)
    }
    setSaving(true)

    let itemId = varLinkItem || null

    // auto-create item
    if (varAutoCreate && !itemId) {
      const attrLabel = attrs.map((a) => varForm[a]).join(' - ')
      const itemName  = `${selectedTpl.name} - ${attrLabel}`
      const newItemId = uid()
      const { error: ie } = await supabase.from('items').insert({
        id: newItemId,
        name: itemName,
        item_code: newItemId.slice(0, 8).toUpperCase(),
        unit: selectedTpl.unit || 'pcs',
        category: selectedTpl.category || null,
      })
      if (ie) { setSaving(false); return toast.error('Failed to create item: ' + ie.message) }
      itemId = newItemId
    }

    const { error } = await supabase.from('item_variants').insert({
      id: uid(),
      template_id: selectedTpl.id,
      item_id: itemId,
      attributes: varForm,
      is_active: true,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Variant added')
    setVarModal(false)
    await loadAll()
  }

  // ── toggle variant active ─────────────────────────────────────────────────
  async function toggleVariant(v) {
    const { error } = await supabase.from('item_variants').update({ is_active: !v.is_active }).eq('id', v.id)
    if (error) return toast.error(error.message)
    setVariants((prev) => prev.map((x) => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
  }

  // ── delete variant ────────────────────────────────────────────────────────
  async function deleteVariant(id) {
    if (!window.confirm('Delete this variant?')) return
    const { error } = await supabase.from('item_variants').delete().eq('id', id)
    if (error) return toast.error(error.message)
    setVariants((prev) => prev.filter((v) => v.id !== id))
    toast.success('Variant deleted')
  }

  // ── toggle template active ────────────────────────────────────────────────
  async function toggleTemplate(t) {
    const { error } = await supabase.from('item_templates').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) return toast.error(error.message)
    const updated = { ...t, is_active: !t.is_active }
    setTemplates((prev) => prev.map((x) => x.id === t.id ? updated : x))
    if (selectedTpl?.id === t.id) setSelectedTpl(updated)
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--text-dim)' }}>Loading item variants…</p>
      </div>
    )
  }

  const tplAttrs = selectedTpl?.variant_attributes || []

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Item Variant Templates"
        subtitle="Define variant attributes and manage variant matrices per template"
      >
        <button className="btn btn-primary btn-sm" onClick={() => setTplModal(true)}>
          <span className="material-icons md-18">add</span> New Template
        </button>
      </PageHeader>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 24 }}>
        <KPICard label="TOTAL TEMPLATES"  value={templates.length}  icon="category"       color="blue"  />
        <KPICard label="TOTAL VARIANTS"   value={variants.length}   icon="layers"         color="teal"  />
        <KPICard label="UNLINKED VARIANTS" value={unlinked}         icon="link_off"       color="yellow" />
        <KPICard label="ACTIVE TEMPLATES" value={activeTpls}        icon="check_circle"   color="green" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Left panel: template list ──────────────────────────────────── */}
        <div style={{
          width: 300, flexShrink: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Templates</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              {templates.length} total
            </span>
          </div>

          {templates.length === 0 ? (
            <EmptyState icon="category" message="No templates yet" />
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
              {templates.map((t) => {
                const tCount = variants.filter((v) => v.template_id === t.id).length
                const isSelected = selectedTpl?.id === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTpl(t)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(184,50,50,.08)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent',
                      transition: 'background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: t.is_active ? 'var(--text)' : 'var(--text-dim)' }}>
                          {t.name}
                        </div>
                        {t.category && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t.category}</div>
                        )}
                      </div>
                      <span style={{
                        background: 'rgba(96,165,250,.12)',
                        color: 'var(--blue)',
                        fontSize: 10,
                        fontFamily: 'var(--mono)',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 20,
                        minWidth: 24,
                        textAlign: 'center',
                      }}>{tCount}</span>
                    </div>
                    {(t.variant_attributes || []).length > 0 && (
                      <AttrsChips attrs={t.variant_attributes} />
                    )}
                    {!t.is_active && (
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 4, display: 'block' }}>
                        INACTIVE
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right panel: selected template ────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedTpl ? (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12,
            }}>
              <EmptyState icon="touch_app" message="Select a template from the list to manage its variants" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Template header card */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedTpl.name}</div>
                    {selectedTpl.description && (
                      <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{selectedTpl.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {selectedTpl.category && (
                        <span style={{
                          background: 'rgba(167,139,250,.12)',
                          color: 'var(--purple)',
                          fontSize: 10,
                          fontFamily: 'var(--mono)',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                        }}>{selectedTpl.category}</span>
                      )}
                      <span style={{
                        background: 'rgba(45,212,191,.12)',
                        color: 'var(--teal)',
                        fontSize: 10,
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 20,
                      }}>{selectedTpl.unit}</span>
                      <AttrsChips attrs={selectedTpl.variant_attributes || []} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`btn btn-sm ${selectedTpl.is_active ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => toggleTemplate(selectedTpl)}
                    >
                      <span className="material-icons md-18">{selectedTpl.is_active ? 'pause' : 'play_arrow'}</span>
                      {selectedTpl.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={openVarModal}>
                      <span className="material-icons md-18">add</span> Add Variant
                    </button>
                  </div>
                </div>
              </div>

              {/* Variant matrix */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 700, fontSize: 13,
                }}>
                  Variant Matrix
                  <span style={{
                    marginLeft: 8, fontSize: 10, color: 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                  }}>
                    {tplVariants.length} variant{tplVariants.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {tplVariants.length === 0 ? (
                  <EmptyState
                    icon="layers"
                    message="No variants yet"
                    action={{ label: 'Add First Variant', onClick: openVarModal }}
                  />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {tplAttrs.map((a) => (
                            <th key={a}>{a.toUpperCase()}</th>
                          ))}
                          <th>LINKED ITEM</th>
                          <th className="th-center">ACTIVE</th>
                          <th className="td-actions">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tplVariants.map((v) => {
                          const attrs = v.attributes || {}
                          return (
                            <tr key={v.id}>
                              {tplAttrs.map((a) => (
                                <td key={a}>
                                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>
                                    {attrs[a] || '—'}
                                  </span>
                                </td>
                              ))}
                              <td>
                                {v.items ? (
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 12 }}>{v.items.name}</div>
                                    {v.items.item_code && (
                                      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                                        {v.items.item_code}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--yellow)', fontSize: 11 }}>Unlinked</span>
                                )}
                              </td>
                              <td className="td-center">
                                <button
                                  className={`btn btn-sm btn-icon ${v.is_active ? 'btn-success' : 'btn-ghost'}`}
                                  onClick={() => toggleVariant(v)}
                                  title={v.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  <span className="material-icons md-18">
                                    {v.is_active ? 'toggle_on' : 'toggle_off'}
                                  </span>
                                </button>
                              </td>
                              <td className="td-actions">
                                <button
                                  className="btn btn-sm btn-danger btn-icon"
                                  onClick={() => deleteVariant(v.id)}
                                  title="Delete variant"
                                >
                                  <span className="material-icons md-18">delete</span>
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
            </div>
          )}
        </div>
      </div>

      {/* ── New Template Modal ─────────────────────────────────────────────── */}
      {tplModal && (
        <div className="overlay" onClick={() => setTplModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New Item Template</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Template Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Tyre, Cement Bag"
                  value={tplForm.name}
                  onChange={(e) => setTplForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  className="form-control"
                  placeholder="Optional description"
                  value={tplForm.description}
                  onChange={(e) => setTplForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <input
                    className="form-control"
                    placeholder="e.g. Tyres, Consumables"
                    value={tplForm.category}
                    onChange={(e) => setTplForm((p) => ({ ...p, category: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Base Unit</label>
                  <input
                    className="form-control"
                    placeholder="pcs, kg, L, etc."
                    value={tplForm.unit}
                    onChange={(e) => setTplForm((p) => ({ ...p, unit: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Variant Attributes (comma-separated)</label>
                <input
                  className="form-control"
                  placeholder="e.g. Size, Grade, Color"
                  value={tplForm.variant_attributes}
                  onChange={(e) => setTplForm((p) => ({ ...p, variant_attributes: e.target.value }))}
                />
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Each attribute becomes a column in the variant matrix.
                  Preview: {tplForm.variant_attributes.split(',').map((s) => s.trim()).filter(Boolean).join(' | ') || '—'}
                </span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setTplModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateTemplate} disabled={saving}>
                {saving ? 'Saving…' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Variant Modal ──────────────────────────────────────────────── */}
      {varModal && selectedTpl && (
        <div className="overlay" onClick={() => setVarModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Add Variant — <span style={{ color: 'var(--gold)' }}>{selectedTpl.name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tplAttrs.map((attr) => (
                <div className="form-group" key={attr}>
                  <label>{attr} *</label>
                  <input
                    className="form-control"
                    placeholder={`Enter ${attr}`}
                    value={varForm[attr] || ''}
                    onChange={(e) => setVarForm((p) => ({ ...p, [attr]: e.target.value }))}
                  />
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-mid)', marginBottom: 10 }}>
                  ITEM LINKING
                </div>
                <div className="form-group">
                  <label>Link to Existing Item</label>
                  <select
                    className="form-control"
                    value={varLinkItem}
                    onChange={(e) => { setVarLinkItem(e.target.value); if (e.target.value) setVarAutoCreate(false) }}
                    disabled={varAutoCreate}
                  >
                    <option value="">— None —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}{it.item_code ? ` (${it.item_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={varAutoCreate}
                    onChange={(e) => { setVarAutoCreate(e.target.checked); if (e.target.checked) setVarLinkItem('') }}
                    disabled={!!varLinkItem}
                  />
                  <span style={{ fontSize: 13 }}>Auto-create Item from template + attribute values</span>
                </label>
                {varAutoCreate && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px',
                    background: 'rgba(52,211,153,.08)',
                    border: '1px solid rgba(52,211,153,.2)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--text-dim)',
                  }}>
                    Will create item: <strong style={{ color: 'var(--text)' }}>
                      {selectedTpl.name} - {tplAttrs.map((a) => varForm[a] || `[${a}]`).join(' - ')}
                    </strong>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setVarModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateVariant} disabled={saving}>
                {saving ? 'Saving…' : 'Add Variant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
