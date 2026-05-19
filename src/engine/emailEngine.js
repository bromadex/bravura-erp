// src/engine/emailEngine.js
//
// Email Engine — client-side wrapper.
//
// Sends emails by invoking the Supabase Edge Function `send-email`, which:
//   1. Reads email_configuration singleton (provider + sender + creds)
//   2. Calls the appropriate provider (Resend / SendGrid / SMTP / Postmark)
//   3. Writes the result to email_logs
//
// Fallback behaviour: if the edge function is unreachable (e.g. local dev with
// no functions deployed), the email is logged to email_logs as 'pending' so
// it can be re-sent later from an admin UI.
//
// All functions are fire-and-forget: failures are logged, never thrown.

import { supabase } from '../lib/supabase'

const EDGE_FN = 'send-email'

// ── Interpolation helper ────────────────────────────────────────
function interpolate(str = '', vars = {}) {
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`
  )
}

// ── Persist to email_logs ───────────────────────────────────────
async function logEmail(row) {
  try {
    await supabase.from('email_logs').insert([{
      id: crypto.randomUUID(),
      ...row,
      created_at: new Date().toISOString(),
    }])
  } catch (err) {
    console.error('[emailEngine] log insert failed:', err?.message || err)
  }
}

/**
 * Send a single email.
 *
 * @param {object} params
 * @param {string} params.to             - recipient email (required)
 * @param {string} [params.toName]
 * @param {string|string[]} [params.cc]
 * @param {string} params.subject        - email subject (required)
 * @param {string} [params.html]         - HTML body
 * @param {string} [params.text]         - plain-text body (fallback)
 * @param {string} [params.eventType]    - notification template event_type (for logging)
 * @param {string} [params.templateId]
 * @param {string} [params.relatedEntityType]
 * @param {string} [params.relatedEntityId]
 * @returns {Promise<{ok: boolean, logId: string, error?: string}>}
 */
export async function sendEmail({
  to, toName, cc, subject, html, text,
  eventType, templateId, relatedEntityType, relatedEntityId,
}) {
  if (!to)      { console.warn('[emailEngine] missing recipient'); return { ok: false, error: 'missing recipient' } }
  if (!subject) { console.warn('[emailEngine] missing subject'); return { ok: false, error: 'missing subject' } }

  const logId = crypto.randomUUID()
  const baseLog = {
    id: logId,
    to_email: to,
    to_name: toName || null,
    cc_emails: Array.isArray(cc) ? cc.join(',') : (cc || null),
    subject,
    body_html: html || null,
    body_text: text  || null,
    template_id: templateId  || null,
    event_type:  eventType    || null,
    related_entity_type: relatedEntityType || null,
    related_entity_id:   relatedEntityId   || null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  // Insert pending log first
  try {
    await supabase.from('email_logs').insert([baseLog])
  } catch (err) {
    console.error('[emailEngine] could not log pending email:', err?.message || err)
  }

  // Try edge function
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FN, {
      body: { logId, to, toName, cc, subject, html, text, eventType, templateId },
    })
    if (error) {
      await supabase.from('email_logs').update({
        status: 'failed',
        error_message: error.message,
      }).eq('id', logId)
      return { ok: false, logId, error: error.message }
    }
    return { ok: true, logId, providerMessageId: data?.providerMessageId }
  } catch (err) {
    // Edge function not deployed or unreachable — log stays as 'pending'
    console.warn('[emailEngine] edge function unreachable; email queued:', err?.message || err)
    return { ok: false, logId, error: 'edge function unreachable; email queued' }
  }
}

/**
 * Send an email using a DB-stored notification template.
 *
 * Looks up notification_templates by event_type, interpolates variables in
 * email_subject and email_body, then sends.
 *
 * Falls back silently if the template is not found, disabled, or has
 * send_email = false.
 */
export async function sendEmailFromTemplate(eventType, recipientEmail, variables = {}, options = {}) {
  if (!recipientEmail) return { ok: false, error: 'missing recipient' }
  try {
    const { data: tmpl } = await supabase
      .from('notification_templates')
      .select('id, send_email, email_subject, email_body, title, message, enabled')
      .eq('event_type', eventType)
      .maybeSingle()

    if (!tmpl || !tmpl.enabled || !tmpl.send_email) return { ok: false, error: 'email channel disabled' }

    const subject = interpolate(tmpl.email_subject || tmpl.title || '(no subject)', variables)
    const html    = interpolate(tmpl.email_body || tmpl.message || '', variables)
    return sendEmail({
      to:        recipientEmail,
      toName:    options.toName,
      cc:        options.cc,
      subject,
      html,
      text:      html.replace(/<[^>]+>/g, ''),
      eventType,
      templateId: tmpl.id,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId:   options.relatedEntityId,
    })
  } catch (err) {
    console.error('[emailEngine] template send failed:', err?.message || err)
    return { ok: false, error: err.message }
  }
}

/**
 * Send a test email — used by the Email Configuration page.
 */
export async function sendTestEmail(recipientEmail) {
  return sendEmail({
    to: recipientEmail,
    subject: 'Bravura ERP — Test Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #facc15;">Test Email from Bravura ERP</h2>
        <p>This is a test message to confirm your email configuration is working correctly.</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
          Sent on ${new Date().toLocaleString()}
        </p>
      </div>
    `,
    text: 'This is a test email from Bravura ERP. Sent on ' + new Date().toLocaleString(),
    eventType: 'test_email',
  })
}

/**
 * Dispatch a push notification via the send-push edge function.
 * Used by notificationEngine.js to fan-out to PWA endpoints.
 */
export async function sendPushNotification(userId, { title, body, link, eventType }) {
  try {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!subs?.length) return { ok: false, error: 'no active subscription' }

    // Log each push attempt
    const logRows = subs.map(s => ({
      id: crypto.randomUUID(),
      subscription_id: s.id,
      user_id: userId,
      title, body, link,
      event_type: eventType || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    }))
    if (logRows.length) await supabase.from('push_logs').insert(logRows)

    // Invoke edge function
    const { error } = await supabase.functions.invoke('send-push', {
      body: { userId, title, body, link, eventType },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, deliveredTo: subs.length }
  } catch (err) {
    console.error('[emailEngine] push dispatch failed:', err?.message || err)
    return { ok: false, error: err.message }
  }
}
