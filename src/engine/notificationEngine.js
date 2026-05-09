// src/engine/notificationEngine.js
//
// Centralised notification writer. Replaces the duplicated
// sendNotification / notifyHOD / notifyStorekeepers helpers
// that were copy-pasted into individual contexts (ProcurementContext, etc.).
//
// Writes to: notifications
// Realtime:  TopBar subscribes to INSERT on notifications filtered by user_id,
//            so any pushNotification() call is immediately visible.
//
// All functions are fire-and-forget: failures are logged, never thrown.

import { supabase } from '../lib/supabase'

/**
 * Push a single notification to one user.
 *
 * @param {string} userId  - app_users.id
 * @param {object} notif
 * @param {string} notif.type     - maps to NOTIFICATION_ICONS in TopBar/NotificationCenter
 * @param {string} notif.title
 * @param {string} notif.message
 * @param {string} [notif.link]   - route to navigate on click, e.g. '/module/hr/leave'
 * @param {object} [notif.metadata] - arbitrary extra data stored as JSON
 */
export async function pushNotification(userId, { type, title, message, link = null, metadata = {} }) {
  if (!userId) return
  try {
    await supabase.from('notifications').insert([{
      id:         crypto.randomUUID(),
      user_id:    userId,
      type,
      title,
      message,
      link,
      metadata,
      is_read:    false,
      created_at: new Date().toISOString(),
    }])
  } catch (err) {
    console.error('[notificationEngine] push failed:', err?.message || err)
  }
}

/**
 * Push the same notification to multiple users (deduplicates user IDs).
 */
export async function pushNotificationToGroup(userIds, notif) {
  if (!userIds?.length) return
  const unique = [...new Set(userIds.filter(Boolean))]
  await Promise.all(unique.map(uid => pushNotification(uid, notif)))
}

/**
 * Push to all app_users with a given role_id.
 * e.g. pushNotificationToRole('role_finance_manager', { … })
 */
export async function pushNotificationToRole(roleId, notif) {
  if (!roleId) return
  try {
    const { data } = await supabase
      .from('app_users')
      .select('id')
      .eq('role_id', roleId)
      .eq('is_active', true)
    if (data?.length) await pushNotificationToGroup(data.map(u => u.id), notif)
  } catch (err) {
    console.error('[notificationEngine] role push failed:', err?.message || err)
  }
}

/**
 * Push to all HODs of a department.
 * Resolves: employees(is_hod=true, department=name) → app_users(employee_id)
 */
export async function pushNotificationToHOD(departmentName, notif) {
  if (!departmentName) return
  try {
    const { data: hods } = await supabase
      .from('employees')
      .select('id')
      .eq('department', departmentName)
      .eq('is_hod', true)
    if (!hods?.length) return

    const empIds = hods.map(e => e.id)
    const { data: users } = await supabase
      .from('app_users')
      .select('id')
      .in('employee_id', empIds)
    if (users?.length) await pushNotificationToGroup(users.map(u => u.id), notif)
  } catch (err) {
    console.error('[notificationEngine] HOD push failed:', err?.message || err)
  }
}

/**
 * Push to all users with a specific role (storekeeper / store_manager pattern).
 * Shorthand for pushNotificationToRole with multiple roles.
 */
export async function pushNotificationToRoles(roleIds, notif) {
  if (!roleIds?.length) return
  try {
    const { data } = await supabase
      .from('app_users')
      .select('id')
      .in('role_id', roleIds)
      .eq('is_active', true)
    if (data?.length) await pushNotificationToGroup(data.map(u => u.id), notif)
  } catch (err) {
    console.error('[notificationEngine] roles push failed:', err?.message || err)
  }
}
