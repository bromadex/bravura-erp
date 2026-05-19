// src/pages/HR/HRDashboard.jsx
// HR module landing page — category picker inspired by Frappe HR.

import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'

const CATEGORIES = [
  {
    id: 'setup',
    icon: 'manage_accounts',
    label: 'HR Setup',
    desc: 'Employees, grades, employment types & org chart',
    color: '#f87171',
    route: '/module/hr/employees',
    pages: ['employees', 'departments', 'designations', 'employee-grades', 'employment-types', 'permissions', 'org-chart'],
  },
  {
    id: 'lifecycle',
    icon: 'timeline',
    label: 'Employee Lifecycle',
    desc: 'Promotions, transfers, onboarding, separation & F&F',
    color: '#c084fc',
    route: '/module/hr/promotions',
    pages: ['promotions', 'transfers', 'onboarding', 'separation', 'full-final'],
  },
  {
    id: 'attendance',
    icon: 'fingerprint',
    label: 'Attendance',
    desc: 'Daily clock-in/out & attendance requests',
    color: '#34d399',
    route: '/module/hr/attendance',
    pages: ['attendance', 'attendance-requests'],
  },
  {
    id: 'shifts',
    icon: 'schedule',
    label: 'Shift Management',
    desc: 'Shift types, assignments & holiday lists',
    color: '#fbbf24',
    route: '/module/hr/shift-types',
    pages: ['shift-types', 'shift-assignments', 'holiday-lists'],
  },
  {
    id: 'leaves',
    icon: 'beach_access',
    label: 'Leaves',
    desc: 'Requests, policies, allocation & balance',
    color: '#60a5fa',
    route: '/module/hr/leave',
    pages: ['leave', 'leave-policies', 'leave-allocation', 'compensatory-leave', 'leave-encashment', 'leave-balance', 'leave-calendar', 'leave-reports'],
  },
  {
    id: 'payroll',
    icon: 'payments',
    label: 'Payroll',
    desc: 'Salary structures, slips, payroll entry & timesheets',
    color: '#a78bfa',
    route: '/module/hr/payroll',
    pages: ['payroll', 'timesheet', 'salary-structures', 'salary-slips', 'payroll-entry', 'travel'],
  },
  {
    id: 'recruitment',
    icon: 'work_outline',
    label: 'Recruitment',
    desc: 'Requisitions, job openings, applicants & interviews',
    color: '#06b6d4',
    route: '/module/hr/job-requisitions',
    pages: ['job-requisitions', 'job-postings', 'applicants', 'interviews'],
  },
  {
    id: 'performance',
    icon: 'rate_review',
    label: 'Performance',
    desc: 'Appraisals, KRAs, templates & reviews',
    color: '#f59e0b',
    route: '/module/hr/appraisal-periods',
    pages: ['appraisal-periods', 'appraisal-templates', 'kras', 'performance-reviews', 'kpi-templates'],
  },
  {
    id: 'overtime',
    icon: 'more_time',
    label: 'Overtime',
    desc: 'Overtime types, slips & payroll integration',
    color: '#f97316',
    route: '/module/hr/overtime',
    pages: ['overtime'],
  },
  {
    id: 'grievances',
    icon: 'report_problem',
    label: 'Grievances',
    desc: 'Employee grievance types, filing & resolution',
    color: '#ef4444',
    route: '/module/hr/grievances',
    pages: ['grievances'],
  },
  {
    id: 'training',
    icon: 'school',
    label: 'Training',
    desc: 'Training types, schedules & employee training log',
    color: '#0ea5e9',
    route: '/module/hr/training',
    pages: ['training'],
  },
  {
    id: 'referrals',
    icon: 'share',
    label: 'Referrals',
    desc: 'Employee referral programs & bonus tracking',
    color: '#8b5cf6',
    route: '/module/hr/referrals',
    pages: ['referrals'],
  },
  {
    id: 'expenses',
    icon: 'receipt_long',
    label: 'Expenses',
    desc: 'Claims & employee advances',
    color: '#fb923c',
    route: '/module/expenses',
    pages: null,
  },
  {
    id: 'reports',
    icon: 'bar_chart',
    label: 'HR Reports',
    desc: 'Attendance, leave balance, salary register & analytics',
    color: '#38bdf8',
    route: '/module/hr/hr-reports',
    pages: ['hr-reports', 'scheduled-notifications'],
  },
  {
    id: 'analytics',
    icon: 'insights',
    label: 'Analytics',
    desc: 'KPIs, headcounts & smart alerts',
    color: '#10b981',
    route: '/module/hr/analytics',
    pages: ['dashboard'],
  },
  {
    id: 'pay-adjustments',
    icon: 'tune',
    label: 'Pay Adjustments',
    desc: 'PAYE slabs, exemptions, arrears, withholdings, incentives & bonuses',
    color: '#e879f9',
    route: '/module/hr/tax-years',
    pages: ['tax-years', 'tax-exemptions', 'additional-salary', 'salary-arrears', 'salary-withholdings', 'payroll-corrections', 'employee-incentives', 'retention-bonuses', 'component-accounts'],
  },
  {
    id: 'hr-settings',
    icon: 'settings',
    label: 'HR Settings',
    desc: 'Employee, payroll, leave, recruitment & notification configuration',
    color: '#64748b',
    route: '/module/hr/hr-settings-hub',
    pages: ['hr-settings-hub', 'hr-settings', 'employee-settings', 'leave-settings', 'expense-settings', 'shift-attendance-settings', 'recruitment-settings', 'tenure-settings', 'performance-settings', 'payroll-settings', 'notification-templates', 'email-configuration'],
  },
]

export default function HRDashboard() {
  const navigate   = useNavigate()
  const canView    = useCanView

  const visibleCategories = CATEGORIES.filter(cat => {
    if (!cat.pages) return true
    return cat.pages.some(p => canView('hr', p))
  })

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Human Resources</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Select a category to get started</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 16,
      }}>
        {visibleCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => navigate(cat.route)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '28px 20px',
              cursor: 'pointer',
              transition: 'all .2s',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = cat.color
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = `0 8px 24px ${cat.color}22`
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{
              width: 56, height: 56,
              borderRadius: 14,
              background: `${cat.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-icons" style={{ fontSize: 30, color: cat.color }}>{cat.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{cat.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{cat.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
