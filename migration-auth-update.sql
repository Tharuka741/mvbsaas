-- Run this in the Supabase SQL editor after migration-auth.sql
-- Replaces the previous version of this file.
--
-- Admin role capabilities:
--   - Can CREATE: invoices, customer orders, supplier orders, GRNs, customers, suppliers
--   - Can VIEW:   all tables except products (inventory) and reports
--   - Cannot DELETE or UPDATE any existing data
--   - Cannot access product-dashboard (enforced on frontend)

-- ── Drop any policies from previous runs ────────────────────────────
drop policy if exists "admin read"           on products;
drop policy if exists "admin read"           on suppliers;
drop policy if exists "admin insert"         on suppliers;
drop policy if exists "admin read"           on customers;
drop policy if exists "admin insert"         on customers;
drop policy if exists "admin insert"         on invoices;
drop policy if exists "admin insert"         on invoice_line_items;
drop policy if exists "admin insert"         on customer_orders;
drop policy if exists "admin insert"         on customer_order_items;
drop policy if exists "admin insert"         on supplier_orders;
drop policy if exists "admin insert"         on supplier_order_items;
drop policy if exists "admin insert"         on grns;
drop policy if exists "admin update grn_id"  on supplier_orders;

-- ── Admin read access ────────────────────────────────────────────────
-- products: read-only (admin can't reach the page but RLS must allow the
--           supplier/customer lookups that other pages do)
create policy "admin read" on products  for select using (is_admin_user());

-- suppliers + customers: read + insert (admin can add new entries)
create policy "admin read"   on suppliers for select using (is_admin_user());
create policy "admin insert" on suppliers for insert with check (is_admin_user());

create policy "admin read"   on customers for select using (is_admin_user());
create policy "admin insert" on customers for insert with check (is_admin_user());

-- ── Admin create access on transactional tables ──────────────────────
-- Invoices
create policy "admin insert" on invoices           for insert with check (is_admin_user());
create policy "admin insert" on invoice_line_items for insert with check (is_admin_user());

-- Customer orders
create policy "admin insert" on customer_orders      for insert with check (is_admin_user());
create policy "admin insert" on customer_order_items for insert with check (is_admin_user());

-- Supplier orders
create policy "admin insert" on supplier_orders      for insert with check (is_admin_user());
create policy "admin insert" on supplier_order_items for insert with check (is_admin_user());

-- GRNs — admin can create; also needs to stamp grn_id on the supplier order
create policy "admin insert" on grns for insert with check (is_admin_user());
create policy "admin update grn_id" on supplier_orders
  for update using (is_admin_user())
  with check (is_admin_user());
