-- Customer orders and line items tables
-- Run this in the Supabase SQL editor

create table if not exists customer_orders (
  id          bigint generated always as identity primary key,
  order_number text,
  invoice_number text not null,
  invoice_date  date,
  due_date      date,
  billed_to     text,
  total_amount  numeric(14, 2) not null default 0,
  item_count    integer not null default 0,
  status        text not null default 'Unpaid',
  created_at    timestamptz not null default now()
);

create table if not exists customer_order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references customer_orders(id) on delete cascade,
  product_name text not null,
  unit_price   numeric(14, 2) not null,
  quantity     integer not null,
  foc          integer not null default 0,
  amount       numeric(14, 2) not null
);

-- Row-level security
alter table customer_orders      enable row level security;
alter table customer_order_items enable row level security;

-- Policies: allow anonymous read/write (matches existing products table pattern)
create policy "anon select orders"       on customer_orders      for select using (true);
create policy "anon insert orders"       on customer_orders      for insert with check (true);
create policy "anon update orders"       on customer_orders      for update using (true);

create policy "anon select order items"  on customer_order_items for select using (true);
create policy "anon insert order items"  on customer_order_items for insert with check (true);
