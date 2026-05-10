// src/pages/Reports/ReportBuilder.jsx
// Dynamic, filterable report runner with PDF / Excel / CSV export.

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/ui'
import { useMasterData } from '../../contexts/MasterDataContext'
import { supabase } from '../../lib/supabase'
import {
  exportXLSX,
  exportCSV,
  exportPDF,
  dateTag,
  fmtDate,
  fmtNum,
} from '../../engine/reportingEngine'

// ─── Report type definitions ───────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'hr_headcount',
    label: 'HR: Employee Headcount',
    module: 'HR',
    icon: 'people',
    filters: { department: true, status: true, dateRange: { col: 'joining_date' } },
    columns: [
      { key: 'employee_number', label: 'Employee #', mono: true },
      { key: 'first_name',      label: 'First Name'             },
      { key: 'last_name',       label: 'Last Name'              },
      { key: 'department',      label: 'Department'             },
      { key: 'designation',     label: 'Designation'            },
      { key: 'joining_date',    label: 'Joined',    date: true  },
      { key: 'status',          label: 'Status'                 },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('employees')
        .select('employee_number, first_name, last_name, department, designation, joining_date, status')
        .neq('status', 'Terminated')
        .limit(1000)
      if (filters.department) q = q.eq('department', filters.department)
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.from)       q = q.gte('joining_date', filters.from)
      if (filters.to)         q = q.lte('joining_date', filters.to)
      return q
    },
  },
  {
    id: 'leave_summary',
    label: 'HR: Leave Summary',
    module: 'HR',
    icon: 'event_busy',
    filters: { department: true, status: true, dateRange: { col: 'start_date' } },
    columns: [
      { key: 'leave_number',   label: 'Leave #',  mono: true      },
      { key: 'employee_name',  label: 'Employee'                   },
      { key: 'department',     label: 'Department'                 },
      { key: 'leave_type',     label: 'Type'                      },
      { key: 'start_date',     label: 'From',     date: true       },
      { key: 'end_date',       label: 'To',       date: true       },
      { key: 'days',           label: 'Days'                       },
      { key: 'status',         label: 'Status'                    },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('leave_requests')
        .select('leave_number, employee_name, department, leave_type, start_date, end_date, days, status')
        .limit(1000)
      if (filters.department) q = q.eq('department', filters.department)
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.from)       q = q.gte('start_date', filters.from)
      if (filters.to)         q = q.lte('start_date', filters.to)
      return q
    },
  },
  {
    id: 'fuel_consumption',
    label: 'Fuel: Consumption Log',
    module: 'Fuel',
    icon: 'local_gas_station',
    filters: { site: true, status: { label: 'Fuel Type', col: 'fuel_type' }, dateRange: { col: 'issue_date' } },
    columns: [
      { key: 'issue_number',   label: 'Issue #',     mono: true          },
      { key: 'issue_date',     label: 'Date',        date: true          },
      { key: 'vehicle_number', label: 'Vehicle'                          },
      { key: 'vehicle_name',   label: 'Vehicle Name'                     },
      { key: 'fuel_type',      label: 'Fuel Type'                        },
      { key: 'litres_issued',  label: 'Litres'                           },
      { key: 'cost_per_litre', label: 'Cost/L',      currency: true      },
      { key: 'total_cost',     label: 'Total Cost',  currency: true      },
      { key: 'issued_by',      label: 'Issued By'                        },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('fuel_issues')
        .select('issue_number, issue_date, vehicle_number, vehicle_name, fuel_type, litres_issued, cost_per_litre, total_cost, issued_by')
        .limit(1000)
      if (filters.status)  q = q.eq('fuel_type', filters.status)
      if (filters.from)    q = q.gte('issue_date', filters.from)
      if (filters.to)      q = q.lte('issue_date', filters.to)
      return q
    },
  },
  {
    id: 'procurement_pos',
    label: 'Procurement: Purchase Orders',
    module: 'Procurement',
    icon: 'shopping_cart',
    filters: { department: true, status: true, dateRange: { col: 'po_date' } },
    columns: [
      { key: 'po_number',      label: 'PO #',          mono: true      },
      { key: 'po_date',        label: 'Date',          date: true      },
      { key: 'supplier_name',  label: 'Supplier'                       },
      { key: 'department',     label: 'Department'                     },
      { key: 'total_amount',   label: 'Total Amount',  currency: true  },
      { key: 'status',         label: 'Status'                         },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('purchase_orders')
        .select('po_number, po_date, supplier_name, department, total_amount, status')
        .limit(1000)
      if (filters.department) q = q.eq('department', filters.department)
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.from)       q = q.gte('po_date', filters.from)
      if (filters.to)         q = q.lte('po_date', filters.to)
      return q
    },
  },
  {
    id: 'store_requisitions',
    label: 'Procurement: Store Requisitions',
    module: 'Procurement',
    icon: 'request_quote',
    filters: { department: true, status: true, dateRange: { col: 'date_submitted' } },
    columns: [
      { key: 'req_number',     label: 'SR #',       mono: true  },
      { key: 'date_submitted', label: 'Date',       date: true  },
      { key: 'requested_by',   label: 'Requested By'            },
      { key: 'department',     label: 'Department'              },
      { key: 'status',         label: 'Status'                  },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('store_requisitions')
        .select('req_number, date_submitted, requested_by, department, status')
        .limit(1000)
      if (filters.department) q = q.eq('department', filters.department)
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.from)       q = q.gte('date_submitted', filters.from)
      if (filters.to)         q = q.lte('date_submitted', filters.to)
      return q
    },
  },
  {
    id: 'inventory_stock',
    label: 'Inventory: Stock Report',
    module: 'Inventory',
    icon: 'inventory_2',
    filters: { status: { label: 'Stock Level', options: ['All', 'Low Stock', 'OK'] }, dateRange: false },
    columns: [
      { key: 'item_code',      label: 'Item Code',  mono: true      },
      { key: 'name',           label: 'Name'                        },
      { key: 'category',       label: 'Category'                    },
      { key: 'unit',           label: 'Unit'                        },
      { key: 'quantity',       label: 'Qty'                         },
      { key: 'reorder_point',  label: 'Reorder Pt'                  },
      { key: 'unit_cost',      label: 'Unit Cost',  currency: true  },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('items')
        .select('item_code, name, category, unit, quantity, reorder_point, unit_cost')
        .eq('is_active', true)
        .limit(1000)
      return q
    },
    // Client-side post-filter for stock level
    postFilter(rows, filters) {
      if (!filters.status || filters.status === 'All') return rows
      if (filters.status === 'Low Stock') return rows.filter(r => (r.quantity || 0) <= (r.reorder_point || 0))
      if (filters.status === 'OK')        return rows.filter(r => (r.quantity || 0) >  (r.reorder_point || 0))
      return rows
    },
  },
  {
    id: 'payroll_summary',
    label: 'HR: Payroll Summary',
    module: 'HR',
    icon: 'payments',
    filters: { department: true, status: true, dateRange: { col: 'created_at' } },
    columns: [
      { key: 'payroll_number', label: 'Payroll #',   mono: true      },
      { key: 'month',          label: 'Month'                        },
      { key: 'year',           label: 'Year'                         },
      { key: 'employee_name',  label: 'Employee'                     },
      { key: 'department',     label: 'Department'                   },
      { key: 'basic_salary',   label: 'Basic',       currency: true  },
      { key: 'gross_pay',      label: 'Gross',       currency: true  },
      { key: 'deductions',     label: 'Deductions',  currency: true  },
      { key: 'net_pay',        label: 'Net',         currency: true  },
      { key: 'status',         label: 'Status'                       },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('payroll_records')
        .select('payroll_number, month, year, employee_name, department, basic_salary, gross_pay, deductions, net_pay, status')
        .limit(1000)
      if (filters.department) q = q.eq('department', filters.department)
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.from)       q = q.gte('created_at', filters.from)
      if (filters.to)         q = q.lte('created_at', filters.to)
      return q
    },
  },
  {
    id: 'audit_log',
    label: 'System: Audit Log',
    module: 'System',
    icon: 'manage_search',
    filters: { status: true, dateRange: { col: 'created_at' } },
    columns: [
      { key: 'created_at',   label: 'Date/Time',    date: true  },
      { key: 'user_name',    label: 'User'                      },
      { key: 'module',       label: 'Module'                    },
      { key: 'action',       label: 'Action'                    },
      { key: 'entity_type',  label: 'Entity Type'               },
      { key: 'entity_name',  label: 'Entity'                    },
      { key: 'status',       label: 'Status'                    },
    ],
    async buildQuery(filters) {
      let q = supabase
        .from('hr_audit_logs')
        .select('created_at, user_name, module, action, entity_type, entity_name, status')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.from)   q = q.gte('created_at', filters.from)
      if (filters.to)     q = q.lte('created_at', filters.to)
      return q
    },
  },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeFilename(reportType) {
  const slug = reportType.label
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  return `${slug}_${dateTag()}`
}

