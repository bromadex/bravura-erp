// src/components/layout/Sidebar.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePermission } from '../../contexts/PermissionContext'

// Maps HR page IDs to their section label so the sidebar can auto-filter
const HR_PAGE_SECTION = {
  employees: 'Organisation', departments: 'Organisation',
  designations: 'Organisation', permissions: 'Organisation',
  attendance: 'Shifts & Attendance', 'attendance-requests': 'Shifts & Attendance',
  'shift-types': 'Shifts & Attendance', 'shift-assignments': 'Shifts & Attendance',
  'holiday-lists': 'Shifts & Attendance',
  leave: 'Leave Management', 'leave-policies': 'Leave Management',
  'leave-allocation': 'Leave Management', 'compensatory-leave': 'Leave Management',
  'leave-encashment': 'Leave Management', 'leave-balance': 'Leave Management',
  'leave-calendar': 'Leave Management', 'leave-reports': 'Leave Management',
  payroll: 'Payroll & Travel', travel: 'Payroll & Travel', timesheet: 'Payroll & Travel',
  analytics: 'Overview',
}

const ALL_MODULES = {
  dashboard: {
    label: 'Dashboard', icon: 'dashboard', color: '#b83232',
    sections: [{ label: 'Overview', pages: [{ id: 'overview', label: 'Dashboard', icon: 'dashboard' }] }],
  },
  procurement: {
    label: 'Procurement', icon: 'shopping_cart', color: '#a78bfa',
    sections: [{
      label: 'Overview', pages: [
        { id: 'dashboard',            label: 'Dashboard',            icon: 'dashboard'      },
      ],
    }, {
      label: 'Purchasing Lifecycle', pages: [
        { id: 'store-requisitions',    label: 'Store Requisitions',   icon: 'assignment'     },
        { id: 'purchase-requisitions', label: 'Purchase Requisitions',icon: 'request_quote'  },
        { id: 'rfq',                   label: 'Request for Quotation',icon: 'send'           },
        { id: 'quotations',            label: 'Supplier Quotations',  icon: 'format_quote'   },
        { id: 'quotation-comparison',  label: 'Quote Comparison',     icon: 'compare'        },
        { id: 'purchase-orders',       label: 'Purchase Orders',      icon: 'shopping_bag'   },
        { id: 'goods-received',        label: 'Goods Received (GRN)', icon: 'move_to_inbox'  },
        { id: 'invoices',              label: 'Purchase Invoices',    icon: 'receipt_long'   },
      ],
    }, {
      label: 'Controls & Analytics', pages: [
        { id: 'budget-control',        label: 'Budget Control',       icon: 'account_balance'},
        { id: 'supplier-performance',  label: 'Supplier Performance', icon: 'star_rate'      },
        { id: 'suppliers',             label: 'Suppliers',            icon: 'store'          },
      ],
    }],
  },
  inventory: {
    label: 'Inventory', icon: 'inventory', color: '#2dd4bf',
    sections: [
      {
        label: 'Stock Management', pages: [
          { id: 'stock-balance', label: 'Stock Balance', icon: 'list_alt'      },
          { id: 'stock-in',      label: 'Stock In',      icon: 'add_circle'    },
          { id: 'stock-out',     label: 'Stock Out',     icon: 'remove_circle' },
          { id: 'transactions',  label: 'Transactions',  icon: 'swap_horiz'    },
          { id: 'stock-taking',  label: 'Stock Taking',  icon: 'fact_check'    },
          { id: 'categories',    label: 'Categories',    icon: 'category'      },
        ],
      },
      {
        label: 'Configuration', pages: [
          { id: 'locations', label: 'Storage Locations', icon: 'location_on' },
        ],
      },
    ],
  },
  logistics: {
    label: 'Logistics', icon: 'local_shipping', color: '#60a5fa',
    sections: [{
      label: 'Operations', pages: [
        { id: 'dashboard',   label: 'Dashboard',   icon: 'dashboard'       },
        { id: 'batch-plant', label: 'Batch Plant', icon: 'factory'         },
        { id: 'deliveries',  label: 'Deliveries',  icon: 'local_shipping'  },
        { id: 'camp',        label: 'Camp Stock',  icon: 'storefront'      },
      ],
    }],
  },
  fuel: {
    label: 'Fuel Management', icon: 'local_gas_station', color: '#fbbf24',
    sections: [{
      label: 'Operations', pages: [
        { id: 'tanks',           label: 'Fuel Tanks',       icon: 'water'              },
        { id: 'dipstick',        label: 'Dipstick Log',     icon: 'straighten'         },
        { id: 'issuance',        label: 'Fuel Issuance',    icon: 'local_gas_station'  },
        { id: 'deliveries',      label: 'Deliveries',       icon: 'local_shipping'     },
      ],
    }, {
      label: 'Analytics', pages: [
        { id: 'reconciliation',  label: 'Reconciliation',   icon: 'balance'            },
        { id: 'consumption',     label: 'Vehicle Consumption', icon: 'speed'            },
        { id: 'forecasting',     label: 'Forecasting',      icon: 'trending_up'        },
        { id: 'reports',         label: 'Fuel Reports',     icon: 'bar_chart'          },
      ],
    }],
  },
  fleet: {
    label: 'Fleet & Assets', icon: 'directions_car', color: '#34d399',
    sections: [{
      label: 'Operations', pages: [
        { id: 'contractor-equipment', label: 'Contractor Equipment', icon: 'handshake'        },
        { id: 'dashboard',          label: 'Fleet Dashboard',    icon: 'dashboard'            },
        { id: 'vehicles',           label: 'Vehicles',           icon: 'directions_car'       },
        { id: 'generators',         label: 'Generators',         icon: 'bolt'                 },
        { id: 'heavy-equipment',    label: 'Heavy Equipment',    icon: 'construction'         },
        { id: 'maintenance-alerts', label: 'Maintenance Alerts', icon: 'notifications_active' },
        { id: 'asset-issues',       label: 'Asset Issues',       icon: 'bug_report'           },
      ],
    }, {
      label: 'Asset Registry', pages: [
        { id: 'asset-registry',     label: 'Asset Dashboard',    icon: 'inventory_2'          },
        { id: 'registry',           label: 'All Assets',         icon: 'list_alt'             },
        { id: 'reclass-log',        label: 'Reclassification Log', icon: 'swap_horiz'         },
        { id: 'asset-import',       label: 'Import Assets',      icon: 'download'             },
        { id: 'category-config',    label: 'Category Config',    icon: 'tune'                 },
      ],
    }, {
      label: 'Maintenance', pages: [
        { id: 'preventive-maintenance', label: 'Preventive Maintenance', icon: 'event_available'  },
        { id: 'tyre-management',        label: 'Tyre Management',        icon: 'tire_repair'      },
      ],
    }, {
      label: 'Analytics', pages: [
        { id: 'downtime-analytics', label: 'Downtime Analytics',  icon: 'timer_off'            },
        { id: 'cost-analysis',      label: 'Cost Analysis (TCO)', icon: 'price_check'          },
      ],
    }],
  },
  hr: {
    label: 'Human Resources', icon: 'badge', color: '#f87171',
    sections: [
      {
        label: 'Overview',
        pages: [
          { id: 'dashboard',  label: 'HR Home',    icon: 'home'      },
          { id: 'analytics',  label: 'Analytics',  icon: 'bar_chart' },
        ],
      },
      {
        label: 'Organisation',
        pages: [
          { id: 'employees',    label: 'Employees',    icon: 'people'               },
          { id: 'departments',  label: 'Departments',  icon: 'business'             },
          { id: 'designations', label: 'Designations', icon: 'work'                 },
          { id: 'permissions',  label: 'Permissions',  icon: 'admin_panel_settings' },
        ],
      },
      {
        label: 'Shifts & Attendance',
        pages: [
          { id: 'shift-types',          label: 'Shift Types',          icon: 'pending_actions'        },
          { id: 'shift-assignments',    label: 'Shift Assignments',    icon: 'assignment_ind'         },
          { id: 'holiday-lists',        label: 'Holiday Lists',        icon: 'beach_access'           },
          { id: 'attendance',           label: 'Attendance',           icon: 'schedule'               },
          { id: 'attendance-requests',  label: 'Attendance Requests',  icon: 'edit_calendar'          },
        ],
      },
      {
        label: 'Leave Management',
        pages: [
          { id: 'leave',              label: 'Leave',               icon: 'event_busy'             },
          { id: 'leave-policies',     label: 'Leave Policies',      icon: 'policy'                 },
          { id: 'leave-allocation',   label: 'Leave Allocation',    icon: 'calendar_month'         },
          { id: 'compensatory-leave', label: 'Compensatory Leave',  icon: 'swap_horiz'             },
          { id: 'leave-encashment',   label: 'Leave Encashment',    icon: 'payments'               },
          { id: 'leave-balance',      label: 'Leave Balance',       icon: 'account_balance_wallet' },
          { id: 'leave-calendar',     label: 'Leave Calendar',      icon: 'calendar_today'         },
          { id: 'leave-reports',      label: 'Leave Reports',       icon: 'bar_chart'              },
        ],
      },
      {
        label: 'Payroll & Travel',
        pages: [
          { id: 'payroll',    label: 'Payroll',           icon: 'payments'   },
          { id: 'travel',     label: 'Travel',            icon: 'flight'     },
          { id: 'timesheet',  label: 'Timesheet Summary', icon: 'fact_check' },
        ],
      },
    ],
  },
  expenses: {
    label: 'Expenses', icon: 'receipt_long', color: '#fb923c',
    sections: [
      {
        label: 'Overview',
        pages: [{ id: 'dashboard', label: 'Expense Dashboard', icon: 'dashboard' }],
      },
      {
        label: 'Claims & Advances',
        pages: [
          { id: 'claims',   label: 'Expense Claims',    icon: 'receipt'            },
          { id: 'advances', label: 'Employee Advances', icon: 'account_balance'    },
        ],
      },
      {
        label: 'Configuration',
        pages: [
          { id: 'types', label: 'Expense Types', icon: 'category' },
        ],
      },
    ],
  },
  campsite: {
    label: 'Campsite', icon: 'cabin', color: '#86efac',
    sections: [
      {
        label: 'Overview',
        pages: [{ id: 'overview', label: 'Camp Overview', icon: 'map' }],
      },
      {
        label: 'Assignments',
        pages: [
          { id: 'assignments', label: 'Assignments', icon: 'assignment_ind' },
          { id: 'rooms',       label: 'Rooms',       icon: 'bed'            },
          { id: 'blocks',      label: 'Blocks',      icon: 'domain'         },
        ],
      },
      {
        label: 'Camp Supplies',
        pages: [
          { id: 'camp-stock',   label: 'Stock Levels',          icon: 'inventory_2' },
          { id: 'consumption',  label: 'Consumption Analytics', icon: 'analytics'   },
          { id: 'ppe-register', label: 'PPE Register',          icon: 'security'    },
          { id: 'headcount',    label: 'Headcount',             icon: 'people'      },
        ],
      },
    ],
  },
  connect: {
    label: 'Connect', icon: 'forum', color: '#67e8f9',
    sections: [{
      label: 'Messaging', pages: [
        { id: 'chats', label: 'Messages', icon: 'chat' },
      ],
    }],
  },
  governance: {
    label: 'Governance', icon: 'policy', color: '#fcd34d',
    sections: [{
      label: 'Compliance', pages: [
        { id: 'announcements', label: 'Announcements',    icon: 'campaign'    },
        { id: 'memos',         label: 'Memos',            icon: 'mail'        },
        { id: 'policies',      label: 'Policies & Rules', icon: 'description' },
        { id: 'code-of-ethics', label: 'Code of Ethics',  icon: 'verified'    },
      ],
    }],
  },
  accounting: {
    label: 'Accounting', icon: 'receipt', color: '#818cf8',
    sections: [{
      label: 'Finance', pages: [
        { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: 'account_tree' },
        { id: 'journal-entries',   label: 'Journal Entries',   icon: 'book'         },
        { id: 'reports',           label: 'Financial Reports', icon: 'assessment'   },
      ],
    }],
  },
  projects: {
    label: 'Projects', icon: 'folder_open', color: '#f59e0b',
    sections: [{
      label: 'Petty Cash', pages: [
        { id: 'petty-cash-dashboard',      label: 'PC Dashboard',      icon: 'dashboard'         },
        { id: 'petty-cash-funds',          label: 'Funds & Top-ups',   icon: 'account_balance_wallet' },
        { id: 'petty-cash-expenses',       label: 'Expenses',          icon: 'receipt_long'      },
        { id: 'petty-cash-reconciliation', label: 'Reconciliation',    icon: 'balance'           },
      ],
    }],
  },
  reports: {
    label: 'Reports', icon: 'bar_chart', color: '#38bdf8',
    sections: [{
      label: 'Analytics', pages: [
        { id: 'overview',        label: 'Overview',         icon: 'dashboard'     },
        { id: 'kpi-dashboards',  label: 'KPI Dashboards',   icon: 'insights'      },
        { id: 'report-builder',  label: 'Report Builder',   icon: 'build_circle'  },
      ],
    }, {
      label: 'Automation', pages: [
        { id: 'scheduled',       label: 'Scheduled Reports', icon: 'schedule_send' },
      ],
    }, {
      label: 'Logs', pages: [
        { id: 'audit-log',       label: 'Audit Trail',       icon: 'history'       },
        { id: 'drafts',          label: 'Drafts',            icon: 'drafts'        },
      ],
    }],
  },
  settings: {
    label: 'Settings & Admin', icon: 'admin_panel_settings', color: '#a78bfa',
    sections: [{
      label: 'Master Data', pages: [
        { id: 'master-data', label: 'Master Data',      icon: 'database' },
      ],
    }, {
      label: 'System Configuration', pages: [
        { id: 'workflows', label: 'Workflow Builder', icon: 'account_tree' },
      ],
    }],
  },
}

