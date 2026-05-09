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