// Build a plain object row using column labels as keys (for export)
function buildExportRow(raw, columns) {
  const obj = {}
  for (const col of columns) {
    obj[col.label] = raw[col.key] ?? ''
  }
  return obj
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ReportBuilder() {
  const { departments, sites } = useMasterData()

  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [filters, setFilters]               = useState({ from: '', to: '', department: '', status: '', site: '' })
  const [rows, setRows]                     = useState(null)   // null = not run yet
  const [loading, setLoading]               = useState(false)

  const reportType = REPORT_TYPES.find(r => r.id === selectedTypeId) || null

  // ── Filter change helpers ────────────────────────────────────────────────

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const handleTypeChange = (id) => {
    setSelectedTypeId(id)
    setRows(null)
    setFilters({ from: '', to: '', department: '', status: '', site: '' })
  }

  // ── Run report ───────────────────────────────────────────────────────────

  const runReport = useCallback(async () => {
    if (!reportType) { toast.error('Select a report type first'); return }
    setLoading(true)
    try {
      const { data, error } = await reportType.buildQuery(filters)
      if (error) throw error

      let result = data || []

      // Client-side post-filter (e.g. inventory stock level)
      if (reportType.postFilter) {
        result = reportType.postFilter(result, filters)
      }

      setRows(result)

      if (result.length === 1000) {
        toast('Showing first 1,000 records. Refine filters to narrow results.', { icon: 'ℹ️' })
      } else if (result.length === 0) {
        toast('No records found for the selected filters.')
      }
    } catch (err) {
      console.error('[ReportBuilder] query error:', err)
      toast.error(`Query failed: ${err?.message || 'Unknown error'}`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [reportType, filters])

  // ── Export handlers ──────────────────────────────────────────────────────

  const exportRows = rows && rows.length > 0
    ? rows.map(r => buildExportRow(r, reportType.columns))
    : null

  const handleExcelExport = () => {
    if (!exportRows) return
    exportXLSX(exportRows, makeFilename(reportType))
  }

  const handleCSVExport = () => {
    if (!exportRows) return
    exportCSV(exportRows, makeFilename(reportType))
  }

  const handlePDFExport = () => {
    if (!exportRows) return
    exportPDF(
      exportRows,
      reportType.label,
      reportType.columns.map(c => c.label),
    )
  }

  // ── Filter bar visibility ────────────────────────────────────────────────

  const showDept   = reportType?.filters?.department === true
  const showSite   = reportType?.filters?.site === true
  const showStatus = !!reportType?.filters?.status
  const showDate   = reportType?.filters?.dateRange !== false

  const statusLabel = typeof reportType?.filters?.status === 'object'
    ? reportType.filters.status.label || 'Status'
    : 'Status'

  const statusOptions = typeof reportType?.filters?.status === 'object' && reportType.filters.status.options
    ? reportType.filters.status.options
    : null

  // ── Cell renderer ────────────────────────────────────────────────────────

  const renderCell = (col, value) => {
    if (value == null || value === '') return <span style={{ color: 'var(--text-dim)' }}>—</span>
    if (col.currency) return <span className="td-mono" style={{ textAlign: 'right' }}>{fmtNum(value)}</span>
    if (col.date)     return fmtDate(value)
    if (col.mono)     return <span className="td-mono">{value}</span>
    return value
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Report Builder"
        subtitle="Select a report type, apply filters, then export."
      />

      {/* ── Filter card ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

          {/* Report type selector */}
          <div className="form-group" style={{ minWidth: 240, flex: '1 1 240px' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
              REPORT TYPE
            </label>
            <select
              className="form-control"
              value={selectedTypeId}
              onChange={e => handleTypeChange(e.target.value)}
            >
              <option value="">— Select report —</option>
              {REPORT_TYPES.map(rt => (
                <option key={rt.id} value={rt.id}>{rt.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          {showDate && (
            <>
              <div className="form-group" style={{ minWidth: 140, flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                  FROM
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={filters.from}
                  onChange={e => setFilter('from', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ minWidth: 140, flex: '0 1 140px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                  TO
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={filters.to}
                  onChange={e => setFilter('to', e.target.value)}
                />
              </div>
            </>
          )}

          {/* Department */}
          {showDept && (
            <div className="form-group" style={{ minWidth: 160, flex: '1 1 160px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                DEPARTMENT
              </label>
              <select
                className="form-control"
                value={filters.department}
                onChange={e => setFilter('department', e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Site */}
          {showSite && (
            <div className="form-group" style={{ minWidth: 160, flex: '1 1 160px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                SITE
              </label>
              <select
                className="form-control"
                value={filters.site}
                onChange={e => setFilter('site', e.target.value)}
              >
                <option value="">All Sites</option>
                {sites.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status */}
          {showStatus && (
            <div className="form-group" style={{ minWidth: 140, flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                {statusLabel.toUpperCase()}
              </label>
              {statusOptions ? (
                <select
                  className="form-control"
                  value={filters.status}
                  onChange={e => setFilter('status', e.target.value)}
                >
                  {statusOptions.map(opt => (
                    <option key={opt} value={opt === 'All' ? '' : opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="form-control"
                  placeholder="Any status…"
                  value={filters.status}
                  onChange={e => setFilter('status', e.target.value)}
                />
              )}
            </div>
          )}

          {/* Run button */}
          <div className="form-group" style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={runReport}
              disabled={loading || !selectedTypeId}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              {loading
                ? <span className="material-icons" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>refresh</span>
                : <span className="material-icons" style={{ fontSize: 16 }}>play_arrow</span>
              }
              {loading ? 'Running…' : 'Run Report'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      {rows !== null && (
        <div className="card">
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)' }}>table_chart</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {rows.length === 0
                  ? 'No results'
                  : `${rows.length.toLocaleString()} record${rows.length === 1 ? '' : 's'}`}
              </span>
              {rows.length === 1000 && (
                <span className="badge badge-dim" style={{ marginLeft: 4, color: 'var(--yellow)' }}>
                  Limit reached — refine filters
                </span>
              )}
            </div>

            {rows.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handlePDFExport}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>picture_as_pdf</span>
                  PDF
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleExcelExport}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>grid_on</span>
                  Excel
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCSVExport}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>download</span>
                  CSV
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>search_off</span>
              No records match the selected filters.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    {reportType.columns.map(col => (
                      <th
                        key={col.key}
                        style={col.currency ? { textAlign: 'right' } : undefined}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {reportType.columns.map(col => (
                        <td
                          key={col.key}
                          style={col.currency ? { textAlign: 'right' } : undefined}
                        >
                          {renderCell(col, row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Idle state ── */}
      {rows === null && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.4 }}>
            assessment
          </span>
          <div style={{ fontSize: 14 }}>Select a report type and click <strong>Run Report</strong> to begin.</div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
