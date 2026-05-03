-- 004_accounting.sql — Double-entry accounting tables
-- Run in Supabase SQL Editor

-- Chart of Accounts
create table if not exists accounts (
  id          text primary key default gen_random_uuid()::text,
  code        text not null unique,
  name        text not null,
  type        text not null check (type in ('Asset','Liability','Equity','Revenue','Expense')),
  description text,
  balance     numeric(18,2) not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Journal Entries (header)
create table if not exists journal_entries (
  id           text primary key default gen_random_uuid()::text,
  entry_date   date not null,
  description  text not null,
  reference    text,
  total_debit  numeric(18,2) not null default 0,
  total_credit numeric(18,2) not null default 0,
  status       text not null default 'posted' check (status in ('draft','posted','reversed')),
  created_by   text,
  created_at   timestamptz not null default now()
);

-- Journal Lines (detail)
create table if not exists journal_lines (
  id          text primary key default gen_random_uuid()::text,
  entry_id    text not null references journal_entries(id) on delete cascade,
  account_id  text not null references accounts(id),
  debit       numeric(18,2) not null default 0,
  credit      numeric(18,2) not null default 0,
  description text,
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists idx_journal_lines_entry   on journal_lines(entry_id);
create index if not exists idx_journal_lines_account on journal_lines(account_id);
create index if not exists idx_journal_entries_date  on journal_entries(entry_date desc);
create index if not exists idx_accounts_type         on accounts(type);

-- RLS policies (permissive for now — tighten per your auth setup)
alter table accounts        enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines   enable row level security;

create policy "accounts_all"        on accounts        for all using (true) with check (true);
create policy "journal_entries_all" on journal_entries for all using (true) with check (true);
create policy "journal_lines_all"   on journal_lines   for all using (true) with check (true);

-- Seed chart of accounts (standard skeleton)
insert into accounts (id, code, name, type, description) values
  (gen_random_uuid()::text, '1000', 'Cash & Cash Equivalents', 'Asset',     'Bank accounts and petty cash'),
  (gen_random_uuid()::text, '1100', 'Accounts Receivable',     'Asset',     'Amounts owed by customers'),
  (gen_random_uuid()::text, '1200', 'Inventory',               'Asset',     'Goods held for sale or use'),
  (gen_random_uuid()::text, '1300', 'Prepaid Expenses',        'Asset',     'Expenses paid in advance'),
  (gen_random_uuid()::text, '1500', 'Property & Equipment',    'Asset',     'Fixed assets net of depreciation'),
  (gen_random_uuid()::text, '2000', 'Accounts Payable',        'Liability', 'Amounts owed to suppliers'),
  (gen_random_uuid()::text, '2100', 'Accrued Liabilities',     'Liability', 'Accrued but unpaid expenses'),
  (gen_random_uuid()::text, '2200', 'Short-term Loans',        'Liability', 'Bank overdrafts and loans < 1 year'),
  (gen_random_uuid()::text, '2500', 'Long-term Debt',          'Liability', 'Loans payable > 1 year'),
  (gen_random_uuid()::text, '3000', 'Paid-in Capital',         'Equity',    'Owner contributions'),
  (gen_random_uuid()::text, '3100', 'Retained Earnings',       'Equity',    'Cumulative net profit'),
  (gen_random_uuid()::text, '4000', 'Revenue',                 'Revenue',   'General revenue account'),
  (gen_random_uuid()::text, '4100', 'Service Revenue',         'Revenue',   'Income from services rendered'),
  (gen_random_uuid()::text, '5000', 'Cost of Sales',           'Expense',   'Direct cost of goods/services'),
  (gen_random_uuid()::text, '5100', 'Salaries & Wages',        'Expense',   'Employee compensation'),
  (gen_random_uuid()::text, '5200', 'Fuel & Transport',        'Expense',   'Vehicle fuel and logistics'),
  (gen_random_uuid()::text, '5300', 'Utilities',               'Expense',   'Electricity, water, comms'),
  (gen_random_uuid()::text, '5400', 'Repairs & Maintenance',   'Expense',   'Equipment and facility repairs'),
  (gen_random_uuid()::text, '5500', 'Camp Supplies',           'Expense',   'Consumables for camp operations'),
  (gen_random_uuid()::text, '5900', 'Miscellaneous Expense',   'Expense',   'Other operating expenses')
on conflict (code) do nothing;
