-- Run in Supabase SQL editor
-- Adds FOC (free of charge) quantity column to supplier_order_items.
-- FOC units are counted toward stock when GRN is confirmed in Inbound.

alter table supplier_order_items
  add column if not exists foc integer not null default 0;
