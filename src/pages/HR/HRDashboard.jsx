// src/pages/HR/HRDashboard.jsx

import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'

const CATEGORIES = [
  {
    id: 'organisation',
    icon: 'corporate_fare',
    label: 'Organisation',
    desc: 'Employees, departments, designations, grades & org chart',
    color: '#f87171',
    route: '/module/hr/employees',
    module: 'hr',
    pages: ['employees', 'departments', 'designations', 'employee-grades', 'employment-types', 'permissions', 'org-chart', 'department-approvers'],
  },
  {
    id: 'lifecycle',
    icon: 'timeline',
    label: 'Employee Lifecycle',
    desc: 'Promotions, transfers, onboarding, separation & F&F',
    color: '#c084fc',
    route: '/module/hr/promotions',
    module: 'hr',
    pages: ['promotions', 'transfers', 'onboarding', 'boarding-activities', 'separation', 'exit-interviews', 'exit-questionnaire', 'full-final'],
  },
  {
    id: 'shifts-attendance',
    icon: 'schedule',
    label: 'Shifts & Attendance',
    desc: 'Shift types, assignments, attendance, check-ins & biometric devices',
    color: '#34d399',
    route: '/module/hr/attendance',
    module: 'hr',
    pages: ['shift-types', 'shift-assignments', 'shift-assignment-tool', 'shift-schedules', 'shift-requests', 'holiday-lists', 'holiday-list-assignments', 'attendance', 'attendance-tool', 'attendance-requests', 'employee-checkins', 'attendance-devices', 'daily-work-summary'],
  },
  {
    id: 'leave',
    icon: 'beach_access',
    label: 'Leave Management',
    desc: 'Requests, policies, allocation, accrual, balance & calendar',
    color: '#60a5fa',
    route: '/module/hr/leave',
    module: 'hr',
    pages: ['leave', 'leave-types', 'leave-policies', 'leave-allocation', 'leave-control-panel', 'leave-block-list', 'earned-leave-schedule', 'compensatory-leave', 'leave-encashment', 'leave-balance', 'leave-calendar', 'leave-reports'],
  },
  {
    id: 'payroll',
    icon: 'payments',
    label: 'Payroll & Compensation',
    desc: 'Salary structures, slips, entry, PAYE, adjustments & overtime',
    color: '#a78bfa',
    route: '/module/hr/payroll',
    module: 'hr',
    pages: ['payroll', 'salary-structures', 'salary-slips', 'payroll-entry', 'tax-years', 'tax-exemptions', 'additional-salary', 'salary-arrears', 'salary-withholdings', 'payroll-corrections', 'employee-incentives', 'retention-bonuses', 'component-accounts', 'timesheet', 'travel', 'purpose-of-travel', 'overtime'],
  },
  {
    id: 'recruitment',
    icon: 'work_outline',
    label: 'Recruitment',
    desc: 'Requisitions, openings, applicants, interviews & offer letters',
    color: '#06b6d4',
    route: '/module/hr/job-requisitions',
    module: 'hr',
    pages: ['job-requisitions', 'job-postings', 'applicants', 'interviews', 'interview-types', 'applicant-sources', 'appointment-letters', 'job-offer-templates'],
  },
  {
    id: 'talent',
    icon: 'rate_review',
    label: 'Talent & Growth',
    desc: 'Performance appraisals, KRAs, training, skills & referrals',
    color: '#f59e0b',
    route: '/module/hr/performance-reviews',
    module: 'hr',
    pages: ['appraisal-cycles', 'appraisal-periods', 'appraisal-templates', 'kras', 'performance-reviews', 'kpi-templates', 'peer-feedback', 'training', 'skills-admin', 'employee-skills', 'skill-matrix', 'designation-skills', 'referrals'],
  },
  {
    id: 'benefits',
    icon: 'card_giftcard',
    label: 'Benefits & Wellbeing',
    desc: 'Gratuity rules, employee benefits & grievance resolution',
    color: '#10b981',
    route: '/module/hr/employee-benefits',
    module: 'hr',
    pages: ['gratuity-rules', 'gratuity', 'employee-benefits', 'grievances'],
  },
  {
    id: 'expenses',
    icon: 'receipt_long',
    label: 'Expenses',
    desc: 'Claims, employee advances & expense types',
    color: '#fb923c',
    route: '/module/expenses',
    module: 'expenses',
    pages: ['claims', 'advances'],
  },
  {
    id: 'hr-settings',
    icon: 'settings',
    label: 'HR Settings',
    desc: 'Employee, payroll, leave, recruitment & notification configuration',
    color: '#64748b',
    route: '/module/hr/hr-settings-hub',
    module: 'hr',
    pages: ['hr-settings-hub', 'hr-settings', 'employee-settings', 'leave-settings', 'expense-settings', 'shift-attendance-settings', 'recruitment-settings', 'tenure-settings', 'performance-settings', 'payroll-settings', 'notification-templates', 'email-configuration', 'skills-settings', 'benefits-settings', 'documents-settings'],
  },
]

export default function HRDashboard() {
  const navigate = useNavigate()
  const canView  = useCanView

  const visibleCategories = CATEGORIES.filter(cat =>
    cat.pages ? cat.pages.some(p => canView(cat.module || 'hr', p)) : true
  )

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Human Resources</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Select a category to get started</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
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
