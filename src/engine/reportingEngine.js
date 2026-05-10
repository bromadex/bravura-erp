// src/engine/reportingEngine.js
//
// Centralised export and reporting utilities.
// Eliminates the duplicated XLSX boilerplate that exists in 19+ files.
//
// Usage (replaces the inline pattern):
//
//   import { exportXLSX, exportAoa, dateTag } from '../../engine/reportingEngine'
//
//   // From an array of objects (most common):
//   exportXLSX(rows, `StockReport_${dateTag()}`)
//
//   // From an array-of-arrays (for manually laid-out reports):
//   exportAoa([['Title'], [], ['Col A', 'Col B'], [1, 2]], `BalanceSheet_${dateTag()}`)

import * as XLSX from 'xlsx'

/** Today's date formatted as YYYY-MM-DD — use in filenames. */
export const dateTag = () => new Date().toISOString().split('T')[0]

/**
 * Export an array of plain objects to .xlsx.
 * Column headers are derived from the object keys (first row).
 *
 * @param {object[]} rows      - data rows
 * @param {string}   filename  - without .xlsx extension
 * @param {string}   [sheet]   - sheet tab label (max 31 chars)
 */
export function exportXLSX(rows, filename, sheet = 'Sheet1') {
  if (!rows?.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Export an array-of-arrays (manual layout) to .xlsx.
 * Use this for reports like Balance Sheet where you control the row structure.
 *
 * @param {any[][]} data      - array of rows, each row is an array of cells
 * @param {string}  filename  - without .xlsx extension
 * @param {string}  [sheet]   - sheet tab label
 */
export function exportAoa(data, filename, sheet = 'Sheet1') {
  if (!data?.length) return
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Export multiple sheets into a single workbook.
 *
 * @param {Array<{ name: string, rows?: object[], data?: any[][] }>} sheets
 * @param {string} filename
 */
export function exportMultiSheet(sheets, filename) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = s.data
      ? XLSX.utils.aoa_to_sheet(s.data)
      : XLSX.utils.json_to_sheet(s.rows || [])
    XLSX.utils.book_append_sheet(wb, ws, (s.name || 'Sheet').slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Format a number as USD-style with 2 decimal places.
 * Matches the `fmt` helper used throughout the UI.
 */
export const fmtNum = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

/**
 * Format a date string as a short locale string (e.g. "12 May 2026").
 */
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Export rows as a UTF-8 CSV file (BOM-prefixed for Excel compatibility).
 */
export function exportCSV(rows, filename) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const escape  = (v) => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename.endsWith('.csv') ? filename : filename + '.csv' })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Print / Save-as-PDF the given rows in a new browser window.
 * Opens a minimal HTML page with a styled table, then calls window.print().
 */
export function exportPDF(rows, title = 'Report', columns = null) {
  if (!rows?.length) return
  const cols = columns || Object.keys(rows[0])
  const thead = `<tr>${cols.map(c => `<th>${c.replace(/_/g,' ')}</th>`).join('')}</tr>`
  const tbody = rows.map(r =>
    `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`
  ).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#111}
      h2{font-size:15px;margin-bottom:4px}
      .sub{font-size:10px;color:#666;margin-bottom:16px}
      table{border-collapse:collapse;width:100%}
      th{background:#1a1a2e;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      td{border-bottom:1px solid #e5e7eb;padding:6px 10px}
      tr:nth-child(even) td{background:#f9fafb}
      @media print{body{padding:0}}
    </style>
  </head><body>
    <h2>${title}</h2>
    <div class="sub">Generated ${new Date().toLocaleString('en-GB')} — ${rows.length} records</div>
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    <script>window.onload=()=>window.print()<\/script>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(html)
  w.document.close()
}
