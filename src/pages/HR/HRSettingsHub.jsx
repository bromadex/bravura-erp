import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/ui'

const CARDS = [
  { title: 'Employee Settings',          desc: 'Numbering, retirement age, self-service',          icon: 'person',        color: 'var(--blue)',   path: '/module/hr/employee-settings' },
  { title: 'Leave Settings',             desc: 'Approval rules, calendar, encashment',             icon: 'beach_access',  color: 'var(--teal)',   path: '/module/hr/leave-settings' },
  { title: 'Expense Settings',           desc: 'Approvers, receipts, default currency',            icon: 'receipt_long',  color: '#f59e0b',       path: '/module/hr/expense-settings' },
  { title: 'Shift & Attendance Settings', desc: 'Check-in, geolocation, grace periods',            icon: 'schedule',      color: 'var(--yellow)', path: '/module/hr/shift-attendance-settings' },
  { title: 'Recruitment Settings',       desc: 'Hiring, interview reminders, offer validity',      icon: 'work_outline',  color: '#06b6d4',       path: '/module/hr/recruitment-settings' },
  { title: 'Tenure Settings',            desc: 'Separation, exit, FNF defaults',                   icon: 'logout',        color: 'var(--red)',    path: '/module/hr/tenure-settings' },
  { title: 'Performance Settings',       desc: 'Reviews, KRAs, appraisal defaults',                icon: 'rate_review',   color: 'var(--gold)',   path: '/module/hr/performance-settings' },
  { title: 'Payroll Settings',           desc: 'Frequency, tax year, slip defaults',               icon: 'payments',      color: 'var(--purple)', path: '/module/hr/payroll-settings' },
  { title: 'Notification Templates',     desc: 'Manage email and event templates',                 icon: 'notifications', color: 'var(--green)',  path: '/module/hr/notification-templates' },
  { title: 'Email Configuration',        desc: 'SMTP, sender, signing config',                     icon: 'mail',          color: 'var(--blue)',   path: '/module/hr/email-configuration' },
  { title: 'Skills & Competency Settings', desc: 'Review cycles, self-assessment, certification tracking', icon: 'workspace_premium', color: '#22d3ee', path: '/module/hr/skills-settings' },
  { title: 'Benefits & Gratuity Settings', desc: 'Benefit claims, receipts, gratuity eligibility & payroll', icon: 'card_giftcard', color: '#10b981', path: '/module/hr/benefits-settings' },
  { title: 'General Company Settings',   desc: 'Company info and HR-wide preferences',             icon: 'business',      color: 'var(--text-dim)', path: '/module/hr/hr-settings' },
]

function Card({ card, onClick }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '20px 20px 20px 28px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 130,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: 4,
        background: card.color,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="material-icons"
          style={{ fontSize: 32, color: card.color }}
        >
          {card.icon}
        </span>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
          {card.title}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {card.desc}
      </div>
    </div>
  )
}

export default function HRSettingsHub() {
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader title="HR Settings" subtitle="Configure all HR module preferences" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
        marginTop: 16,
      }}>
        {CARDS.map(card => (
          <Card key={card.path} card={card} onClick={() => navigate(card.path)} />
        ))}
      </div>
    </div>
  )
}
