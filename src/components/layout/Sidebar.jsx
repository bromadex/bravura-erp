// src/components/layout/Sidebar.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePermission } from '../../contexts/PermissionContext'

// Maps page ID → section label within People super-module (for section filtering)
const PEOPLE_PAGE_SECTION = {
  // Organisation
  employees:'Organisation', departments:'Organisation', designations:'Organisation',
  permissions:'Organisation', 'employee-grades':'Organisation',
  'employment-types':'Organisation', 'org-chart':'Organisation', 'department-approvers':'Organisation',
  // Employee Lifecycle
  promotions:'Employee Lifecycle', transfers:'Employee Lifecycle', onboarding:'Employee Lifecycle',
  separation:'Employee Lifecycle', 'full-final':'Employee Lifecycle', 'exit-interviews':'Employee Lifecycle',
  'exit-questionnaire':'Employee Lifecycle', 'boarding-activities':'Employee Lifecycle',
  // Shifts & Attendance (merged from Shift Management + Attendance)
  'shift-types':'Shifts & Attendance', 'shift-assignments':'Shifts & Attendance',
  'shift-schedules':'Shifts & Attendance', 'shift-requests':'Shifts & Attendance',
  'shift-assignment-tool':'Shifts & Attendance', 'holiday-lists':'Shifts & Attendance',
  'holiday-list-assignments':'Shifts & Attendance', attendance:'Shifts & Attendance',
  'attendance-requests':'Shifts & Attendance', 'attendance-tool':'Shifts & Attendance',
  'employee-checkins':'Shifts & Attendance', 'attendance-devices':'Shifts & Attendance',
  'daily-work-summary':'Shifts & Attendance',
  // Leave Management
  leave:'Leave Management', 'leave-types':'Leave Management', 'leave-policies':'Leave Management',
  'leave-allocation':'Leave Management', 'leave-control-panel':'Leave Management',
  'leave-block-list':'Leave Management', 'earned-leave-schedule':'Leave Management',
  'compensatory-leave':'Leave Management', 'leave-encashment':'Leave Management',
  'leave-balance':'Leave Management', 'leave-calendar':'Leave Management', 'leave-reports':'Leave Management',
  // Payroll & Compensation (merged Payroll & Travel + Pay Adjustments + Overtime)
  payroll:'Payroll & Compensation', 'salary-structures':'Payroll & Compensation',
  'salary-slips':'Payroll & Compensation', 'payroll-entry':'Payroll & Compensation',
  'tax-years':'Payroll & Compensation', 'tax-exemptions':'Payroll & Compensation',
  'additional-salary':'Payroll & Compensation', 'salary-arrears':'Payroll & Compensation',
  'salary-withholdings':'Payroll & Compensation', 'payroll-corrections':'Payroll & Compensation',
  'employee-incentives':'Payroll & Compensation', 'retention-bonuses':'Payroll & Compensation',
  'component-accounts':'Payroll & Compensation', timesheet:'Payroll & Compensation',
  travel:'Payroll & Compensation', 'purpose-of-travel':'Payroll & Compensation', overtime:'Payroll & Compensation',
  // Recruitment
  'job-requisitions':'Recruitment', 'job-postings':'Recruitment', applicants:'Recruitment',
  interviews:'Recruitment', 'interview-types':'Recruitment', 'applicant-sources':'Recruitment',
  'appointment-letters':'Recruitment', 'job-offer-templates':'Recruitment',
  // Talent & Growth (merged Performance + Training + Skills + Referrals)
  'appraisal-cycles':'Talent & Growth', 'appraisal-periods':'Talent & Growth',
  'appraisal-templates':'Talent & Growth', kras:'Talent & Growth', 'performance-reviews':'Talent & Growth',
  'kpi-templates':'Talent & Growth', 'peer-feedback':'Talent & Growth', training:'Talent & Growth',
  'skills-admin':'Talent & Growth', 'employee-skills':'Talent & Growth',
  'skill-matrix':'Talent & Growth', 'designation-skills':'Talent & Growth', referrals:'Talent & Growth',
  // Benefits & Wellbeing (merged Benefits + Grievances)
  'gratuity-rules':'Benefits & Wellbeing', gratuity:'Benefits & Wellbeing',
  'employee-benefits':'Benefits & Wellbeing', grievances:'Benefits & Wellbeing',
  // Documents
  'employee-documents':'Documents', 'id-document-types':'Documents',
  // Expenses (cross-module from expenses)
  claims:'Expenses', advances:'Expenses',
  // Reports & Analytics
  'hr-reports':'Reports & Analytics', 'scheduled-notifications':'Reports & Analytics', analytics:'Reports & Analytics',
  // HR Settings
  'hr-settings-hub':'HR Settings', 'hr-settings':'HR Settings', 'employee-settings':'HR Settings',
  'leave-settings':'HR Settings', 'expense-settings':'HR Settings', 'shift-attendance-settings':'HR Settings',
  'recruitment-settings':'HR Settings', 'tenure-settings':'HR Settings', 'performance-settings':'HR Settings',
  'payroll-settings':'HR Settings', 'notification-templates':'HR Settings', 'email-configuration':'HR Settings',
  'skills-settings':'HR Settings', 'benefits-settings':'HR Settings', 'documents-settings':'HR Settings',
}

