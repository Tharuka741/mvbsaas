-- Run in Supabase SQL editor
-- Prevents duplicate invoice/order numbers on customer_orders.
-- Safe to run: no existing duplicates or blanks as of this writing.

alter table customer_orders
  add constraint customer_orders_invoice_number_key unique (invoice_number);

alter table customer_orders
  add constraint customer_orders_order_number_key unique (order_number);
