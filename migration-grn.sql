-- Supplier orders, line items, and GRN tables
-- Run this in the Supabase SQL editor

create table if not exists supplier_orders (
  id              bigint generated always as identity primary key,
  supplier_name   text not null,
  catalog_supplier text,
  order_date      date,
  reference       text,
  vat_enabled     boolean not null default false,
  subtotal        numeric(14, 2) not null default 0,
  vat_total       numeric(14, 2) not null default 0,
  net_total       numeric(14, 2) not null default 0,
  total_quantity  integer not null default 0,
  grn_id          bigint,
  created_at      timestamptz not null default now()
);

create table if not exists supplier_order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references supplier_orders(id) on delete cascade,
  product_name text not null,
  unit_cost    numeric(14, 2) not null,
  quantity     integer not null,
  subtotal     numeric(14, 2) not null,
  vat          numeric(14, 2) not null default 0,
  net          numeric(14, 2) not null
);

create table if not exists grns (
  id           bigint generated always as identity primary key,
  batch_date   text not null,
  order_count  integer not null default 0,
  total_items  integer not null default 0,
  net_total    numeric(14, 2) not null default 0,
  confirmed_at timestamptz not null default now()
);

-- FK from supplier_orders to grns (after both tables exist)
alter table supplier_orders
  add constraint supplier_orders_grn_fkey
  foreign key (grn_id) references grns(id) on delete set null;

-- Add stock_quantity to products
alter table products add column if not exists stock_quantity integer not null default 0;

-- Row-level security
alter table supplier_orders       enable row level security;
alter table supplier_order_items  enable row level security;
alter table grns                  enable row level security;

create policy "anon select supplier_orders"      on supplier_orders for select using (true);
create policy "anon insert supplier_orders"      on supplier_orders for insert with check (true);
create policy "anon update supplier_orders"      on supplier_orders for update using (true);
create policy "anon delete supplier_orders"      on supplier_orders for delete using (true);

create policy "anon select supplier_order_items" on supplier_order_items for select using (true);
create policy "anon insert supplier_order_items" on supplier_order_items for insert with check (true);

create policy "anon select grns"                 on grns for select using (true);
create policy "anon insert grns"                 on grns for insert with check (true);