// For other merged modules: when URL module is a sub-module, which section to show (null = show all)
const SUBMODULE_SECTION = {
  inventory: 'Warehouse & Stock',
  logistics:  'Dispatch & Delivery',
  fuel:       'Fuel Management',
  campsite:   'Campsite',
  projects:   'Petty Cash',
  connect:    'Communications',
  expenses:   'Expenses',
}

// Maps URL module slug → super-module key in ALL_MODULES
const SUPER_MODULE_OF = {
  hr:'people', expenses:'people',
  procurement:'supply-chain', inventory:'supply-chain', logistics:'supply-chain',
  fleet:'operations', fuel:'operations', campsite:'operations',
  accounting:'finance', projects:'finance',
  connect:'workplace', governance:'workplace',
  dashboard:'analytics', reports:'analytics',
  settings:'settings',
}

// Default sub-module to use when navigating from a super-module (for pages without explicit module)
const DEFAULT_NAV = {
  people:'hr', 'supply-chain':'procurement', operations:'fleet',
  finance:'accounting', workplace:'governance', analytics:'reports', settings:'settings',
}

const ALL_MODULES = {
  people: {
    label: 'People & Workforce', icon: 'badge', color: '#f87171',
    sections: [
      { label: 'Overview', pages: [
        { id: 'dashboard', label: 'People Home', icon: 'home' },
      ]},
      { label: 'Organisation', pages: [
        { id: 'employees',            label: 'Employees',         icon: 'people'               },
        { id: 'departments',          label: 'Departments',       icon: 'business'             },
        { id: 'designations',         label: 'Designations',      icon: 'work'                 },
        { id: 'employee-grades',      label: 'Employee Grades',   icon: 'military_tech'        },
        { id: 'employment-types',     label: 'Employment Types',  icon: 'badge'                },
        { id: 'org-chart',            label: 'Org Chart',         icon: 'account_tree'         },
        { id: 'department-approvers', label: 'Dept Approvers',    icon: 'approval'             },
        { id: 'permissions',          label: 'Permissions',       icon: 'admin_panel_settings' },
      ]},
      { label: 'Employee Lifecycle', pages: [
        { id: 'promotions',          label: 'Promotions',          icon: 'trending_up'          },
        { id: 'transfers',           label: 'Transfers',           icon: 'swap_horiz'           },
        { id: 'onboarding',          label: 'Onboarding',          icon: 'how_to_reg'           },
        { id: 'boarding-activities', label: 'Boarding Activities', icon: 'assignment_turned_in' },
        { id: 'separation',          label: 'Separation',          icon: 'logout'               },
        { id: 'exit-interviews',     label: 'Exit Interviews',     icon: 'feedback'             },
        { id: 'exit-questionnaire',  label: 'Exit Questionnaire',  icon: 'quiz'                 },
        { id: 'full-final',          label: 'Full & Final',        icon: 'calculate'            },
      ]},
      { label: 'Shifts & Attendance', pages: [
        { id: 'shift-types',              label: 'Shift Types',         icon: 'pending_actions'   },
        { id: 'shift-assignments',        label: 'Shift Assignments',   icon: 'assignment_ind'    },
        { id: 'shift-assignment-tool',    label: 'Bulk Assign Tool',    icon: 'done_all'          },
        { id: 'shift-schedules',          label: 'Shift Schedules',     icon: 'rotate_right'      },
        { id: 'shift-requests',           label: 'Shift Requests',      icon: 'swap_horiz'        },
        { id: 'holiday-lists',            label: 'Holiday Lists',       icon: 'beach_access'      },
        { id: 'holiday-list-assignments', label: 'Holiday Assignments', icon: 'event_available'   },
        { id: 'attendance',               label: 'Attendance',          icon: 'schedule'          },
        { id: 'attendance-tool',          label: 'Attendance Tool',     icon: 'grid_on'           },
        { id: 'attendance-requests',      label: 'Attendance Requests', icon: 'edit_calendar'     },
        { id: 'employee-checkins',        label: 'Check-in Log',        icon: 'fingerprint'       },
        { id: 'attendance-devices',       label: 'Biometric Devices',   icon: 'sensors'           },
        { id: 'daily-work-summary',       label: 'Daily Work Summary',  icon: 'description'       },
      ]},
      { label: 'Leave Management', pages: [
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
      ]},
      { label: 'Payroll & Compensation', pages: [
        { id: 'salary-structures',   label: 'Salary Structures',    icon: 'account_balance_wallet' },
        { id: 'payroll',             label: 'Payroll',              icon: 'payments'               },
        { id: 'salary-slips',        label: 'Salary Slips',         icon: 'receipt_long'           },
        { id: 'payroll-entry',       label: 'Payroll Entry',        icon: 'batch_prediction'       },
        { id: 'tax-years',           label: 'Tax Years & PAYE',     icon: 'calendar_month'         },
        { id: 'tax-exemptions',      label: 'Tax Exemptions',       icon: 'receipt_long'           },
        { id: 'additional-salary',   label: 'Additional Salary',    icon: 'add_circle'             },
        { id: 'salary-arrears',      label: 'Salary Arrears',       icon: 'history'                },
        { id: 'salary-withholdings', label: 'Salary Withholdings',  icon: 'block'                  },
        { id: 'payroll-corrections', label: 'Payroll Corrections',  icon: 'build_circle'           },
        { id: 'employee-incentives', label: 'Employee Incentives',  icon: 'emoji_events'           },
        { id: 'retention-bonuses',   label: 'Retention Bonuses',    icon: 'card_giftcard'          },
        { id: 'component-accounts',  label: 'Component GL Accounts',icon: 'account_tree'           },
        { id: 'timesheet',           label: 'Timesheet Summary',    icon: 'fact_check'             },
        { id: 'travel',              label: 'Travel',               icon: 'flight'                 },
        { id: 'purpose-of-travel',   label: 'Purpose of Travel',    icon: 'explore'                },
        { id: 'overtime',            label: 'Overtime Slips',       icon: 'more_time'              },
      ]},
      { label: 'Recruitment', pages: [
        { id: 'job-requisitions',    label: 'Job Requisitions',    icon: 'description'    },
        { id: 'job-postings',        label: 'Job Openings',        icon: 'work_outline'   },
        { id: 'applicants',          label: 'Applicants',          icon: 'people_outline' },
        { id: 'interviews',          label: 'Interviews',          icon: 'event_note'     },
        { id: 'interview-types',     label: 'Interview Types',     icon: 'category'       },
        { id: 'applicant-sources',   label: 'Applicant Sources',   icon: 'hub'            },
        { id: 'appointment-letters', label: 'Appointment Letters', icon: 'mail'           },
        { id: 'job-offer-templates', label: 'Offer Templates',     icon: 'description'    },
      ]},
      { label: 'Talent & Growth', pages: [
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
      ]},
      { label: 'Benefits & Wellbeing', pages: [
        { id: 'gratuity-rules',    label: 'Gratuity Rules',    icon: 'rule'           },
        { id: 'gratuity',          label: 'Gratuity',          icon: 'calculate'      },
        { id: 'employee-benefits', label: 'Employee Benefits', icon: 'card_giftcard'  },
        { id: 'grievances',        label: 'Grievances',        icon: 'report_problem' },
      ]},
      { label: 'Documents', pages: [
        { id: 'employee-documents', label: 'Employee Documents', icon: 'folder' },
        { id: 'id-document-types',  label: 'ID Document Types',  icon: 'badge'  },
      ]},
      { label: 'Expenses', pages: [
        { id: 'dashboard', module: 'expenses', label: 'Expense Dashboard', icon: 'dashboard'      },
        { id: 'claims',    module: 'expenses', label: 'Expense Claims',    icon: 'receipt'        },
        { id: 'advances',  module: 'expenses', label: 'Employee Advances', icon: 'account_balance'},
        { id: 'types',     module: 'expenses', label: 'Expense Types',     icon: 'category'       },
      ]},
      { label: 'Reports & Analytics', pages: [
        { id: 'hr-reports',              label: 'HR Reports',              icon: 'bar_chart'     },
        { id: 'scheduled-notifications', label: 'Scheduled Notifications', icon: 'notifications' },
        { id: 'analytics',               label: 'Analytics',               icon: 'insights'      },
      ]},
      { label: 'HR Settings', pages: [
        { id: 'hr-settings-hub',           label: 'Settings Hub',           icon: 'settings'          },
        { id: 'employee-settings',         label: 'Employee Settings',      icon: 'manage_accounts'   },
        { id: 'leave-settings',            label: 'Leave Settings',         icon: 'event_busy'        },
        { id: 'expense-settings',          label: 'Expense Settings',       icon: 'receipt_long'      },
        { id: 'shift-attendance-settings', label: 'Shift & Attendance',     icon: 'schedule'          },
        { id: 'recruitment-settings',      label: 'Recruitment Settings',   icon: 'work_outline'      },
        { id: 'tenure-settings',           label: 'Tenure & Exit',          icon: 'logout'            },
        { id: 'performance-settings',      label: 'Performance Settings',   icon: 'rate_review'       },
        { id: 'payroll-settings',          label: 'Payroll Settings',       icon: 'payments'          },
        { id: 'notification-templates',    label: 'Notification Templates', icon: 'notifications'     },
        { id: 'email-configuration',       label: 'Email Configuration',    icon: 'email'             },
        { id: 'skills-settings',           label: 'Skills Settings',        icon: 'workspace_premium' },
        { id: 'benefits-settings',         label: 'Benefits & Gratuity',    icon: 'card_giftcard'     },
        { id: 'documents-settings',        label: 'Documents Settings',     icon: 'folder_shared'     },
      ]},
    ],
  },

  'supply-chain': {
    label: 'Supply Chain', icon: 'inventory_2', color: '#a78bfa',
    sections: [
      { label: 'Procurement', pages: [
        { id: 'dashboard',             label: 'SC Dashboard',          icon: 'dashboard'      },
        { id: 'store-requisitions',    label: 'Store Requisitions',    icon: 'assignment'     },
        { id: 'purchase-requisitions', label: 'Purchase Requisitions', icon: 'request_quote'  },
        { id: 'rfq',                   label: 'Request for Quotation', icon: 'send'           },
        { id: 'quotations',            label: 'Supplier Quotations',   icon: 'format_quote'   },
        { id: 'quotation-comparison',  label: 'Quote Comparison',      icon: 'compare'        },
        { id: 'purchase-orders',       label: 'Purchase Orders',       icon: 'shopping_bag'   },
        { id: 'goods-received',        label: 'Goods Received (GRN)',  icon: 'move_to_inbox'  },
        { id: 'invoices',              label: 'Purchase Invoices',     icon: 'receipt_long'   },
        { id: 'budget-control',        label: 'Budget Control',        icon: 'account_balance'},
        { id: 'supplier-performance',  label: 'Supplier Performance',  icon: 'star_rate'      },
        { id: 'suppliers',             label: 'Suppliers',             icon: 'store'          },
      ]},
      { label: 'Warehouse & Stock', pages: [
        { id: 'stock-balance', module: 'inventory', label: 'Stock Balance',     icon: 'list_alt'      },
        { id: 'stock-in',      module: 'inventory', label: 'Stock In',          icon: 'add_circle'    },
        { id: 'stock-out',     module: 'inventory', label: 'Stock Out',         icon: 'remove_circle' },
        { id: 'transactions',  module: 'inventory', label: 'Transactions',      icon: 'swap_horiz'    },
        { id: 'stock-taking',  module: 'inventory', label: 'Stock Taking',      icon: 'fact_check'    },
        { id: 'categories',    module: 'inventory', label: 'Categories',        icon: 'category'      },
        { id: 'locations',     module: 'inventory', label: 'Storage Locations', icon: 'location_on'   },
      ]},
      { label: 'Dispatch & Delivery', pages: [
        { id: 'batch-plant', module: 'logistics', label: 'Batch Plant', icon: 'factory'        },
        { id: 'deliveries',  module: 'logistics', label: 'Deliveries',  icon: 'local_shipping' },
        { id: 'camp',        module: 'logistics', label: 'Camp Stock',  icon: 'storefront'     },
      ]},
    ],
  },

  operations: {
    label: 'Operations', icon: 'engineering', color: '#34d399',
    sections: [
      { label: 'Fleet & Vehicles', pages: [
        { id: 'dashboard',            label: 'Fleet Dashboard',    icon: 'dashboard'            },
        { id: 'vehicles',             label: 'Vehicles',           icon: 'directions_car'       },
        { id: 'generators',           label: 'Generators',         icon: 'bolt'                 },
        { id: 'heavy-equipment',      label: 'Heavy Equipment',    icon: 'construction'         },
        { id: 'contractor-equipment', label: 'Contractor Equip.',  icon: 'handshake'            },
        { id: 'maintenance-alerts',   label: 'Maintenance Alerts', icon: 'notifications_active' },
        { id: 'asset-issues',         label: 'Asset Issues',       icon: 'bug_report'           },
      ]},
      { label: 'Asset Registry', pages: [
        { id: 'asset-registry',  label: 'Asset Dashboard',      icon: 'inventory_2' },
        { id: 'registry',        label: 'All Assets',           icon: 'list_alt'    },
        { id: 'reclass-log',     label: 'Reclassification Log', icon: 'swap_horiz'  },
        { id: 'asset-import',    label: 'Import Assets',        icon: 'download'    },
        { id: 'category-config', label: 'Category Config',      icon: 'tune'        },
      ]},
      { label: 'Maintenance', pages: [
        { id: 'preventive-maintenance', label: 'Preventive Maintenance', icon: 'event_available' },
        { id: 'tyre-management',        label: 'Tyre Management',        icon: 'tire_repair'     },
      ]},
      { label: 'Fleet Analytics', pages: [
        { id: 'downtime-analytics', label: 'Downtime Analytics',  icon: 'timer_off'   },
        { id: 'cost-analysis',      label: 'Cost Analysis (TCO)', icon: 'price_check' },
      ]},
      { label: 'Fuel Management', pages: [
        { id: 'tanks',          module: 'fuel', label: 'Fuel Tanks',          icon: 'water'             },
        { id: 'dipstick',       module: 'fuel', label: 'Dipstick Log',        icon: 'straighten'        },
        { id: 'issuance',       module: 'fuel', label: 'Fuel Issuance',       icon: 'local_gas_station' },
        { id: 'deliveries',     module: 'fuel', label: 'Fuel Deliveries',     icon: 'local_shipping'    },
        { id: 'reconciliation', module: 'fuel', label: 'Reconciliation',      icon: 'balance'           },
        { id: 'consumption',    module: 'fuel', label: 'Vehicle Consumption', icon: 'speed'             },
        { id: 'forecasting',    module: 'fuel', label: 'Forecasting',         icon: 'trending_up'       },
        { id: 'reports',        module: 'fuel', label: 'Fuel Reports',        icon: 'bar_chart'         },
      ]},
      { label: 'Campsite', pages: [
        { id: 'overview',     module: 'campsite', label: 'Camp Overview',         icon: 'map'           },
        { id: 'assignments',  module: 'campsite', label: 'Assignments',           icon: 'assignment_ind'},
        { id: 'rooms',        module: 'campsite', label: 'Rooms',                 icon: 'bed'           },
        { id: 'blocks',       module: 'campsite', label: 'Blocks',                icon: 'domain'        },
        { id: 'camp-stock',   module: 'campsite', label: 'Stock Levels',          icon: 'inventory_2'   },
        { id: 'consumption',  module: 'campsite', label: 'Consumption Analytics', icon: 'analytics'     },
        { id: 'ppe-register', module: 'campsite', label: 'PPE Register',          icon: 'security'      },
        { id: 'headcount',    module: 'campsite', label: 'Headcount',             icon: 'people'        },
      ]},
    ],
  },

  finance: {
    label: 'Finance', icon: 'account_balance', color: '#818cf8',
    sections: [
      { label: 'General Ledger', pages: [
        { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: 'account_tree' },
        { id: 'journal-entries',   label: 'Journal Entries',   icon: 'book'         },
        { id: 'reports',           label: 'Financial Reports', icon: 'assessment'   },
      ]},
      { label: 'Petty Cash', pages: [
        { id: 'petty-cash-dashboard',      module: 'projects', label: 'PC Dashboard',    icon: 'dashboard'              },
        { id: 'petty-cash-funds',          module: 'projects', label: 'Funds & Top-ups', icon: 'account_balance_wallet' },
        { id: 'petty-cash-expenses',       module: 'projects', label: 'Expenses',        icon: 'receipt_long'           },
        { id: 'petty-cash-reconciliation', module: 'projects', label: 'Reconciliation',  icon: 'balance'                },
      ]},
    ],
  },

  workplace: {
    label: 'Workplace', icon: 'corporate_fare', color: '#fcd34d',
    sections: [
      { label: 'Communications', pages: [
        { id: 'announcements',                   label: 'Announcements',    icon: 'campaign'    },
        { id: 'memos',                           label: 'Memos',            icon: 'mail'        },
        { id: 'chats', module: 'connect',        label: 'Messages',         icon: 'chat'        },
      ]},
      { label: 'Compliance', pages: [
        { id: 'policies',       label: 'Policies & Rules', icon: 'description' },
        { id: 'code-of-ethics', label: 'Code of Ethics',   icon: 'verified'    },
      ]},
    ],
  },

  analytics: {
    label: 'Analytics', icon: 'insights', color: '#38bdf8',
    sections: [
      { label: 'Dashboards & Reports', pages: [
        { id: 'overview',       module: 'reports', label: 'Overview',          icon: 'dashboard'     },
        { id: 'kpi-dashboards', module: 'reports', label: 'KPI Dashboards',    icon: 'insights'      },
        { id: 'report-builder', module: 'reports', label: 'Report Builder',    icon: 'build_circle'  },
        { id: 'scheduled',      module: 'reports', label: 'Scheduled Reports', icon: 'schedule_send' },
      ]},
      { label: 'Logs', pages: [
        { id: 'audit-log', module: 'reports', label: 'Audit Trail', icon: 'history' },
        { id: 'drafts',    module: 'reports', label: 'Drafts',      icon: 'drafts'  },
      ]},
    ],
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
      ],
    }, {
      label: 'Communications', pages: [
        { id: 'push-notifications', label: 'Push Notifications', icon: 'notifications_active' },
        { id: 'email-logs',         label: 'Email Logs',         icon: 'mail'                 },
      ],
    }],
  },
}

