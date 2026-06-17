-- Run in Supabase SQL editor
-- Adds an optional variant_price column to products for older MRP pricing.

alter table products
  add column if not exists variant_price numeric;
