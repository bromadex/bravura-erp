// src/pages/Reports/ReportsOverview.jsx — Cross-module KPI dashboard
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const fmt  = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtN = (n) => new Intl.NumberFormat('en-US').format(n || 0)

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-icons" style={{ fontSize: 17, color }}>{icon}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{label.toUpperCase()}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function ReportsOverview() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [
          invR, fuelR, fleetR, hrR, procR, campsiteR, leaveR, accountR,
        ] = await Promise.all([
          // Inventory — item count + low-stock
          supabase.from('items').select('id, quantity, reorder_point, unit_cost').eq('is_active', true),
          // Fuel — latest tank levels
          supabase.from('fuel_tanks').select('id, current_level, capacity').eq('is_active', true),
          // Fleet — active vehicles
          supabase.from('vehicles').select('id, status'),
          // HR — headcount
          supabase.from('employees').select('id, status').neq('status', 'Terminated'),
          // Procurement — open POs
          supabase.from('purchase_orders').select('id, status, total_amount').in('status', ['Pending','Approved','Partial']),
          // Campsite occupancy
          supabase.from('room_assignments').select('id, status').eq('status', 'Active'),
          // Leave — pending approvals
          supabase.from('leave_requests').select('id, status').eq('status', 'Pending'),
          // Accounting — net profit
          supabase.from('accounts').select('type, balance').eq('is_active', true),
        ])

        const inv      = invR.data      || []
        const tanks    = fuelR.data     || []
        const vehicles = fleetR.data    || []
        const emps     = hrR.data       || []
        const pos      = procR.data     || []
        const assigns  = campsiteR.data || []
        const leaves   = leaveR.data    || []
        const accts    = accountR.data  || []

        const lowStock     = inv.filter(i => i.quantity <= (i.reorder_point || 0)).length
        const stockValue   = inv.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0)
        const fuelPct      = tanks.length
          ? tanks.reduce((s, t) => s + ((t.current_level || 0) / (t.capacity || 1)), 0) / tanks.length * 100
          : 0
        const activeVeh    = vehicles.filter(v => v.status === 'Active').length
        const openPOs      = pos.length
        const poValue      = pos.reduce((s, p) => s + (p.total_amount || 0), 0)
        const revenue      = accts.filter(a => a.type === 'Revenue').reduce((s, a) => s + (a.balance || 0), 0)
        const expenses     = accts.filter(a => a.type === 'Expense').reduce((s, a) => s + (a.balance || 0), 0)

        setData({
          invCount: inv.length, lowStock, stockValue,
          fuelPct: Math.round(fuelPct), tankCount: tanks.length,
          headcount: emps.length,
          activeVeh, totalVeh: vehicles.length,
          openPOs, poValue,
          occupancy: assigns.length,
          pendingLeave: leaves.length,
          netProfit: revenue - expenses, revenue, expenses,
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading reports…</div>
  if (!data)   return null

  const sections = [
    {
      title: 'Accounting',
      color: 'var(--teal)',
      cards: [
        { label: 'Net Profit',     value: fmt(data.netProfit),  sub: 'Revenue – Expenses',           color: data.netProfit >= 0 ? 'var(--teal)' : 'var(--red)', icon: 'trending_up'  },
        { label: 'Total Revenue',  value: fmt(data.revenue),    sub: 'Cumulative account balances',   color: 'var(--green)',                                      icon: 'payments'     },
        { label: 'Total Expenses', value: fmt(data.expenses),   sub: 'Cumulative account balances',   color: 'var(--red)',                                        icon: 'receipt_long' },
      ],
    },
    {
      title: 'Inventory',
      color: 'var(--blue)',
      cards: [
        { label: 'Items Tracked', value: fmtN(data.invCount),   sub: 'Active items in catalogue',     color: 'var(--blue)',  icon: 'inventory_2'   },
        { label: 'Low Stock',     value: fmtN(data.lowStock),   sub: 'At or below reorder point',     color: data.lowStock > 0 ? 'var(--yellow)' : 'var(--green)', icon: 'warning' },
        { label: 'Stock Value',   value: fmt(data.stockValue),  sub: 'Cost × qty on hand',            color: 'var(--blue)',  icon: 'attach_money'  },
      ],
    },
    {
      title: 'Procurement',
      color: 'var(--purple)',
      cards: [
        { label: 'Open POs',   value: fmtN(data.openPOs), sub: 'Pending / Approved / Partial',  color: 'var(--purple)', icon: 'shopping_cart'  },
        { label: 'PO Value',   value: fmt(data.poValue),  sub: 'Total open PO value',            color: 'var(--purple)', icon: 'request_quote'  },
      ],
    },
    {
      title: 'Fleet',
      color: 'var(--gold)',
      cards: [
        { label: 'Active Vehicles', value: `${data.activeVeh} / ${data.totalVeh}`, sub: 'Ready for deployment', color: 'var(--gold)', icon: 'directions_car' },
        { label: 'Avg Fuel Level',  value: `${data.fuelPct}%`,                     sub: `Across ${data.tankCount} tanks`,             color: data.fuelPct < 25 ? 'var(--red)' : 'var(--gold)', icon: 'local_gas_station' },
      ],
    },
    {
      title: 'HR',
      color: 'var(--green)',
      cards: [
        { label: 'Active Employees', value: fmtN(data.headcount),    sub: 'Excl. terminated',          color: 'var(--green)',  icon: 'people'         },
        { label: 'Pending Leave',    value: fmtN(data.pendingLeave), sub: 'Awaiting approval',          color: data.pendingLeave > 0 ? 'var(--yellow)' : 'var(--green)', icon: 'event_busy' },
      ],
    },
    {
      title: 'Campsite',
      color: 'var(--teal)',
      cards: [
        { label: 'Occupied Rooms', value: fmtN(data.occupancy), sub: 'Active assignments', color: 'var(--teal)', icon: 'hotel' },
      ],
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Reports Overview</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Live snapshot across all modules</div>
      </div>

      {sections.map(sec => (
        <div key={sec.title} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: sec.color, fontFamily: 'var(--mono)', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' }}>
            {sec.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
            {sec.cards.map(c => <KpiCard key={c.label} {...c} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
