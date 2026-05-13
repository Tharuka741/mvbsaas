-- ── Auth migration ────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor.
-- After running, create users via Supabase Auth → Users → Invite user,
-- then insert their role below.

-- 1. User roles table
create table if not exists user_roles (
  id   uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('admin', 'manager', 'ceo', 'tech_lead')),
  name text not null
);

alter table user_roles enable row level security;

create policy "users read own role" on user_roles
  for select using (id = auth.uid());

-- 2. Helper functions (security definer = bypass RLS when called internally)

create or replace function is_power_user()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role in ('manager', 'ceo', 'tech_lead') from user_roles where id = auth.uid()),
    false
  );
$$;

create or replace function is_admin_user()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'admin' from user_roles where id = auth.uid()),
    false
  );
$$;

-- 3. Drop old open anon policies ─────────────────────────────────────

-- products
drop policy if exists "anon select products" on products;
drop policy if exists "anon insert products" on products;
drop policy if exists "anon update products" on products;
drop policy if exists "anon delete products" on products;

-- suppliers
drop policy if exists "anon select suppliers" on suppliers;
drop policy if exists "anon insert suppliers" on suppliers;
drop policy if exists "anon update suppliers" on suppliers;
drop policy if exists "anon delete suppliers" on suppliers;

-- customers
drop policy if exists "anon select customers" on customers;
drop policy if exists "anon insert customers" on customers;
drop policy if exists "anon update customers" on customers;
drop policy if exists "anon delete customers" on customers;

-- invoices
drop policy if exists "anon select invoices" on invoices;
drop policy if exists "anon insert invoices" on invoices;
drop policy if exists "anon update invoices" on invoices;
drop policy if exists "anon delete invoices" on invoices;

-- invoice_line_items
drop policy if exists "anon select invoice_line_items" on invoice_line_items;
drop policy if exists "anon insert invoice_line_items" on invoice_line_items;
drop policy if exists "anon update invoice_line_items" on invoice_line_items;
drop policy if exists "anon delete invoice_line_items" on invoice_line_items;

-- customer_orders
drop policy if exists "anon select customer_orders" on customer_orders;
drop policy if exists "anon insert customer_orders" on customer_orders;
drop policy if exists "anon update customer_orders" on customer_orders;
drop policy if exists "anon delete customer_orders" on customer_orders;

-- customer_order_items
drop policy if exists "anon select customer_order_items" on customer_order_items;
drop policy if exists "anon insert customer_order_items" on customer_order_items;
drop policy if exists "anon update customer_order_items" on customer_order_items;
drop policy if exists "anon delete customer_order_items" on customer_order_items;

-- supplier_orders
drop policy if exists "anon select supplier_orders" on supplier_orders;
drop policy if exists "anon insert supplier_orders" on supplier_orders;
drop policy if exists "anon update supplier_orders" on supplier_orders;
drop policy if exists "anon delete supplier_orders" on supplier_orders;

-- supplier_order_items
drop policy if exists "anon select supplier_order_items" on supplier_order_items;
drop policy if exists "anon insert supplier_order_items" on supplier_order_items;
drop policy if exists "anon update supplier_order_items" on supplier_order_items;
drop policy if exists "anon delete supplier_order_items" on supplier_order_items;

-- grns
drop policy if exists "anon select grns" on grns;
drop policy if exists "anon insert grns" on grns;
drop policy if exists "anon update grns" on grns;
drop policy if exists "anon delete grns" on grns;

-- 4. New role-based policies ─────────────────────────────────────────

-- products, suppliers, customers — power users only
create policy "power full" on products   for all using (is_power_user()) with check (is_power_user());
create policy "power full" on suppliers  for all using (is_power_user()) with check (is_power_user());
create policy "power full" on customers  for all using (is_power_user()) with check (is_power_user());

-- invoices, invoice_line_items — power: full / admin: read
create policy "read"   on invoices for select using (is_power_user() or is_admin_user());
create policy "insert" on invoices for insert with check (is_power_user());
create policy "update" on invoices for update using (is_power_user());
create policy "delete" on invoices for delete using (is_power_user());

create policy "read"   on invoice_line_items for select using (is_power_user() or is_admin_user());
create policy "insert" on invoice_line_items for insert with check (is_power_user());
create policy "update" on invoice_line_items for update using (is_power_user());
create policy "delete" on invoice_line_items for delete using (is_power_user());

-- customer_orders, customer_order_items — power: full / admin: read
create policy "read"   on customer_orders for select using (is_power_user() or is_admin_user());
create policy "insert" on customer_orders for insert with check (is_power_user());
create policy "update" on customer_orders for update using (is_power_user());
create policy "delete" on customer_orders for delete using (is_power_user());

create policy "read"   on customer_order_items for select using (is_power_user() or is_admin_user());
create policy "insert" on customer_order_items for insert with check (is_power_user());
create policy "update" on customer_order_items for update using (is_power_user());
create policy "delete" on customer_order_items for delete using (is_power_user());

-- supplier_orders, supplier_order_items — power: full / admin: read
create policy "read"   on supplier_orders for select using (is_power_user() or is_admin_user());
create policy "insert" on supplier_orders for insert with check (is_power_user());
create policy "update" on supplier_orders for update using (is_power_user());
create policy "delete" on supplier_orders for delete using (is_power_user());

create policy "read"   on supplier_order_items for select using (is_power_user() or is_admin_user());
create policy "insert" on supplier_order_items for insert with check (is_power_user());
create policy "update" on supplier_order_items for update using (is_power_user());
create policy "delete" on supplier_order_items for delete using (is_power_user());

-- grns — power: full / admin: read
create policy "read"   on grns for select using (is_power_user() or is_admin_user());
create policy "insert" on grns for insert with check (is_power_user());
create policy "update" on grns for update using (is_power_user());
create policy "delete" on grns for delete using (is_power_user());

-- 5. Assign roles ────────────────────────────────────────────────────
-- After inviting each user via Supabase Auth → Users, copy their UUID and run:
--
-- insert into user_roles (id, role, name) values
--   ('uuid-here', 'tech_lead', 'Your Name'),
--   ('uuid-here', 'manager',   'Manager Name'),
--   ('uuid-here', 'ceo',       'CEO Name'),
--   ('uuid-here', 'admin',     'Admin Name');
