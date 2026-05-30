// src/lib/fleetGL.js
// Fleet GL auto-posting utility.
// All posts are SILENT-FAIL — they never block the primary save operation.
// Usage:
//   postFleetGL(supabase, { type: 'fuel_issuance', amount, assetId, assetName, reference, glConfig })
//   postFleetGL(supabase, { type: 'maintenance_close', amount, assetId, assetName, reference, glConfig })
//   postFleetGL(supabase, { type: 'depreciation', amount, assetId, assetName, reference, glConfig })

import { postToGL } from '../engine/accountingEngine'

/**
 * Build GL line items for a fleet transaction type.
 * Returns null if required accounts are not configured.
 */
function buildFleetLines(type, amount, assetName, glConfig) {
  const desc = assetName || 'Fleet Asset'

  switch (type) {
    case 'fuel_issuance': {
      const drAcct = glConfig?.fuel_expense_account
      const crAcct = glConfig?.fuel_inventory_account
      if (!drAcct || !crAcct) return null
      return [
        { account_code: drAcct, debit: amount, credit: 0,      description: `Fuel expense — ${desc}` },
        { account_code: crAcct, debit: 0,      credit: amount, description: `Fuel inventory CR — ${desc}` },
      ]
    }
    case 'maintenance_close': {
      const drAcct = glConfig?.maintenance_expense_account
      const crAcct = glConfig?.maintenance_payable_account
      if (!drAcct || !crAcct) return null
      return [
        { account_code: drAcct, debit: amount, credit: 0,      description: `Maintenance expense — ${desc}` },
        { account_code: crAcct, debit: 0,      credit: amount, description: `Maintenance payable — ${desc}` },
      ]
    }
    case 'depreciation': {
      const drAcct = glConfig?.depreciation_expense_account
      const crAcct = glConfig?.accum_depreciation_account
      if (!drAcct || !crAcct) return null
      return [
        { account_code: drAcct, debit: amount, credit: 0,      description: `Depreciation expense — ${desc}` },
        { account_code: crAcct, debit: 0,      credit: amount, description: `Accum. depreciation — ${desc}` },
      ]
    }
    default:
      return null
  }
}

/**
 * Post a fleet GL entry. Always silent-fail.
 * @param {object} supabaseClient  - Supabase client (passed so fuel/workshop pages don't import accountingEngine directly)
 * @param {object} opts
 * @param {string} opts.type       - 'fuel_issuance' | 'maintenance_close' | 'depreciation'
 * @param {number} opts.amount     - Transaction amount
 * @param {string} opts.assetId    - Asset UUID
 * @param {string} opts.assetName  - Asset display name
 * @param {string} opts.reference  - Unique GL reference string (for dedup)
 * @param {object} opts.glConfig   - Map of config_key → account_code from fleet_gl_config
 * @param {string} opts.entryDate  - ISO date (YYYY-MM-DD)
 * @param {string} opts.userId     - Posted-by user
 */
export async function postFleetGL(supabaseClient, { type, amount, assetId, assetName, reference, glConfig, entryDate, userId }) {
  try {
    if (!amount || amount <= 0) return
    const lines = buildFleetLines(type, amount, assetName, glConfig)
    if (!lines) {
      console.warn(`Fleet GL: no accounts configured for type="${type}" — skipping GL post`)
      return
    }

    const date = entryDate || new Date().toISOString().split('T')[0]
    const ref  = reference || `FLEET-${type.toUpperCase()}-${assetId?.slice(0, 8) || 'UNKNOWN'}-${Date.now()}`

    await postToGL({
      sourceModule: 'fleet',
      sourceType:   type,
      sourceId:     assetId || 'fleet',
      entryDate:    date,
      description:  `Fleet ${type.replace(/_/g, ' ')} — ${assetName || 'Unknown'}`,
      reference:    ref,
      lines,
      postedBy:     userId || '',
    })
  } catch (e) {
    console.warn(`Fleet GL post failed (type=${type}, ref=${reference}):`, e.message)
  }
}

/**
 * Load fleet GL config from Supabase.
 * Returns a flat map: { fuel_expense_account: 'code', ... }
 */
export async function loadFleetGLConfig(supabaseClient) {
  try {
    const { data } = await supabaseClient.from('fleet_gl_config').select('config_key, config_value')
    const map = {}
    data?.forEach(r => { if (r.config_value) map[r.config_key] = r.config_value })
    return map
  } catch (e) {
    console.warn('Fleet GL config load failed:', e.message)
    return {}
  }
}
