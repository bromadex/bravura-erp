# Bravura ERP — Edge Functions

Two edge functions support Phase 10 cross-cutting engines:

## 1. `send-email`

Sends transactional emails via Resend, SendGrid, or Postmark based on the
provider configured in `email_configuration` singleton.

### Deploy

```bash
cd supabase
supabase functions deploy send-email --no-verify-jwt
```

### Required secrets

Set in Supabase Dashboard → Edge Functions → Secrets, or:

```bash
# Pick the one matching your provider:
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set SENDGRID_API_KEY=SG.xxx
supabase secrets set POSTMARK_TOKEN=xxx
```

Then in **HR → HR Settings → Email Configuration**:
- set `provider` to `resend` / `sendgrid` / `postmark`
- set `api_key_ref` to the secret **name** (e.g. `RESEND_API_KEY`)
- set `default_from_email` and `default_from_name`
- toggle `is_active = true`

The edge function reads `api_key_ref` and resolves it via `Deno.env.get(keyName)`.

### Verify

In the app: **Settings & Admin → Email Logs**, retry a failed message, or use
the Test button in Email Configuration.

---

## 2. `send-push`

Sends Web Push notifications to subscribed devices using VAPID-signed JWTs.

### Deploy

```bash
supabase functions deploy send-push --no-verify-jwt
```

### Required configuration

In Supabase Dashboard → SQL or **Settings & Admin → Push Notifications**
(as super admin):

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys --json
   ```
2. Paste the `publicKey` and `privateKey` into the admin UI, set a subject
   (e.g. `mailto:admin@yourcompany.com`), toggle `is_enabled = true`,
   and save.

### Verify

- Open the app in Chrome/Edge/Firefox.
- Go to **Settings & Admin → Push Notifications**, click **Enable Push**,
  grant permission.
- Click **Test** to dispatch a local notification (no server roundtrip).
- To verify server delivery, trigger a workflow action whose template has
  `send_push = true` — the push should arrive even when the tab is closed.

---

## Notification template channel flags

`notification_templates` now has:
- `send_push BOOLEAN` — fan out to PWA subscriptions
- `send_email BOOLEAN` — fan out via send-email
- `email_subject TEXT`, `email_body TEXT` — channel-specific copy (HTML supported)

Toggle these per template in **HR → Notification Templates**.
The `notificationEngine.pushNotificationFromTemplate()` reads the flags
and dispatches across all enabled channels.
