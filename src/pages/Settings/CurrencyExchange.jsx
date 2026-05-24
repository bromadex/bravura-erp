// src/pages/Settings/CurrencyExchange.jsx
// Currency Exchange Rates manager. Base currency is ZMW (Zambian Kwacha).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'

const CURRENCY_LIST = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
]

const SOURCE_COLOR = {
  manual: 'var(--blue)',
  api:    'var(--green)',
  import: 'var(--teal)',
}

const today = new Date().toISOString().split('T')[0]

function emptyForm() {
  return {
    currency_code:  '',
    currency_name:  '',
    rate_to_base:   '',
    effective_date: today,
    source:         'manual',
    notes:          '',
    is_active:      true,
  }
}

const CONVERTER_CURRENCIES = ['ZMW', ...CURRENCY_LIST.map(c => c.code)]

export default function CurrencyExchange() {
  const [rates,            setRates]           = useState([])
  const [loading,          setLoading]         = useState(true)
  const [modalOpen,        setModalOpen]       = useState(false)
  const [editing,          setEditing]         = useState(null)
  const [saving,           setSaving]          = useState(false)
  const [converterAmount,  setConverterAmount] = useState('')
  const [converterFrom,    setConverterFrom]   = useState('USD')
  const [converterTo,      setConverterTo]     = useState('ZMW')
  const [form,             setForm]            = useState(emptyForm())

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('currency_rates')
      .select('*')
      .order('currency_code')
      .order('effective_date', { ascending: false })
    if (error) toast.error('Failed to load exchange rates')
    else setRates(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Latest rate per currency (for display + converter) ────────────────────────

  const latestRates = useMemo(() => {
    const seen = {}
    const out  = []
    for (const r of rates) {
      if (!seen[r.currency_code]) { seen[r.currency_code] = true; out.push(r) }
    }
    return out
  }, [rates])

  // ── Currency converter ────────────────────────────────────────────────────────

  const convertedAmount = useMemo(() => {
    const amt = Number(converterAmount) || 0
    if (!amt) return null
    if (converterFrom === 'ZMW' && converterTo === 'ZMW') return amt
    const fromRate = converterFrom === 'ZMW'
      ? 1
      : (latestRates.find(r => r.currency_code === converterFrom)?.rate_to_base || 1)
    const toRate   = converterTo === 'ZMW'
      ? 1
      : (latestRates.find(r => r.currency_code === converterTo)?.rate_to_base || 1)
    return (amt * fromRate) / toRate
  }, [converterAmount, converterFrom, converterTo, latestRates])

  // ── KPI derived values ────────────────────────────────────────────────────────

  const activeCount   = latestRates.filter(r => r.is_active).length
  const usdRate       = latestRates.find(r => r.currency_code === 'USD')
  const zarRate       = latestRates.find(r => r.currency_code === 'ZAR')
  const lastUpdated   = rates.length
    ? rates.reduce((latest, r) => r.effective_date > latest ? r.effective_date : latest, rates[0].effective_date)
    : null

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      currency_code:  r.currency_code,
      currency_name:  r.currency_name,
      rate_to_base:   r.rate_to_base,
      effective_date: r.effective_date,
      source:         r.source || 'manual',
      notes:          r.notes || '',
      is_active:      r.is_active,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.currency_code.trim()) return toast.error('Currency code is required')
    if (!form.rate_to_base || isNaN(Number(form.rate_to_base)) || Number(form.rate_to_base) <= 0)
      return toast.error('Rate must be a positive number')
    setSaving(true)
    try {
      const payload = {
        currency_code:  form.currency_code.trim().toUpperCase(),
        currency_name:  form.currency_name.trim(),
        rate_to_base:   parseFloat(form.rate_to_base),
        effective_date: form.effective_date,
        source:         form.source,
        notes:          form.notes.trim(),
        is_active:      form.is_active,
        updated_at:     new Date().toISOString(),
      }
      let error
      if (editing) {
        ;({ error } = await supabase.from('currency_rates').update(payload).eq('id', editing.id))
      } else {
        ;({ error } = await supabase.from('currency_rates').insert({ ...payload, created_at: new Date().toISOString() }))
      }
      if (error) { toast.error(error.message); return }
      toast.success(editing ? 'Rate updated' : 'Rate added')
      setModalOpen(false)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (r) => {
    const { error } = await supabase
      .from('currency_rates')
      .update({ is_active: !r.is_active, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) toast.error(error.message)
    else {
      toast.success(r.is_active ? 'Rate deactivated' : 'Rate activated')
      await loadData()
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!latestRates.length) return toast.error('No rates to export')
    exportXLSX(
      latestRates.map(r => ({
        Currency:       r.currency_code,
        Name:           r.currency_name,
        'Rate to ZMW':  r.rate_to_base,
        Date:           r.effective_date,
        Source:         r.source,
      })),
      `CurrencyRates_${dateTag()}`
    )
  }

  // ── Auto-fill currency name when code selected from list ──────────────────────

  const handleCurrencyCodeChange = (code) => {
    sf('currency_code', code)
    const match = CURRENCY_LIST.find(c => c.code === code)
    if (match) sf('currency_name', match.name)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Currency Exchange Rates"
        subtitle="Base currency: ZMW (Zambian Kwacha) — update rates regularly"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">download</span> Export
        </button>
        <button className="btn btn-primary" onClick={openNew}>
          <span className="material-icons">add</span> Add Rate
        </button>
      </PageHeader>

      {/* ── KPI Cards ── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Active Currencies"
          value={activeCount}
          icon="currency_exchange"
          color="gold"
          sub={`${latestRates.length} total configured`}
        />
        <KPICard
          label="USD Rate"
          value={usdRate ? `K ${Number(usdRate.rate_to_base).toFixed(2)} / USD` : '—'}
          icon="attach_money"
          color="green"
          sub={usdRate ? `as of ${usdRate.effective_date}` : 'Not configured'}
        />
        <KPICard
          label="ZAR Rate"
          value={zarRate ? `K ${Number(zarRate.rate_to_base).toFixed(4)} / ZAR` : '—'}
          icon="payments"
          color="blue"
          sub={zarRate ? `as of ${zarRate.effective_date}` : 'Not configured'}
        />
        <KPICard
          label="Last Updated"
          value={lastUpdated || '—'}
          icon="event"
          sub="most recent effective date"
        />
      </div>

      {/* ── Rates Table ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Exchange Rates</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Latest rate per currency — 1 FCY = X ZMW
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</div>
        ) : latestRates.length === 0 ? (
          <EmptyState
            icon="currency_exchange"
            message="No exchange rates configured"
            action={{ label: 'Add Rate', onClick: openNew }}
          />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Name</th>
                  <th style={{ textAlign: 'right' }}>Rate (1 FCY = X ZMW)</th>
                  <th>Effective Date</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...latestRates].sort((a, b) => a.currency_code.localeCompare(b.currency_code)).map(r => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                    <td>
                      <span style={{
                        fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14,
                        color: 'var(--gold)',
                      }}>
                        {r.currency_code}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{r.currency_name}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                      {Number(r.rate_to_base).toFixed(4)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.effective_date}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: SOURCE_COLOR[r.source] || 'var(--text-dim)',
                        background: `color-mix(in srgb, ${SOURCE_COLOR[r.source] || 'var(--text-dim)'} 12%, transparent)`,
                        borderRadius: 4, padding: '2px 8px', textTransform: 'capitalize',
                      }}>
                        {r.source || 'manual'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        title={r.is_active ? 'Deactivate' : 'Activate'}
                        onClick={() => handleToggleActive(r)}
                        style={{ color: r.is_active ? 'var(--green)' : 'var(--red)' }}
                      >
                        <span className="material-icons" style={{ fontSize: 16 }}>
                          {r.is_active ? 'check_circle' : 'cancel'}
                        </span>
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Currency Converter ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '20px 24px',
        marginTop: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>calculate</span>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Currency Converter</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Amount</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="form-control"
              style={{ fontFamily: 'var(--mono)', fontWeight: 700, width: 160 }}
              placeholder="0.00"
              value={converterAmount}
              onChange={e => setConverterAmount(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>From</label>
            <select
              className="form-control"
              style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}
              value={converterFrom}
              onChange={e => setConverterFrom(e.target.value)}
            >
              {CONVERTER_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ paddingBottom: 6, fontSize: 20, fontWeight: 700, color: 'var(--text-dim)' }}>=</div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>To</label>
            <select
              className="form-control"
              style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}
              value={converterTo}
              onChange={e => setConverterTo(e.target.value)}
            >
              {CONVERTER_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {convertedAmount != null && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontFamily: 'var(--mono)',
              fontWeight: 800,
              fontSize: 22,
              color: 'var(--gold)',
              letterSpacing: '.02em',
            }}>
              {converterAmount} {converterFrom} = {convertedAmount.toFixed(4)} {converterTo}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Rates are indicative — verify before use in official documents
        </div>
      </div>

      {/* ── Add / Edit Rate Modal ── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Rate · ${editing.currency_code}` : 'Add Exchange Rate'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>

          {/* Currency code — select from list or free type */}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Currency Code <span style={{ color: 'var(--red)' }}>*</span></label>
            <select
              className="form-control"
              value={CURRENCY_LIST.find(c => c.code === form.currency_code) ? form.currency_code : '__custom__'}
              onChange={e => {
                if (e.target.value !== '__custom__') handleCurrencyCodeChange(e.target.value)
                else sf('currency_code', '')
              }}
            >
              <option value="">— Select currency —</option>
              {CURRENCY_LIST.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
              <option value="__custom__">Other (type below)</option>
            </select>
            {/* Free-text override when code not in list */}
            {!CURRENCY_LIST.find(c => c.code === form.currency_code) && (
              <input
                className="form-control"
                style={{ marginTop: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase', fontWeight: 700 }}
                placeholder="e.g. MWK"
                maxLength={6}
                value={form.currency_code}
                onChange={e => sf('currency_code', e.target.value.toUpperCase())}
              />
            )}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Currency Name</label>
            <input
              className="form-control"
              value={form.currency_name}
              onChange={e => sf('currency_name', e.target.value)}
              placeholder="e.g. US Dollar"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>
              Rate to ZMW <span style={{ color: 'var(--red)' }}>*</span>
              {form.currency_code && (
                <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 6 }}>
                  (1 {form.currency_code || 'FCY'} = X ZMW)
                </span>
              )}
            </label>
            <input
              type="number"
              min={0}
              step="0.0001"
              className="form-control"
              style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
              value={form.rate_to_base}
              onChange={e => sf('rate_to_base', e.target.value)}
              placeholder="e.g. 26.5000"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Effective Date</label>
            <input
              type="date"
              className="form-control"
              value={form.effective_date}
              onChange={e => sf('effective_date', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Source</label>
            <select className="form-control" value={form.source} onChange={e => sf('source', e.target.value)}>
              <option value="manual">Manual</option>
              <option value="api">API</option>
              <option value="import">Import</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Notes</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.notes}
              onChange={e => sf('notes', e.target.value)}
              placeholder="Optional source or reference note"
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.is_active} onChange={e => sf('is_active', e.target.checked)} />
            <span>Active</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update Rate' : 'Add Rate'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
