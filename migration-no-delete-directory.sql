-- Run in Supabase SQL editor after migration-admin-permissions.sql
--
-- Customers and suppliers are referenced by name (not a foreign key) from
-- customer_orders/supplier_orders/products/invoices, so deleting one would
-- leave existing records pointing at a name that no longer resolves to
-- anything. No role may delete a customer or supplier record anymore —
-- everyone (power users and admin alike) can still view and edit them.
-- The corresponding frontend delete buttons have been removed from
-- customers.js/suppliers.js and replaced with inline editable fields.

-- customers: drop the old "for all" power policy (which included delete)
-- and the admin delete grant added in migration-admin-permissions.sql;
-- recreate power access without delete.
drop policy if exists "power full"   on customers;
drop policy if exists "admin delete" on customers;

create policy "power select" on customers for select using (is_power_user());
create policy "power insert" on customers for insert with check (is_power_user());
create policy "power update" on customers for update using (is_power_user()) with check (is_power_user());

-- suppliers: same treatment.
drop policy if exists "power full"   on suppliers;
drop policy if exists "admin delete" on suppliers;

create policy "power select" on suppliers for select using (is_power_user());
create policy "power insert" on suppliers for insert with check (is_power_user());
create policy "power update" on suppliers for update using (is_power_user()) with check (is_power_user());
