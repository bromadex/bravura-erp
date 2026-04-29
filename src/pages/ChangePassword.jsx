// src/pages/ChangePassword.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function ChangePassword() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!form.currentPassword) {
      toast.error('Current password required')
      return
    }
    if (form.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      // Verify current password
      const { data, error } = await supabase
        .from('app_users')
        .select('password_plain, password_hash')
        .eq('id', user.id)
        .single()

      if (error) throw new Error('User not found')

      const isValid = data.password_plain === form.currentPassword || 
                      atob(data.password_hash || '') === form.currentPassword
      
      if (!isValid) {
        toast.error('Current password is incorrect')
        return
      }

      // Update password
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          password_plain: form.newPassword,
          password_hash: btoa(form.newPassword),
          must_change_password: false
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      toast.success('Password changed successfully! Please log in again.')
      
      // Log out and redirect to login
      setTimeout(() => {
        logout()
        navigate('/login')
      }, 1500)
      
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 16
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span className="material-icons" style={{ fontSize: 56, color: 'var(--gold)' }}>lock</span>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>Change Password</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>You must change your password before continuing</p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                className="form-control"
                value={form.currentPassword}
                onChange={e => setForm({ ...form, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                className="form-control"
                value={form.newPassword}
                onChange={e => setForm({ ...form, newPassword: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                className="form-control"
                value={form.confirmPassword}
                onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
