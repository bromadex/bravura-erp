// OpeningStock.jsx — Post opening stock balances as SLEs
// voucher_type='OpeningStock', transaction_type='Receipt', actual_qty > 0
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../../components/ui'
import { fmtNum, dateTag } from '../../engine/reportingEngine'

const DEFAULT_WAREHOUSE = 'wh_main_store'
const blankLine = () => ({
  _key: crypto.randomUUID(),
  item_id: '', warehouse_id: DEFAULT_WAREHOUSE,
  qty: '', unit_cost: '',
  posting_date: new Date().toISOString().slice(0, 10),
})

export default function OpeningStock() {
  const [items,        setItems]        = useState([])
  const [warehouses,   setWarehouses]   = useState([])
  const [lines,        setLines]        = useState([blankLine()])
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  const [itemSearch,   setItemSearch]   = useState({})
  const [sessionPosted,setSessionPosted]= useState([])
  const [posted,       setPosted]       = useState([])
  const [loadingPosted,setLoadingPosted]= useState(false)
  const [activeTab,    setActiveTab]    = useState('session')

  useEffect(() => {
    supabase.from('items').select('id,name,item_code,unit,category').order('name')
      .then(({ data }) => setItems(data || []))
    supabase.from('warehouses').select('id,name').order('name')
      .then(({ data }) => setWarehouses(data || []))
  }, [])

  const loadPosted = useCallback(async () => {
    setLoadingPosted(true)
    const { data } = await supabase
      .from('stock_ledger_entries')
      .select('id,item_id,warehouse_id,actual_qty,incoming_rate,posting_datetime,voucher_no,items(name,unit),warehouses(name)')
      .eq('voucher_type', 'OpeningStock')
      .order('posting_datetime', { ascending: false })
      .limit(200)
    setPosted(data || [])
    setLoadingPosted(false)
  }, [])
  useEffect(() => { loadPosted() }, [loadPosted])

  const updateLine = (key, field, value) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l))
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n })
  }
  const addLine    = ()    => setLines(prev => [...prev, blankLine()])
  const removeLine = (key) => setLines(prev => prev.filter(l => l._key !== key))

  const validate = () => {
    const errs = {}
    lines.forEach(l => {
      const e = []
      if (!l.item_id)      e.push('Item required')
      if (!l.warehouse_id) e.push('Warehouse required')
      if (!l.qty || isNaN(+l.qty) || +l.qty <= 0) e.push('Qty must be > 0')
      if (l.unit_cost === '' || isNaN(+l.unit_cost) || +l.unit_cost < 0) e.push('Cost must be ≥ 0')
      if (!l.posting_date) e.push('Date required')
      if (e.length) errs[l._key] = e
    })
    return errs
  }

  const checkDuplicates = async () => {
    const dupes = []
    for (const l of lines) {
      const { data } = await supabase.from('stock_ledger_entries')
        .select('id').eq('item_id', l.item_id).eq('warehouse_id', l.warehouse_id)
        .eq('voucher_type', 'OpeningStock').limit(1)
      if (data?.length) {
        const item = items.find(i => i.id === l.item_id)
        dupes.push(item?.name || l.item_id)
      }
    }
    return dupes
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const dupes = await checkDuplicates()
    if (dupes.length) {
      const ok = window.confirm(
        `⚠️ Opening stock already exists for:\n${dupes.join(', ')}\n\nPosting again creates duplicates. Proceed?`
      )
      if (!ok) return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ref = `OS-${Date.now()}`
      const sles = lines.map(l => ({
        id: crypto.randomUUID(),
        item_id: l.item_id, warehouse_id: l.warehouse_id,
        actual_qty: +l.qty, incoming_rate: +l.unit_cost,
        outgoing_rate: 0, valuation_rate: +l.unit_cost,
        posting_datetime: new Date(l.posting_date).toISOString(),
        voucher_type: 'OpeningStock', transaction_type: 'Receipt',
        voucher_no: ref, is_cancelled: false,
        created_by: user?.email || 'system',
      }))
      const { error } = await supabase.from('stock_ledger_entries').insert(sles)
      if (error) throw error
      const enriched = sles.map(s => ({
        ...s,
        item_name: items.find(i => i.id === s.item_id)?.name || s.item_id,
        unit:      items.find(i => i.id === s.item_id)?.unit || '',
        wh_name:   warehouses.find(w => w.id === s.warehouse_id)?.name || s.warehouse_id,
      }))
      setSessionPosted(prev => [...enriched, ...prev])
      setLines([blankLine()])
      setItemSearch({})
      setErrors({})
      loadPosted()
    } catch (err) {
      alert('Error posting opening stock: ' + (err.message || err))
    } finally { setSaving(false) }
  }

  const filteredItems = (key) => {
    const q = (itemSearch[key] || '').toLowerCase()
    if (!q) return items.slice(0, 30)
    return items.filter(i =>
      i.name?.toLowerCase().includes(q) || i.item_code?.toLowerCase().includes(q)
    ).slice(0, 30)
  }

  const totalQty   = lines.reduce((s, l) => s + (+l.qty || 0), 0)
  const totalValue = lines.reduce((s, l) => s + (+l.qty || 0) * (+l.unit_cost || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <PageHeader
        title="Opening Stock"
        subtitle="Post initial inventory balances as Stock Ledger Entries — do this once per item/warehouse before going live"
        actions={
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Posting…' : 'Post Opening Stock'}
          </button>
        }
      />

      {/* Warning */}
      <div style={{
        background: 'color-mix(in srgb, var(--yellow) 15%, transparent)',
        border: '1px solid var(--yellow)', borderRadius: 8,
        padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10,
      }}>
        <span className="material-icons" style={{ color: 'var(--yellow)', marginTop: 2 }}>warning</span>
        <div>
          <strong style={{ color: 'var(--yellow)' }}>One-time operation</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: 13 }}>
            Opening stock should be posted <em>once</em> per item/warehouse before transactions begin.
            Check the <strong>Already Posted</strong> tab before proceeding to avoid duplicates.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        {/* LEFT: Entry form */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Stock Lines ({lines.length})</span>
            <button className="btn btn-secondary btn-sm" onClick={addLine}>
              <span className="material-icons">add</span> Add Line
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['Item', 'Warehouse', 'Qty', 'Unit Cost (USD)', 'Date', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line._key} style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Item search */}
                    <td style={{ padding: '6px 8px', minWidth: 200, position: 'relative' }}>
                      <input
                        className="form-control" style={{ fontSize: 12 }}
                        placeholder="Search item…"
                        value={
                          itemSearch[line._key] !== undefined
                            ? itemSearch[line._key]
                            : (items.find(i => i.id === line.item_id)?.name || '')
                        }
                        onChange={e => {
                          setItemSearch(p => ({ ...p, [line._key]: e.target.value }))
                          if (!e.target.value) updateLine(line._key, 'item_id', '')
                        }}
                        onFocus={() => setItemSearch(p => ({ ...p, [line._key]: p[line._key] ?? '' }))}
                        onBlur={() => {
                          setTimeout(() => {
                            if (!line.item_id)
                              setItemSearch(p => { const n = { ...p }; delete n[line._key]; return n })
                          }, 200)
                        }}
                      />
                      {itemSearch[line._key] !== undefined && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 8, right: 8, zIndex: 100,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 6, maxHeight: 180, overflowY: 'auto',
                          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
                        }}>
                          {filteredItems(line._key).length === 0 && (
                            <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>No items found</div>
                          )}
                          {filteredItems(line._key).map(item => (
                            <div
                              key={item.id}
                              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              onMouseDown={() => {
                                updateLine(line._key, 'item_id', item.id)
                                setItemSearch(p => { const n = { ...p }; delete n[line._key]; return n })
                              }}
                            >
                              <strong>{item.name}</strong>
                              {item.item_code && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{item.item_code}</span>}
                              {item.unit && <span style={{ color: 'var(--teal)', marginLeft: 6, fontSize: 11 }}>{item.unit}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {errors[line._key]?.filter(e => e.includes('Item')).map(e => (
                        <div key={e} style={{ color: 'var(--red)', fontSize: 11, marginTop: 2 }}>{e}</div>
                      ))}
                    </td>

                    {/* Warehouse */}
                    <td style={{ padding: '6px 8px', minWidth: 130 }}>
                      <select className="form-control" style={{ fontSize: 12 }}
                        value={line.warehouse_id}
                        onChange={e => updateLine(line._key, 'warehouse_id', e.target.value)}
                      >
                        <option value="">Select…</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '6px 8px', width: 90 }}>
                      <input className="form-control" style={{ fontSize: 12 }}
                        type="number" min="0.001" step="any" placeholder="0"
                        value={line.qty}
                        onChange={e => updateLine(line._key, 'qty', e.target.value)}
                      />
                      {errors[line._key]?.filter(e => e.includes('Qty')).map(e => (
                        <div key={e} style={{ color: 'var(--red)', fontSize: 11, marginTop: 2 }}>{e}</div>
                      ))}
                    </td>

                    {/* Unit cost */}
                    <td style={{ padding: '6px 8px', width: 120 }}>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 12 }}>$</span>
                        <input className="form-control" style={{ fontSize: 12, paddingLeft: 20 }}
                          type="number" min="0" step="any" placeholder="0.00"
                          value={line.unit_cost}
                          onChange={e => updateLine(line._key, 'unit_cost', e.target.value)}
                        />
                      </div>
                      {errors[line._key]?.filter(e => e.includes('Cost')).map(e => (
                        <div key={e} style={{ color: 'var(--red)', fontSize: 11, marginTop: 2 }}>{e}</div>
                      ))}
                    </td>

                    {/* Date */}
                    <td style={{ padding: '6px 8px', width: 130 }}>
                      <input className="form-control" style={{ fontSize: 12 }}
                        type="date" value={line.posting_date}
                        onChange={e => updateLine(line._key, 'posting_date', e.target.value)}
                      />
                    </td>

                    {/* Remove */}
                    <td style={{ padding: '6px 8px', width: 40, textAlign: 'center' }}>
                      {lines.length > 1 && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => removeLine(line._key)} title="Remove line"
                          style={{ color: 'var(--red)', padding: '2px 4px' }}
                        >
                          <span className="material-icons" style={{ fontSize: 16 }}>delete_outline</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer totals */}
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: 24, fontSize: 13 }}>
            <span style={{ color: 'var(--text-dim)' }}>Lines: <strong style={{ color: 'var(--text)' }}>{lines.length}</strong></span>
            <span style={{ color: 'var(--text-dim)' }}>Total Qty: <strong style={{ color: 'var(--text)' }}>{fmtNum(totalQty)}</strong></span>
            <span style={{ color: 'var(--text-dim)' }}>Total Value: <strong style={{ color: 'var(--green)' }}>$ {fmtNum(totalValue)}</strong></span>
          </div>
        </div>

        {/* RIGHT: Session / History */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'session', label: `This Session (${sessionPosted.length})` },
              { id: 'history', label: `Already Posted (${posted.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 'none', outline: 'none',
                background: activeTab === t.id ? 'var(--surface2)' : 'transparent',
                color: activeTab === t.id ? 'var(--gold)' : 'var(--text-dim)',
                borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
              }}>{t.label}</button>
            ))}
          </div>

          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {activeTab === 'session' && (
              sessionPosted.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                    <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: .4 }}>inventory_2</span>
                    No entries posted this session yet
                  </div>
                : sessionPosted.map(s => (
                    <div key={s.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <strong style={{ color: 'var(--text)' }}>{s.item_name}</strong>
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{fmtNum(s.actual_qty)} {s.unit}</span>
                      </div>
                      <div style={{ color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{s.wh_name}</span>
                        <span>$ {fmtNum(s.valuation_rate)}/unit</span>
                      </div>
                    </div>
                  ))
            )}
            {activeTab === 'history' && (
              loadingPosted
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
                : posted.length === 0
                  ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                      <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: .4 }}>check_circle</span>
                      No opening stock posted yet
                    </div>
                  : posted.map(s => (
                      <div key={s.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <strong style={{ color: 'var(--text)' }}>{s.items?.name || s.item_id}</strong>
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{fmtNum(s.actual_qty)} {s.items?.unit}</span>
                        </div>
                        <div style={{ color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{s.warehouses?.name || s.warehouse_id}</span>
                          <span style={{ fontSize: 11 }}>{dateTag(s.posting_datetime)}</span>
                        </div>
                        <div style={{ color: 'var(--text-dim)', marginTop: 2, fontSize: 11 }}>
                          $ {fmtNum(s.incoming_rate)}/unit · {s.voucher_no}
                        </div>
                      </div>
                    ))
            )}
          </div>

          {activeTab === 'history' && posted.length > 0 && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={loadPosted} style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>refresh</span> Refresh
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
