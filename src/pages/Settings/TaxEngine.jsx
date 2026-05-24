// src/pages/Settings/TaxEngine.jsx
// Tax Templates manager for procurement (Zambia context, VAT 16%).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

function emptyTemplateForm() {
  return { name: '', template_type: 'Purchase', is_default: false, is_active: true, description: '' }
}
function emptyLineForm() {
  return { sort_order: 0, charge_type: 'On Net Total', description: '', account_head: '', rate: '', tax_amount: '', included_in_price: false }
}

const TYPE_COLOR = {
  Purchase: 'var(--blue)',
  Sales:    'var(--green)',
  Both:     'var(--purple)',
}

const CHARGE_TYPES = ['On Net Total', 'On Previous Row Amount', 'Actual Amount']

export default function TaxEngine() {
  const [templates,        setTemplates]        = useState([])
  const [lines,            setLines]            = useState([])
  const [loading,          setLoading]          = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [modalOpen,        setModalOpen]        = useState(false)
  const [editing,          setEditing]          = useState(null)
  const [saving,           setSaving]           = useState(false)
  const [lineModal,        setLineModal]        = useState(false)
  const [editingLine,      setEditingLine]      = useState(null)
  const [form,             setForm]             = useState(emptyTemplateForm())
  const [lineForm,         setLineForm]         = useState(emptyLineForm())
  const [testAmount,       setTestAmount]       = useState('')

  const sf  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const slf = (k, v) => setLineForm(f => ({ ...f, [k]: v }))

  const loadData = useCallback(async () => {
    setLoading(true)
    const [tRes, lRes] = await Promise.all([
      supabase.from('tax_templates').select('*').order('name'),
      supabase.from('tax_template_lines').select('*').order('sort_order'),
    ])
    if (tRes.error) toast.error('Failed to load tax templates')
    else {
      setTemplates(tRes.data || [])
      if (!selectedTemplate && tRes.data?.length) setSelectedTemplate(tRes.data[0])
    }
    if (!lRes.error) setLines(lRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Template CRUD ────────────────────────────────────────────────────────────

  const openNewTemplate = () => {
    setEditing(null)
    setForm(emptyTemplateForm())
    setModalOpen(true)
  }

  const openEditTemplate = (t) => {
    setEditing(t)
    setForm({
      name:          t.name,
      template_type: t.template_type,
      is_default:    t.is_default,
      is_active:     t.is_active,
      description:   t.description || '',
    })
    setModalOpen(true)
  }

  const handleSaveTemplate = async () => {
    if (!form.name.trim()) return toast.error('Template name is required')
    setSaving(true)
    try {
      if (form.is_default) {
        await supabase
          .from('tax_templates')
          .update({ is_default: false })
          .neq('id', editing?.id || '00000000-0000-0000-0000-000000000000')
      }
      const payload = {
        name:          form.name.trim(),
        template_type: form.template_type,
        is_default:    form.is_default,
        is_active:     form.is_active,
        description:   form.description.trim(),
        updated_at:    new Date().toISOString(),
      }
      let error
      if (editing) {
        ;({ error } = await supabase.from('tax_templates').update(payload).eq('id', editing.id))
      } else {
        ;({ error } = await supabase.from('tax_templates').insert({ ...payload, created_at: new Date().toISOString() }))
      }
      if (error) { toast.error(error.message); return }
      toast.success(editing ? 'Template updated' : 'Template created')
      setModalOpen(false)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (t) => {
    const { error } = await supabase
      .from('tax_templates')
      .update({ is_active: !t.is_active, updated_at: new Date().toISOString() })
      .eq('id', t.id)
    if (error) toast.error(error.message)
    else {
      toast.success(t.is_active ? 'Template deactivated' : 'Template activated')
      await loadData()
    }
  }

  const handleDeleteTemplate = async (id) => {
    const attached = lines.filter(l => l.template_id === id)
    if (attached.length) return toast.error('Remove all tax lines before deleting the template')
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    const { error } = await supabase.from('tax_templates').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('Template deleted')
      if (selectedTemplate?.id === id) setSelectedTemplate(null)
      await loadData()
    }
  }

  // ── Line CRUD ────────────────────────────────────────────────────────────────

  const openNewLine = () => {
    setEditingLine(null)
    const existing = lines.filter(l => l.template_id === selectedTemplate?.id)
    setLineForm({ ...emptyLineForm(), sort_order: existing.length + 1 })
    setLineModal(true)
  }

  const openEditLine = (line) => {
    setEditingLine(line)
    setLineForm({
      sort_order:        line.sort_order,
      charge_type:       line.charge_type,
      description:       line.description || '',
      account_head:      line.account_head || '',
      rate:              line.rate ?? '',
      tax_amount:        line.tax_amount ?? '',
      included_in_price: line.included_in_price || false,
    })
    setLineModal(true)
  }

  const handleSaveLine = async () => {
    if (!lineForm.description.trim()) return toast.error('Description is required')
    if (!selectedTemplate) return toast.error('No template selected')
    setSaving(true)
    try {
      const payload = {
        template_id:       selectedTemplate.id,
        sort_order:        Number(lineForm.sort_order) || 0,
        charge_type:       lineForm.charge_type,
        description:       lineForm.description.trim(),
        account_head:      lineForm.account_head.trim(),
        rate:              lineForm.charge_type !== 'Actual Amount' ? (parseFloat(lineForm.rate) || null) : null,
        tax_amount:        lineForm.charge_type === 'Actual Amount'  ? (parseFloat(lineForm.tax_amount) || null) : null,
        included_in_price: lineForm.included_in_price,
        updated_at:        new Date().toISOString(),
      }
      let error
      if (editingLine) {
        ;({ error } = await supabase.from('tax_template_lines').update(payload).eq('id', editingLine.id))
      } else {
        ;({ error } = await supabase.from('tax_template_lines').insert({ ...payload, created_at: new Date().toISOString() }))
      }
      if (error) { toast.error(error.message); return }
      toast.success(editingLine ? 'Line updated' : 'Line added')
      setLineModal(false)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLine = async (id) => {
    if (!window.confirm('Delete this tax line?')) return
    const { error } = await supabase.from('tax_template_lines').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Line deleted'); await loadData() }
  }

  // ── Tax Calculator ───────────────────────────────────────────────────────────

  const selectedLines = selectedTemplate
    ? lines.filter(l => l.template_id === selectedTemplate.id).sort((a, b) => a.sort_order - b.sort_order)
    : []

  const netAmount = parseFloat(testAmount) || 0

  const calcBreakdown = () => {
    const breakdown = []
    let prevRowAmount = netAmount
    for (const line of selectedLines) {
      let amt = 0
      if (line.charge_type === 'On Net Total') {
        amt = (line.rate / 100) * netAmount
      } else if (line.charge_type === 'On Previous Row Amount') {
        amt = (line.rate / 100) * prevRowAmount
      } else if (line.charge_type === 'Actual Amount') {
        amt = line.tax_amount || 0
      }
      breakdown.push({ ...line, computed: amt })
      prevRowAmount = amt
    }
    return breakdown
  }

  const breakdown  = netAmount > 0 ? calcBreakdown() : []
  const totalTax   = breakdown.reduce((s, b) => s + b.computed, 0)
  const grandTotal = netAmount + totalTax

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Tax Engine"
        subtitle="Manage purchase tax templates — VAT, withholding tax, levies"
      >
        <button className="btn btn-primary" onClick={openNewTemplate}>
          <span className="material-icons">add</span> New Template
        </button>
      </PageHeader>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* ── LEFT: Template List ── */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{
              fontWeight: 700, fontSize: 13, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10,
            }}>
              Templates
            </div>

            {templates.length === 0 ? (
              <EmptyState
                icon="receipt_long"
                message="No templates yet"
                action={{ label: 'New Template', onClick: openNewTemplate }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => {
                  const isSelected = selectedTemplate?.id === t.id
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      style={{
                        background:   'var(--surface)',
                        border:       `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                        borderLeft:   isSelected ? '4px solid var(--gold)' : '4px solid transparent',
                        borderRadius: 8,
                        padding:      '12px 14px',
                        cursor:       'pointer',
                        opacity:      t.is_active ? 1 : 0.55,
                        transition:   'border-color .15s',
                      }}
                    >
                      {/* Name row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t.name}</span>
                        {t.is_default && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--gold)',
                            background: 'color-mix(in srgb, var(--gold) 12%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)',
                            borderRadius: 4, padding: '1px 6px', letterSpacing: '.05em',
                          }}>
                            DEFAULT
                          </span>
                        )}
                      </div>

                      {/* Type badge + status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: TYPE_COLOR[t.template_type] || 'var(--text-dim)',
                          background: `color-mix(in srgb, ${TYPE_COLOR[t.template_type] || 'var(--text-dim)'} 12%, transparent)`,
                          borderRadius: 4, padding: '1px 7px',
                        }}>
                          {t.template_type}
                        </span>
                        <span style={{ fontSize: 11, color: t.is_active ? 'var(--green)' : 'var(--text-dim)', marginLeft: 'auto' }}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {t.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
                          {t.description}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={e => { e.stopPropagation(); openEditTemplate(t) }}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span> Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: t.is_active ? 'var(--red)' : 'var(--green)' }}
                          onClick={e => { e.stopPropagation(); handleToggleActive(t) }}
                        >
                          {t.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--red)', marginLeft: 'auto' }}
                          onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: Lines Panel ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selectedTemplate ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
                <span className="material-icons" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 10 }}>
                  receipt_long
                </span>
                Select a template to view its lines
              </div>
            ) : (
              <>
                {/* Lines table card */}
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Tax Lines — {selectedTemplate.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {selectedLines.length} line{selectedLines.length !== 1 ? 's' : ''} configured
                      </div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={openNewLine}>
                      <span className="material-icons">add</span> Add Line
                    </button>
                  </div>

                  {selectedLines.length === 0 ? (
                    <EmptyState
                      icon="functions"
                      message="No tax lines — add VAT, withholding tax, or levies"
                      action={{ label: 'Add Line', onClick: openNewLine }}
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="stock-table">
                        <thead>
                          <tr>
                            <th style={{ width: 48 }}>Sort #</th>
                            <th>Charge Type</th>
                            <th>Description</th>
                            <th>Account Head</th>
                            <th style={{ textAlign: 'right' }}>Rate %</th>
                            <th style={{ textAlign: 'center' }}>Included in Price</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLines.map(line => (
                            <tr key={line.id}>
                              <td style={{ fontFamily: 'var(--mono)', textAlign: 'center', color: 'var(--text-dim)' }}>
                                {line.sort_order}
                              </td>
                              <td>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, color: 'var(--teal)',
                                  background: 'color-mix(in srgb, var(--teal) 10%, transparent)',
                                  borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap',
                                }}>
                                  {line.charge_type}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>{line.description}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                                {line.account_head || '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                                {line.charge_type === 'Actual Amount'
                                  ? <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 11 }}>K {line.tax_amount ?? '—'}</span>
                                  : `${line.rate ?? '—'}%`
                                }
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span
                                  className="material-icons"
                                  style={{ fontSize: 16, color: line.included_in_price ? 'var(--green)' : 'var(--border2)' }}
                                >
                                  {line.included_in_price ? 'check_circle' : 'radio_button_unchecked'}
                                </span>
                              </td>
                              <td>
                                <div className="btn-group">
                                  <button className="btn btn-secondary btn-sm" onClick={() => openEditLine(line)}>
                                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ color: 'var(--red)' }}
                                    onClick={() => handleDeleteLine(line.id)}
                                  >
                                    <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Tax Calculator ── */}
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '20px 24px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>calculate</span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Tax Calculator</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>
                      — test against {selectedTemplate.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div className="form-group" style={{ margin: 0, flex: '0 0 240px' }}>
                      <label style={{ fontSize: 12 }}>Test Amount (K)</label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="e.g. 10000"
                        value={testAmount}
                        onChange={e => setTestAmount(e.target.value)}
                        style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {netAmount > 0 && (
                    <div className="table-wrap">
                      <table className="stock-table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th>Description</th>
                            <th>Charge Type</th>
                            <th style={{ textAlign: 'right' }}>Rate %</th>
                            <th style={{ textAlign: 'right' }}>Amount (K)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ background: 'color-mix(in srgb, var(--surface2) 60%, transparent)' }}>
                            <td style={{ fontWeight: 600 }}>Net Amount</td>
                            <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>—</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                              {netAmount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          {breakdown.map(b => (
                            <tr key={b.id}>
                              <td>{b.description}</td>
                              <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{b.charge_type}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                                {b.charge_type === 'Actual Amount' ? '—' : `${b.rate}%`}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
                                {b.computed.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid var(--border2)', background: 'color-mix(in srgb, var(--gold) 6%, transparent)' }}>
                            <td colSpan={3} style={{ fontWeight: 700, textAlign: 'right', paddingRight: 12 }}>Total Tax</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                              {totalTax.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr style={{ background: 'color-mix(in srgb, var(--green) 8%, transparent)' }}>
                            <td colSpan={3} style={{ fontWeight: 700, textAlign: 'right', paddingRight: 12 }}>Grand Total (incl. Tax)</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--green)' }}>
                              {grandTotal.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {netAmount <= 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Enter an amount above to see the tax breakdown.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Template Modal ── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Template · ${editing.name}` : 'New Tax Template'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Template Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={form.name}
              onChange={e => sf('name', e.target.value)}
              placeholder="e.g. Standard VAT 16%"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Template Type</label>
            <select className="form-control" value={form.template_type} onChange={e => sf('template_type', e.target.value)}>
              <option value="Purchase">Purchase</option>
              <option value="Sales">Sales</option>
              <option value="Both">Both</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Description</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.description}
              onChange={e => sf('description', e.target.value)}
              placeholder="Optional notes about this template"
            />
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.is_default} onChange={e => sf('is_default', e.target.checked)} />
              <span>Set as Default</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.is_active} onChange={e => sf('is_active', e.target.checked)} />
              <span>Active</span>
            </label>
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Line Modal ── */}
      <ModalDialog
        open={lineModal}
        onClose={() => setLineModal(false)}
        title={editingLine ? 'Edit Tax Line' : `Add Tax Line · ${selectedTemplate?.name || ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sort #</label>
              <input
                type="number"
                min={0}
                className="form-control"
                style={{ fontFamily: 'var(--mono)' }}
                value={lineForm.sort_order}
                onChange={e => slf('sort_order', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Charge Type</label>
              <select className="form-control" value={lineForm.charge_type} onChange={e => slf('charge_type', e.target.value)}>
                {CHARGE_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Description <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={lineForm.description}
              onChange={e => slf('description', e.target.value)}
              placeholder="e.g. VAT 16%, WHT 15%"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Account Head</label>
            <input
              className="form-control"
              style={{ fontFamily: 'var(--mono)' }}
              value={lineForm.account_head}
              onChange={e => slf('account_head', e.target.value)}
              placeholder="e.g. 2200-VAT-PAYABLE"
            />
          </div>

          {lineForm.charge_type !== 'Actual Amount' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Rate (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="form-control"
                style={{ fontFamily: 'var(--mono)' }}
                value={lineForm.rate}
                onChange={e => slf('rate', e.target.value)}
                placeholder="e.g. 16"
              />
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>Percentage applied to the base amount</small>
            </div>
          )}

          {lineForm.charge_type === 'Actual Amount' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Fixed Tax Amount (K)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-control"
                style={{ fontFamily: 'var(--mono)' }}
                value={lineForm.tax_amount}
                onChange={e => slf('tax_amount', e.target.value)}
                placeholder="e.g. 250.00"
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={lineForm.included_in_price}
              onChange={e => slf('included_in_price', e.target.checked)}
            />
            <span>Included in Price (tax is already embedded in the net amount)</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setLineModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveLine} disabled={saving}>
            {saving ? 'Saving…' : editingLine ? 'Update Line' : 'Add Line'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
