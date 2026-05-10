-- supabase/migrations/statuses_table.sql
-- Run in Supabase SQL editor to enable DB-driven status definitions.

CREATE TABLE IF NOT EXISTS statuses (
  key         TEXT PRIMARY KEY,        -- e.g. 'approved', 'pending', 'in_transit'
  label       TEXT NOT NULL,           -- e.g. 'Approved', 'Pending Approval'
  badge_class TEXT NOT NULL DEFAULT 'badge-dim',  -- CSS class: badge-green, badge-red, etc.
  color       TEXT,                    -- optional hex for charts/custom use
  icon        TEXT,                    -- optional material icon name
  module      TEXT DEFAULT 'global',   -- which module owns it (global = all modules)
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with all current hardcoded statuses (from StatusBadge.jsx STATUS_MAP)
INSERT INTO statuses (key, label, badge_class, module, sort_order) VALUES
  -- Approval / Workflow
  ('pending',              'Pending',            'badge-yellow',  'global',      10),
  ('submitted',            'Submitted',          'badge-blue',    'global',      20),
  ('approved',             'Approved',           'badge-green',   'global',      30),
  ('rejected',             'Rejected',           'badge-red',     'global',      40),
  ('cancelled',            'Cancelled',          'badge-red',     'global',      50),
  ('draft',                'Draft',              'badge-blue',    'global',      60),
  ('review',               'Under Review',       'badge-yellow',  'global',      70),
  -- Procurement
  ('fulfilled',            'Fulfilled',          'badge-green',   'procurement', 10),
  ('partially_fulfilled',  'Part. Fulfilled',    'badge-yellow',  'procurement', 20),
  ('ordered',              'Ordered',            'badge-gold',    'procurement', 30),
  ('partially_received',   'Part. Received',     'badge-yellow',  'procurement', 40),
  ('received',             'Received',           'badge-green',   'procurement', 50),
  ('closed',               'Closed',             'badge-dim',     'procurement', 60),
  -- HR / Attendance
  ('present',              'Present',            'badge-green',   'hr',          10),
  ('absent',               'Absent',             'badge-red',     'hr',          20),
  ('late',                 'Late',               'badge-yellow',  'hr',          30),
  ('leave',                'On Leave',           'badge-purple',  'hr',          40),
  ('holiday',              'Holiday',            'badge-blue',    'hr',          50),
  ('active',               'Active',             'badge-green',   'global',      80),
  ('inactive',             'Inactive',           'badge-dim',     'global',      90),
  ('terminated',           'Terminated',         'badge-red',     'hr',          60),
  -- Inventory
  ('in_stock',             'In Stock',           'badge-green',   'inventory',   10),
  ('low_stock',            'Low Stock',          'badge-yellow',  'inventory',   20),
  ('out_of_stock',         'Out of Stock',       'badge-red',     'inventory',   30),
  ('normal',               'Normal',             'badge-green',   'inventory',   40),
  -- Campsite
  ('vacant',               'Vacant',             'badge-green',   'campsite',    10),
  ('occupied',             'Occupied',           'badge-red',     'campsite',    20),
  ('occupied_on_leave',    'On Leave',           'badge-yellow',  'campsite',    30),
  ('on_leave',             'On Leave',           'badge-yellow',  'campsite',    40),
  ('full',                 'Full',               'badge-red',     'campsite',    50),
  ('maintenance',          'Maintenance',        'badge-yellow',  'campsite',    60),
  ('checked_out',          'Checked Out',        'badge-dim',     'campsite',    70),
  ('transferred',          'Transferred',        'badge-blue',    'campsite',    80),
  -- Fleet / Assets
  ('working',              'Working',            'badge-green',   'fleet',       10),
  ('breakdown',            'Breakdown',          'badge-red',     'fleet',       20),
  ('in_progress',          'In Progress',        'badge-yellow',  'fleet',       30),
  ('resolved',             'Resolved',           'badge-green',   'fleet',       40),
  ('open',                 'Open',               'badge-yellow',  'fleet',       50),
  ('grounded',             'Grounded',           'badge-red',     'fleet',       60),
  -- Logistics / Delivery
  ('in_transit',           'In Transit',         'badge-blue',    'logistics',   10),
  ('delivered',            'Delivered',          'badge-green',   'logistics',   20),
  ('short_delivered',      'Short Delivered',    'badge-yellow',  'logistics',   30),
  -- Fuel
  ('diesel',               'Diesel',             'badge-gold',    'fuel',        10),
  ('petrol',               'Petrol',             'badge-blue',    'fuel',        20),
  -- System
  ('success',              'Success',            'badge-green',   'system',      10),
  ('failed',               'Failed',             'badge-red',     'system',      20)
ON CONFLICT (key) DO NOTHING;
