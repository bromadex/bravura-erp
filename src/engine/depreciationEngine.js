// src/engine/depreciationEngine.js
// Asset depreciation: straight-line & reducing-balance.
// Calculates, records entries, and optionally posts to GL via accountingEngine.

import { supabase } from '../lib/supabase'
import { postToGL }  from './accountingEngine'

// ─── pure calculations ────────────────────────────────────────────────────────

/** Monthly straight-line depreciation amount. */
export function calcStraightLine(cost, salvage, lifeYears) {
  const depreciable = Math.max(0, (cost || 0) - (salvage || 0))
  const months = (lifeYears || 0) * 12
  return months > 0 ? depreciable / months : 0
}

/** Monthly reducing-balance depreciation amount from current book value + annual rate (%). */
export function calcReducingBalance(bookValue, annualRatePct) {
  return (bookValue || 0) * ((annualRatePct || 0) / 100) / 12
}

/**
 * Usage-based depreciation per km driven in a period.
 * depPerKm = (cost - salvage) / expectedLifetimeKm
 * periodDep = depPerKm * kmDrivenThisPeriod
 */
export function calcUsageBased(cost, salvage, expectedLifetimeKm, kmDrivenThisPeriod) {
  const depreciable = Math.max(0, (cost || 0) - (salvage || 0))
  const depPerKm = expectedLifetimeKm > 0 ? depreciable / expectedLifetimeKm : 0
  return depPerKm * (kmDrivenThisPeriod || 0)
}

/**
 * Compute depreciation for a single asset from asset_registry fields (client-side).
 * Returns { monthlyDep, annualDep, pctDepreciated, remainingLifePct, bookValue, accumulated }
 */
export function computeAssetDepreciation(asset) {
  const cost    = parseFloat(asset.purchase_cost   || 0)
  const salvage = parseFloat(asset.disposal_value  || asset.salvage_value || 0)
  const life    = parseFloat(asset.useful_life_years || 0)
  const method  = asset.depreciation_method || 'straight_line'
  const rate    = parseFloat(asset.depreciation_rate || 20)
  const bv      = asset.current_book_value != null ? parseFloat(asset.current_book_value) : cost

  let monthlyDep = 0
  if (method === 'straight_line' && cost > 0 && life > 0) {
    monthlyDep = calcStraightLine(cost, salvage, life)
  } else if (method === 'reducing_balance' && bv > 0) {
    monthlyDep = calcReducingBalance(bv, rate)
  }
  // usage_based monthly dep = 0 (computed per period from km)

  const accumulated    = Math.max(0, cost - bv)
  const depreciable    = Math.max(0, cost - salvage)
  const pctDepreciated = depreciable > 0 ? Math.min(100, (accumulated / depreciable) * 100) : 0
  const remainingLifePct = 100 - pctDepreciated

  return {
    method,
    monthlyDep,
    annualDep:       monthlyDep * 12,
    accumulated,
    bookValue:       bv,
    pctDepreciated,
    remainingLifePct,
    color: remainingLifePct > 50 ? 'var(--green)' : remainingLifePct > 25 ? 'var(--yellow)' : 'var(--red)',
  }
}

/** Build a full projected schedule as an array of {period, amount, bookValue}. */
export function buildProjectedSchedule(sched) {
  const rows   = []
  let bv       = sched.purchase_cost - (sched.total_depreciated || 0)
  const floor  = sched.salvage_value || 0
  const start  = new Date(sched.start_date || Date.now())
  const months = (sched.useful_life_years || 5) * 12

  for (let m = 0; m < months; m++) {
    const d = new Date(start)
    d.setMonth(d.getMonth() + m)
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    let amt = sched.depreciation_method === 'reducing_balance'
      ? calcReducingBalance(bv, sched.annual_rate || 20)
      : calcStraightLine(sched.purchase_cost, sched.salvage_value, sched.useful_life_years)

    amt = Math.min(amt, Math.max(0, bv - floor))
    if (amt <= 0.001) break

    bv -= amt
    rows.push({ period, amount: amt, bookValue: bv })
  }
  return rows
}

// ─── database operations ──────────────────────────────────────────────────────

/**
 * Run depreciation for one schedule in one period.
 * Creates a Draft entry. If GL accounts are set, also posts to GL (entry becomes Posted).
 */
