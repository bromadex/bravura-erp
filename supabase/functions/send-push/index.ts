// Bravura ERP — send-push Edge Function
// Deploy:  supabase functions deploy send-push --no-verify-jwt
//
// Reads push_config singleton for VAPID keys, looks up active
// push_subscriptions for the given user, and dispatches Web Push.
//
// Uses native crypto APIs available in Deno for VAPID JWT signing.

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import webpush from 'https://esm.sh/web-push@3.6.7?bundle'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  userId: string
  title: string
  body?: string
  link?: string
  eventType?: string
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

  const { userId, title, body, link, eventType } = payload
  if (!userId || !title) {
    return new Response(JSON.stringify({ error: 'userId and title are required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // 1. Load VAPID config
  const { data: cfg } = await sb.from('push_config').select('*').eq('id', 'singleton').maybeSingle()
  if (!cfg || !cfg.is_enabled || !cfg.vapid_public_key || !cfg.vapid_private_key) {
    return new Response(JSON.stringify({ error: 'push is not configured (push_config disabled or missing VAPID keys)' }), { status: 503, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  try {
    webpush.setVapidDetails(cfg.vapid_subject || 'mailto:admin@bravura.local', cfg.vapid_public_key, cfg.vapid_private_key)
  } catch (err) {
    return new Response(JSON.stringify({ error: `VAPID config invalid: ${(err as Error).message}` }), { status: 503, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // 2. Load active subscriptions
  const { data: subs } = await sb.from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!subs?.length) {
    return new Response(JSON.stringify({ ok: true, delivered: 0, message: 'no active subscriptions' }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const data = JSON.stringify({
    title, body: body || '', link: link || '/', event_type: eventType,
  })

  let delivered = 0
  let failed    = 0
  const now     = new Date().toISOString()

  await Promise.all(subs.map(async (s) => {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh_key, auth: s.auth_key },
    }
    try {
      await webpush.sendNotification(subscription, data, { TTL: 60 })
      delivered++
      // Mark last_used_at + log success
      await Promise.all([
        sb.from('push_subscriptions').update({ last_used_at: now }).eq('id', s.id),
        sb.from('push_logs').update({ status: 'sent', sent_at: now })
          .eq('subscription_id', s.id).eq('status', 'pending'),
      ])
    } catch (err: any) {
      failed++
      const statusCode = err?.statusCode || err?.status
      // 404 / 410 — subscription is gone, disable it
      if (statusCode === 404 || statusCode === 410) {
        await sb.from('push_subscriptions').update({ is_active: false }).eq('id', s.id)
      }
      await sb.from('push_logs').update({
        status: 'failed',
        error_message: err?.message || `HTTP ${statusCode || '?'}`,
      }).eq('subscription_id', s.id).eq('status', 'pending')
    }
  }))

  return new Response(JSON.stringify({ ok: true, delivered, failed }), {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
