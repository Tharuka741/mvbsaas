-- ============================================================
-- Medivex Operations — Supabase Schema
-- Run this in the Supabase SQL Editor (dashboard → SQL Editor)
-- ============================================================

-- Invoice prices (replaces products.js as source of truth)
create table if not exists invoice_prices (
  id           bigint generated always as identity primary key,
  name         text unique not null,
  unit_price   numeric(10, 2) not null,
  updated_at   timestamptz default now()
);

alter table invoice_prices enable row level security;

create policy "allow all" on invoice_prices
  for all using (true) with check (true);

grant select, insert, update, delete on invoice_prices to anon, authenticated;


-- Supplier costs (replaces supplier-data.js as source of truth)
create table if not exists supplier_costs (
  id           bigint generated always as identity primary key,
  supplier     text not null,
  product      text not null,
  unit_cost    numeric(10, 2) not null,
  updated_at   timestamptz default now(),
  unique (supplier, product)
);

alter table supplier_costs enable row level security;

create policy "allow all" on supplier_costs
  for all using (true) with check (true);

grant select, insert, update, delete on supplier_costs to anon, authenticated;


-- Invoices (saved when user downloads a PDF from the Invoice Generator)
create table if not exists invoices (
  id              bigint generated always as identity primary key,
  invoice_number  text unique not null,
  invoice_date    date,
  due_date        date,
  billed_to       text,
  subtotal        numeric(10, 2),
  vat             numeric(10, 2),
  total           numeric(10, 2),
  created_at      timestamptz default now()
);

alter table invoices enable row level security;

create policy "allow all" on invoices
  for all using (true) with check (true);

grant select, insert, update, delete on invoices to anon, authenticated;


-- Invoice line items
create table if not exists invoice_line_items (
  id            bigint generated always as identity primary key,
  invoice_id    bigint references invoices (id) on delete cascade,
  product_name  text not null,
  quantity      int not null,
  unit_price    numeric(10, 2) not null,
  line_total    numeric(10, 2) not null
);

alter table invoice_line_items enable row level security;

create policy "allow all" on invoice_line_items
  for all using (true) with check (true);

grant select, insert, update, delete on invoice_line_items to anon, authenticated;
