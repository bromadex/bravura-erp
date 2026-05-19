// Bravura ERP — send-email Edge Function
// Deploy:  supabase functions deploy send-email --no-verify-jwt
// Secrets needed (set via Supabase Dashboard or `supabase secrets set`):
//   RESEND_API_KEY     (when provider='resend')
//   SENDGRID_API_KEY   (when provider='sendgrid')
//   POSTMARK_TOKEN     (when provider='postmark')
//
// Reads email_configuration singleton to determine provider, then dispatches.
// Updates email_logs row (created by client) with the result.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  logId?: string
  to: string
  toName?: string
  cc?: string | string[]
  subject: string
  html?: string
  text?: string
  eventType?: string
  templateId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const { logId, to, toName, cc, subject, html, text } = payload
  if (!to || !subject) {
    return new Response(JSON.stringify({ error: 'missing recipient or subject' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // 1. Load email_configuration
  const { data: cfg } = await sb.from('email_configuration').select('*').eq('id', 'singleton').maybeSingle()
  if (!cfg || cfg.provider === 'none' || !cfg.is_active) {
    if (logId) await sb.from('email_logs').update({
      status: 'failed',
      error_message: 'email_configuration is not active or provider is "none"',
    }).eq('id', logId)
    return new Response(JSON.stringify({ error: 'email is not configured' }), { status: 503, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const fromEmail = cfg.default_from_email
  const fromName  = cfg.default_from_name || 'Bravura ERP'

  // 2. Resolve API key from secret name in api_key_ref
  const keyName = cfg.api_key_ref || ''
  const apiKey  = keyName ? Deno.env.get(keyName) : null

  let providerResult: { ok: boolean, messageId?: string, error?: string }

  try {
    switch (cfg.provider) {
      case 'resend':
        providerResult = await sendViaResend({ apiKey, fromEmail, fromName, to, toName, cc, subject, html, text })
        break
      case 'sendgrid':
        providerResult = await sendViaSendGrid({ apiKey, fromEmail, fromName, to, toName, cc, subject, html, text })
        break
      case 'postmark':
        providerResult = await sendViaPostmark({ apiKey, fromEmail, fromName, to, toName, cc, subject, html, text })
        break
      case 'smtp':
        // SMTP requires a different transport; Deno has community SMTP libs.
        // For now, return an explicit not-yet-supported error.
        providerResult = { ok: false, error: 'SMTP provider not yet implemented in edge function — use resend, sendgrid or postmark' }
        break
      default:
        providerResult = { ok: false, error: `unknown provider: ${cfg.provider}` }
    }
  } catch (err) {
    providerResult = { ok: false, error: (err as Error).message }
  }

  // 3. Update email_logs
  const now = new Date().toISOString()
  if (logId) {
    await sb.from('email_logs').update({
      status: providerResult.ok ? 'sent' : 'failed',
      provider: cfg.provider,
      provider_message_id: providerResult.messageId || null,
      from_email: fromEmail,
      from_name:  fromName,
      error_message: providerResult.error || null,
      sent_at: providerResult.ok ? now : null,
    }).eq('id', logId)
  }

  if (!providerResult.ok) {
    return new Response(JSON.stringify({ error: providerResult.error }), { status: 502, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, providerMessageId: providerResult.messageId }), {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

// ── Resend ─────────────────────────────────────────────────────
async function sendViaResend({ apiKey, fromEmail, fromName, to, toName, cc, subject, html, text }: any) {
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to:   toName ? [`${toName} <${to}>`] : [to],
      cc:   cc ? (Array.isArray(cc) ? cc : cc.split(',').map((s: string) => s.trim())) : undefined,
      subject,
      html: html || undefined,
      text: text || undefined,
    }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) return { ok: false, error: data?.message || `resend HTTP ${resp.status}` }
  return { ok: true, messageId: data?.id }
}

// ── SendGrid ───────────────────────────────────────────────────
async function sendViaSendGrid({ apiKey, fromEmail, fromName, to, toName, cc, subject, html, text }: any) {
  if (!apiKey) return { ok: false, error: 'SENDGRID_API_KEY not set' }
  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: to, name: toName }],
        cc: cc ? (Array.isArray(cc) ? cc.map((e: string) => ({ email: e })) : cc.split(',').map((e: string) => ({ email: e.trim() }))) : undefined,
        subject,
      }],
      from: { email: fromEmail, name: fromName },
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        ...(html ? [{ type: 'text/html',  value: html }] : []),
      ],
    }),
  })
  if (resp.status === 202) {
    return { ok: true, messageId: resp.headers.get('x-message-id') || undefined }
  }
  const errBody = await resp.text().catch(() => '')
  return { ok: false, error: `sendgrid HTTP ${resp.status}: ${errBody.slice(0, 200)}` }
}

// ── Postmark ───────────────────────────────────────────────────
async function sendViaPostmark({ apiKey, fromEmail, fromName, to, cc, subject, html, text }: any) {
  if (!apiKey) return { ok: false, error: 'POSTMARK_TOKEN not set' }
  const resp = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': apiKey,
    },
    body: JSON.stringify({
      From:     `${fromName} <${fromEmail}>`,
      To:       to,
      Cc:       cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined,
      Subject:  subject,
      HtmlBody: html,
      TextBody: text,
    }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) return { ok: false, error: data?.Message || `postmark HTTP ${resp.status}` }
  return { ok: true, messageId: data?.MessageID }
}
