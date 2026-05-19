// src/lib/pushNotifications.js
//
// Client-side helper for managing PWA web push notifications.
// Handles service worker registration, permission requests, subscription
// management, and persistence to Supabase.
//
// Usage from the app:
//   import { registerServiceWorker, subscribeToPush, unsubscribeFromPush, getPushStatus }
//   await registerServiceWorker()         // call once at startup
//   const status = await getPushStatus()  // check current state
//   await subscribeToPush(userId)         // enable
//   await unsubscribeFromPush(userId)     // disable

import { supabase } from './supabase'

const SW_URL = '/sw.js'

// ── Service worker registration ─────────────────────────────────
export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[push] Service Worker not supported in this browser')
    return null
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    return reg
  } catch (err) {
    console.warn('[push] SW registration failed:', err)
    return null
  }
}

// ── Capability detection ────────────────────────────────────────
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager'   in window     &&
    'Notification'  in window
  )
}

export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

// ── VAPID public key from push_config singleton ─────────────────
async function getVapidPublicKey() {
  const { data } = await supabase
    .from('push_config')
    .select('vapid_public_key, is_enabled')
    .eq('id', 'singleton')
    .maybeSingle()
  if (!data || !data.is_enabled) return null
  return data.vapid_public_key || null
}

// urlBase64ToUint8Array — required for applicationServerKey
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output  = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

// ── Current subscription state ──────────────────────────────────
export async function getPushStatus() {
  if (!isPushSupported()) {
    return { supported: false, enabled: false, permission: 'unsupported', subscription: null }
  }
  const permission = Notification.permission
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { supported: true, enabled: false, permission, subscription: null }
  const sub = await reg.pushManager.getSubscription()
  return {
    supported:    true,
    enabled:      !!sub && permission === 'granted',
    permission,
    subscription: sub,
  }
}

// ── Subscribe ───────────────────────────────────────────────────
export async function subscribeToPush(userId) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser')
  if (!userId)            throw new Error('userId is required to subscribe')

  // 1. Request permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted')
  }

  // 2. Ensure SW is registered & ready
  let reg = await navigator.serviceWorker.getRegistration()
  if (!reg) reg = await registerServiceWorker()
  if (!reg) throw new Error('Service worker is not available')
  await navigator.serviceWorker.ready

  // 3. Fetch VAPID public key
  const vapidKey = await getVapidPublicKey()
  if (!vapidKey) throw new Error('Push is not yet configured by an administrator (missing VAPID public key)')

  // 4. Subscribe
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })

  // 5. Persist to Supabase
  const json = sub.toJSON()
  const payload = {
    id:         crypto.randomUUID(),
    user_id:    userId,
    endpoint:   sub.endpoint,
    p256dh_key: json.keys?.p256dh || '',
    auth_key:   json.keys?.auth   || '',
    user_agent: navigator.userAgent,
    is_active:  true,
  }

  // Upsert by (user_id, endpoint)
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint)
    .maybeSingle()

  if (existing) {
    await supabase.from('push_subscriptions').update({
      p256dh_key: payload.p256dh_key,
      auth_key:   payload.auth_key,
      user_agent: payload.user_agent,
      is_active:  true,
    }).eq('id', existing.id)
  } else {
    await supabase.from('push_subscriptions').insert([payload])
  }

  return sub
}

// ── Unsubscribe ─────────────────────────────────────────────────
export async function unsubscribeFromPush(userId) {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await sub.unsubscribe()
    if (userId) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint)
    }
  }
}

// ── Dispatch a test notification (locally; no server) ───────────
export async function sendTestNotification() {
  if (!isPushSupported()) throw new Error('Not supported')
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Service worker not registered')
  return reg.showNotification('Bravura ERP — Test', {
    body: 'Notifications are working correctly.',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag:  'bravura-test',
  })
}
