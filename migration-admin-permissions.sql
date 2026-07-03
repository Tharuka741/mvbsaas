-- Run in Supabase SQL editor after migration-audit-log.sql
--
-- Updated admin role capabilities:
--   - Sales & Purchasing (customers, suppliers, customer orders, supplier
--     orders, invoices): full CRUD, same as power users. Page-level
--     business rules (e.g. "can't delete a dispatch-confirmed order",
--     "can't delete a GRN-confirmed supplier order") remain enforced in
--     the page JS only, exactly as they already are for power users —
--     this migration does not change that enforcement model.
--   - Products & stock levels: view only. Admin loses the "admin update
--     products stock" policy from migration-stock.sql entirely — that
--     policy was unconditional (any column, not just stock) and is no
--     longer needed since stock is only ever mutated via Inbound/Outbound
--     confirm, which admin cannot perform.
--   - GRNs / Inbound confirm / Outbound confirm: unchanged — admin still
--     only has read access to grns, so Inbound "Confirm GRN"/"Reject" and
--     Outbound "Confirm Dispatch" stay manager-only at the RLS layer.
--   - Activity log: unchanged — no admin policy exists on audit_logs, so
--     it stays fully invisible to admin.

-- ── Sales & Purchasing — admin update/delete parity with power users ───

create policy "admin update" on customers for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on customers for delete using (is_admin_user());

create policy "admin update" on suppliers for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on suppliers for delete using (is_admin_user());

create policy "admin update" on customer_orders for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on customer_orders for delete using (is_admin_user());

create policy "admin update" on customer_order_items for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on customer_order_items for delete using (is_admin_user());

-- Supersede the narrow "admin update grn_id" policy from
-- migration-auth-update.sql with a general update grant.
drop policy if exists "admin update grn_id" on supplier_orders;
create policy "admin update" on supplier_orders for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on supplier_orders for delete using (is_admin_user());

create policy "admin update" on supplier_order_items for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on supplier_order_items for delete using (is_admin_user());

create policy "admin update" on invoices for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on invoices for delete using (is_admin_user());

create policy "admin update" on invoice_line_items for update using (is_admin_user()) with check (is_admin_user());
create policy "admin delete" on invoice_line_items for delete using (is_admin_user());

-- ── Products — admin becomes strictly read-only (view only, no edits) ──

drop policy if exists "admin update products stock" on products;
