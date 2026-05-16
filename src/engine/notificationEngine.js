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
export async function pushNotification(userId, { type, title, message, link = null, metadata = {}, category = 'general' }) {
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
      category,
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
 * Push to the HOD of a department.
 * Resolves via departments.hod_id → app_users.employee_id
 * (departments.hod_id is the authoritative HOD reference in this schema)
 */
export async function pushNotificationToHOD(departmentName, notif) {
  if (!departmentName) return
  try {
    const { data: dept } = await supabase
      .from('departments')
      .select('hod_id')
      .eq('name', departmentName)
      .maybeSingle()
    if (!dept?.hod_id) return

    const { data: users } = await supabase
      .from('app_users')
      .select('id')
      .eq('employee_id', dept.hod_id)
      .eq('is_active', true)
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

/**
 * Push a notification using a DB-stored template.
 * Looks up the template by event_type, interpolates {{variable}} placeholders,
 * then routes to recipients based on recipientSpec.
 *
 * Falls back silently if the template is not found or disabled.
 *
 * @param {string} eventType     - key from notification_templates.event_type, e.g. 'sr_submitted'
 * @param {object} variables     - substitution values, e.g. { requester_name: 'John', req_number: 'SR-2026-00001' }
 * @param {object} recipientSpec - one of:
 *   { userId: string }            — single user
 *   { userIds: string[] }         — multiple users
 *   { role: string }              — all users with this role_id
 *   { roles: string[] }           — all users with any of these role_ids
 *   { department: string }        — HOD of this department name
 * @param {object} [fallback]    - optional default notif if template not in DB yet:
 *   { type, title, message, link }
 */
export async function pushNotificationFromTemplate(eventType, variables = {}, recipientSpec = {}, fallback = null) {
  try {
    // 1. Fetch template
    const { data: tmpl, error } = await supabase
      .from('notification_templates')
      .select('type, title, message, link, enabled, category')
      .eq('event_type', eventType)
      .maybeSingle()

    let notif
    if (error || !tmpl || !tmpl.enabled) {
      if (fallback) {
        notif = fallback
      } else {
        return  // no template and no fallback — skip silently
      }
    } else {
      // 2. Interpolate {{variable}} placeholders
      const interpolate = (str = '') =>
        str.replace(/\{\{(\w+)\}\}/g, (_, k) => (variables[k] !== undefined ? String(variables[k]) : `{{${k}}}`))

      notif = {
        type:     tmpl.type,
        title:    interpolate(tmpl.title),
        message:  interpolate(tmpl.message),
        link:     tmpl.link || null,
        category: tmpl.category || 'general',
        metadata: variables,
      }
    }

    // 3. Route to recipients
    const { userId, userIds, role, roles, department } = recipientSpec

    if (userId)     await pushNotification(userId, notif)
    if (userIds)    await pushNotificationToGroup(userIds, notif)
    if (role)       await pushNotificationToRole(role, notif)
    if (roles)      await pushNotificationToRoles(roles, notif)
    if (department) await pushNotificationToHOD(department, notif)

  } catch (err) {
    console.error('[notificationEngine] template push failed:', err?.message || err)
  }
}
