-- Run in Supabase SQL editor
-- Adds an optional variant_cost column to products for alternate supplier cost pricing.

alter table products
  add column if not exists variant_cost numeric;