export default function Sidebar({ module }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { canView } = usePermission()

  const effectiveModule = SUPER_MODULE_OF[module] || module

  const config = (() => {
    const full = ALL_MODULES[effectiveModule]
    if (!full) return null
    const filteredSections = full.sections
      .map(section => {
        const filteredPages = section.pages.filter(page => {
          const navModule = page.module || DEFAULT_NAV[effectiveModule] || module
          return canView(navModule, page.id)
        })
        return filteredPages.length > 0 ? { ...section, pages: filteredPages } : null
      })
      .filter(Boolean)
    return filteredSections.length > 0 ? { ...full, sections: filteredSections } : null
  })()

  const storageKey = `sidebar_exp_${effectiveModule}`
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

  // Section filtering logic
  let activeSectionLabel = null
  if (effectiveModule === 'people') {
    if (module === 'expenses') {
      activeSectionLabel = SUBMODULE_SECTION['expenses'] // 'Expenses'
    } else if (module === 'hr') {
      activeSectionLabel = PEOPLE_PAGE_SECTION[currentPage] || null
    }
    // module === 'people' fallback: show all sections (activeSectionLabel stays null)
  } else {
    activeSectionLabel = SUBMODULE_SECTION[module] || null
  }

  const visibleSections = activeSectionLabel
    ? config.sections.filter(s => s.label === activeSectionLabel)
    : config.sections

  const toggleSection = (label) => setExpanded(prev => ({ ...prev, [label]: !prev[label] }))

  const btnStyle = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 12, fontWeight: 600, transition: 'all .15s' }
  const btnHover = (e) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' }
  const btnOut   = (e) => { e.currentTarget.style.background = 'transparent';     e.currentTarget.style.color = 'var(--text-mid)' }

  const homeLabel = effectiveModule === 'people' ? 'People Home' : `${config.label} Home`
  const homeRoute = `/module/${DEFAULT_NAV[effectiveModule] || module}`

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
        <button onClick={() => navigate(homeRoute)} style={btnStyle} onMouseOver={btnHover} onMouseOut={btnOut}>
          <span className="material-icons" style={{ fontSize: 16 }}>{config.icon}</span>
          {homeLabel}
        </button>
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
                    const pageNavModule = page.module || DEFAULT_NAV[effectiveModule] || module
                    const isActive = currentPage === page.id && location.pathname.includes(`/module/${pageNavModule}/`)
                    return (
                      <button key={`${pageNavModule}-${page.id}`}
                        onClick={() => { navigate(`/module/${pageNavModule}/${page.id}`); setMobileOpen(false) }}
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
