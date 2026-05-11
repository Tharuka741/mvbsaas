-- ============================================================
-- Medivex — Migration: merge invoice_prices + supplier_costs
-- into a single unified products table.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- 1. Create the unified products table
create table if not exists products (
  id          bigint generated always as identity primary key,
  supplier    text,
  name        text not null,
  unit_cost   numeric(10, 2),
  unit_price  numeric(10, 2),
  updated_at  timestamptz default now()
);

alter table products enable row level security;

create policy "allow all" on products
  for all using (true) with check (true);

grant select, insert, update, delete on products to anon, authenticated;


-- 2. Migrate from supplier_costs (join invoice_prices on name match)
insert into products (supplier, name, unit_cost, unit_price)
select
  sc.supplier,
  sc.product,
  sc.unit_cost,
  ip.unit_price
from supplier_costs sc
left join invoice_prices ip on ip.name = sc.product;


-- 3. Insert any invoice_prices entries with no matching supplier_costs row
insert into products (name, unit_price)
select ip.name, ip.unit_price
from invoice_prices ip
where not exists (
  select 1 from products p where p.name = ip.name
);