export async function runMonthlyDepreciation({ scheduleId, periodLabel, entryDate, userId }) {
  const { data: sched, error: se } = await supabase
    .from('asset_depreciation_schedules')
    .select('*')
    .eq('id', scheduleId)
    .single()
  if (se || !sched) throw new Error('Depreciation schedule not found')
  if (sched.status !== 'active') throw new Error(`Schedule is ${sched.status} — cannot depreciate`)

  // Duplicate period guard
  const { data: dup } = await supabase
    .from('asset_depreciation_entries')
    .select('id')
    .eq('schedule_id', scheduleId)
    .eq('period_label', periodLabel)
    .neq('status', 'Cancelled')
    .maybeSingle()
  if (dup) throw new Error(`Period ${periodLabel} already has a depreciation entry for this schedule`)

  const currentBV = sched.book_value ?? (sched.purchase_cost - (sched.total_depreciated || 0))
  let depAmount = sched.depreciation_method === 'reducing_balance'
    ? calcReducingBalance(currentBV, sched.annual_rate || 20)
    : calcStraightLine(sched.purchase_cost, sched.salvage_value, sched.useful_life_years)

  const remaining = currentBV - (sched.salvage_value || 0)
  depAmount = Math.min(depAmount, Math.max(0, remaining))
  if (depAmount <= 0.001) throw new Error('Asset is fully depreciated — no more entries can be created')

  const newBV    = currentBV - depAmount
  const entryId  = crypto.randomUUID()
  const fullyDep = newBV <= (sched.salvage_value || 0) + 0.01

  const { error: ie } = await supabase.from('asset_depreciation_entries').insert([{
    id: entryId,
    schedule_id:         scheduleId,
    asset_id:            sched.asset_id,
    entry_date:          entryDate,
    period_label:        periodLabel,
    depreciation_amount: depAmount,
    book_value_after:    newBV,
    status:              'Draft',
    created_by:          userId || '',
    created_at:          new Date().toISOString(),
  }])
  if (ie) throw new Error(ie.message)

  await supabase.from('asset_depreciation_schedules').update({
    total_depreciated: (sched.total_depreciated || 0) + depAmount,
    book_value:        newBV,
    status:            fullyDep ? 'fully_depreciated' : 'active',
    updated_at:        new Date().toISOString(),
  }).eq('id', scheduleId)

  // Try GL posting if accounts configured
  let glEntryId = null
  if (sched.gl_depreciation_acct && sched.gl_accum_depr_acct) {
    try {
      glEntryId = await postToGL({
        sourceModule: 'assets',
        sourceType:   'depreciation_entry',
        sourceId:     entryId,
        entryDate,
        description:  `Depreciation — ${sched.asset_code} — ${periodLabel}`,
        reference:    `DEPR-${sched.asset_id.slice(0, 8)}-${periodLabel}`,
        lines: [
          { account_code: sched.gl_depreciation_acct, debit: depAmount, credit: 0, description: `Depr ${sched.asset_code}` },
          { account_code: sched.gl_accum_depr_acct,   debit: 0, credit: depAmount, description: `Accum Depr ${sched.asset_code}` },
        ],
        postedBy: userId || '',
      })
      await supabase.from('asset_depreciation_entries').update({
        journal_entry_id: glEntryId,
        status: 'Posted',
      }).eq('id', entryId)
    } catch (glErr) {
      console.warn('GL posting failed, entry saved as Draft:', glErr.message)
    }
  }

  return { entryId, depAmount, newBV, glEntryId, fullyDepreciated: fullyDep }
}

/** Run depreciation for ALL active schedules for a given period. */
export async function runBatchDepreciation({ periodLabel, entryDate, userId }) {
  const { data: schedules = [] } = await supabase
    .from('asset_depreciation_schedules')
    .select('id, asset_code, asset_id')
    .eq('status', 'active')

  const results = { success: [], skipped: [], failed: [] }
  for (const s of schedules) {
    try {
      const r = await runMonthlyDepreciation({ scheduleId: s.id, periodLabel, entryDate, userId })
      results.success.push({ assetCode: s.asset_code, ...r })
    } catch (e) {
      if (e.message.includes('already has a depreciation entry')) {
        results.skipped.push({ assetCode: s.asset_code, reason: e.message })
      } else {
        results.failed.push({ assetCode: s.asset_code, error: e.message })
      }
    }
  }
  return results
}

/** Get the current book value and schedule info for an asset. */
export async function getAssetDepreciationSummary(assetId) {
  const { data: schedules = [] } = await supabase
    .from('asset_depreciation_schedules')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
  return schedules
}
