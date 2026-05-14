-- Run in Supabase SQL editor after migration-auth-update.sql
-- Drops and recreates stock_quantity to start with a clean slate (all 0).

alter table products drop column if exists stock_quantity;
alter table products add column stock_quantity integer not null default 0;

-- Admin creates invoices (customer orders) which trigger stock deduction,
-- so admin needs UPDATE on products for that operation.
drop policy if exists "admin update products stock" on products;
create policy "admin update products stock" on products
  for update using (is_admin_user()) with check (is_admin_user());
