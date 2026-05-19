// src/pages/Settings/PushNotificationSettings.jsx
//
// Combined page:
//   - Per-user: toggle browser push subscriptions on/off, test
//   - Admin (super_admin only): configure VAPID keys for server-side push

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { PageHeader, Spinner } from '../../components/ui'
import {
  isPushSupported, getPushStatus,
  subscribeToPush, unsubscribeFromPush, sendTestNotification,
} from '../../lib/pushNotifications'

export default function PushNotificationSettings() {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 'role_super_admin'

  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [subscriptions, setSubscriptions] = useState([])

  const [config, setConfig] = useState({ vapid_public_key: '', vapid_private_key: '', vapid_subject: 'mailto:admin@bravura.local', is_enabled: false })
  const [savingCfg, setSavingCfg] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const s = await getPushStatus()
    setStatus(s)

    if (user?.id) {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setSubscriptions(data || [])
    }

    if (isAdmin) {
      const { data } = await supabase.from('push_config').select('*').eq('id', 'singleton').maybeSingle()
      if (data) setConfig({ ...config, ...data })
    }
    setLoading(false)
  }, [user?.id, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const enable = async () => {
    if (!user?.id) return toast.error('You must be logged in')
    setBusy(true)
    try {
      await subscribeToPush(user.id)
      toast.success('Push notifications enabled')
      await load()
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await unsubscribeFromPush(user?.id)
      toast.success('Push notifications disabled')
      await load()
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const test = async () => {
    try {
      await sendTestNotification()
      toast.success('Test notification dispatched')
    } catch (err) { toast.error(err.message) }
  }

  const revokeSubscription = async (id) => {
    try {
      await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', id)
      toast.success('Subscription revoked')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const saveConfig = async () => {
    setSavingCfg(true)
    try {
      const payload = { id: 'singleton', ...config, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('push_config').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      toast.success('Push configuration saved')
    } catch (err) { toast.error(err.message) }
    finally { setSavingCfg(false) }
  }

  if (loading) return <div><PageHeader title="Push Notifications" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Push Notifications" subtitle="Receive Bravura alerts directly on this device" />

      {!isPushSupported() ? (
        <div style={{ background: 'var(--yellow)22', border: '1px solid var(--yellow)55', borderRadius: 10, padding: 16, marginTop: 16, fontSize: 13, color: 'var(--yellow)' }}>
          <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>warning</span>
          This browser does not support web push notifications.
        </div>
      ) : (
        <>
          {/* Status card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: status?.enabled ? 'var(--green)22' : 'var(--text-dim)22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-icons" style={{ fontSize: 28, color: status?.enabled ? 'var(--green)' : 'var(--text-dim)' }}>
                  {status?.enabled ? 'notifications_active' : 'notifications_off'}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {status?.enabled ? 'Notifications are enabled' : 'Notifications are disabled'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
                  Permission: <strong>{status?.permission}</strong>
                  {status?.permission === 'denied' && (
                    <span style={{ color: 'var(--red)', marginLeft: 12 }}>
                      <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>block</span>
                      Blocked in browser settings — please re-allow from the address bar
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {status?.enabled
                  ? <>
                      <button className="btn btn-secondary" onClick={test}>
                        <span className="material-icons">send</span> Test
                      </button>
                      <button className="btn btn-danger" onClick={disable} disabled={busy}>
                        <span className="material-icons">notifications_off</span> Disable
                      </button>
                    </>
                  : <button className="btn btn-primary" onClick={enable} disabled={busy || status?.permission === 'denied'}>
                      <span className="material-icons">notifications_active</span> {busy ? 'Enabling…' : 'Enable Push'}
                    </button>}
              </div>
            </div>
          </div>

          {/* Active subscriptions */}
          {subscriptions.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Your Subscribed Devices ({subscriptions.filter(s => s.is_active).length} active)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subscriptions.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, opacity: s.is_active ? 1 : 0.5 }}>
                    <span className="material-icons" style={{ fontSize: 18, color: s.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                      {s.is_active ? 'check_circle' : 'cancel'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.user_agent ? s.user_agent.split(') ')[0].split('(').pop() : 'Unknown device'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        Added {new Date(s.created_at).toLocaleString()}
                        {s.last_used_at && ` · Last push: ${new Date(s.last_used_at).toLocaleString()}`}
                      </div>
                    </div>
                    {s.is_active && (
                      <button className="btn btn-secondary btn-sm" onClick={() => revokeSubscription(s.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Admin VAPID config */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)55', borderRadius: 12, padding: 24, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>admin_panel_settings</span>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Server Push Configuration (Admin Only)</h3>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.5 }}>
            Web Push requires VAPID (Voluntary Application Server Identification) keys.
            Generate a pair with <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>npx web-push generate-vapid-keys</code>,
            paste them below, and toggle the feature on. The keys are read by the <code>send-push</code> edge function.
          </div>
          <div className="form-group">
            <label>VAPID Public Key</label>
            <textarea className="form-control" rows={2} value={config.vapid_public_key || ''}
              onChange={e => setConfig(p => ({ ...p, vapid_public_key: e.target.value }))}
              style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
          </div>
          <div className="form-group">
            <label>VAPID Private Key</label>
            <textarea className="form-control" rows={2} value={config.vapid_private_key || ''}
              onChange={e => setConfig(p => ({ ...p, vapid_private_key: e.target.value }))}
              style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
            <small style={{ fontSize: 11, color: 'var(--red)' }}>
              <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>warning</span> Treat as a secret. Used only server-side in the send-push edge function.
            </small>
          </div>
          <div className="form-group">
            <label>VAPID Subject</label>
            <input className="form-control" value={config.vapid_subject || ''}
              onChange={e => setConfig(p => ({ ...p, vapid_subject: e.target.value }))} placeholder="mailto:admin@yourcompany.com" />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!config.is_enabled}
                onChange={e => setConfig(p => ({ ...p, is_enabled: e.target.checked }))} />
              Enable web push system-wide
            </label>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={saveConfig} disabled={savingCfg}>
              <span className="material-icons">save</span> {savingCfg ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