export default function Sidebar({ module }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { canView } = usePermission()

  const config = (() => {
    const full = ALL_MODULES[module]
    if (!full) return null
    const filteredSections = full.sections
      .map(section => {
        const filteredPages = section.pages.filter(page => canView(module, page.id))
        return filteredPages.length > 0 ? { ...section, pages: filteredPages } : null
      })
      .filter(Boolean)
    return filteredSections.length > 0 ? { ...full, sections: filteredSections } : null
  })()

  const storageKey = `sidebar_exp_${module}`
  const [expanded, setExpanded] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') }
    catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(expanded))
  }, [expanded, storageKey])

  const [mobileOpen, setMobileOpen] = useState(false)

  if (!config) return null

  const currentPage = location.pathname.split('/').pop()

  // For HR: show only the section the active page belongs to
  const activeSectionLabel = module === 'hr' ? HR_PAGE_SECTION[currentPage] : null
  const visibleSections = activeSectionLabel
    ? config.sections.filter(s => s.label === activeSectionLabel)
    : config.sections

  const toggleSection = (label) => setExpanded(prev => ({ ...prev, [label]: !prev[label] }))

  const btnStyle = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 12, fontWeight: 600, transition: 'all .15s' }
  const btnHover = (e) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' }
  const btnOut   = (e) => { e.currentTarget.style.background = 'transparent';     e.currentTarget.style.color = 'var(--text-mid)' }

  const sidebarContent = (
    <aside style={{ width: 248, background: 'var(--surface)', borderRight: '1px solid var(--border)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Module header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${config.color}22`, border: `1px solid ${config.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-icons" style={{ color: config.color, fontSize: 20 }}>{config.icon}</span>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{config.label}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>MODULE</div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div style={{ padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {module === 'hr' && (
          <button onClick={() => navigate('/module/hr')} style={btnStyle} onMouseOver={btnHover} onMouseOut={btnOut}>
            <span className="material-icons" style={{ fontSize: 16 }}>badge</span>
            HR Home
          </button>
        )}
        <button onClick={() => navigate('/')} style={btnStyle} onMouseOver={btnHover} onMouseOut={btnOut}>
          <span className="material-icons" style={{ fontSize: 16 }}>home</span>
          Back to Home
        </button>
      </div>

      {/* Pages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 20px' }}>
        {visibleSections.map(section => {
          const isExpanded = expanded[section.label] !== false
          return (
            <div key={section.label} style={{ marginBottom: 4 }}>
              <button onClick={() => toggleSection(section.label)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>
                <span style={{ flex: 1, textAlign: 'left' }}>{section.label}</span>
                <span className="material-icons" style={{ fontSize: 14 }}>{isExpanded ? 'expand_less' : 'expand_more'}</span>
              </button>
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                  {section.pages.map(page => {
                    const isActive = currentPage === page.id || (page.id === visibleSections[0]?.pages[0]?.id && location.pathname === `/module/${module}`)
                    return (
                      <button key={page.id} onClick={() => { navigate(`/module/${module}/${page.id}`); setMobileOpen(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px 8px 20px', borderRadius: 8, border: 'none', background: isActive ? `${config.color}18` : 'transparent', cursor: 'pointer', color: isActive ? config.color : 'var(--text-mid)', fontSize: 12, fontWeight: isActive ? 700 : 400, textAlign: 'left', transition: 'all .12s', borderLeft: isActive ? `3px solid ${config.color}` : '3px solid transparent' }}
                        onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
                        onMouseOut={e =>  { if (!isActive) { e.currentTarget.style.background = 'transparent';     e.currentTarget.style.color = 'var(--text-mid)' } }}>
                        <span className="material-icons" style={{ fontSize: 15 }}>{page.icon}</span>
                        {page.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )

  return (
    <>
      <div style={{ display: 'flex' }} className="sidebar-desktop">{sidebarContent}</div>
      <button className="sidebar-hamburger" onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', position: 'fixed', top: 12, left: 12, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'var(--text)' }}>
        <span className="material-icons">{mobileOpen ? 'close' : 'menu'}</span>
      </button>
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }} onClick={() => setMobileOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ height: '100vh' }}>{sidebarContent}</div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,.5)' }} />
        </div>
      )}
    </>
  )
}
