-- Backfill: mark all pre-existing customer orders as outbound confirmed.
-- These were created before the outbound workflow existed; their stock was
-- already deducted at invoice time, so they should not appear in the outbound queue.
UPDATE customer_orders
SET outbound_confirmed = true
WHERE outbound_confirmed IS NULL OR outbound_confirmed = false;
