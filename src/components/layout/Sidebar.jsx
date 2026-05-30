// src/components/layout/Sidebar.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePermission } from '../../contexts/PermissionContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// Maps HR page IDs to their consolidated section label
const HR_PAGE_SECTION = {
  // Organisation
  employees: 'Organisation', departments: 'Organisation', designations: 'Organisation',
  permissions: 'Organisation', 'employee-grades': 'Organisation',
  'employment-types': 'Organisation', 'org-chart': 'Organisation', 'department-approvers': 'Organisation',
  // Employee Lifecycle
  promotions: 'Employee Lifecycle', transfers: 'Employee Lifecycle', onboarding: 'Employee Lifecycle',
  separation: 'Employee Lifecycle', 'full-final': 'Employee Lifecycle', 'exit-interviews': 'Employee Lifecycle',
  'exit-questionnaire': 'Employee Lifecycle', 'boarding-activities': 'Employee Lifecycle',
  // Shifts & Attendance (Shift Management + Attendance merged)
  'shift-types': 'Shifts & Attendance', 'shift-assignments': 'Shifts & Attendance',
  'shift-schedules': 'Shifts & Attendance', 'shift-requests': 'Shifts & Attendance',
  'shift-assignment-tool': 'Shifts & Attendance', 'holiday-lists': 'Shifts & Attendance',
  'holiday-list-assignments': 'Shifts & Attendance', attendance: 'Shifts & Attendance',
  'attendance-requests': 'Shifts & Attendance', 'attendance-tool': 'Shifts & Attendance',
  'employee-checkins': 'Shifts & Attendance', 'attendance-devices': 'Shifts & Attendance',
  'daily-work-summary': 'Shifts & Attendance',
  // Leave Management
  leave: 'Leave Management', 'leave-types': 'Leave Management', 'leave-policies': 'Leave Management',
  'leave-allocation': 'Leave Management', 'leave-control-panel': 'Leave Management',
  'leave-block-list': 'Leave Management', 'earned-leave-schedule': 'Leave Management',
  'compensatory-leave': 'Leave Management', 'leave-encashment': 'Leave Management',
  'leave-balance': 'Leave Management', 'leave-calendar': 'Leave Management', 'leave-reports': 'Leave Management',
  // Payroll & Compensation (Payroll + Pay Adjustments + Travel + Overtime merged)
  payroll: 'Payroll & Compensation', 'salary-structures': 'Payroll & Compensation',
  'salary-slips': 'Payroll & Compensation', 'payroll-entry': 'Payroll & Compensation',
  travel: 'Payroll & Compensation', 'purpose-of-travel': 'Payroll & Compensation',
  timesheet: 'Payroll & Compensation', overtime: 'Payroll & Compensation',
  'tax-years': 'Payroll & Compensation', 'tax-exemptions': 'Payroll & Compensation',
  'additional-salary': 'Payroll & Compensation', 'salary-arrears': 'Payroll & Compensation',
  'salary-withholdings': 'Payroll & Compensation', 'payroll-corrections': 'Payroll & Compensation',
  'zimra-returns': 'Payroll & Compensation', 'itf16-certificates': 'Payroll & Compensation',
  'nssa-remittance': 'Payroll & Compensation',
  'employee-incentives': 'Payroll & Compensation', 'retention-bonuses': 'Payroll & Compensation',
  'component-accounts': 'Payroll & Compensation',
  // Recruitment
  'job-requisitions': 'Recruitment', 'job-postings': 'Recruitment', applicants: 'Recruitment',
  interviews: 'Recruitment', 'interview-types': 'Recruitment', 'applicant-sources': 'Recruitment',
  'appointment-letters': 'Recruitment', 'job-offer-templates': 'Recruitment',
  // Talent & Growth (Performance + Training + Skills + Referrals merged)
  'appraisal-cycles': 'Talent & Growth', 'appraisal-periods': 'Talent & Growth',
  'appraisal-templates': 'Talent & Growth', kras: 'Talent & Growth',
  'performance-reviews': 'Talent & Growth', 'kpi-templates': 'Talent & Growth',
  'peer-feedback': 'Talent & Growth', training: 'Talent & Growth',
  'skills-admin': 'Talent & Growth', 'employee-skills': 'Talent & Growth',
  'skill-matrix': 'Talent & Growth', 'designation-skills': 'Talent & Growth', referrals: 'Talent & Growth',
  // Benefits & Wellbeing (Benefits + Grievances merged)
  'gratuity-rules': 'Benefits & Wellbeing', gratuity: 'Benefits & Wellbeing',
  'employee-benefits': 'Benefits & Wellbeing', grievances: 'Benefits & Wellbeing',
  // Documents
  'employee-documents': 'Documents', 'id-document-types': 'Documents',
  // Reports
  'hr-reports': 'Reports', 'scheduled-notifications': 'Reports', analytics: 'Reports',
  // HR Settings
  'hr-settings-hub': 'HR Settings', 'hr-settings': 'HR Settings', 'employee-settings': 'HR Settings',
  'leave-settings': 'HR Settings', 'expense-settings': 'HR Settings',
  'shift-attendance-settings': 'HR Settings', 'recruitment-settings': 'HR Settings',
  'tenure-settings': 'HR Settings', 'performance-settings': 'HR Settings',
  'payroll-settings': 'HR Settings', 'notification-templates': 'HR Settings',
  'email-configuration': 'HR Settings', 'skills-settings': 'HR Settings',
  'benefits-settings': 'HR Settings', 'documents-settings': 'HR Settings',
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
      label: 'Procurement Cycle', pages: [
        { id: 'material-requests',     label: 'Material Requests',    icon: 'assignment'     },
        { id: 'purchase-requisitions', label: 'Purchase Requisitions',icon: 'request_quote'  },
        { id: 'rfq',                   label: 'Request for Quotation',icon: 'send'           },
        { id: 'quotations',            label: 'Supplier Quotations',  icon: 'format_quote'   },
        { id: 'quotation-comparison',  label: 'Quote Comparison',     icon: 'compare'        },
        { id: 'purchase-orders',       label: 'Purchase Orders',      icon: 'shopping_bag'   },
        { id: 'goods-received',        label: 'Goods Received (GRN)', icon: 'move_to_inbox'  },
        { id: 'purchase-returns',      label: 'Purchase Returns',     icon: 'assignment_return' },
        { id: 'landed-costs',          label: 'Landed Costs',         icon: 'local_shipping' },
        { id: 'invoices',              label: 'Purchase Invoices',    icon: 'receipt_long'   },
        { id: 'payment-vouchers',      label: 'Payment Vouchers',     icon: 'payments'       },
      ],
    }, {
      label: 'Controls & Analytics', pages: [
        { id: 'budget-control',        label: 'Budget Control',       icon: 'account_balance'},
        { id: 'budget-vs-actual',      label: 'Budget vs Actual',     icon: 'balance'        },
        { id: 'supplier-price-lists',  label: 'Supplier Price Lists', icon: 'price_check'   },
        { id: 'supplier-performance',  label: 'Supplier Performance', icon: 'star_rate'      },
        { id: 'spend-analytics',       label: 'Spend Analytics',      icon: 'bar_chart'      },
        { id: 'grir',                  label: 'GRIR Reconciliation',  icon: 'compare_arrows' },
        { id: 'ap-aging',              label: 'AP Aging',             icon: 'hourglass_bottom'},
        { id: 'purchase-contracts',    label: 'Purchase Contracts',   icon: 'description'    },
        { id: 'wht-return',            label: 'WHT Monthly Return',   icon: 'receipt_long'   },
        { id: 'wht-certificates',      label: 'WHT Certificates',     icon: 'workspace_premium' },
        { id: 'vat-return',            label: 'VAT 7 Return',         icon: 'percent'        },
        { id: 'imtt-tracker',          label: 'IMTT Tracker',         icon: 'swap_horiz'     },
        { id: 'quality-inspection',    label: 'Quality Inspections',  icon: 'verified'       },
        { id: 'supplier-statement',    label: 'Supplier Statement',   icon: 'account_balance_wallet' },
        { id: 'blanket-orders',        label: 'Blanket Orders',       icon: 'handshake'      },
        { id: 'procurement-tracker',   label: 'Procurement Tracker',  icon: 'route'          },
        { id: 'cost-centre-report',    label: 'Cost Centre Report',   icon: 'donut_large'    },
        { id: 'suppliers',             label: 'Suppliers',            icon: 'store'          },
      ],
    }],
  },
  inventory: {
    label: 'Inventory', icon: 'inventory', color: '#2dd4bf',
    sections: [
      {
        label: 'Overview', pages: [
          { id: 'dashboard',         label: 'Dashboard',         icon: 'dashboard'     },
        ],
      },
      {
        label: 'Stock Operations', pages: [
          { id: 'stock-balance',      label: 'Stock Balance',      icon: 'list_alt'           },
          { id: 'stock-in',           label: 'Stock In',           icon: 'add_circle'         },
          { id: 'stock-transfers',    label: 'Stock Transfers',    icon: 'sync_alt'           },
          { id: 'store-requisitions', label: 'Store Requisitions', icon: 'assignment_returned'},
          { id: 'pick-list',          label: 'Pick List',          icon: 'assignment'         },
          { id: 'stock-reservations', label: 'Stock Reservations', icon: 'lock_clock'         },
          { id: 'stock-out',          label: 'Stock Out',          icon: 'remove_circle'      },
          { id: 'stock-taking',       label: 'Stock Taking',       icon: 'fact_check'         },
          { id: 'cycle-count',        label: 'Cycle Count',        icon: 'playlist_add_check' },
          { id: 'opening-stock',      label: 'Opening Stock',      icon: 'inventory_2'        },
          { id: 'consignment',        label: 'Consignment Stock',  icon: 'local_shipping'     },
          { id: 'transactions',       label: 'Transactions',       icon: 'swap_horiz'         },
        ],
      },
      {
        label: 'Reports', pages: [
          { id: 'stock-ledger',     label: 'Stock Ledger',        icon: 'receipt_long'    },
          { id: 'stock-valuation',  label: 'Stock Valuation',     icon: 'account_balance_wallet' },
          { id: 'stock-ageing',     label: 'Stock Ageing Report', icon: 'hourglass_empty' },
          { id: 'forecast-reorder', label: 'Forecast & Reorder',  icon: 'trending_up'     },
          { id: 'auto-mr',          label: 'Auto-MR Scheduler',  icon: 'auto_awesome'    },
          { id: 'dept-consumption', label: 'Dept Consumption',    icon: 'groups'          },
          { id: 'item-shortage',    label: 'Item Shortage',       icon: 'warning'         },
          { id: 'batch-expiry',     label: 'Batch Expiry',        icon: 'event_busy'      },
        ],
      },
      {
        label: 'Configuration', pages: [
          { id: 'categories',     label: 'Categories',        icon: 'category'    },
          { id: 'warehouses',     label: 'Warehouses',        icon: 'warehouse'   },
          { id: 'locations',      label: 'Storage Locations', icon: 'location_on' },
          { id: 'batch-serials',  label: 'Batch & Serials',   icon: 'qr_code_2'   },
          { id: 'item-variants',  label: 'Item Variants',     icon: 'tune'        },
          { id: 'uom-conversion', label: 'UOM Conversion',    icon: 'swap_vert'   },
          { id: 'putaway-rules',  label: 'Putaway Rules',     icon: 'rule'        },
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
      label: 'Tank Management', pages: [
        { id: 'tanks',      label: 'Fuel Tanks',   icon: 'water'         },
        { id: 'deliveries', label: 'Deliveries',   icon: 'local_shipping'},
        { id: 'dipstick',   label: 'Dipstick Log', icon: 'straighten'    },
      ],
    }, {
      label: 'Fuel Operations', pages: [
        { id: 'requests',  label: 'Fuel Requests',  icon: 'assignment'        },
        { id: 'issuance',  label: 'Fuel Issuance',  icon: 'local_gas_station' },
        { id: 'shifts',    label: 'Fuel Shifts',    icon: 'schedule'          },
        { id: 'bowser',    label: 'Bowser Dispatch', icon: 'rv_hookup'        },
      ],
    }, {
      label: 'Analytics & Reports', pages: [
        { id: 'reconciliation', label: 'Reconciliation',      icon: 'balance'     },
        { id: 'consumption',    label: 'Vehicle Consumption',  icon: 'speed'       },
        { id: 'forecasting',    label: 'Forecasting',          icon: 'trending_up' },
        { id: 'reports',        label: 'Fuel Reports',         icon: 'bar_chart'   },
      ],
    }],
  },
  fleet: {
    label: 'Fleet & Assets', icon: 'directions_car', color: '#34d399',
    sections: [{
      label: 'Overview', pages: [
        { id: 'dashboard', label: 'Fleet Dashboard', icon: 'dashboard' },
      ],
    }, {
      label: 'Fleet Assets', pages: [
        { id: 'vehicles',             label: 'Vehicles',              icon: 'directions_car' },
        { id: 'generators',           label: 'Generators',            icon: 'bolt'           },
        { id: 'heavy-equipment',      label: 'Heavy Equipment',       icon: 'construction'   },
        { id: 'contractor-equipment', label: 'Contractor Equipment',  icon: 'handshake'      },
      ],
    }, {
      label: 'Operations', pages: [
        { id: 'dispatch',             label: 'Dispatch Board',        icon: 'grid_view'      },
        { id: 'trips',                label: 'Trip Management',       icon: 'route'          },
        { id: 'drivers',              label: 'Driver Management',     icon: 'badge'          },
        { id: 'allocation',           label: 'Equipment Allocation',  icon: 'place'          },
        { id: 'operator-assignments', label: 'Operator Assignments',  icon: 'engineering'    },
        { id: 'meter-readings',       label: 'Meter Readings',        icon: 'speed'          },
      ],
    }, {
      label: 'Maintenance', pages: [
        { id: 'workshop-jobs',          label: 'Workshop Jobs',          icon: 'build'                },
        { id: 'breakdowns',             label: 'Breakdown Management',   icon: 'report_problem'       },
        { id: 'preventive-maintenance', label: 'Preventive Maintenance', icon: 'event_available'      },
        { id: 'maintenance-alerts',     label: 'Maintenance Alerts',     icon: 'notifications_active' },
        { id: 'asset-issues',           label: 'Asset Issues',           icon: 'bug_report'           },
        { id: 'tyre-management',        label: 'Tyre Management',        icon: 'tire_repair'          },
      ],
    }, {
      label: 'Safety & Compliance', pages: [
        { id: 'inspections', label: 'Inspections',     icon: 'fact_check'    },
        { id: 'accidents',   label: 'Accident Reports', icon: 'car_crash'    },
        { id: 'compliance',  label: 'Fleet Compliance', icon: 'verified_user'},
      ],
    }, {
      label: 'Asset Registry', pages: [
        { id: 'asset-registry',     label: 'Asset Dashboard',      icon: 'inventory_2'   },
        { id: 'registry',           label: 'All Assets',           icon: 'list_alt'      },
        { id: 'depreciation',       label: 'Depreciation',         icon: 'trending_down' },
        { id: 'asset-verification', label: 'Asset Verification',   icon: 'verified'      },
        { id: 'reclass-log',        label: 'Reclassification Log', icon: 'swap_horiz'    },
        { id: 'asset-import',       label: 'Import Assets',        icon: 'download'      },
        { id: 'category-config',    label: 'Category Config',      icon: 'tune'          },
      ],
    }, {
      label: 'Analytics', pages: [
        { id: 'analytics',          label: 'Fleet Intelligence',   icon: 'insights'   },
        { id: 'downtime-analytics', label: 'Downtime Analytics',  icon: 'timer_off'  },
        { id: 'cost-analysis',      label: 'Cost Analysis (TCO)', icon: 'price_check'},
      ],
    }, {
      label: 'Configuration', pages: [
        { id: 'gl-config', label: 'GL Account Mapping', icon: 'account_tree' },
        { id: 'settings',  label: 'Fleet Settings',     icon: 'settings'     },
      ],
    }],
  },
  hr: {
    label: 'Human Resources', icon: 'badge', color: '#f87171',
    sections: [
      {
        label: 'Overview',
        pages: [
          { id: 'dashboard', label: 'HR Home', icon: 'home' },
        ],
      },
      {
        label: 'Organisation',
        pages: [
          { id: 'employees',            label: 'Employees',         icon: 'people'               },
          { id: 'departments',          label: 'Departments',       icon: 'business'             },
          { id: 'designations',         label: 'Designations',      icon: 'work'                 },
          { id: 'employee-grades',      label: 'Employee Grades',   icon: 'military_tech'        },
          { id: 'employment-types',     label: 'Employment Types',  icon: 'badge'                },
          { id: 'org-chart',            label: 'Org Chart',         icon: 'account_tree'         },
          { id: 'department-approvers', label: 'Dept Approvers',    icon: 'approval'             },
          { id: 'permissions',          label: 'Permissions',       icon: 'admin_panel_settings' },
        ],
      },
      {
        label: 'Employee Lifecycle',
        pages: [
          { id: 'promotions',          label: 'Promotions',          icon: 'trending_up'          },
          { id: 'transfers',           label: 'Transfers',           icon: 'swap_horiz'           },
          { id: 'onboarding',          label: 'Onboarding',          icon: 'how_to_reg'           },
          { id: 'boarding-activities', label: 'Boarding Activities', icon: 'assignment_turned_in' },
          { id: 'separation',          label: 'Separation',          icon: 'logout'               },
          { id: 'exit-interviews',     label: 'Exit Interviews',     icon: 'feedback'             },
          { id: 'exit-questionnaire',  label: 'Exit Questionnaire',  icon: 'quiz'                 },
          { id: 'full-final',          label: 'Full & Final',        icon: 'calculate'            },
        ],
      },
      {
        label: 'Shifts & Attendance',
        pages: [
          { id: 'shift-types',              label: 'Shift Types',         icon: 'pending_actions' },
          { id: 'shift-assignments',        label: 'Shift Assignments',   icon: 'assignment_ind'  },
          { id: 'shift-assignment-tool',    label: 'Bulk Assign Tool',    icon: 'done_all'        },
          { id: 'shift-schedules',          label: 'Shift Schedules',     icon: 'rotate_right'    },
          { id: 'shift-requests',           label: 'Shift Requests',      icon: 'swap_horiz'      },
          { id: 'holiday-lists',            label: 'Holiday Lists',       icon: 'beach_access'    },
          { id: 'holiday-list-assignments', label: 'Holiday Assignments', icon: 'event_available' },
          { id: 'attendance',               label: 'Attendance',          icon: 'schedule'        },
          { id: 'attendance-tool',          label: 'Attendance Tool',     icon: 'grid_on'         },
          { id: 'attendance-requests',      label: 'Attendance Requests', icon: 'edit_calendar'   },
          { id: 'employee-checkins',        label: 'Check-in Log',        icon: 'fingerprint'     },
          { id: 'attendance-devices',       label: 'Biometric Devices',   icon: 'sensors'         },
          { id: 'daily-work-summary',       label: 'Daily Work Summary',  icon: 'description'     },
        ],
      },
      {
        label: 'Leave Management',
        pages: [
          { id: 'leave',                 label: 'Leave Requests',        icon: 'event_busy'             },
          { id: 'leave-types',           label: 'Leave Types',           icon: 'category'               },
          { id: 'leave-policies',        label: 'Leave Policies',        icon: 'policy'                 },
          { id: 'leave-allocation',      label: 'Leave Allocation',      icon: 'calendar_month'         },
          { id: 'leave-control-panel',   label: 'Leave Control Panel',   icon: 'tune'                   },
          { id: 'leave-block-list',      label: 'Leave Block Lists',     icon: 'block'                  },
          { id: 'earned-leave-schedule', label: 'Earned Leave Schedule', icon: 'event_repeat'           },
          { id: 'compensatory-leave',    label: 'Compensatory Leave',    icon: 'swap_horiz'             },
          { id: 'leave-encashment',      label: 'Leave Encashment',      icon: 'payments'               },
          { id: 'leave-balance',         label: 'Leave Balance',         icon: 'account_balance_wallet' },
          { id: 'leave-calendar',        label: 'Leave Calendar',        icon: 'calendar_today'         },
          { id: 'leave-reports',         label: 'Leave Reports',         icon: 'bar_chart'              },
        ],
      },
      {
        label: 'Payroll & Compensation',
        pages: [
          { id: 'salary-structures',   label: 'Salary Structures',    icon: 'account_balance_wallet' },
          { id: 'payroll',             label: 'Payroll',              icon: 'payments'               },
          { id: 'salary-slips',        label: 'Salary Slips',         icon: 'receipt_long'           },
          { id: 'payroll-entry',       label: 'Payroll Entry',        icon: 'batch_prediction'       },
          { id: 'travel',              label: 'Travel',               icon: 'flight'                 },
          { id: 'purpose-of-travel',   label: 'Purpose of Travel',    icon: 'explore'                },
          { id: 'timesheet',           label: 'Timesheet Summary',    icon: 'fact_check'             },
          { id: 'overtime',            label: 'Overtime Slips',       icon: 'more_time'              },
          { id: 'tax-years',           label: 'Tax Years & PAYE',     icon: 'calendar_month'         },
          { id: 'tax-exemptions',      label: 'Tax Exemptions',       icon: 'receipt_long'           },
          { id: 'additional-salary',   label: 'Additional Salary',    icon: 'add_circle'             },
          { id: 'salary-arrears',      label: 'Salary Arrears',       icon: 'history'                },
          { id: 'salary-withholdings', label: 'Salary Withholdings',  icon: 'block'                  },
          { id: 'payroll-corrections', label: 'Payroll Corrections',  icon: 'build_circle'           },
          { id: 'zimra-returns',       label: 'ZIMRA P6 Returns',     icon: 'assignment_turned_in'   },
          { id: 'itf16-certificates',  label: 'ITF16 Certificates',   icon: 'badge'                  },
          { id: 'nssa-remittance',     label: 'NSSA Remittance',      icon: 'account_balance'        },
          { id: 'employee-incentives', label: 'Employee Incentives',  icon: 'emoji_events'           },
          { id: 'retention-bonuses',   label: 'Retention Bonuses',    icon: 'card_giftcard'          },
          { id: 'component-accounts',  label: 'Component GL Accounts',icon: 'account_tree'           },
        ],
      },
      {
        label: 'Recruitment',
        pages: [
          { id: 'job-requisitions',    label: 'Job Requisitions',    icon: 'description'    },
          { id: 'job-postings',        label: 'Job Openings',        icon: 'work_outline'   },
          { id: 'applicants',          label: 'Applicants',          icon: 'people_outline' },
          { id: 'interviews',          label: 'Interviews',          icon: 'event_note'     },
          { id: 'interview-types',     label: 'Interview Types',     icon: 'category'       },
          { id: 'applicant-sources',   label: 'Applicant Sources',   icon: 'hub'            },
          { id: 'appointment-letters', label: 'Appointment Letters', icon: 'mail'           },
          { id: 'job-offer-templates', label: 'Offer Templates',     icon: 'description'    },
        ],
      },
      {
        label: 'Talent & Growth',
        pages: [
          { id: 'appraisal-cycles',    label: 'Appraisal Cycles',    icon: 'loop'           },
          { id: 'appraisal-periods',   label: 'Appraisal Periods',   icon: 'calendar_month' },
          { id: 'appraisal-templates', label: 'Appraisal Templates', icon: 'assignment'     },
          { id: 'kras',                label: 'Key Result Areas',    icon: 'flag'           },
          { id: 'performance-reviews', label: 'Performance Reviews', icon: 'rate_review'    },
          { id: 'kpi-templates',       label: 'KPI Templates',       icon: 'checklist'      },
          { id: 'peer-feedback',       label: 'Peer Feedback',       icon: 'people'         },
          { id: 'training',            label: 'Training',            icon: 'school'         },
          { id: 'skills-admin',        label: 'Skills Master',       icon: 'star'           },
          { id: 'employee-skills',     label: 'Employee Skills',     icon: 'manage_accounts'},
          { id: 'skill-matrix',        label: 'Skill Matrix',        icon: 'grid_on'        },
          { id: 'designation-skills',  label: 'Designation Skills',  icon: 'fact_check'     },
          { id: 'referrals',           label: 'Employee Referrals',  icon: 'share'          },
        ],
      },
      {
        label: 'Benefits & Wellbeing',
        pages: [
          { id: 'gratuity-rules',    label: 'Gratuity Rules',    icon: 'rule'          },
          { id: 'gratuity',          label: 'Gratuity',          icon: 'calculate'     },
          { id: 'employee-benefits', label: 'Employee Benefits', icon: 'card_giftcard' },
          { id: 'grievances',        label: 'Grievances',        icon: 'report_problem'},
        ],
      },
      {
        label: 'Documents',
        pages: [
          { id: 'employee-documents', label: 'Employee Documents', icon: 'folder' },
          { id: 'id-document-types',  label: 'ID Document Types',  icon: 'badge'  },
        ],
      },
      {
        label: 'Reports',
        pages: [
          { id: 'hr-reports',              label: 'HR Reports',              icon: 'bar_chart'     },
          { id: 'scheduled-notifications', label: 'Scheduled Notifications', icon: 'notifications' },
          { id: 'analytics',               label: 'Analytics',               icon: 'insights'      },
        ],
      },
      {
        label: 'HR Settings',
        pages: [
          { id: 'hr-settings-hub',          label: 'Settings Hub',           icon: 'settings'          },
          { id: 'employee-settings',        label: 'Employee Settings',      icon: 'manage_accounts'   },
          { id: 'leave-settings',           label: 'Leave Settings',         icon: 'event_busy'        },
          { id: 'expense-settings',         label: 'Expense Settings',       icon: 'receipt_long'      },
          { id: 'shift-attendance-settings',label: 'Shift & Attendance',     icon: 'schedule'          },
          { id: 'recruitment-settings',     label: 'Recruitment Settings',   icon: 'work_outline'      },
          { id: 'tenure-settings',          label: 'Tenure & Exit Settings', icon: 'logout'            },
          { id: 'performance-settings',     label: 'Performance Settings',   icon: 'rate_review'       },
          { id: 'payroll-settings',         label: 'Payroll Settings',       icon: 'payments'          },
          { id: 'notification-templates',   label: 'Notification Templates', icon: 'notifications'     },
          { id: 'email-configuration',      label: 'Email Configuration',    icon: 'email'             },
          { id: 'skills-settings',          label: 'Skills Settings',        icon: 'workspace_premium' },
          { id: 'benefits-settings',        label: 'Benefits & Gratuity',    icon: 'card_giftcard'     },
          { id: 'documents-settings',       label: 'Documents Settings',     icon: 'folder_shared'     },
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
        { id: 'chart-of-accounts',   label: 'Chart of Accounts',   icon: 'account_tree'           },
        { id: 'journal-entries',     label: 'Journal Entries',     icon: 'book'                   },
        { id: 'reports',             label: 'Financial Reports',   icon: 'assessment'             },
        { id: 'cash-flow',           label: 'Cash Flow Statement', icon: 'waterfall_chart'        },
        { id: 'bank-reconciliation', label: 'Bank Reconciliation', icon: 'account_balance_wallet' },
      ],
    }],
  },
  projects: {
    label: 'Projects', icon: 'folder_open', color: '#f59e0b',
    sections: [
      {
        label: 'Job Costing', pages: [
          { id: 'jobs',                label: 'Jobs Register',       icon: 'work'              },
          { id: 'job-cost-sheet',      label: 'Job Cost Sheet',      icon: 'receipt_long'      },
          { id: 'job-costing-report',  label: 'Job Costing Report',  icon: 'assessment'        },
        ],
      },
      {
        label: 'Petty Cash', pages: [
          { id: 'petty-cash-dashboard',      label: 'PC Dashboard',      icon: 'dashboard'         },
          { id: 'petty-cash-funds',          label: 'Funds & Top-ups',   icon: 'account_balance_wallet' },
          { id: 'petty-cash-expenses',       label: 'Expenses',          icon: 'receipt_long'      },
          { id: 'petty-cash-reconciliation', label: 'Reconciliation',    icon: 'balance'           },
        ],
      },
    ],
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
        { id: 'master-data', label: 'Master Data', icon: 'database' },
      ],
    }, {
      label: 'Workflow', pages: [
        { id: 'workflows',            label: 'Workflow Builder',     icon: 'account_tree' },
        { id: 'workflow-assignments', label: 'Workflow Assignments', icon: 'route'        },
        { id: 'workflow-rules',       label: 'Workflow Rules',       icon: 'rule'         },
        { id: 'approval-thresholds',  label: 'Approval Thresholds',  icon: 'policy'       },
      ],
    }, {
      label: 'Communications', pages: [
        { id: 'push-notifications', label: 'Push Notifications', icon: 'notifications_active' },
        { id: 'email-logs',         label: 'Email Logs',         icon: 'mail'                 },
      ],
    }, {
      label: 'Governance', pages: [
        { id: 'governance-policies', label: 'Governance Policies', icon: 'policy'               },
        { id: 'inventory-audit-log', label: 'Ops Audit Log',       icon: 'manage_search'        },
        { id: 'numbering-series',    label: 'Numbering Series',    icon: 'format_list_numbered' },
        { id: 'tax-engine',          label: 'Tax Engine',          icon: 'receipt_long'         },
        { id: 'currency-exchange',   label: 'Currency Exchange',   icon: 'currency_exchange'    },
        { id: 'inventory-gl-config', label: 'Inventory GL Config', icon: 'account_tree'         },
      ],
    }],
  },
}

