-- Run in Supabase SQL editor after migration-inbound.sql
-- Adds a grn_remark column to supplier_orders to mark GRN-rejected orders.

alter table supplier_orders
  add column if not exists grn_remark text;