export default function Sidebar({ module }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { canView } = usePermission()
  const { user } = useAuth()
  const [connectUnread, setConnectUnread] = useState(0)

  // Listen for unread count updates from ConnectPage
  useEffect(() => {
    const handler = (e) => setConnectUnread(e.detail || 0)
    window.addEventListener('connect-unread-update', handler)
    // Also check window.__connectUnread on mount
    if (window.__connectUnread) setConnectUnread(window.__connectUnread)
    return () => window.removeEventListener('connect-unread-update', handler)
  }, [])

  // Fallback: poll DB for unread when not on Connect page
  useEffect(() => {
    if (!user || module === 'connect') return
    const fetchUnread = async () => {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id)
      if (!parts?.length) return
      let total = 0
      await Promise.all(parts.map(async p => {
        const q = supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', p.conversation_id)
          .eq('is_deleted', false)
          .neq('sender_id', user.id)
        if (p.last_read_at) q.gt('created_at', p.last_read_at)
        const { count } = await q
        total += (count || 0)
      }))
      setConnectUnread(total)
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 60000)
    return () => clearInterval(interval)
  }, [user, module])

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
                        {page.id === 'chats' && connectUnread > 0 && (
                          <span style={{
                            background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 800,
                            borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                            marginLeft: 'auto',
                          }}>
                            {connectUnread > 99 ? '99+' : connectUnread}
                          </span>
                        )}
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
